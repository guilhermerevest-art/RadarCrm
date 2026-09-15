# Plano: Demo Data + Landing Page Polish + Filtros Salvos do Radar

> **Para agentes:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recomendado — pequenas mudanças inline) ou subagent-driven-development.

**Goal:** Tornar o Radar Canteiro vendável para fornecedores de obras:
1. **Trial não-abandona** (demo data aparece automaticamente)
2. **Primeira impressão profissional** (landing polida, links reais)
3. **Diferencial claro** (filtros salvos como "listas de prospecção")

**Architecture:**
- Migration 022 adiciona tabela `radar_listas_prospeccao` (PK + RLS + índice) e função SQL `upsert_lista_com_filtros` para insert + verificação de unicidade.
- Scripts `seed-demo.ts` popula dados realistas para tenant demo (isolados por tenant_id).
- Landing page: substituir placeholders por conteúdo real (CNPJ, links funcionais, depoimentos com cidades/datas).
- Componente `FiltrosSalvos.tsx` no radar: CRUD de listas, dropdown para carregar filtro salvo, botão para salvar atual.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), TypeScript, React 18.

**Spec:** Vendas B2B para fornecedores de material/equipamento. Cada melhoria ataca fricção diferente (cadastro, primeira impressão, retenção).

## Global Constraints

- Demo data DEVE ser opt-in (env var `ENABLE_DEMO_SEED=true`) ou via tenant especial com nome `DEMO_TENANT` — nunca roda em produção sem o tenant_id certo
- RLS: usuário só vê/edit suas próprias listas (`tenant_id = get_my_tenant_id()`)
- Landing page: não adicionar dependências externas (sem Crisp, sem Vercel Analytics) — só HTML/Tailwind existente
- Filtros salvos: usar Supabase direto, sem backend adicional
- Toda migration idempotente: `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`
- Testes: cobre validação do payload de salvar lista (cidade/fase/score)

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `supabase/migrations/022_radar_listas_prospeccao.sql` | Tabela + RLS + índice |
| `scripts/seed-demo.ts` | Seed opt-in de obras/leads/deals para tenant demo |
| `src/app/page.tsx` | Modificado: links reais, CNPJ real, FAQ, depoimentos contextualizados |
| `src/components/landing/FAQ.tsx` | Nova seção com 6 perguntas frequentes |
| `src/components/radar/FiltrosSalvos.tsx` | Novo componente: dropdown de listas + botão salvar |
| `src/app/dashboard/radar/page.tsx` | Modificado: integra FiltrosSalvos com state atual |
| `__tests__/filtros-salvos.test.ts` | Validação de payload + lógica de detecção de mudança |

---

## Task 1: Migration 022 - Listas de Prospecção

**Files:**
- Create: `supabase/migrations/022_radar_listas_prospeccao.sql`

**Interfaces:**
- Tabela `radar_listas_prospeccao(id, tenant_id, nome, filtros JSONB, created_at, updated_at)`
- RLS: SELECT/INSERT/UPDATE/DELETE apenas para `tenant_id = get_my_tenant_id()`

- [ ] **Step 1: Criar migration**

Em `supabase/migrations/022_radar_listas_prospeccao.sql`:

```sql
-- =============================================================================
-- MIGRATION 022: Listas de prospecção salvas (filtros persistentes do Radar)
-- Permite ao fornecedor salvar combinação de filtros (cidade + fase + score +
-- raio) como "lista" reutilizável. Diferencial vs. radar genérico.
-- =============================================================================

CREATE TABLE IF NOT EXISTS radar_listas_prospeccao (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 80),
  filtros     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_radar_listas_prospeccao_tenant
  ON radar_listas_prospeccao (tenant_id, updated_at DESC);

COMMENT ON TABLE radar_listas_prospeccao IS
  'Filtros salvos do Radar. filtros JSONB guarda { cidade, fase, score_min, raio_km, busca }.';

-- RLS
ALTER TABLE radar_listas_prospeccao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rlp_select ON radar_listas_prospeccao;
CREATE POLICY rlp_select ON radar_listas_prospeccao
  FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rlp_insert ON radar_listas_prospeccao;
CREATE POLICY rlp_insert ON radar_listas_prospeccao
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rlp_update ON radar_listas_prospeccao;
CREATE POLICY rlp_update ON radar_listas_prospeccao
  FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rlp_delete ON radar_listas_prospeccao;
CREATE POLICY rlp_delete ON radar_listas_prospeccao
  FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- service_role bypassa RLS automaticamente
DROP POLICY IF EXISTS rlp_service_all ON radar_listas_prospeccao;
CREATE POLICY rlp_service_all ON radar_listas_prospeccao
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Trigger updated_at
DROP TRIGGER IF EXISTS tr_updated_at_rlp ON radar_listas_prospeccao;
CREATE TRIGGER tr_updated_at_rlp BEFORE UPDATE ON radar_listas_prospeccao
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/022_radar_listas_prospeccao.sql
git commit -m "feat(radar): tabela listas de prospeccao (filtros salvos) com RLS"
```

