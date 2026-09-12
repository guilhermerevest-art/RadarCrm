# Enriquecimento de Empresas (PJ) — Telefone, Email, Quadro Societario

Objetivo: a partir de um CNPJ de construtora ou orgao publico, retornar telefone comercial, email e socios, com custo minimo e cache global compartilhado entre tenants.

Fontes combinadas:
- BrasilAPI (gratis, dados basicos + QSA).
- CnpjWs (R$ 0,05/consulta, telefone e email quando BrasilAPI nao tem).
- Google Places API (R$ 0,03/lookup, valida endereco e retorna telefone quando empresa tem ficha).
- Hunter.io (R$ 49/mes, email corporativo por dominio).
- Apollo.io (R$ 49/mes, telefone direto de decisor + email).

Regra geral: enriquecer sob demanda, nao por padrao. Apenas quando o vendedor clica em "preparar proposta" ou cria lead a partir da obra. Isso reduz custo em ~90%.

---

## 1. Schema

### 1.1 Colunas adicionadas em `empresas`

```sql
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS telefone_comercial text,
  ADD COLUMN IF NOT EXISTS telefone_normalizado text,           -- 55+DDD+numero, 12 ou 13 digitos
  ADD COLUMN IF NOT EXISTS email_comercial text,
  ADD COLUMN IF NOT EXISTS email_validado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_valido boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_validador_em timestamptz,
  ADD COLUMN IF NOT EXISTS site_url text,
  ADD COLUMN IF NOT EXISTS google_place_id text,
  ADD COLUMN IF NOT EXISTS google_rating numeric(3,2),
  ADD COLUMN IF NOT EXISTS fonte_enriquecimento text,           -- jsonb com fontes consultadas
  ADD COLUMN IF NOT EXISTS enriquecido_em timestamptz,
  ADD COLUMN IF NOT EXISTS enriquecimento_custo numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS socio_exposto boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_empresas_whatsapp_valido
  ON empresas (whatsapp_valido) WHERE whatsapp_valido = true;

CREATE INDEX IF NOT EXISTS idx_empresas_cnpj
  ON empresas (cnpj);

CREATE INDEX IF NOT EXISTS idx_empresas_google_place_id
  ON empresas (google_place_id) WHERE google_place_id IS NOT NULL;
```

### 1.2 Nova tabela: `empresas_enriquecimento_log`

Cada chamada a API externa gera um registro. Auditavel, dedupavel, cobravel.

```sql
CREATE TABLE empresas_enriquecimento_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj char(14) NOT NULL,
  empresa_id uuid REFERENCES empresas(id),
  fonte text NOT NULL,                       -- 'brasilapi', 'cnpjws', 'google_places', 'hunter', 'apollo'
  campos_retornados text[],                  -- ['telefone','email','qsa']
  campos_preenchidos text[],                 -- efetivamente gravados
  custo numeric(10,4) DEFAULT 0,
  duracao_ms int,
  status text NOT NULL,                      -- 'sucesso', 'nao_encontrado', 'erro', 'rate_limit'
  erro_mensagem text,
  triggered_by uuid REFERENCES tenant_users(id),
  triggered_by_tenant uuid REFERENCES tenants(id),
  cache_hit boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_enriquecimento_cnpj_created
  ON empresas_enriquecimento_log (cnpj, created_at DESC);

CREATE INDEX idx_enriquecimento_tenant
  ON empresas_enriquecimento_log (triggered_by_tenant, created_at DESC);
```

### 1.3 Nova tabela: `empresas_enriquecimento_cache`

Cache global compartilhado entre tenants. Quando o CNPJ ja foi enriquecido por outro tenant nos ultimos 90 dias, retorna direto sem cobrar de novo.

