import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // pg_policies
  const { data: policies } = await supabase.rpc('exec_sql', {
    sql: `SELECT schemaname, tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname='public' AND tablename IN ('tenant_users','radar_obras','radar_obras_globais','radar_obra_marcacoes') ORDER BY tablename, policyname`,
  } as any)

  console.log(policies)
}

main().catch(e => { console.error('err:', e.message); process.exit(1) })