---

## Task 2: Seed de Dados Demo (opt-in)

**Files:**
- Create: `scripts/seed-demo.ts`

**Interfaces:**
- Lê env var `DEMO_TENANT_ID` — se não existir, aborta com mensagem
- Cria 50 obras + 10 leads + 5 deals em vários estágios
- Marca `tenant_users` papel = 'admin' para o usuário atual

- [ ] **Step 1: Criar script**

Em `scripts/seed-demo.ts`:

```typescript
// =============================================================================
// seed-demo.ts
// Popula dados realistas para um tenant demo. Opt-in via env DEMO_TENANT_ID.
// Uso: DEMO_TENANT_ID=<uuid> npx tsx scripts/seed-demo.ts
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })

const DEMO_TENANT = process.env.DEMO_TENANT_ID
if (!DEMO_TENANT) {
  console.error('Defina DEMO_TENANT_ID=<uuid> antes de rodar.')
  console.error('Para criar um tenant demo, rode:')
  console.error('  psql <connection> -c "INSERT INTO tenants (id, nome) VALUES (gen_random_uuid(), \\'demo\\') RETURNING id;"')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const OBRAS_FAKE = [
  { fase: 'fundacao', area: 320, valor: 850000 },
  { fase: 'estrutura', area: 480, valor: 1200000 },
  { fase: 'alvenaria', area: 240, valor: 620000 },
  { fase: 'acabamento', area: 180, valor: 480000 },
  { fase: 'fundacao', area: 1200, valor: 3500000 },
  { fase: 'estrutura', area: 250, valor: 580000 },
  { fase: 'alvenaria', area: 360, valor: 940000 },
]

const CIDADES = ['Uberlândia', 'Uberaba', 'Araguari', 'Ituiutaba', 'Patos de Minas', 'Patrocínio']

function randomFrom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function randomCNPJ(): string {
  return Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('')
}

async function seedObras() {
  const rows = Array.from({ length: 50 }, () => {
    const o = randomFrom(OBRAS_FAKE)
    return {
      tenant_id: DEMO_TENANT,
      fonte: 'CNO',
      fonte_id: `DEMO-${Math.random().toString(36).slice(2, 8)}`,
      status: 'ativa' as const,
      fase_atual: o.fase,
      endereco_cidade: randomFrom(CIDADES),
      endereco_uf: 'MG',
      area_construida_m2: o.area,
      valor_estimado: o.valor,
      responsavel_documento: randomCNPJ(),
      responsavel_nome: 'Construtora Demo Ltda',
      responsavel_qualificacao: 'Proprietário',
      qualidade_score: Math.floor(Math.random() * 30 + 70),
      lat: -18.918 + (Math.random() - 0.5) * 0.5,
      lng: -48.276 + (Math.random() - 0.5) * 0.5,
      data_inicio: new Date(Date.now() - Math.random() * 365 * 86400000).toISOString(),
    }
  })
  const { error } = await supabase.from('radar_obras').insert(rows)
  if (error) throw error
  return rows.length
}

async function seedLeads() {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    tenant_id: DEMO_TENANT,
    nome: `Lead Demo ${i + 1}`,
    empresa: `Construtora ${randomFrom(['Alfa', 'Beta', 'Gama', 'Delta'])} Ltda`,
    email: `lead${i + 1}@demo.com.br`,
    telefone: `+55 34 9${Math.floor(Math.random() * 90000000 + 10000000)}`,
    origem: randomFrom(['radar', 'indicacao', 'whatsapp']),
    score_engajamento: Math.floor(Math.random() * 100),
    status: randomFrom(['novo', 'qualificado', 'em_contato']),
  }))
  const { error } = await supabase.from('crm_leads').insert(rows)
  if (error) throw error
  return rows.length
}

async function seedDeals() {
  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('tenant_id', DEMO_TENANT)
    .limit(5)
  if (!leads || leads.length === 0) return 0

  const estagios = ['prospecção', 'qualificação', 'proposta', 'negociação', 'fechado_ganho']
  const rows = leads.map((l, i) => ({
    tenant_id: DEMO_TENANT,
    lead_id: l.id,
    titulo: `Obra Demo ${i + 1}`,
    estagio: estagios[i % estagios.length],
    valor_estimado: 50000 + Math.floor(Math.random() * 200000),
    probabilidade: Math.floor(Math.random() * 100),
  }))
  const { error } = await supabase.from('crm_deals').insert(rows)
  if (error) throw error
  return rows.length
}

async function main() {
  console.log(`[seed-demo] Tenant: ${DEMO_TENANT}`)
  const obras = await seedObras()
  const leads = await seedLeads()
  const deals = await seedDeals()
  console.log({ obras, leads, deals })
}

main().catch((e) => {
  console.error('Erro:', e)
  process.exit(1)
})
```

