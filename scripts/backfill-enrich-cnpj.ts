// =============================================================================
// backfill-enrich-cnpj.ts
// Backfill das 7.214 CNPJs (apos backfill-responsavel.ts) via BrasilAPI +
// publica.cnpj.ws. Persiste em radar_obras_empresas + radar_obras_socios.
//
// Estrategia:
//   - BrasilAPI primario (mais rapido, gratuito, 55 req/min)
//   - publica.cnpj.ws fallback (retorna socios/QSA, mas rate-limit menor)
//   - 404 nas duas APIs -> marca fonte='nao_encontrado' (nao tenta de novo)
//   - Erro transitorio -> tenta de novo na proxima execucao
//   - Checkpoint em memoria + log: roda, mostra status, sai. Re-rodavel.
//
// Estimativa: 7.214 CNPJs x 1.1s/req = ~2.2h para primeira passada.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BRASILAPI_URL = 'https://brasilapi.com.br/api/cnpj/v1/'
const PUBLICA_URL = 'https://publica.cnpj.ws/cnpj/'
const DELAY_MS = 1100
const BATCH_DB = 50

interface FetchResult {
  ok: 'found' | 'not_found' | 'error'
  data?: any
}

async function fetchBrasilApi(cnpj: string): Promise<FetchResult> {
  try {
    const r = await fetch(BRASILAPI_URL + cnpj, {
      headers: { 'User-Agent': 'RadarCrm/1.0 (contato@radarcrm.com.br)' },
    })
    if (r.status === 200) return { ok: 'found', data: await r.json() }
    if (r.status === 404) return { ok: 'not_found' }
    return { ok: 'error' }
  } catch {
    return { ok: 'error' }
  }
}

async function fetchPublica(cnpj: string): Promise<FetchResult> {
  try {
    const r = await fetch(PUBLICA_URL + cnpj, {
      headers: { 'User-Agent': 'RadarCrm/1.0 (contato@radarcrm.com.br)' },
    })
    if (r.status === 200) return { ok: 'found', data: await r.json() }
    if (r.status === 404) return { ok: 'not_found' }
    return { ok: 'error' }
  } catch {
    return { ok: 'error' }
  }
}

function mapearBrasilApi(data: any) {
  return {
    cnpj_basico: data.cnpj?.substring(0, 8),
    razao_social: data.razao_social || null,
    nome_fantasia: data.nome_fantasia || null,
    situacao_cadastral: data.descricao_situacao_cadastral || null,
    natureza_juridica: data.natureza_juridica || null,
    cnae_principal: data.cnae_fiscal ? `${data.cnae_fiscal} - ${data.cnae_fiscal_descricao || ''}`.trim() : null,
    porte: data.porte || null,
    capital_social: data.capital_social ? parseFloat(data.capital_social) : null,
    data_abertura: data.data_inicio_atividade || null,
    logradouro: [data.descricao_tipo_de_logradouro, data.logradouro, data.numero].filter(Boolean).join(' ') || null,
    bairro: data.bairro || null,
    municipio: data.municipio || null,
    uf: data.uf || null,
    cep: data.cep || null,
    telefone: data.ddd_telefone_1 || null,
    email: data.email || null,
  }
}

function mapearPublica(data: any) {
  const est = data.estabelecimento || {}
  return {
    cnpj_basico: data.cnpj?.substring(0, 8),
    razao_social: data.razao_social || null,
    nome_fantasia: est.nome_fantasia || null,
    situacao_cadastral: est.situacao_cadastral || null,
    natureza_juridica: data.natureza_juridica?.descricao || null,
    cnae_principal: est.atividade_principal?.id ? `${est.atividade_principal.id} - ${est.atividade_principal.descricao || ''}`.trim() : null,
    porte: est.porte?.descricao || null,
    capital_social: data.capital_social ? parseFloat(data.capital_social) : null,
    data_abertura: est.data_inicio_atividade || null,
    logradouro: [est.tipo_logradouro, est.logradouro, est.numero].filter(Boolean).join(' ') || null,
    bairro: est.bairro || null,
    municipio: est.cidade?.nome || null,
    uf: est.estado?.sigla || null,
    cep: est.cep || null,
    telefone: est.ddd1 && est.telefone1 ? `${est.ddd1}${est.telefone1}` : null,
    email: est.email || null,
  }
}

