require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: 'public' } }
)

async function main() {
  console.log('🔍 Testando fn_geocoding_resolver...\n')

  const testAddress = 'Rua XV de Novembro, Centro, Uberlandia, MG, Brasil'

  console.log(`Endereço: ${testAddress}`)

  const { data, error } = await supabase.rpc('fn_geocoding_resolver', {
    endereco: testAddress
  })

  if (error) {
    console.log('❌ Erro:', error.message)
    console.log('Código:', error.code)
    console.log('Detalhes:', JSON.stringify(error, null, 2))
    return
  }

  console.log('✅ Resultado:', JSON.stringify(data, null, 2))
}

main().catch(console.error)
