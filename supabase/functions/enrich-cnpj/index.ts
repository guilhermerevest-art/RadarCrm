// =============================================================================
// Edge Function: enrich-cnpj
// Enriquece CNPJs das obras (radar_obras.responsavel_documento) via
// BrasilAPI (primario) + publica.cnpj.ws (fallback).
// Grava em radar_obras_empresas + radar_obras_socios.
//
// Parametros:
//   limit (opcional): quantos CNPJs processar nesta execucao (default 200)
//   force_refresh (opcional): re-consultar mesmo ja enriquecido
//
// Estrategia:
//   1. Buscar obras ativas com responsavel_documento de 14 digitos
//   2. Filtrar apenas os CNPJs ainda nao enriquecidos (ou se force_refresh)
//   3. Para cada CNPJ: BrasilAPI -> publica.cnpj.ws -> marca nao_encontrado
//   4. Gravar empresa + socios via service_role (bypass RLS)
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BRASILAPI_URL = 'https://brasilapi.com.br/api/cnpj/v1/'
const PUBLICA_URL = 'https://publica.cnpj.ws/cnpj/'
const DELAY_MS = 1100  // ~55 req/min, dentro do limite da BrasilAPI

const QUALIFICACOES_PRIORITARIAS = new Set([
  'Pessoa Juridica Construtora',
  'Incorporador de Construcao Civil',
])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BrasilApiData {
  cnpj: string
  razao_social: string
  nome_fantasia: string
  descricao_situacao_cadastral: string
  natureza_juridica: string
  cnae_fiscal: number
  cnae_fiscal_descricao?: string
  porte: string
  capital_social: number | string
  data_inicio_atividade: string
  descricao_tipo_de_logradouro: string
  logradouro: string
  numero: string
  bairro: string
  municipio: string
  uf: string
  cep: string
  ddd_telefone_1: string
  email: string
}

interface PublicaData {
  cnpj: string
  razao_social: string
  natureza_juridica: { descricao: string }
  capital_social: number | string
  estabelecimento: {
    nome_fantasia: string
    situacao_cadastral: string
    atividade_principal: { id: string; descricao: string }
    porte: { descricao: string }
    data_inicio_atividade: string
    tipo_logradouro: string
    logradouro: string
    numero: string
    bairro: string
    cidade: { nome: string }
    estado: { sigla: string }
    cep: string
    ddd1: string
    telefone1: string
    email: string
  }
  socios?: Array<{
    nome: string
    qualificacao: string
    data_entrada: string
    faixa_etaria: string
  }>
}

interface FetchResult<T> {
  encontrado: boolean
  notFound: boolean
  data?: T
}

async function fetchBrasilApi(cnpj: string): Promise<FetchResult<BrasilApiData>> {
  try {
    const resp = await fetch(BRASILAPI_URL + cnpj, {
      headers: { 'User-Agent': 'RadarCrm/1.0 (contato@radarcrm.com.br)' },
    })
    if (resp.status === 200) return { encontrado: true, notFound: false, data: await resp.json() }
    if (resp.status === 404) return { encontrado: false, notFound: true }
    return { encontrado: false, notFound: false }  // erro transitorio
  } catch {
    return { encontrado: false, notFound: false }
  }
}

async function fetchPublica(cnpj: string): Promise<FetchResult<PublicaData>> {
  try {
    const resp = await fetch(PUBLICA_URL + cnpj, {
      headers: { 'User-Agent': 'RadarCrm/1.0 (contato@radarcrm.com.br)' },
    })
    if (resp.status === 200) return { encontrado: true, notFound: false, data: await resp.json() }
    if (resp.status === 404) return { encontrado: false, notFound: true }
    return { encontrado: false, notFound: false }
  } catch {
    return { encontrado: false, notFound: false }
  }
}

function cnpjBasico(cnpj: string | undefined | null, fallback: string): string {
  const d = (cnpj || '').replace(/\D/g, '').substring(0, 8)
  return d.length === 8 ? d : fallback
}