async function processarCnpj(cnpj: string, tenantId: string): Promise<'enriched' | 'not_found' | 'failed'> {
  let dados: any = null
  let socios: any[] | null = null

  const brasil = await fetchBrasilApi(cnpj)
  if (brasil.ok === 'found') {
    dados = mapearBrasilApi(brasil.data)
  } else if (brasil.ok === 'not_found') {
    const pub = await fetchPublica(cnpj)
    if (pub.ok === 'found') {
      dados = mapearPublica(pub.data)
      socios = pub.data.socios || []
    } else if (pub.ok === 'not_found') {
      // marca placeholder
      const { error } = await supabase.from('radar_obras_empresas').upsert({
        tenant_id: tenantId,
        cnpj,
        cnpj_basico: cnpj.substring(0, 8),
        fonte_enriquecimento: 'nao_encontrado',
        last_enriched_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,cnpj' })
      return error ? 'failed' : 'not_found'
    } else {
      return 'failed'
    }
  } else {
    // erro BrasilAPI, tenta publica
    const pub = await fetchPublica(cnpj)
    if (pub.ok === 'found') {
      dados = mapearPublica(pub.data)
      socios = pub.data.socios || []
    } else if (pub.ok === 'not_found') {
      const { error } = await supabase.from('radar_obras_empresas').upsert({
        tenant_id: tenantId,
        cnpj,
        cnpj_basico: cnpj.substring(0, 8),
        fonte_enriquecimento: 'nao_encontrado',
        last_enriched_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,cnpj' })
      return error ? 'failed' : 'not_found'
    } else {
      return 'failed'
    }
  }

  if (!dados) return 'failed'

  const { error } = await supabase.from('radar_obras_empresas').upsert({
    tenant_id: tenantId,
    cnpj,
    ...dados,
    fonte_enriquecimento: dados.fonte_enriquecimento || 'brasilapi',
    last_enriched_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,cnpj' })

  if (error) {
    console.error(`  [gravacao] erro ${cnpj}: ${error.message.slice(0, 100)}`)
    return 'failed'
  }

  // Socios (delete + insert)
  if (socios && socios.length > 0) {
    await supabase.from('radar_obras_socios').delete().eq('tenant_id', tenantId).eq('cnpj_empresa', cnpj)
    const rows = socios.map((s: any) => ({
      tenant_id: tenantId,
      cnpj_empresa: cnpj,
      nome: s.nome,
      qualificacao: s.qualificacao || null,
      data_entrada: s.data_entrada || null,
      faixa_etaria: s.faixa_etaria || null,
    }))
    const { error: socErr } = await supabase.from('radar_obras_socios').insert(rows)
    if (socErr) console.error(`  [socios] erro ${cnpj}: ${socErr.message.slice(0, 100)}`)
  }

  return 'enriched'
}

async function main() {
  const limitArg = process.argv.find(a => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null

  console.log('[1/3] Coletando CNPJs pendentes...')
  const { data: obras } = await supabase
    .from('radar_obras')
    .select('id, tenant_id, responsavel_documento')
    .eq('status', 'ativa')
    .not('responsavel_documento', 'is', null)
    .limit(limit ? limit * 5 : 50000)

  const seen = new Set<string>()
  const alvos: Array<{ cnpj: string; tenant: string }> = []
  for (const o of obras || []) {
    const cnpj = (o.responsavel_documento || '').replace(/\D/g, '')
    if (cnpj.length === 14 && !seen.has(cnpj)) {
      seen.add(cnpj)
      alvos.push({ cnpj, tenant: o.tenant_id })
    }
  }
  console.log(`  ${alvos.length} CNPJs unicos nas obras`)

  // Filtrar ja enriquecidos
  const { data: existentes } = await supabase
    .from('radar_obras_empresas')
    .select('cnpj')
  const existentesSet = new Set((existentes || []).map((e: any) => e.cnpj))
  const pendentes = alvos.filter(a => !existentesSet.has(a.cnpj))
  console.log(`  ${existentesSet.size} ja enriquecidos, ${pendentes.length} pendentes`)

  if (limit) pendentes.splice(limit)

  console.log(`\n[2/3] Processando ${pendentes.length} CNPJs (rate: ${DELAY_MS}ms/req)...`)

  let enriched = 0, notFound = 0, failed = 0
  const inicio = Date.now()

  for (let i = 0; i < pendentes.length; i++) {
    const { cnpj, tenant } = pendentes[i]
    const resultado = await processarCnpj(cnpj, tenant)
    if (resultado === 'enriched') enriched++
    else if (resultado === 'not_found') notFound++
    else failed++

    if ((i + 1) % 25 === 0 || i === pendentes.length - 1) {
      const elapsed = (Date.now() - inicio) / 1000
      const rate = (i + 1) / elapsed
      const remaining = (pendentes.length - i - 1) / rate
      const etaMin = Math.round(remaining / 60)
      console.log(`  ${i + 1}/${pendentes.length} OK=${enriched} NE=${notFound} F=${failed} (${rate.toFixed(1)}/s, ~${etaMin}min restantes)`)
    }

    if (i < pendentes.length - 1) await new Promise(r => setTimeout(r, DELAY_MS))
  }

  console.log(`\n[3/3] ✅ Concluido: enriquecidos=${enriched}, nao_encontrados=${notFound}, falhas=${failed}`)

  const { data: stats } = await supabase.rpc('get_enrich_cnpj_stats')
  console.log('Stats finais:', JSON.stringify(stats))
}

main().catch(e => { console.error(e); process.exit(1) })