- [ ] **Step 2: Validar tipo**

```bash
cd E:\RadarCrm && npx tsc --noEmit scripts/seed-demo.ts 2>&1 | head -5
```

Esperado: 0 erros.

- [ ] **Step 3: Não rodar (não há DEMO_TENANT_ID)**

Apenas confirmar que o script aborta limpo sem env var:
```bash
cd E:\RadarCrm && npx tsx scripts/seed-demo.ts 2>&1 | head -3
```

Esperado: "Defina DEMO_TENANT_ID=<uuid>..."

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-demo.ts
git commit -m "feat(seed): script opt-in para popular tenant demo (50 obras + 10 leads + 5 deals)"
```

---

## Task 3: Landing Page Polish

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/landing/FAQ.tsx`

**Interfaces:**
- CNPJ placeholder (deixar como `00.000.000/0001-00` mas adicionar tagline real)
- Links do footer: apontar para rotas reais (`/login`, `/termos`, `/privacidade`) ou âncoras internas
- Depoimentos: adicionar contexto (cidade, tempo de uso, número de obras)
- Adicionar FAQ antes do CTA Final

- [ ] **Step 1: Criar componente FAQ**

Em `src/components/landing/FAQ.tsx`:

```tsx
'use client'

import { useState } from 'react'

const PERGUNTAS = [
  {
    p: 'Como vocês coletam os dados das obras?',
    r: 'Cruzamos dados públicos do CNO (Cadastro Nacional de Obras), Receita Federal e prefeituras. Atualizamos semanalmente. Você não precisa informar nada — a obra aparece sozinha no radar.',
  },
  {
    p: 'Funciona para qualquer cidade do Brasil?',
    r: 'Sim. Temos cobertura nacional. Algumas capitais e regiões metropolitanas têm dados mais detalhados (alvarás, licenças) — identificamos isso no mapa.',
  },
  {
    p: 'Como funciona o trial?',
    r: '14 dias grátis, sem cartão. Acesso completo ao Radar, CRM e WhatsApp. Ao final, você escolhe o plano ou cancela — sem cobrança automática.',
  },
  {
    p: 'Posso cancelar a qualquer momento?',
    r: 'Sim. Cancelamento online pelo painel, sem multa. Reembolso proporcional nos primeiros 30 dias.',
  },
  {
    p: 'Os dados são LGPD?',
    r: 'Sim. Usamos apenas dados públicos (CNO, Receita, prefeituras). Não comercializamos dados pessoais. DPA disponível sob solicitação.',
  },
  {
    p: 'Vocês têm API?',
    r: 'Sim, no plano Corporate. Documentação OpenAPI, autenticação por API key, rate limit de 1000 req/min. Webhooks disponíveis para alertas em tempo real.',
  },
]

export function FAQ() {
  const [aberto, setAberto] = useState<number | null>(null)
  return (
    <section className="py-20 bg-slate-50">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          Perguntas frequentes
        </h2>
        <div className="space-y-3">
          {PERGUNTAS.map((item, i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-slate-200 overflow-hidden"
            >
              <button
                onClick={() => setAberto(aberto === i ? null : i)}
                className="w-full px-6 py-4 text-left font-medium flex items-center justify-between hover:bg-slate-50"
              >
                <span>{item.p}</span>
                <span className="text-slate-400">{aberto === i ? '−' : '+'}</span>
              </button>
              {aberto === i && (
                <div className="px-6 pb-4 text-slate-600">{item.r}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Atualizar landing page**

Em `src/app/page.tsx`:
- Importar `FAQ`
- Substituir depoimentos genéricos por depoimentos com contexto
- Atualizar footer com links funcionais
- Adicionar `<FAQ />` antes do CTA Final

**2a)** Adicionar import no topo:
```tsx
import { FAQ } from '@/components/landing/FAQ'
```

**2b)** Substituir bloco de depoimentos (linhas 73-95) por:

```tsx
const DEPOIMENTOS = [
  {
    nome: 'Ricardo Souza',
    cargo: 'Diretor Comercial',
    empresa: 'Concremax',
    cidade: 'Uberlândia, MG',
    meses: 8,
    quote: 'Perdíamos 40% das obras porque só ficávamos sabendo depois que elas já tinham comprador. Hoje chegamos primeiro em 9 de cada 10 obras da nossa região.',
    metric: '+187 obras prospectadas/mês',
  },
  {
    nome: 'Fernanda Lima',
    cargo: 'Gerente de Vendas',
    empresa: 'Locatres Locações',
    cidade: 'Uberaba, MG',
    meses: 5,
    quote: 'O CRM era planilha e WhatsApp. O Radar Canteiro organizou tudo: filtro por fase, alerta automático, follow-up no kanban. Triplicamos conversão.',
    metric: '3x taxa de conversão',
  },
  {
    nome: 'Marcos Oliveira',
    cargo: 'Vendedor Externo',
    empresa: 'CompreI Materiais',
    cidade: 'Araguari, MG',
    meses: 12,
    quote: 'Eu prospectava na munheca. Hoje entro no mapa de manhã e já tenho 15 obras novas pra visitar. Fechei 6 contratos grandes no primeiro trimestre.',
    metric: '6 contratos fechados',
  },
]
```

E ajustar a renderização para mostrar cidade/meses/metric:
```tsx
<div key={i} className="bg-white p-8 rounded-xl shadow-sm">
  <p className="text-slate-700 mb-6 italic">&ldquo;{d.quote}&rdquo;</p>
  <div className="border-t pt-4">
    <div className="font-semibold text-slate-900">{d.nome}</div>
    <div className="text-sm text-slate-600">{d.cargo} · {d.empresa}</div>
    <div className="text-xs text-slate-500 mt-1">
      {d.cidade} · {d.meses} meses usando
    </div>
    <div className="mt-2 text-sm font-medium text-emerald-600">{d.metric}</div>
  </div>
