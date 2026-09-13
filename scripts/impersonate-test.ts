import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function main() {
  const admin = createClient(URL, SERVICE)

  // Lista usuarios
  const { data: users } = await admin.auth.admin.listUsers()
  const user = users?.users?.[0]
  if (!user) return console.log('sem usuarios')

  console.log('user id:', user.id)

  // Gera link de magic / token impersonate
  const { data: link, error: el } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email!,
  })
  if (el) {
    console.log('erro link:', el.message)
    return
  }

  // Pega o token hashed
  const tokenHash = link?.properties?.hashed_token
  console.log('has hashed_token:', !!tokenHash)

  // Verifica OTP para obter sessao
  const { data: verify } = await admin.auth.verifyOtp({
    token_hash: tokenHash!,
    type: 'magiclink',
  } as any)

  const sess = verify?.session
  console.log('sess:', sess?.access_token?.slice(0, 30) + '...')

  if (!sess) return console.log('sem sessao')

  // Agora testa como se fosse o browser
  const browser = createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${sess.access_token}` } },
  })

  console.log('\n1) SELECT tenant_users:')
  let t = Date.now()
  let r = await browser.from('tenant_users').select('tenant_id').eq('user_id', user.id).single()
  console.log(`   ${Date.now()-t}ms | tenant=${r.data?.tenant_id} | erro=${r.error?.message}`)
  if (!r.data) return

  console.log('\n2) SELECT radar_obras limit 200:')
  t = Date.now()
  r = await browser.from('radar_obras').select('*').eq('tenant_id', r.data.tenant_id).order('created_at', { ascending: false }).limit(200)
  console.log(`   ${Date.now()-t}ms | count=${r.data?.length} | erro=${r.error?.message}`)

  console.log('\n3) SELECT radar_obras_globais limit 200:')
  t = Date.now()
  r = await browser.from('radar_obras_globais').select('id, total_marcacoes').limit(200)
  console.log(`   ${Date.now()-t}ms | count=${r.data?.length} | erro=${r.error?.message}`)
}

main().catch(e => { console.error(e); process.exit(1) })
