import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

// Simula EXATAMENTE o browser: ANON key + login por email/senha
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

async function main() {
  const supabase = createClient(URL, ANON, { auth: { persistSession: false } })

  console.log('Login...')
  const { data: sess, error: eLogin } = await supabase.auth.signInWithPassword({
    email: 'guilherme.quartzrevest@gmail.com',
    password: 'TESTE123',
  })
  console.log('user:', sess?.user?.id, 'erro:', eLogin?.message)

  if (!sess?.user) {
    console.log('Sem user - nao posso testar mais')
    return
  }

  console.log('\n1) SELECT tenant_users:')
  const t0 = Date.now()
  const { data: tu, error: e1 } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', sess.user.id)
    .single()
  console.log(`   ${Date.now()-t0}ms | tenant=${tu?.tenant_id} | erro=${e1?.message}`)

  if (!tu) return

  console.log('\n2) SELECT radar_obras (limit 200):')
  const t1 = Date.now()
  const { data: ob, error: e2 } = await supabase
    .from('radar_obras')
    .select('*')
    .eq('tenant_id', tu.tenant_id)
    .order('created_at', { ascending: false })
    .limit(200)
  console.log(`   ${Date.now()-t1}ms | count=${ob?.length} | erro=${e2?.message}`)

  if (ob && ob.length > 0) {
    console.log('\n3) SELECT radar_obras_globais em lote:')
    const t2 = Date.now()
    const { data: globais, error: e3 } = await supabase
      .from('radar_obras_globais')
      .select('id, total_marcacoes, total_confirmacoes')
      .limit(10)
    console.log(`   ${Date.now()-t2}ms | count=${globais?.length} | erro=${e3?.message}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