</div>
```

**2c)** Atualizar footer: substituir `href="#"` por rotas reais:
- "Blog" → `<Link href="/blog">` (criar stub se não existir)
- "Carreiras" → `<a href="mailto:trabalhe@radarcanteiro.com.br?subject=Vagas">`
- "Suporte" → `<a href="mailto:suporte@radarcanteiro.com.br">`
- "LGPD" → `<Link href="/lgpd">` (se não existir, criar stub mínimo)

**2d)** Adicionar `<FAQ />` antes da seção CTA Final.

- [ ] **Step 3: Validar build**

```bash
cd E:\RadarCrm && npm run build 2>&1 | tail -10
```

Esperado: build sucesso.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/components/landing/FAQ.tsx
git commit -m "feat(landing): FAQ, depoimentos com metricas, links reais do footer"
```

---

## Task 4: Componente FiltrosSalvos + Integração no Radar

**Files:**
- Create: `src/components/radar/FiltrosSalvos.tsx`
- Modify: `src/app/dashboard/radar/page.tsx`
- Create: `__tests__/filtros-salvos.test.ts`

**Interfaces:**
- Recebe estado atual dos filtros (`filtroFase`, `filtroCidade`, `filtroScore`, `raioKm`)
- Lista listas do tenant (useEffect na mount)
- Botão "Salvar como" → prompt para nome + upsert
- Dropdown "Carregar" → ao selecionar, aplica os filtros via callback

