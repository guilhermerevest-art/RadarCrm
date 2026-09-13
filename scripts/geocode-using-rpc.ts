// Geocodificador usando fn_geocoding_resolver do Supabase
// Executar: npx tsx scripts/geocode-using-rpc.ts
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: 'public' } }
)

const BATCH_SIZE = 100
const DELAY_MS = 500 // Pequeno delay para não sobrecarregar

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log('🚀 Geocodificador usando fn_geocoding_resolver\n')

  // 1. Buscar obras sem coordenadas
  const { data: obras, count } = await supabase
    .from('radar_obras')
    .select('id, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf', { count: 'exact' })
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
    .is('lat', null)
    .not('endereco_logradouro', 'ilike', '%Não informado%')
    .not('endereco_logradouro', 'ilike', '%S/N%')
    .limit(500)

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

    if (i % 20 === 0) {
      process.stdout.write(`\n[${i + 1}-${Math.min(i + 20, obras.length)}/${obras.length}] `)
    }
    process.stdout.write('.')

    try {
      // Chamar RPC para geocodificar
      const { data: result, error: rpcError } = await supabase.rpc('fn_geocoding_resolver', {
        endereco
      })

      if (rpcError) {
        erros++
        continue
      }

      if (result && !result.error && result.lat && result.lng) {
        // Atualizar obra com coordenadas
        const { error: updateError } = await supabase
          .from('radar_obras')
          .update({
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lng)
          })
          .eq('id', obra.id)

        if (!updateError) {
          atualizados++
        } else {
          erros++
        }
      } else {
        erros++
      }
    } catch (e) {
      erros++
    }

    // Rate limiting
    if (i < obras.length - 1) {
      await sleep(DELAY_MS)
    }
  }

  // Estatísticas finais
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

  console.log('\n\n====================================')
  console.log('📊 Resultado:')
  console.log(`   Com coordenadas: ${comCoords}`)
  console.log(`   Sem coordenadas: ${semCoords}`)
  console.log(`   Atualizados nesta execução: ${atualizados}`)
  console.log(`   Erros: ${erros}`)
  console.log(`   ⏱️  Tempo: ${((Date.now() - inicio) / 1000).toFixed(1)}s`)
  console.log('====================================')

  if (semCoords > 0) {
    console.log('\n💡 Execute novamente para continuar geocodificando.')
  }
}

main().catch(console.error)
