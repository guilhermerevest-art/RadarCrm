// Importador CNO - SÓ UBERLÂNDIA (MVP)
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { createClient } = require('@supabase/supabase-js')

require('dotenv').config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltam variáveis SUPABASE_URL ou SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'public' },
})

const CIDADE_ALVO = 'uberlandia'

function normalizar(s) {
  if (!s) return ''
  return s.toString().toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function parseCSVLine(line) {
  const cols = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      cols.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cols.push(current)
  return cols
}

async function main() {
  const csvPath = process.argv[2] || path.join(process.cwd(), 'cno.csv')
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Arquivo não encontrado: ${csvPath}`)
    process.exit(1)
  }

  console.log(`📂 Lendo: ${csvPath}`)
  console.log(`🎯 Filtro: SOMENTE UBERLÂNDIA/MG`)
  console.log('')

  // Pega tenant MVP
  const { data: tenants, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, nome, slug')
    .eq('slug', 'uberlandia-mvp')
    .limit(1)

  if (tenantErr || !tenants?.length) {
    console.error('❌ Tenant MVP não encontrado. Aplique a migration 004 primeiro.')
    process.exit(1)
  }

  const tenantId = tenants[0].id
  console.log(`✅ Tenant MVP: ${tenants[0].nome} (${tenantId})`)
  console.log('')

  const stream = fs.createReadStream(csvPath, { encoding: 'latin1' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  let header = null
  let COL_CNO, COL_MUNICIPIO, COL_UF, COL_CEP, COL_LOGRADOURO, COL_NUMERO, COL_BAIRRO, COL_DATA, COL_AREA, COL_NOME, COL_NI, COL_QUALIF
  let totalLinhas = 0
  let totalUberlandia = 0
  let totalInseridas = 0
  let batch = []
  const BATCH_SIZE = 200
  let startTime = Date.now()

  for await (const line of rl) {
    if (!header) {
      header = parseCSVLine(line).map(h => h.trim().toLowerCase())
      console.log(`📋 Colunas: ${header.length} detectadas`)
      const idx = (name) => header.findIndex(h => h.includes(name))
      COL_CNO = idx('cno') >= 0 ? idx('cno') : 0
      COL_MUNICIPIO = idx('nome do munic')
      COL_UF = idx('estado')
      COL_CEP = idx('cep')
      COL_LOGRADOURO = idx('logradouro')
      COL_NUMERO = idx('número') >= 0 ? idx('número') : idx('numero')
      COL_BAIRRO = idx('bairro')
      COL_DATA = idx('data de in')
      COL_AREA = idx('área total') >= 0 ? idx('área total') : idx('rea total')
      COL_NOME = idx('nome') >= 0 ? idx('nome') : -1
      COL_NI = idx('ni do respons') >= 0 ? idx('ni do respons') : idx('ni_respons')
      COL_QUALIF = idx('qualifica') >= 0 ? idx('qualifica') : -1
      console.log(`   NI resp=${COL_NI}, Nome resp=${COL_NOME}, Qualif=${COL_QUALIF}`)
      console.log('')
      continue
    }

    totalLinhas++
    if (totalLinhas % 100000 === 0) {
      process.stdout.write(`  📖 ${(totalLinhas/1000).toFixed(0)}k linhas lidas...`)
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
      console.log(` (${elapsed}s)`)
    }

    const cols = parseCSVLine(line)
    const municipio = normalizar(cols[COL_MUNICIPIO])
    const uf = (cols[COL_UF] || '').toUpperCase().trim()

    if (uf !== 'MG') continue
    if (municipio !== CIDADE_ALVO) continue

    totalUberlandia++

    const hash = `cno:${cols[COL_CNO] || `udi-${totalLinhas}`}`
    const area = parseFloat(cols[COL_AREA]) || 0

    batch.push({
      tenant_id: tenantId,
      fonte: 'cno',
      fonte_id: cols[COL_CNO] || null,
      endereco_logradouro: (cols[COL_LOGRADOURO] || 'Não informado').slice(0, 200),
      endereco_numero: cols[COL_NUMERO] || null,
      endereco_bairro: cols[COL_BAIRRO] || null,
      endereco_cidade: 'Uberlândia',
      endereco_uf: 'MG',
      endereco_cep: cols[COL_CEP] || null,
      lat: null,
      lng: null,
      data_inicio: cols[COL_DATA] || null,
      valor_estimado: area > 0 ? area * 2500 : null,
      // fase_atual: NÃO setada — fica NULL até alguém marcar
      porte: area > 5000 ? 'grande' : (area > 500 ? 'medio' : 'pequeno'),
      status: 'ativa',
      qualidade_score: 50,
      hash_deduplicacao: hash,
      descricao: ((COL_NOME >= 0 ? cols[COL_NOME] : '') + ' - ' + (cols[COL_NOME] || '')).substring(0, 500),
      responsavel_nome: COL_NOME >= 0 ? (cols[COL_NOME] || null)?.slice(0, 200) : null,
      responsavel_documento: COL_NI >= 0 ? cols[COL_NI]?.replace(/\D/g, '').slice(0, 18) || null : null,
      responsavel_qualificacao: COL_QUALIF >= 0 ? cols[COL_QUALIF]?.slice(0, 50) || null : null,
      raw_payload: {
        responsavel: COL_NOME >= 0 ? cols[COL_NOME]?.slice(0, 200) : null,
        responsavel_documento: COL_NI >= 0 ? cols[COL_NI]?.replace(/\D/g, '').slice(0, 18) : null,
        responsavel_qualificacao: COL_QUALIF >= 0 ? cols[COL_QUALIF]?.slice(0, 50) : null,
        area_m2: area,
      },
    })

    if (batch.length >= BATCH_SIZE) {
      await flush(batch)
      totalInseridas += batch.length
      batch = []
    }
  }

  if (batch.length > 0) {
    await flush(batch)
    totalInseridas += batch.length
  }

  console.log('')
  console.log('====================================')
  console.log(`📊 Linhas lidas: ${totalLinhas.toLocaleString('pt-BR')}`)
  console.log(`🎯 Uberlândia: ${totalUberlandia.toLocaleString('pt-BR')}`)
  console.log(`✅ Inseridas: ${totalInseridas.toLocaleString('pt-BR')}`)
  console.log(`⏱️  Tempo: ${((Date.now() - startTime)/1000).toFixed(1)}s`)
  console.log('====================================')

  async function flush(items) {
    const { error } = await supabase
      .from('radar_obras')
      .upsert(items, { onConflict: 'tenant_id,hash_deduplicacao', ignoreDuplicates: true })

    if (error) {
      console.error(`❌ ${error.message}`)
    }
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