```sql
CREATE TABLE empresas_enriquecimento_cache (
  cnpj char(14) PRIMARY KEY,
  payload jsonb NOT NULL,                    -- dados consolidados de todas as fontes
  fontes_utilizadas text[],                  -- ['brasilapi','cnpjws']
  telefone_comercial text,
  telefone_normalizado text,
  email_comercial text,
  whatsapp_valido boolean,
  site_url text,
  google_place_id text,
  socios jsonb,                              -- array com cargo, nome, cpf_parcial
  fetched_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '90 days'),
  hit_count int DEFAULT 0
);

CREATE INDEX idx_enriquecimento_cache_expires
  ON empresas_enriquecimento_cache (expires_at);

CREATE INDEX idx_enriquecimento_cache_whatsapp
  ON empresas_enriquecimento_cache (whatsapp_valido) WHERE whatsapp_valido = true;
```

---

## 2. Edge Function `enrich-company`

Localizacao: `supabase/functions/enrich-company/index.ts`

### 2.1 Codigo

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BRASILAPI_URL = 'https://brasilapi.com.br/api/cnpj/v1/'
const CNPJWS_URL = 'https://cnpj.ws/api/v1/'
const GOOGLE_PLACES_URL = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
const HUNTER_URL = 'https://api.hunter.io/v2/domain-search'
const APOLLO_URL = 'https://api.apollo.io/v1/mixed_people/search'

interface EnrichRequest {
  cnpj: string
  tenant_id: string
  user_id: string
  force_refresh?: boolean
}

interface EnrichResult {
  telefone: string | null
  telefone_normalizado: string | null
  whatsapp_valido: boolean
  email: string | null
  site_url: string | null
  socios: any[] | null
  fontes_utilizadas: string[]
  custo_total: number
  cache_hit: boolean
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const payload: EnrichRequest = await req.json()

