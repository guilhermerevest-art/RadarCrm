import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import fs from 'fs'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const sql = fs.readFileSync('supabase/migrations/005_fase_null_por_default.sql', 'utf8')
  console.log('Aplicando migration 005...')
  const { error } = await supabase.rpc('exec_sql', { sql })
  if (error) {
    console.error('Erro:', error.message)
    return
  }
  console.log('OK!')

  const { count } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
  console.log('Total obras MVP:', count)

  const { count: nulos } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
    .is('fase_atual', null)
  console.log('Obras SEM fase (nao identificadas):', nulos)
}

main().catch(e => { console.error(e); process.exit(1) })