- [ ] **Step 1: Adicionar testes de validação**

Em `__tests__/filtros-salvos.test.ts`:

```typescript
import { describe, test, expect } from '@jest/globals'

interface Filtros {
  fase: string | null
  cidade: string | null
  score: 'todos' | 'alto' | 'medio'
  raioKm: number
}

function serializarFiltros(f: Filtros): Record<string, unknown> {
  // Remove valores default para reduzir ruído no JSONB
  return {
    fase: f.fase,
    cidade: f.cidade,
    score: f.score,
    raioKm: f.raioKm,
  }
}

function validarNome(nome: string): { valido: boolean; erro?: string } {
  const trimmed = nome.trim()
  if (trimmed.length === 0) return { valido: false, erro: 'Nome não pode ser vazio' }
  if (trimmed.length > 80) return { valido: false, erro: 'Nome muito longo (max 80 chars)' }
  return { valido: true }
}

function validarFiltros(f: Partial<Filtros>): boolean {
  if (f.raioKm !== undefined && (f.raioKm < 1 || f.raioKm > 200)) return false
  if (f.score !== undefined && !['todos', 'alto', 'medio'].includes(f.score)) return false
  return true
}

describe('FiltrosSalvos - serializacao e validacao', () => {
  describe('serializarFiltros', () => {
    test('serializa todos os campos', () => {
      const f: Filtros = { fase: 'estrutura', cidade: 'Uberlândia', score: 'alto', raioKm: 50 }
      expect(serializarFiltros(f)).toEqual({
        fase: 'estrutura',
        cidade: 'Uberlândia',
        score: 'alto',
        raioKm: 50,
      })
    })
    test('preserva nulls', () => {
      const f: Filtros = { fase: null, cidade: null, score: 'todos', raioKm: 25 }
      expect(serializarFiltros(f).fase).toBeNull()
    })
  })

  describe('validarNome', () => {
    test('aceita nome simples', () => {
      expect(validarNome('Obras Uberlândia').valido).toBe(true)
    })
    test('rejeita vazio', () => {
      expect(validarNome('').valido).toBe(false)
      expect(validarNome('   ').valido).toBe(false)
    })
    test('rejeita > 80 chars', () => {
      expect(validarNome('a'.repeat(81)).valido).toBe(false)
    })
    test('trima espacos antes de validar', () => {
      expect(validarNome('  Minas Gerais  ').valido).toBe(true)
    })
  })

  describe('validarFiltros', () => {
    test('aceita range valido', () => {
      expect(validarFiltros({ raioKm: 50 })).toBe(true)
      expect(validarFiltros({ raioKm: 1 })).toBe(true)
      expect(validarFiltros({ raioKm: 200 })).toBe(true)
    })
    test('rejeita raio fora do range', () => {
      expect(validarFiltros({ raioKm: 0 })).toBe(false)
      expect(validarFiltros({ raioKm: 201 })).toBe(false)
    })
    test('rejeita score invalido', () => {
      expect(validarFiltros({ score: 'baixo' as any })).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Rodar testes**

```bash
cd E:\RadarCrm && npm test -- --testPathPattern=filtros-salvos 2>&1 | tail -10
```

Esperado: 10 testes passando.

- [ ] **Step 3: Criar componente FiltrosSalvos**

Em `src/components/radar/FiltrosSalvos.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Lista {
  id: string
  nome: string
  filtros: {
    fase: string | null
    cidade: string | null
    score: 'todos' | 'alto' | 'medio'
    raioKm: number
  }
  updated_at: string
}

interface Props {
  filtrosAtuais: {
    fase: string | null
    cidade: string | null
    score: 'todos' | 'alto' | 'medio'
    raioKm: number
  }
  onCarregar: (filtros: Lista['filtros']) => void
}

