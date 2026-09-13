// Testa TODOS os fluxos críticos: tenant, obras, marcacao, lead
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.replace(/[\r\n]/g, '')

async function main() {
  const admin = createClient(URL, SERVICE)
  const { data: users } = await admin.auth.admin.listUsers()
  const user = users?.users?.[0]
  if (!user) return console.log('sem user')
  console.log('user:', user.id, user.email)

  // Gera sessão (impersonate)
  const { data: link } = await admin.auth.admin.generateLink({
    type: 'magiclink', email: user.email!,
  })
  const { data: verify } = await admin.auth.verifyOtp({
    token_hash: link?.properties?.hashed_token!, type: 'magiclink',
  } as any)
  const sess = verify?.session
  if (!sess) return console.log('sem sess')

  const browser = createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${sess.access_token}` } },
  })

  const TENANT = '00000000-0000-0000-0000-000000000001'

  // 1) tenant_users
  let r = await browser.from('tenant_users').select('tenant_id').eq('user_id', user.id).single()
  console.log('1. tenant_users:', r.data ? 'OK' : 'FAIL', r.error?.message)

  // 2) radar_obras (SELECT)
  r = await browser.from('radar_obras').select('id, hash_deduplicacao').eq('tenant_id', TENANT).limit(1)
  console.log('2. radar_obras SELECT:', r.data ? `OK (${r.data.length} obras)` : 'FAIL', r.error?.message)
  const primeiraObra = r.data?.[0]

  // 3) radar_obras_globais (INSERT) - testa se policy permite
  const hashTeste = `test-${Date.now()}`
  r = await browser.from('radar_obras_globais').insert({
    hash_deduplicacao: hashTeste,
    endereco_logradouro: 'Rua Teste',
    endereco_cidade: 'Uberlândia',
    endereco_uf: 'MG',
  }).select().single()
  console.log('3. radar_obras_globais INSERT:', r.data ? 'OK' : 'FAIL', r.error?.message)
  const novaGlobal = r.data
  if (novaGlobal) {
    // 4) radar_obra_marcacoes INSERT
    const rMarc = await browser.from('radar_obra_marcacoes').insert({
      obra_global_id: novaGlobal.id,
      tenant_id: TENANT,
      user_id: user.id,
      fase: 'fundacao',
      fase_macro: 'fundacao',
    }).select().single()
    console.log('4. radar_obra_marcacoes INSERT:', rMarc.data ? 'OK' : 'FAIL', rMarc.error?.message)

    // 5) radar_obra_confirmacoes INSERT (com user errado pra ver se block)
    const rConf = await browser.from('radar_obra_confirmacoes').insert({
      marcacao_id: rMarc.data?.id,
      user_id: user.id,
    })
    console.log('5. radar_obra_confirmacoes INSERT:', rConf.error ? 'FAIL' : 'OK', rConf.error?.message)

    // 6) crm_leads INSERT
    const rLead = await browser.from('crm_leads').insert({
      tenant_id: TENANT,
      nome: 'Lead Teste',
      telefone: '34999999999',
      status: 'novo',
      origem: 'radar',
    }).select().single()
    console.log('6. crm_leads INSERT:', rLead.data ? `OK (${rLead.data.id})` : 'FAIL', rLead.error?.message)
  }

  // Cleanup
  if (novaGlobal) {
    await admin.from('radar_obras_globais').delete().eq('id', novaGlobal.id)
  }
  console.log('\ncleanup OK')
}

main().catch(e => { console.error(e); process.exit(1) })
