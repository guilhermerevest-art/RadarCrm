// Geocodificador direto usando Nominatim
// Executar: npx tsx scripts/geocode-nominatim.ts
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: 'public' } }
)

const DELAY_MS = 1000 // Rate limit do Nominatim: 1 req/s

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function geocode(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RadarCrm/1.0 (contato@radarcrm.com)' }
    })
    const data = await res.json()
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch (e) {
    console.error('Erro:', e.message)
  }
  return null
}

async function main() {
  console.log('🚀 Geocodificador Nominatim\n')

  // Buscar obras sem coordenadas (apenas logradouros únicos)
  const { data: obras } = await supabase
    .from('radar_obras')
    .select('id, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf')
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
    .is('lat', null)
    .not('endereco_logradouro', 'ilike', '%Não informado%')
    .not('endereco_logradouro', 'ilike', '%S/N%')
    .limit(100)

  if (!obras || obras.length === 0) {
    console.log('✅ Todas as obras já têm coordenadas!')
    return
  }

  console.log(`📋 ${obras.length} obras para geocodificar\n`)

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

    process.stdout.write(`[${i + 1}/${obras.length}] ${obra.endereco_logradouro?.substring(0, 35)}... `)

    const coords = await geocode(endereco)

    if (coords) {
      const { error } = await supabase
        .from('radar_obras')
        .update({ lat: coords.lat, lng: coords.lng })
        .eq('id', obra.id)

      if (error) {
        console.log('❌')
        erros++
      } else {
        console.log(`✅ (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`)
        atualizados++
      }
    } else {
      console.log('⚠️  não encontrado')
      erros++
    }

    // Rate limiting
    if (i < obras.length - 1) {
      await sleep(DELAY_MS)
    }
  }

  // Estatísticas
  const { count: comCoords } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
    .not('lat', 'is', null)

  const { count: semCoords } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
    .is('lat', null)

  console.log('\n====================================')
  console.log('📊 Resultado:')
  console.log(`   Com coordenadas: ${comCoords}`)
  console.log(`   Sem coordenadas: ${semCoords}`)
  console.log(`   Atualizados: ${atualizados}`)
  console.log(`   ⏱️  Tempo: ${((Date.now() - inicio) / 1000).toFixed(1)}s`)
  console.log('====================================')
}

main().catch(console.error)