function mapearBrasilApi(d: BrasilApiData, cnpjOriginal: string): Record<string, unknown> {
  const cnae = d.cnae_fiscal
    ? `${d.cnae_fiscal}${d.cnae_fiscal_descricao ? ' - ' + d.cnae_fiscal_descricao : ''}`
    : null
  const logradouro = [d.descricao_tipo_de_logradouro, d.logradouro, d.numero]
    .filter(Boolean).join(' ').trim()
  return {
    cnpj_basico: cnpjBasico(d.cnpj, cnpjOriginal),
    razao_social: d.razao_social || null,
    nome_fantasia: d.nome_fantasia || null,
    situacao_cadastral: d.descricao_situacao_cadastral || null,
    natureza_juridica: d.natureza_juridica || null,
    cnae_principal: cnae,
    porte: d.porte || null,
    capital_social: d.capital_social ? parseFloat(String(d.capital_social)) : null,
    data_abertura: d.data_inicio_atividade || null,
    logradouro: logradouro || null,
    bairro: d.bairro || null,
    municipio: d.municipio || null,
    uf: d.uf || null,
    cep: d.cep || null,
    telefone: d.ddd_telefone_1 || null,
    email: d.email || null,
    fonte_enriquecimento: 'brasilapi',
  }
}

function mapearPublica(d: PublicaData, cnpjOriginal: string): Record<string, unknown> {
  const e = d.estabelecimento
  const cnae = e.atividade_principal?.id
    ? `${e.atividade_principal.id}${e.atividade_principal.descricao ? ' - ' + e.atividade_principal.descricao : ''}`
    : null
  const logradouro = [e.tipo_logradouro, e.logradouro, e.numero].filter(Boolean).join(' ').trim()
  const telefone = (e.ddd1 && e.telefone1) ? `${e.ddd1}${e.telefone1}` : null
  return {
    cnpj_basico: cnpjBasico(d.cnpj, cnpjOriginal),
    razao_social: d.razao_social || null,
    nome_fantasia: e.nome_fantasia || null,
    situacao_cadastral: e.situacao_cadastral || null,
    natureza_juridica: d.natureza_juridica?.descricao || null,
    cnae_principal: cnae,
    porte: e.porte?.descricao || null,
    capital_social: d.capital_social ? parseFloat(String(d.capital_social)) : null,
    data_abertura: e.data_inicio_atividade || null,
    logradouro: logradouro || null,
    bairro: e.bairro || null,
    municipio: e.cidade?.nome || null,
    uf: e.estado?.sigla || null,
    cep: e.cep || null,
    telefone,
    email: e.email || null,
    fonte_enriquecimento: 'publica.cnpj.ws',
  }
}

