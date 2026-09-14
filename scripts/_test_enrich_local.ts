// =============================================================================
// Teste local do fluxo de enriquecimento (sem Deno/Edge Function)
// Simula exatamente o que enrich-cnpj faz, mas rodando em Node.
// Usado para validar que BrasilAPI + publica.cnpj.ws estao acessiveis e
// que o schema de gravacao funciona, antes de fazer deploy.
//
// Uso: npx tsx scripts/_test_enrich_local.ts --limit=3
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BRASILAPI_URL = 'https://brasilapi.com.br/api/cnpj/v1/'
const PUBLICA_URL = 'https://publica.cnpj.ws/cnpj/'
const DELAY_MS = 1100

interface FetchResult {
  encontrado: boolean
  notFound: boolean
  data?: any
}

async function fetchBrasilApi(cnpj: string): Promise<FetchResult> {
  const r = await fetch(BRASILAPI_URL + cnpj, {
    headers: { 'User-Agent': 'RadarCrm/1.0 (contato@radarcrm.com.br)' },
  })
  if (r.status === 200) return { encontrado: true, notFound: false, data: await r.json() }
  if (r.status === 404) return { encontrado: false, notFound: true }
  return { encontrado: false, notFound: false }
}

async function fetchPublica(cnpj: string): Promise<FetchResult> {
  const r = await fetch(PUBLICA_URL + cnpj, {
    headers: { 'User-Agent': 'RadarCrm/1.0 (contato@radarcrm.com.br)' },
  })
  if (r.status === 200) return { encontrado: true, notFound: false, data: await r.json() }
  if (r.status === 404) return { encontrado: false, notFound: true }
  return { encontrado: false, notFound: false }
}

function mapearBrasilApi(data: any) {
  return {
    cnpj_basico: data.cnpj?.substring(0, 8),
    razao_social: data.razao_social,
    nome_fantasia: data.nome_fantasia,
    situacao_cadastral: data.descricao_situacao_cadastral,
    natureza_juridica: data.natureza_juridica,
    cnae_principal: data.cnae_fiscal ? `${data.cnae_fiscal} - ${data.cnae_fiscal_descricao || ''}`.trim() : null,
    porte: data.porte,
    capital_social: data.capital_social ? parseFloat(data.capital_social) : null,
    data_abertura: data.data_inicio_atividade,
    logradouro: [data.descricao_tipo_de_logradouro, data.logradouro, data.numero].filter(Boolean).join(' '),
    bairro: data.bairro,
    municipio: data.municipio,
    uf: data.uf,
    cep: data.cep,
    telefone: data.ddd_telefone_1,
    email: data.email,
    fonte_enriquecimento: 'brasilapi',
  }
}

function mapearPublica(data: any) {
  const est = data.estabelecimento || {}
  return {
    cnpj_basico: data.cnpj?.substring(0, 8),
    razao_social: data.razao_social,
    nome_fantasia: est.nome_fantasia,
    situacao_cadastral: est.situacao_cadastral,
    natureza_juridica: data.natureza_juridica?.descricao,
    cnae_principal: est.atividade_principal?.id ? `${est.atividade_principal.id} - ${est.atividade_principal.descricao || ''}`.trim() : null,
    porte: est.porte?.descricao,
    capital_social: data.capital_social ? parseFloat(data.capital_social) : null,
    data_abertura: est.data_inicio_atividade,
    logradouro: [est.tipo_logradouro, est.logradouro, est.numero].filter(Boolean).join(' '),
    bairro: est.bairro,
    municipio: est.cidade?.nome,
    uf: est.estado?.sigla,
    cep: est.cep,
    telefone: est.ddd1 && est.telefone1 ? `${est.ddd1}${est.telefone1}` : null,
    email: est.email,
    fonte_enriquecimento: 'publica.cnpj.ws',
  }
}