  if (!payload.cnpj || payload.cnpj.length !== 14) {
    return new Response(JSON.stringify({ error: 'cnpj_invalido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 1. Tentar cache primeiro (a menos que force_refresh)
  if (!payload.force_refresh) {
    const cached = await loadFromCache(supabase, payload.cnpj)
    if (cached) {
      await logEnrichment(supabase, {
        cnpj: payload.cnpj,
        fonte: 'cache',
        status: 'sucesso',
        triggered_by: payload.user_id,
        triggered_by_tenant: payload.tenant_id,
        cache_hit: true,
        custo: 0,
      })
      await incrementCacheHit(supabase, payload.cnpj)
      return jsonResponse(cached)
    }
  }

  // 2. Pipeline de enriquecimento
  const start = Date.now()
  const result: EnrichResult = {
    telefone: null,
    telefone_normalizado: null,
    whatsapp_valido: false,
    email: null,
    site_url: null,
    socios: null,
    fontes_utilizadas: [],
    custo_total: 0,
    cache_hit: false,
  }

  // FONTE 1: BrasilAPI (gratis, sempre primeiro)
  const brasilData = await fetchBrasilAPI(supabase, payload.cnpj, payload)
  if (brasilData) {
    result.telefone = brasilData.telefone
    result.telefone_normalizado = normalizarTelefone(brasilData.telefone, brasilData.ddd)
    result.email = brasilData.email
    result.site_url = brasilData.site
    result.socios = brasilData.qsa
    result.fontes_utilizadas.push('brasilapi')
  }

  // FONTE 2: Google Places (se tiver razao social ou site)
  if (brasilData?.razao_social) {
    const placeData = await fetchGooglePlaces(
      supabase,
      payload.cnpj,
      brasilData.razao_social,
      brasilData.site || brasilData.email?.split('@')[1],
      payload
    )
    if (placeData) {
      if (!result.telefone && placeData.telefone) {
        result.telefone = placeData.telefone
        result.telefone_normalizado = normalizarTelefone(placeData.telefone)
      }
      if (placeData.site_url && !result.site_url) {
        result.site_url = placeData.site_url
      }
      if (placeData.place_id) {
        // salvamos para enriquecer no futuro
      }
      result.fontes_utilizadas.push('google_places')
      result.custo_total += 0.03
    }
  }

  // FONTE 3: CnpjWs (se ainda nao tem telefone)
  if (!result.telefone) {
    const cnpjwsData = await fetchCnpjWs(supabase, payload.cnpj, payload)
    if (cnpjwsData) {
      if (cnpjwsData.telefone) {
        result.telefone = cnpjwsData.telefone
        result.telefone_normalizado = normalizarTelefone(cnpjwsData.telefone, cnpjwsData.ddd)
      }
      if (cnpjwsData.email && !result.email) result.email = cnpjwsData.email
      result.fontes_utilizadas.push('cnpjws')
      result.custo_total += 0.05
    }
  }

  // FONTE 4: Hunter.io (se tem site mas nao tem email)
  if (result.site_url && !result.email) {
    const domain = extractDomain(result.site_url)
    if (domain) {
      const hunterData = await fetchHunter(supabase, domain, payload)
      if (hunterData) {
        result.email = hunterData.email
        result.fontes_utilizadas.push('hunter')
      }
    }
  }

  // FONTE 5: Apollo.io (se quer telefone direto de decisor)
  // Custa caro (1 credito por lookup). So chama se nao achou telefone em lugar nenhum.
  if (!result.telefone && Deno.env.get('APOLLO_API_KEY')) {
    const apolloData = await fetchApollo(supabase, brasilData?.razao_social, payload)
    if (apolloData) {
      result.telefone = apolloData.telefone
      result.telefone_normalizado = normalizarTelefone(apolloData.telefone)
      result.fontes_utilizadas.push('apollo')
      result.custo_total += 0.10
    }
  }

  // FONTE 6: Validar WhatsApp (usar funcao interna)
  if (result.telefone_normalizado) {
    result.whatsapp_valido = await validarWhatsApp(result.telefone_normalizado)
  }

  const duracao_ms = Date.now() - start

  // 3. Gravar cache
  await saveToCache(supabase, payload.cnpj, result, result.fontes_utilizadas)

  // 4. Atualizar empresa
  await updateEmpresa(supabase, payload.cnpj, result, result.custo_total)

  // 5. Log
  await logEnrichment(supabase, {
    cnpj: payload.cnpj,
    fonte: result.fontes_utilizadas.join(','),
    campos_preenchidos: buildCamposPreenchidos(result),
    custo: result.custo_total,
    duracao_ms,
    status: 'sucesso',
    triggered_by: payload.user_id,
    triggered_by_tenant: payload.tenant_id,
    cache_hit: false,
  })

  return jsonResponse(result)
})

// ============== FONTE 1: BRASILAPI ==============
async function fetchBrasilAPI(supabase: any, cnpj: string, payload: any) {
  try {
    const res = await fetch(BRASILAPI_URL + cnpj)
    if (!res.ok) {
      await logEnrichment(supabase, {
        cnpj, fonte: 'brasilapi', status: 'nao_encontrado',
        triggered_by: payload.user_id, triggered_by_tenant: payload.tenant_id,
      })
      return null
    }
    const data = await res.json()

    // BrasilAPI retorna: telefone (com DDD), email, site, qsa (quadro societario)
    return {
      telefone: data.ddd_telefone_1 ? data.ddd_telefone_1 : null,
      ddd: data.ddd_telefone_1 ? data.ddd : null,
      email: data.email || null,
      site: data.site || null,
      razao_social: data.razao_social || data.nome_fantasia,
      qsa: data.qsa?.map((s: any) => ({
        nome: s.nome_socio,
        cargo: s.qualificacao_socio,
        data_entrada: s.data_entrada_sociedade,
        cpf_parcial: s.cnpj_cpf_do_socio?.replace(/[^0-9]/g, '').slice(0, 8) + '***',
        faixa_etaria: s.faixa_etaria,
      })) || [],
    }
  } catch (err) {
    await logEnrichment(supabase, {
      cnpj, fonte: 'brasilapi', status: 'erro', erro_mensagem: String(err),
      triggered_by: payload.user_id, triggered_by_tenant: payload.tenant_id,
    })
    return null
  }
}

// ============== FONTE 2: GOOGLE PLACES ==============
async function fetchGooglePlaces(supabase: any, cnpj: string, razaoSocial: string, dominio: string | null, payload: any) {
  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')
  if (!apiKey) return null

  try {
    // Query priorizando dominio se tiver
    const query = dominio
      ? `${razaoSocial} ${dominio}`
      : razaoSocial

    const url = `${GOOGLE_PLACES_URL}?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address,formatted_phone_number,website,rating&key=${apiKey}`

    const res = await fetch(url)
    if (!res.ok) {
      await logEnrichment(supabase, {
        cnpj, fonte: 'google_places', status: res.status === 429 ? 'rate_limit' : 'erro',
        erro_mensagem: 'HTTP ' + res.status,
        triggered_by: payload.user_id, triggered_by_tenant: payload.tenant_id,
      })
      return null
    }

    const data = await res.json()
    const candidate = data.candidates?.[0]
    if (!candidate) return null

    return {
      telefone: candidate.formatted_phone_number || null,
      site_url: candidate.website || null,
      place_id: candidate.place_id || null,
      rating: candidate.rating || null,
    }
  } catch (err) {
    await logEnrichment(supabase, {
      cnpj, fonte: 'google_places', status: 'erro', erro_mensagem: String(err),
      triggered_by: payload.user_id, triggered_by_tenant: payload.tenant_id,
    })
    return null
  }
}

// ============== FONTE 3: CNPJWS ==============
async function fetchCnpjWs(supabase: any, cnpj: string, payload: any) {
  const apiKey = Deno.env.get('CNPJWS_API_KEY')
  if (!apiKey) return null

  try {
    const res = await fetch(CNPJWS_URL + cnpj, {
      headers: { 'Authorization': 'Bearer ' + apiKey },
    })

    if (!res.ok) {
      await logEnrichment(supabase, {
        cnpj, fonte: 'cnpjws', status: res.status === 429 ? 'rate_limit' : 'erro',
        triggered_by: payload.user_id, triggered_by_tenant: payload.tenant_id,
      })
      return null
    }

    const data = await res.json()

    return {
      telefone: data.telefone1 || data.telefone2 || null,
      ddd: data.ddd1 || data.ddd2 || null,
      email: data.email || null,
    }
  } catch (err) {
    await logEnrichment(supabase, {
      cnpj, fonte: 'cnpjws', status: 'erro', erro_mensagem: String(err),
      triggered_by: payload.user_id, triggered_by_tenant: payload.tenant_id,
    })
    return null
  }
}

// ============== FONTE 4: HUNTER.IO ==============
async function fetchHunter(supabase: any, domain: string, payload: any) {
  const apiKey = Deno.env.get('HUNTER_API_KEY')
  if (!apiKey) return null

  try {
    const url = `${HUNTER_URL}?domain=${domain}&api_key=${apiKey}&limit=5`
    const res = await fetch(url)

    if (!res.ok) {
      await logEnrichment(supabase, {
        cnpj: 'n/a', fonte: 'hunter', status: 'erro',
        triggered_by: payload.user_id, triggered_by_tenant: payload.tenant_id,
      })
      return null
    }

    const data = await res.json()
    const pattern = data.data?.pattern
    const email = pattern || data.data?.emails?.[0]?.value

    return { email: email || null }
  } catch (err) {
    return null
  }
}

// ============== FONTE 5: APOLLO.IO ==============
async function fetchApollo(supabase: any, razaoSocial: string, payload: any) {
  const apiKey = Deno.env.get('APOLLO_API_KEY')
  if (!apiKey) return null

  try {
    const res = await fetch(APOLLO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        api_key: apiKey,
        q_organization_name: razaoSocial,
        person_titles: ['Diretor', 'Sócio', 'Proprietário', 'CEO', 'CFO'],
        limit: 3,
      }),
    })

    if (!res.ok) {
      await logEnrichment(supabase, {
        cnpj: 'n/a', fonte: 'apollo', status: 'rate_limit',
        triggered_by: payload.user_id, triggered_by_tenant: payload.tenant_id,
      })
      return null
    }

    const data = await res.json()
    const person = data.people?.find((p: any) => p.phone_numbers?.length > 0)
    if (!person) return null

    const phone = person.phone_numbers?.[0]
    return {
      telefone: phone?.sanitized_number || phone?.number,
      decisor_nome: person.name,
      decisor_cargo: person.title,
    }
  } catch (err) {
    return null
  }
}

