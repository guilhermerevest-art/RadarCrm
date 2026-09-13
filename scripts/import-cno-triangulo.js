// Importador CNO filtrado - Triângulo Mineiro (otimizado para CSV com 880MB)
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

function normalizar(s) {
  if (!s) return ''
  return s.toString().toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Parser de CSV com aspas escapadas
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
  console.log(`🎯 Filtro: Triângulo Mineiro`)
  console.log(`🏙️  Cidades alvo: ${CIDADES_TRIANGULO.size}`)
  console.log('')

  // Pega tenant_id do primeiro tenant
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

  const stream = fs.createReadStream(csvPath, { encoding: 'latin1' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  let header = null
  let COL_CNO, COL_MUNICIPIO, COL_UF, COL_CEP, COL_LOGRADOURO, COL_NUMERO, COL_BAIRRO, COL_DATA, COL_AREA
  let totalLinhas = 0
  let totalFiltradas = 0
  let totalInseridas = 0
  let totalErros = 0
  let batch = []
  const BATCH_SIZE = 300
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
      console.log(`   CNO=${COL_CNO}, Munic=${COL_MUNICIPIO}, UF=${COL_UF}`)
      console.log('')
      continue
    }

    totalLinhas++
    const cols = parseCSVLine(line)
    const municipio = normalizar(cols[COL_MUNICIPIO])
    const uf = (cols[COL_UF] || '').toUpperCase().trim()

    if (uf !== 'MG') continue
    if (!CIDADES_TRIANGULO.has(municipio)) continue

    totalFiltradas++

    const hash = `cno:${cols[COL_CNO] || `${municipio}-${totalLinhas}`}`
    const area = parseFloat(cols[COL_AREA]) || 0

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
      data_inicio: cols[COL_DATA] || null,
      valor_estimado: area > 0 ? area * 2500 : null,
      fase_atual: 'alvara',
      porte: area > 5000 ? 'grande' : (area > 500 ? 'medio' : 'pequeno'),
      status: 'ativa',
      qualidade_score: 50,
      hash_deduplicacao: hash,
    })

    if (batch.length >= BATCH_SIZE) {
      await flush(batch)
      totalInseridas += BATCH_SIZE - totalErros
      totalErros = 0
      batch = []
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`  ⏱️  ${totalLinhas} lidas / ${totalFiltradas} alvo / ~${totalInseridas} inseridas em ${elapsed}s`)
    }
  }

  if (batch.length > 0) {
    await flush(batch)
    totalInseridas += batch.length - totalErros
    totalErros = 0
  }

  console.log('')
  console.log('====================================')
  console.log(`📊 Lidas: ${totalLinhas}`)
  console.log(`🎯 Filtradas: ${totalFiltradas}`)
  console.log(`✅ Inseridas: ${totalInseridas}`)
  console.log(`⏱️  Tempo: ${((Date.now() - startTime)/1000).toFixed(1)}s`)
  console.log('====================================')

  async function flush(items) {
    const { error } = await supabase
      .from('radar_obras')
      .upsert(items, { onConflict: 'tenant_id,hash_deduplicacao', ignoreDuplicates: true })

    if (error) {
      console.error(`❌ ${error.message}`)
      totalErros = items.length
    }
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
