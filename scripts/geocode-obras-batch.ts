// Geocodificador inteligente - agrupa por logradouro único
// Executar: npx tsx scripts/geocode-obras-batch.ts
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: 'public' } }
)

const DELAY_MS = 1100

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function geocode(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RadarCrm/1.0 (contato@radarcrm.com)' }
    })
    const data = await res.json()
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch (e) {
    console.error('Erro geocode:', e.message)
  }
  return null
}

async function main() {
  console.log('🚀 Geocodificador inteligente de obras\n')
  console.log('📋 Estratégia: geocodificar logradouros únicos, não obras individuais\n')

  // 1. Buscar logradouros únicos sem coordenadas
  const { data: logradouros } = await supabase
    .from('radar_obras')
    .select('endereco_logradouro, endereco_cidade, endereco_uf')
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
    .is('lat', null)
    .not('endereco_logradouro', 'ilike', '%Não informado%')

  if (!logradouros || logradouros.length === 0) {
    console.log('✅ Todas as obras já têm coordenadas!')
    return
  }

  // Extrair logradouros únicos
  const uniqueLogradouros = [...new Set(
    logradouros.map(l => `${l.endereco_logradouro}, ${l.endereco_cidade}, ${l.endereco_uf}, Brasil`)
  )]

  console.log(`📊 ${logradouros.length} obras sem coords`)
  console.log(`🏠 ${uniqueLogradouros.length} logradouros únicos para geocodificar\n`)

  let atualizados = 0
  let inicio = Date.now()

  for (let i = 0; i < Math.min(uniqueLogradouros.length, 100); i++) { // Limite de 100 para testar
    const logradouro = uniqueLogradouros[i]

    process.stdout.write(`[${i + 1}/${Math.min(uniqueLogradouros.length, 100)}] ${logradouro.substring(0, 50)}... `)

    const coords = await geocode(logradouro)

    if (coords) {
      // Extrair partes do logradouro
      const parts = logradouro.split(', ')
      const rua = parts[0]
      const cidade = parts[1]
      const uf = parts[2]

      // Atualizar todas as obras com esse logradouro
      const { error } = await supabase
        .from('radar_obras')
        .update({ lat: coords.lat, lng: coords.lng })
        .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
        .eq('endereco_logradouro', rua)
        .eq('endereco_cidade', cidade)
        .is('lat', null)

      if (error) {
        console.log('❌')
      } else {
        console.log(`✅ (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`)
        atualizados++
      }
    } else {
      console.log('⚠️')
    }

    if (i < Math.min(uniqueLogradouros.length, 100) - 1) {
      await sleep(DELAY_MS)
    }
  }

  // Estatísticas
  const { count: semCoords } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
    .is('lat', null)

  const { count: comCoords } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
    .not('lat', 'is', null)

  console.log('\n====================================')
  console.log(`📊 Resultado:`)
  console.log(`   Com coordenadas: ${comCoords}`)
  console.log(`   Sem coordenadas: ${semCoords}`)
  console.log(`   Logradouros geocodificados: ${atualizados}`)
  console.log(`   ⏱️  Tempo: ${((Date.now() - inicio) / 1000).toFixed(1)}s`)
  console.log('====================================')
}

main().catch(console.error)