async function salvarEmpresa(admin: any, tenantId: string, cnpj: string, dados: Record<string, unknown>): Promise<void> {
  await admin.from('radar_obras_empresas').upsert({
    tenant_id: tenantId,
    cnpj,
    ...dados,
    last_enriched_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,cnpj' })
}

async function salvarSocios(admin: any, tenantId: string, cnpj: string, socios: any[]): Promise<void> {
  if (!socios || socios.length === 0) return
  // delete + insert para refletir quadro societario atual
  await admin.from('radar_obras_socios').delete()
    .eq('tenant_id', tenantId)
    .eq('cnpj_empresa', cnpj)
  const rows = socios.map(s => ({
    tenant_id: tenantId,
    cnpj_empresa: cnpj,
    nome: s.nome,
    qualificacao: s.qualificacao || null,
    data_entrada: s.data_entrada || null,
    faixa_etaria: s.faixa_etaria || null,
  }))
  await admin.from('radar_obras_socios').insert(rows)
}

async function marcarNaoEncontrado(admin: any, tenantId: string, cnpj: string): Promise<void> {
  await admin.from('radar_obras_empresas').upsert({
    tenant_id: tenantId,
    cnpj,
    cnpj_basico: cnpj.substring(0, 8),
    fonte_enriquecimento: 'nao_encontrado',
    last_enriched_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,cnpj' })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, supabaseServiceKey)

    const { limit: limitArg, force_refresh } = await req.json().catch(() => ({}))
    const limit = typeof limitArg === 'number' ? limitArg : 200
    const force = !!force_refresh

    // 1) Buscar obras ativas com CNPJ (14 digitos)
    // Paginar para evitar .range(0, 9999) em base grande
    const cnpjToTenant = new Map<string, string>()
    const cnpjToQualif = new Map<string, string | null>()

    let offset = 0
    const PAGE = 1000
    while (cnpjToTenant.size < limit + 1000) {
      const { data: obras, error } = await admin
        .from('radar_obras')
        .select('id, tenant_id, responsavel_documento, responsavel_qualificacao')
        .eq('status', 'ativa')
        .not('responsavel_documento', 'is', null)
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      if (!obras || obras.length === 0) break

      for (const o of obras) {
        const doc = (o.responsavel_documento || '').replace(/\D/g, '')
        if (doc.length === 14 && !cnpjToTenant.has(doc)) {
          cnpjToTenant.set(doc, o.tenant_id)
          cnpjToQualif.set(doc, o.responsavel_qualificacao)
        }
      }
      offset += PAGE
      if (obras.length < PAGE) break
    }
    console.log(`[enrich-cnpj] ${cnpjToTenant.size} CNPJs unicos coletados`)

    // 2) Filtrar os ja enriquecidos (se !force)
    const todosCnpjs = Array.from(cnpjToTenant.keys())
    const jaEnriquecidos = new Set<string>()
    if (!force && todosCnpjs.length > 0) {
      for (let i = 0; i < todosCnpjs.length; i += 500) {
        const slice = todosCnpjs.slice(i, i + 500)
        const { data: existentes } = await admin
          .from('radar_obras_empresas')
          .select('cnpj')
          .in('cnpj', slice)
        for (const e of existentes || []) jaEnriquecidos.add(e.cnpj)
      }
    }

    const fila = todosCnpjs
      .filter(c => !jaEnriquecidos.has(c) || force)
      .slice(0, limit)

    // Priorizar Construtora/Incorporador
    fila.sort((a, b) => {
      const qa = cnpjToQualif.get(a) || ''
      const qb = cnpjToQualif.get(b) || ''
      const aPrior = QUALIFICACOES_PRIORITARIAS.has(qa) ? 0 : 1
      const bPrior = QUALIFICACOES_PRIORITARIAS.has(qb) ? 0 : 1
      return aPrior - bPrior
    })

    console.log(`[enrich-cnpj] Fila: ${fila.length} CNPJs (ja_enriquecidos=${jaEnriquecidos.size})`)

    // 3) Processar
    let enriquecidos = 0
    let naoEncontrados = 0
    let falhas = 0

    for (let i = 0; i < fila.length; i++) {
      const cnpj = fila[i]
      const tenantId = cnpjToTenant.get(cnpj)!

      let brasilResult = await fetchBrasilApi(cnpj)
      let dados: Record<string, unknown> | null = null
      let socios: any[] | null = null

      if (brasilResult.encontrado && brasilResult.data) {
        dados = mapearBrasilApi(brasilResult.data, cnpj)
      } else if (brasilResult.notFound) {
        // BrasilAPI disse 404, tenta publica
        const publicaResult = await fetchPublica(cnpj)
        if (publicaResult.encontrado && publicaResult.data) {
          dados = mapearPublica(publicaResult.data, cnpj)
          socios = publicaResult.data.socios || []
        } else if (publicaResult.notFound) {
          await marcarNaoEncontrado(admin, tenantId, cnpj)
          naoEncontrados++
          continue
        } else {
          falhas++
          continue
        }
      } else {
        // BrasilAPI erro transitorio, tenta publica
        const publicaResult = await fetchPublica(cnpj)
        if (publicaResult.encontrado && publicaResult.data) {
          dados = mapearPublica(publicaResult.data, cnpj)
          socios = publicaResult.data.socios || []
        } else if (publicaResult.notFound) {
          await marcarNaoEncontrado(admin, tenantId, cnpj)
          naoEncontrados++
          continue
        } else {
          falhas++
          continue
        }
      }

      if (dados) {
        try {
          await salvarEmpresa(admin, tenantId, cnpj, dados)
          if (socios) await salvarSocios(admin, tenantId, cnpj, socios)
          enriquecidos++
        } catch (e) {
          console.error(`[enrich-cnpj] Erro ao gravar ${cnpj}:`, e)
          falhas++
        }
      }

      if ((i + 1) % 50 === 0) {
        console.log(`[enrich-cnpj] progresso ${i + 1}/${fila.length} OK=${enriquecidos} NE=${naoEncontrados} F=${falhas}`)
      }
      if (i < fila.length - 1) await new Promise(r => setTimeout(r, DELAY_MS))
    }

    const result = {
      success: true,
      total_coletados: cnpjToTenant.size,
      ja_enriquecidos: jaEnriquecidos.size,
      processados: fila.length,
      enriquecidos,
      nao_encontrados: naoEncontrados,
      falhas,
    }
    console.log(`[enrich-cnpj] resultado:`, JSON.stringify(result))

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[enrich-cnpj] Erro fatal:', e)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
