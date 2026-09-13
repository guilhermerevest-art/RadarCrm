// Geocodificador em lote - agrupa logradouros únicos para ser mais rápido
// Executar: npx tsx scripts/geocode-batch-streets.ts
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const DELAY_MS = 900

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
    // ignore
  }
  return null
}

async function main() {
  console.log('🚀 Geocodificador por logradouros únicos\n')

  // Buscar logradouros únicos sem coordenadas
  const { data: obras } = await supabase
    .from('radar_obras')
    .select('id, endereco_logradouro, endereco_cidade, endereco_uf')
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
    .is('lat', null)
    .not('endereco_logradouro', 'ilike', '%Não informado%')
    .not('endereco_logradouro', 'ilike', '%S/N%')
    .limit(100)

  if (!obras || obras.length === 0) {
    console.log('✅ Todas as obras já têm coordenadas!')
    return
  }

  // Extrair logradouros únicos
  const uniqueStreets = [...new Map(
    obras.map(o => [o.endereco_logradouro, {
      logradouro: o.endereco_logradouro,
      cidade: o.endereco_cidade,
      uf: o.endereco_uf
    }])
  ).values()]

  console.log(`📋 ${obras.length} obras, ${uniqueStreets.length} logradouros únicos\n`)

  let atualizados = 0
  let erros = 0
  let inicio = Date.now()

  for (let i = 0; i < uniqueStreets.length; i++) {
    const street = uniqueStreets[i]
    const endereco = `${street.logradouro}, ${street.cidade}, ${street.uf}, Brasil`

    process.stdout.write(`[${i + 1}/${uniqueStreets.length}] ${street.logradouro?.substring(0, 30)}... `)

    const coords = await geocode(endereco)

    if (coords) {
      // Atualizar TODAS as obras com esse logradouro
      const { error } = await supabase
        .from('radar_obras')
        .update({ lat: coords.lat, lng: coords.lng })
        .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
        .eq('endereco_logradouro', street.logradouro)
        .is('lat', null)

      if (error) {
        console.log('❌')
        erros++
      } else {
        console.log(`✅ (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`)
        atualizados++
      }
    } else {
      console.log('⚠️')
      erros++
    }

    if (i < uniqueStreets.length - 1) {
      await sleep(DELAY_MS)
    }
  }

  // Estatísticas
  const { count: com } = await supabase.from('radar_obras').select('*', { count: 'exact', head: true }).eq('tenant_id', '00000000-0000-0000-0000-000000000001').not('lat', 'is', null)
  const { count: sem } = await supabase.from('radar_obras').select('*', { count: 'exact', head: true }).eq('tenant_id', '00000000-0000-0000-0000-000000000001').is('lat', null)

  console.log('\n====================================')
  console.log('📊 Resultado:')
  console.log(`   Com coordenadas: ${com}`)
  console.log(`   Sem coordenadas: ${sem}`)
  console.log(`   Logradouros processados: ${uniqueStreets.length}`)
  console.log(`   ⏱️  Tempo: ${((Date.now() - inicio) / 1000).toFixed(1)}s`)
  console.log('====================================')
}

main().catch(console.error)