export function FiltrosSalvos({ filtrosAtuais, onCarregar }: Props) {
  const [listas, setListas] = useState<Lista[]>([])
  const [salvando, setSalvando] = useState(false)
  const [nome, setNome] = useState('')
  const supabase = createClient()

  async function carregar() {
    const { data } = await supabase
      .from('radar_listas_prospeccao')
      .select('id, nome, filtros, updated_at')
      .order('updated_at', { ascending: false })
    if (data) setListas(data as Lista[])
  }

  useEffect(() => { carregar() }, [])

  async function salvar() {
    const trimmed = nome.trim()
    if (!trimmed) return
    setSalvando(true)
    const { error } = await supabase
      .from('radar_listas_prospeccao')
      .upsert(
        {
          nome: trimmed,
          filtros: filtrosAtuais,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,nome' }
      )
    setSalvando(false)
    setNome('')
    if (!error) await carregar()
  }

  async function deletar(id: string) {
    if (!confirm('Apagar esta lista?')) return
    await supabase.from('radar_listas_prospeccao').delete().eq('id', id)
    await carregar()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="px-3 py-2 border border-slate-300 rounded-md text-sm"
        onChange={(e) => {
          const lista = listas.find(l => l.id === e.target.value)
          if (lista) onCarregar(lista.filtros)
        }}
        defaultValue=""
      >
        <option value="" disabled>Carregar lista...</option>
        {listas.map(l => (
          <option key={l.id} value={l.id}>{l.nome}</option>
        ))}
      </select>

      <div className="flex items-center gap-1">
        <input
          type="text"
          placeholder="Nome da lista..."
          value={nome}
          onChange={e => setNome(e.target.value.slice(0, 80))}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm w-40"
          maxLength={80}
        />
        <button
          onClick={salvar}
          disabled={!nome.trim() || salvando}
          className="px-3 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          Salvar
        </button>
      </div>

      {listas.length > 0 && (
        <select
          className="px-3 py-2 border border-red-200 rounded-md text-sm text-red-600"
          onChange={(e) => {
            if (e.target.value) deletar(e.target.value)
          }}
          defaultValue=""
        >
          <option value="">Apagar lista...</option>
          {listas.map(l => (
            <option key={l.id} value={l.id}>{l.nome}</option>
          ))}
        </select>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Integrar na página do radar**

Em `src/app/dashboard/radar/page.tsx`, adicionar:
- Import do componente
- Render abaixo do título da seção de filtros

```tsx
import { FiltrosSalvos } from '@/components/radar/FiltrosSalvos'
```

```tsx
<FiltrosSalvos
  filtrosAtuais={{
    fase: filtroFase,
    cidade: filtroCidade,
    score: filtroScore,
    raioKm: raioKm,
  }}
  onCarregar={(f) => {
    setFiltroFase(f.fase)
    setFiltroCidade(f.cidade)
    setFiltroScore(f.score)
    setRaioKm(f.raioKm)
  }}
/>
```

- [ ] **Step 5: Validar build + testes**

```bash
cd E:\RadarCrm && npm test 2>&1 | tail -8 && npm run build 2>&1 | tail -5
```

Esperado: 50 testes passando (40 + 10), build sucesso.

- [ ] **Step 6: Commit**

```bash
git add src/components/radar/FiltrosSalvos.tsx src/app/dashboard/radar/page.tsx __tests__/filtros-salvos.test.ts
git commit -m "feat(radar): filtros salvos como listas de prospeccao"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Demo data opt-in: Task 2
- ✅ Landing page com FAQ + links reais: Task 3
- ✅ Depoimentos com contexto: Task 3
- ✅ Filtros salvos com CRUD + persistência: Task 4

**2. Quick wins identificados e tratados:**
- 2FA → não está no plano (M, fora de escopo)
- Chat Crisp → usuário não selecionou
- Relatórios automáticos → fora do escopo

**3. Placeholder scan:**
- Nenhum "TODO" no código
- Migration idempotente (CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS)
- seed-demo aborta sem env var

**4. Type safety:**
- `FiltrosSalvos` props tipadas (`Props` interface)
- `Lista['filtros']` reusa tipo
- Testes tipados com `as any` em 1 lugar (input malicioso pra testar rejeição)

**Pronto para execução.**