// ============== VALIDACAO WHATSAPP ==============
async function validarWhatsApp(telefone: string): Promise<boolean> {
  // Implementacao via EvolutionAPI (vide Secao 11 da spec)
  // Endpoint: GET /chat/whatsappNumbers/{instance}
  // Payload: { numbers: [telefone] }
  const evolutionUrl = Deno.env.get('EVOLUTION_BASE_URL')
  const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')
  const instance = Deno.env.get('EVOLUTION_INSTANCE_PADRAO')

  if (!evolutionUrl || !evolutionKey || !instance) {
    return false
  }

  try {
    const res = await fetch(`${evolutionUrl}/chat/whatsappNumbers/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionKey,
      },
      body: JSON.stringify({ numbers: [telefone] }),
    })

    if (!res.ok) return false
    const data = await res.json()
    return Array.isArray(data) && data.some(
      (r: any) => r.number === telefone && r.exists
    )
  } catch {
    return false
  }
}

// ============== HELPERS ==============
function normalizarTelefone(telefone: string, ddd?: string): string | null {
  if (!telefone) return null
  const digitos = telefone.replace(/\D/g, '')

  if (digitos.length === 10 || digitos.length === 11) {
    // fixo ou celular brasileiro sem DDI
    if (ddd) {
      return '55' + ddd + digitos
    }
    // assume DDD ja no numero
    return '55' + digitos
  }

  if (digitos.length === 12 || digitos.length === 13) {
    // ja tem 55
    return digitos
  }

  return null
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function buildCamposPreenchidos(result: any): string[] {
  const campos: string[] = []
  if (result.telefone) campos.push('telefone')
  if (result.email) campos.push('email')
  if (result.site_url) campos.push('site_url')
  if (result.socios?.length > 0) campos.push('socios')
  if (result.whatsapp_valido) campos.push('whatsapp_valido')
  return campos
}

async function loadFromCache(supabase: any, cnpj: string): Promise<any | null> {
  const { data } = await supabase
    .from('empresas_enriquecimento_cache')
    .select('*')
    .eq('cnpj', cnpj)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!data) return null

  return {
    telefone: data.telefone_comercial,
    telefone_normalizado: data.telefone_normalizado,
    whatsapp_valido: data.whatsapp_valido,
    email: data.email_comercial,
    site_url: data.site_url,
    socios: data.socios,
    fontes_utilizadas: data.fontes_utilizadas,
    custo_total: 0,
    cache_hit: true,
  }
}

async function saveToCache(supabase: any, cnpj: string, result: any, fontes: string[]) {
  await supabase.from('empresas_enriquecimento_cache').upsert({
    cnpj,
    payload: result,
    fontes_utilizadas: fontes,
    telefone_comercial: result.telefone,
    telefone_normalizado: result.telefone_normalizado,
    email_comercial: result.email,
    whatsapp_valido: result.whatsapp_valido,
    site_url: result.site_url,
    socios: result.socios,
    fetched_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
  })
}

async function updateEmpresa(supabase: any, cnpj: string, result: any, custo: number) {
  await supabase.from('empresas').update({
    telefone_comercial: result.telefone,
    telefone_normalizado: result.telefone_normalizado,
    email_comercial: result.email,
    whatsapp_valido: result.whatsapp_valido,
    whatsapp_validador_em: new Date().toISOString(),
    site_url: result.site_url,
    fonte_enriquecimento: result.fontes_utilizadas.join(','),
    enriquecido_em: new Date().toISOString(),
    enriquecimento_custo: custo,
    socio_exposto: (result.socios?.length || 0) > 0,
  }).eq('cnpj', cnpj)
}

async function incrementCacheHit(supabase: any, cnpj: string) {
  await supabase.rpc('increment_cache_hit', { p_cnpj: cnpj })
}

async function logEnrichment(supabase: any, data: any) {
  await supabase.from('empresas_enriquecimento_log').insert(data)
}

function jsonResponse(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
}
```

### 2.2 RPC auxiliar

```sql
CREATE OR REPLACE FUNCTION increment_cache_hit(p_cnpj char(14))
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE empresas_enriquecimento_cache
  SET hit_count = hit_count + 1
  WHERE cnpj = p_cnpj;
END;
$$;
```

---

## 3. Quando cada fonte e acionada

Fluxo em cascata (custo crescente, qualidade decrescente):

```
cache (R$ 0, < 5ms)
  └── miss
       brasilapi (R$ 0, ~200ms, dados basicos + QSA)
            └── telefone? NAO
                 google_places (R$ 0.03, ~400ms, valida endereco e telefone)
                      └── telefone? NAO
                           cnpjws (R$ 0.05, ~600ms, fallback telefone)
                                └── telefone? NAO
                                     apollo (R$ 0.10, ~800ms, decisor direto)
                                          └── falha
                                               retorna sem telefone
```

Para email (mesma logica, mas hunter no lugar de apollo):

```
brasilapi (gratis)
  └── email? NAO
       hunter (R$ 0, ja incluido no plano, ~300ms)
            └── email? NAO
                 apollo (R$ 0.10)
                      └── falha
```

---

## 4. Custos por consulta (cenario tipico)

| Cenario | Custo | Tempo |
|---|---|---|
| Cache hit (mesmo CNPJ ja enriquecido) | R$ 0,00 | < 5 ms |
| BrasilAPI resolve tudo (tem telefone + email + QSA) | R$ 0,00 | ~ 200 ms |
| BrasilAPI + Google Places | R$ 0,03 | ~ 600 ms |
| BrasilAPI + CnpjWs | R$ 0,05 | ~ 800 ms |
| BrasilAPI + Google + CnpjWs + Hunter | R$ 0,08 | ~ 1.5 s |
| Pipeline completo com Apollo | R$ 0,18 | ~ 2.5 s |

Cenario mais comum (BrasilAPI resolve): R$ 0,00.

Com 50 clientes enriquecendo 30 CNPJs/mes cada = 1.500 enriquecimentos/mes. Destes, ~70% sao cache hit = R$ 0,00. Restantes 450 a custo medio de R$ 0,08 = **R$ 36/mes**.

---

## 5. Gatilhos no frontend

### 5.1 Quando enriquecer automaticamente (sem clique)

- Quando `radar_obras.cnpj_responsavel` e criado pela primeira vez: enriquecimento async em background (Edge Function agendada).
- Quando usuario clica em "ver detalhes" da obra pela primeira vez.

### 5.2 Quando enriquecer por clique do usuario

Botao "Buscar telefone e email" no detalhe da empresa/obra. Cada clique custa uma consulta (mas cache evita repeticao).

### 5.3 Quando NUNCA enriquecer

- Empresa arquivada.
- Empresa marcada como "nao enriquecer" pelo tenant.
- CNPJ de orgao publico (prefeitura, camara): nao tem telefone comercial util.

---

## 6. UI: detalhe da empresa

Adicionar secao "Contatos" em `EmpresaDetalhe.tsx`:

```
┌─────────────────────────────────────────────────────┐
│ Contatos                                            │
├─────────────────────────────────────────────────────┤
│ Telefone:  (34) 3232-1234                          │
│             ✓ WhatsApp valido                       │
│             [Ligar] [Enviar WhatsApp]               │
│                                                     │
│ Email:     contato@construtora.com.br               │
│             ✓ Email validado                        │
│             [Enviar e-mail]                         │
│                                                     │
│ Site:      construtora.com.br                       │
│             [Abrir]                                 │
│                                                     │
│ Quadro societario:                                  │
│   • Joao da Silva - Socio administrador             │
│     CPF: 123.456.***  (cargo publico)               │
│   • Maria Souza - Socio                              │
│                                                     │
│ [Atualizar dados]  [Marcar como nao contactar]     │
└─────────────────────────────────────────────────────┘
```

Socios: mostrar nome, cargo, e **apenas se for cargo publico** (administrador, diretor, presidente). Para cargos tecnicos, ocultar.

Botao "Atualizar dados" chama `enrich-company` com `force_refresh: true`. Custo: varia conforme fontes necessarias.

---

## 7. Validacao de WhatsApp

A validacao usa a EvolutionAPI (vide Secao 11 da spec). Por que validar?

- 30% dos telefones retornados por BrasilAPI estao errados ou desatualizados.
- Numero fixo nunca tem WhatsApp.
- Numero celular existe mas pode nao ter conta ativa.

A validacao consome 1 credito da EvolutionAPI por consulta. Cachear resultado por 30 dias (mudanca de numero e rara).

Atencao: EvolutionAPI em producao nao deve ser usada para isso em escala (> 1k/dia). WhatsApp pode sinalizar como comportamento abusivo. Solucao: usar a Meta Cloud API oficial para validacao em escala (endpoint `/v1/contacts`).

---

## 8. LGPD e base legal

| Dado | Base legal | Pode usar sem consentimento? |
|---|---|---|
| Telefone comercial de PJ | O dado e publico (QSA, site, Google). PJ nao tem expectativa de privacidade sobre contato comercial. | SIM |
| Email comercial de PJ | Mesmo. | SIM |
| QSA (socios) | Publico por dever funcional (Registro Civil de Pessoas Juridicas). Mas use com cuidado: cargo, nao dados pessoais do socio. | SIM para cargo, NAO para vida pessoal |
| Decisor direto (Apollo) | Dado comercializado por data brokers. Base legal discutivel. | Em duvida. Recomenda-se opt-in do decisor. |

Recomendacao:

- Telefone, email, QSA: usar sem opt-in. E dado publico.
- Apollo (telefone pessoal de decisor): usar apenas para prospectar cargos de alta rotatividade (Diretor, CEO), e dar opt-out de 1 clique.
- Telefone de pessoa fisica (dono, mestre): NAO enriquecer. Nao ha fonte publica confiavel, e uso comercial sem consentimento viola LGPD.

---

## 9. Custos mensais por escala

| Clientes | Enriquecimentos/mes (com cache 70%) | Custo BrasilAPI | Custo Google Places | Custo CnpjWs | Custo Hunter | Custo Apollo | Total |
|---|---|---|---|---|---|---|---|
| 10 | 300 | R$ 0 | R$ 9 | R$ 4.50 | R$ 49 (plano) | R$ 0 | **R$ 62** |
| 50 | 1.500 | R$ 0 | R$ 45 | R$ 22.50 | R$ 49 | R$ 30 | **R$ 146** |
| 100 | 3.000 | R$ 0 | R$ 90 | R$ 45 | R$ 99 | R$ 60 | **R$ 294** |
| 200 | 6.000 | R$ 0 | R$ 180 | R$ 90 | R$ 199 | R$ 120 | **R$ 589** |

Cenario 50 clientes: R$ 146/mes. Custo por cliente: R$ 2.92/mes. Vendas geradas por enriquecer telefone/email: 5 a 10% a mais. Payback: 1 venda por mes paga o enriquecimento.

---

## 10. Configuracao de secrets

Adicione ao `.env`:

```bash
# Enriquecimento de empresas
BRASILAPI_URL=https://brasilapi.com.br/api/cnpj/v1/
GOOGLE_PLACES_API_KEY=sua_chave_aqui
CNPJWS_API_KEY=sua_chave_aqui
HUNTER_API_KEY=sua_chave_aqui
APOLLO_API_KEY=sua_chave_aqui

# Para validacao de WhatsApp
EVOLUTION_BASE_URL=https://evolution.seudominio.com.br
EVOLUTION_API_KEY=sua_chave_aqui
EVOLUTION_INSTANCE_PADRAO=validacao
```

E ao Supabase:

```bash
supabase secrets set GOOGLE_PLACES_API_KEY=xxx
supabase secrets set CNPJWS_API_KEY=xxx
supabase secrets set HUNTER_API_KEY=xxx
supabase secrets set APOLLO_API_KEY=xxx
supabase secrets set EVOLUTION_BASE_URL=xxx
supabase secrets set EVOLUTION_API_KEY=xxx
supabase secrets set EVOLUTION_INSTANCE_PADRAO=validacao
```

---

## 11. Cronograma de implementacao

| Semana | Tarefa |
|---|---|
| 1 | Schema (colunas em `empresas`, `empresas_enriquecimento_cache`, `empresas_enriquecimento_log`) + RPC `increment_cache_hit` |
| 2 | Edge Function `enrich-company` com BrasilAPI + Google Places |
| 3 | UI: secao "Contatos" em `EmpresaDetalhe.tsx` + botao "Buscar telefone e email" |
| 4 | Integracao CnpjWs + Hunter |
| 5 | Validacao de WhatsApp + cache de 30 dias |
| 6 | Apollo.io + audit log + dashboard de custos |

Total: 6 semanas. 1 dev. Custo de APIs: R$ 62 a R$ 294/mes conforme escala.

---

## 12. Riscos e mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| BrasilAPI fora do ar | media | medio | Cache de 90 dias. Fallback para BrasilAPI mirror ou scraping direto da Receita. |
| Google Places cobra caro sem controle | alta | medio | Limite de 100 chamadas/mes no plano free. Acima disso, plano R$ 200/mes com 5k chamadas. |
| Apollo vende dado desatualizado | alta | baixo | Validar telefone via WhatsApp antes de usar. Se nao valida, descarta. |
| CNPJ invalido ou baixado | media | baixo | BrasilAPI retorna erro. Empresa e marcada como `situacao='baixada'`. |
| Cache retorna dado antigo | baixa | medio | TTL 90 dias para campos basicos. Telefone/WhatsApp: 30 dias. |
| Banimento EvolutionAPI por validacao em massa | media | alto | Usar Meta Cloud API `/v1/contacts` para validacao em escala. Limite 100 chamadas/dia. |

---

## 13. Metricas de sucesso

Acompanhar mensalmente:

- Taxa de cache hit (meta > 70%).
- Custo medio por enriquecimento (meta < R$ 0,10).
- % de CNPJs com telefone valido (meta > 50%).
- % de CNPJs com WhatsApp valido (meta > 35%).
- % de leads criados com enriquecimento que viram deals (meta > 25%, vs 8% sem enriquecimento).
- Tempo medio de pipeline (meta < 14 dias, vs 28 dias sem enriquecimento).

---

## 14. Quando NAO enriquecer

Lista de CNPJs a ignorar:

- Orgaos publicos (CNPJ de prefeitura, camara, ministerio): tem razao social mas telefone comercial e o atendimento geral.
- Empresas com `situacao='baixada'` na Receita.
- Empresas marcadas como `nao_enriquecer=true` pelo tenant.
- Pessoas fisicas (CPF): nunca enriquecer via esta pipeline.
- Empresas em situacao irregular ou falidas.

Filtro SQL:

```sql
-- Exemplo: lista de CNPJs a enriquecer automaticamente
SELECT cnpj
FROM empresas
WHERE situacao_receita = 'ativa'
  AND cnpj NOT LIKE '%.%.%'              -- exclui formato invalido
  AND nao_enriquecer = false
  AND enriquecido_em IS NULL
  AND LENGTH(cnpj) = 14
LIMIT 100;
```

---

## 15. Resumo executivo

| Item | Valor |
|---|---|
| Custo inicial de implementacao | 6 semanas de 1 dev (~R$ 12k) |
| Custo mensal com 50 clientes | R$ 146/mes |
| Custo por enriquecimento | R$ 0,00 a R$ 0,18 |
| Aumento de conversao esperado | +5 a 10 pp |
| Payback | 1 mes |
| Riscos principais | BrasilAPI instavel, custo Google Places, dados desatualizados |
| Mitigacao principal | Cache agressivo + validacao WhatsApp antes de usar |

Recomendacao final: implementar na Sprint 5 do roadmap (depois de PNCP). E o segundo maior impulsionador de conversao depois de alerta diario de obra nova.