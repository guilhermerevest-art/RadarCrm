import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TENANT_MVP = '00000000-0000-0000-0000-000000000001'

async function main() {
  // Soma todas as fases via postgres function
  const { data: rpc, error } = await supabase.rpc('count_obras_por_fase' as any, { p_tenant: TENANT_MVP })
  if (!error && rpc) {
    console.log('Via RPC:', rpc)
  }

  // Conta direto com head
  const { count: total, error: e2 } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_MVP)

  console.log('Total exato:', total, 'erro:', e2?.message || 'nenhum')

  // Amostra por fase
  const { data: sample } = await supabase
    .from('radar_obras')
    .select('fase_atual')
    .eq('tenant_id', TENANT_MVP)
    .range(0, 20000)

  const fases: Record<string, number> = {}
  sample?.forEach((o: any) => {
    fases[o.fase_atual] = (fases[o.fase_atual] || 0) + 1
  })
  console.log('Distribuicao amostra:', fases)
}

main().catch((e) => { console.error(e); process.exit(1) })
