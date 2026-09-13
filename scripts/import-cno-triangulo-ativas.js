// Reimportação CNO - Triângulo Mineiro - SOMENTE OBRAS ATIVAS
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

// Cidades do Triângulo Mineiro + Alto Paranaíba + Noroeste
const CIDADES_TRIANGULO = new Set([
  'uberlandia','uberaba','araguari','ituiutaba','prata','monte carmelo',
  'tupaciguara','centralina','capinopolis','cachoeira dourada','arapora',
  'indianopolis','grupiara','estrela do sul','santa juliana','romaria',
  'nova ponte','sacramento','perdizes','pedrinopolis','pratinha',
  'verissimo','conquista','agua comprida','campo florido','comendador gomes',
  'conceicao das alagoas','delta','limeira do oeste','pirajuba','planura',
  'sao jose da bela vista','uniao de minas','carneirinho','itapagipe',
  'gurinhatã','ipiacu','santa vitoria','frutal',
  'patos de minas','patrocinio','araxa','sao gotardo','rio paranaiba',
  'matutina','biquinhas','paineiras','cedro do abaete','carmo do paranaiba',
  'lagoa formosa','presidente olegario','lagamar','guarda-mor','vazante',
  'coromandel','tiros','varjao de minas',
  'paracatu','unai','joao pinheiro','brasilandia de minas','buritis',
  'bonfinopolis de minas','dom bosco','natalandia','riachinho','arinos',
  'uruana de minas','urucuia','sao romao','bonito de minas','chapada gaucha',
  'pintopolis','icarai de minas','coracao de jesus','sao francisco',
  'pedras de maria da cruz','japonvar','lontra','mirabela','patis',
  'varzelandia','sao joao da ponte','brasilia de minas','verdelandia',
  'ibiaí','jequitai','claro dos pocoes','sao goncalo do abaete',
  'morada nova de minas',
])

// Situações ATIVAS no CNO:
// 01 = Ativa
// 14 = Ativa com pendência
const SITUACOES_ATIVAS = new Set(['01', '14'])

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
      if (inQuotes && line[i+1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cols.push(current); current = ''
    } else current += ch
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
  console.log(`🎯 Filtro: Triângulo Mineiro + SOMENTE ATIVAS (situação 01 ou 14)`)
  console.log(`🏙️  Cidades alvo: ${CIDADES_TRIANGULO.size}`)
  console.log('')

  const { data: tenants, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, nome')
    .limit(1)

  if (tenantErr || !tenants?.length) {
    console.error('❌ Nenhum tenant encontrado:', tenantErr?.message)
    process.exit(1)
  }

  const tenantId = tenants[0].id
  console.log(`✅ Tenant: ${tenants[0].nome} (${tenantId})`)
  console.log('')

  // ETAPA 1: Limpar dados anteriores
  console.log('🧹 Limpando obras anteriores (ativas + encerradas)...')
  const { count: totalAnterior } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })

  console.log(`   Total anterior: ${totalAnterior}`)

  // Deleta em batches
  let deleted = 0
  while (true) {
    const { data: ids } = await supabase.from('radar_obras').select('id').limit(500)
    if (!ids?.length) break
    const { error } = await supabase.from('radar_obras').delete().in('id', ids.map(r => r.id))
    if (error) { console.error('❌', error.message); break }
    deleted += ids.length
    if (ids.length < 500) break
  }
  console.log(`   ✅ Deletadas: ${deleted}`)
  console.log('')

  // ETAPA 2: Importar filtrado
  console.log('📥 Iniciando importação filtrada...\n')

  const stream = fs.createReadStream(csvPath, { encoding: 'latin1' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  let header = null
  let COL_CNO, COL_MUNICIPIO, COL_UF, COL_CEP, COL_LOGRADOURO, COL_NUMERO, COL_BAIRRO, COL_DATA, COL_AREA, COL_SITUACAO, COL_NOME_RESP, COL_DATA_SITUACAO
  let totalLinhas = 0
  let totalFiltradas = 0
  let totalAtivas = 0
  let totalInseridas = 0
  let batch = []
  const BATCH_SIZE = 300
  const startTime = Date.now()

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
      COL_SITUACAO = idx('situação') >= 0 ? idx('situação') : idx('situacao')
      COL_NOME_RESP = idx('nome')
      COL_DATA_SITUACAO = idx('data da sit')
      console.log(`   CNO=${COL_CNO}, Munic=${COL_MUNICIPIO}, UF=${COL_UF}, Sit=${COL_SITUACAO}`)
      console.log('')
      continue
    }

    totalLinhas++
    const cols = parseCSVLine(line)
    const municipio = normalizar(cols[COL_MUNICIPIO])
    const uf = (cols[COL_UF] || '').toUpperCase().trim()
    const situacao = (cols[COL_SITUACAO] || '').trim()

    if (uf !== 'MG') continue
    if (!CIDADES_TRIANGULO.has(municipio)) continue
    totalFiltradas++

    if (!SITUACOES_ATIVAS.has(situacao)) continue
    totalAtivas++

    const hash = `cno:${cols[COL_CNO] || `${municipio}-${totalLinhas}`}`
    const area = parseFloat(cols[COL_AREA]) || 0
    const dataInicio = cols[COL_DATA] || null

    batch.push({
      tenant_id: tenantId,
      fonte: 'cno',
      fonte_id: cols[COL_CNO] || null,
      endereco_logradouro: (cols[COL_LOGRADOURO] || 'Não informado').slice(0, 200),
      endereco_numero: cols[COL_NUMERO] || null,
      endereco_bairro: cols[COL_BAIRRO] || null,
      endereco_cidade: (cols[COL_MUNICIPIO] || '').trim().toUpperCase(),
      endereco_uf: 'MG',
      endereco_cep: cols[COL_CEP] || null,
      lat: null,
      lng: null,
      data_inicio: dataInicio,
      valor_estimado: area > 0 && area < 100000 ? area * 2500 : (area > 0 ? null : null),
      fase_atual: 'alvara',
      porte: area > 5000 ? 'grande' : (area > 500 ? 'medio' : 'pequeno'),
      status: 'ativa',
      qualidade_score: 50,
      hash_deduplicacao: hash,
      raw_payload: {
        cno: cols[COL_CNO],
        situacao,
        data_situacao: cols[COL_DATA_SITUACAO],
        responsavel: cols[COL_NOME_RESP]?.slice(0, 100),
        area_m2: area,
      },
    })

    if (batch.length >= BATCH_SIZE) {
      await flush(batch)
      totalInseridas += batch.length
      batch = []
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`  ⏱️  ${totalLinhas} lidas / ${totalFiltradas} Triângulo / ${totalAtivas} ativas / ${totalInseridas} inseridas em ${elapsed}s`)
    }
  }

  if (batch.length > 0) {
    await flush(batch)
    totalInseridas += batch.length
  }

  console.log('')
  console.log('====================================')
  console.log(`📊 Lidas: ${totalLinhas}`)
  console.log(`🎯 Triângulo: ${totalFiltradas}`)
  console.log(`✅ ATIVAS (01+14): ${totalAtivas}`)
  console.log(`💾 Inseridas: ${totalInseridas}`)
  console.log(`⏱️  Tempo: ${((Date.now() - startTime)/1000).toFixed(1)}s`)
  console.log('====================================')

  async function flush(items) {
    const { error } = await supabase
      .from('radar_obras')
      .insert(items)

    if (error) {
      console.error(`❌ ${error.message}`)
    }
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