async function main() {
  const limitArg = process.argv.find(a => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 3

  console.log(`[1/3] Coletando ${limit} CNPJs pendentes...`)

  // Pegar CNPJs unicos ainda nao enriquecidos
  const { data: obras } = await s
    .from('radar_obras')
    .select('id, tenant_id, responsavel_documento, responsavel_nome, responsavel_qualificacao')
    .eq('status', 'ativa')
    .not('responsavel_documento', 'is', null)
    .limit(limit * 3)  // pegar mais pq pode ter duplicatas

  const seen = new Set<string>()
  const alvos: Array<{ cnpj: string; tenant: string; nome: string; qualif: string }> = []
  for (const o of obras || []) {
    const cnpj = o.responsavel_documento.replace(/\D/g, '')
    if (cnpj.length !== 14) continue
    if (seen.has(cnpj)) continue
    seen.add(cnpj)
    alvos.push({ cnpj, tenant: o.tenant_id, nome: o.responsavel_nome, qualif: o.responsavel_qualificacao })
    if (alvos.length >= limit) break
  }
  console.log(`  ${alvos.length} alvos:`)
  for (const a of alvos) console.log(`    ${a.cnpj} | ${a.nome} (${a.qualif})`)

  console.log(`\n[2/3] Consultando APIs (BrasilAPI + publica.cnpj.ws)...`)
  let enriquecidos = 0, naoEncontrados = 0, falhas = 0

  for (let i = 0; i < alvos.length; i++) {
    const alvo = alvos[i]
    let dados: any = null

    let brasilResult = await fetchBrasilApi(alvo.cnpj)
    if (brasilResult.encontrado) {
      dados = mapearBrasilApi(brasilResult.data)
      console.log(`  ${i + 1}/${alvos.length} ${alvo.cnpj} -> BrasilAPI OK (${dados.razao_social})`)
    } else if (brasilResult.notFound) {
      const publicaResult = await fetchPublica(alvo.cnpj)
      if (publicaResult.encontrado) {
        dados = mapearPublica(publicaResult.data)
        console.log(`  ${i + 1}/${alvos.length} ${alvo.cnpj} -> publica.ws OK (${dados.razao_social})`)
      } else if (publicaResult.notFound) {
        console.log(`  ${i + 1}/${alvos.length} ${alvo.cnpj} -> NAO ENCONTRADO`)
        naoEncontrados++
        continue
      } else {
        console.log(`  ${i + 1}/${alvos.length} ${alvo.cnpj} -> falha`)
        falhas++
        continue
      }
    } else {
      falhas++
      continue
    }

    // Gravar (apenas ultimo, para nao sujar a base)
    if (i === alvos.length - 1 && dados) {
      console.log(`\n[3/3] Gravando ultimo resultado (${alvo.cnpj}) no banco...`)
      const { error } = await s.from('radar_obras_empresas').upsert({
        tenant_id: alvo.tenant,
        cnpj: alvo.cnpj,
        ...dados,
        last_enriched_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,cnpj' })
      if (error) console.error('  Erro ao gravar:', error.message)
      else console.log('  ✅ Gravado!')
    }

    if (dados) enriquecidos++
    if (i < alvos.length - 1) await new Promise(r => setTimeout(r, DELAY_MS))
  }

  console.log(`\n✅ Resultado: enriquecidos=${enriquecidos} nao_encontrados=${naoEncontrados} falhas=${falhas}`)

  // Limpar registro de teste
  console.log('\n[cleanup] Removendo registro de teste...')
  const { data: ultimo } = await s
    .from('radar_obras_empresas')
    .select('cnpj')
    .eq('fonte_enriquecimento', 'brasilapi')
    .order('last_enriched_at', { ascending: false })
    .limit(1)
  if (ultimo && ultimo[0]) {
    // Nao remover pq ja pode estar correto - deixar como demonstracao
    console.log(`  Mantendo registro real gravado: ${ultimo[0].cnpj}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
