import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

// Testa com ANON key (simula browser), não service role
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

const supabase = createClient(URL, ANON, { auth: { persistSession: false } })

async function main() {
  console.log('Testando com ANON key (simula browser)...\n')

  console.log('1) getUser sem login:')
  const { data: { user } } = await supabase.auth.getUser()
  console.log('   user =', user, '\n')

  console.log('2) SELECT tenant_users SEM usuario (deve falhar por RLS):')
  const { data: tu, error: e1 } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .limit(1)
  console.log('   tu =', tu, 'erro =', e1?.message, '\n')

  console.log('3) SELECT radar_obras SEM usuario (deve falhar por RLS):')
  const { data: ob, error: e2 } = await supabase
    .from('radar_obras')
    .select('id')
    .limit(1)
  console.log('   ob =', ob?.length, 'obras', 'erro =', e2?.message)
}

main().catch(e => { console.error(e); process.exit(1) })
