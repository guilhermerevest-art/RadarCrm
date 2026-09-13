import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TENANT_MVP = '00000000-0000-0000-0000-000000000001'

async function main() {
  console.log('=== TENANTS ===')
  const { data: tenants } = await supabase.from('tenants').select('id, nome, slug')
  console.table(tenants)

  console.log('\n=== USUARIOS AUTH ===')
  const { data: users } = await supabase.auth.admin.listUsers()
  console.log('Total auth users:', users?.users?.length)
  users?.users?.forEach((u: any) => console.log(`  ${u.id} - ${u.email}`))

  console.log('\n=== TENANT_USERS ===')
  const { data: tu } = await supabase.from('tenant_users').select('id, tenant_id, user_id, papel, ativo')
  console.table(tu)

  console.log('\n=== TENANT USERS QUE APONTAM PARA TENANT MVP ===')
  const { count: ok } = await supabase
    .from('tenant_users')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_MVP)
  console.log('Vinculos MVP:', ok)

  console.log('\n=== OBRAS NO TENANT MVP ===')
  const { count: obras } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_MVP)
  console.log('Obras MVP:', obras)
}

main().catch(e => { console.error(e); process.exit(1) })
