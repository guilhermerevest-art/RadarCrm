// Geocodificador de obras usando Nominatim (OpenStreetMap)
// Executar: npx tsx scripts/geocode-obras.ts
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: 'public' } }
)

const BATCH_SIZE = 50
const DELAY_MS = 1100 // Rate limit do Nominatim: 1 req/s

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function geocode(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RadarCrm/1.0' }
    })
    const data = await res.json()
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch (e) {
    console.error('Geocode error:', e.message)
  }
  return null
}

async function main() {
  console.log('🚀 Iniciando geocodificação de obras...')
  console.log('')

  // Buscar obras sem coordenadas
  const { data: obras, count } = await supabase
    .from('radar_obras')
    .select('id, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep', { count: 'exact' })
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
    .is('lat', null)
    .limit(1000) // Começar com 1000 para testar

  if (!obras || obras.length === 0) {
    console.log('✅ Todas as obras já têm coordenadas!')
    return
  }

  console.log(`📋 ${obras.length} obras sem coordenadas para geocodificar`)

  let atualizados = 0
  let erros = 0
  let inicio = Date.now()

  for (let i = 0; i < obras.length; i++) {
    const obra = obras[i]

    // Montar endereço
    const partes = [
      obra.endereco_logradouro,
      obra.endereco_numero,
      obra.endereco_bairro,
      obra.endereco_cidade,
      obra.endereco_uf,
      'Brasil'
    ].filter(Boolean)

    const endereco = partes.join(', ')

    process.stdout.write(`[${i + 1}/${obras.length}] ${obra.endereco_logradouro?.substring(0, 40)}... `)

    const coords = await geocode(endereco)

    if (coords) {
      const { error } = await supabase
        .from('radar_obras')
        .update({ lat: coords.lat, lng: coords.lng })
        .eq('id', obra.id)

      if (error) {
        console.log('❌ ERRO')
        erros++
      } else {
        console.log(`✅ (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`)
        atualizados++
      }
    } else {
      console.log('⚠️  Não encontrado')
      erros++
    }

    // Rate limiting
    if (i < obras.length - 1) {
      await sleep(DELAY_MS)
    }
  }

  console.log('')
  console.log('====================================')
  console.log(`📊 Resumo:`)
  console.log(`   ✅ Atualizados: ${atualizados}`)
  console.log(`   ⚠️  Não encontrados: ${erros - atualizados}`)
  console.log(`   ❌ Erros: ${erros}`)
  console.log(`   ⏱️  Tempo: ${((Date.now() - inicio) / 1000).toFixed(1)}s`)
  console.log('====================================')

  if (atualizados > 0) {
    console.log('')
    console.log('💡 Execute novamente para continuar geocodificando mais obras.')
  }
}

main().catch(console.error)
