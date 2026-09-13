import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'public' } }
)

const TENANT_MVP = '00000000-0000-0000-0000-000000000001'

async function main() {
  const { count: total } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_MVP)

  const { data: porFase } = await supabase
    .from('radar_obras')
    .select('fase_atual')
    .eq('tenant_id', TENANT_MVP)

  const fases: Record<string, number> = {}
  porFase?.forEach((o: any) => {
    fases[o.fase_atual] = (fases[o.fase_atual] || 0) + 1
  })

  const { data: porCidade } = await supabase
    .from('radar_obras')
    .select('endereco_cidade')

  const cidades = new Set(porCidade?.map((o: any) => o.endereco_cidade))

  const { count: leads } = await supabase
    .from('crm_leads')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_MVP)

  console.log('====== MVP UBERLANDIA ======')
  console.log('Total obras: ' + (total || 0))
  console.log('Cidades unicas: ' + cidades.size)
  console.log('Fases:')
  Object.entries(fases).forEach(([k, v]) => {
    console.log('   ' + k + ': ' + v)
  })
  console.log('Leads CRM: ' + (leads || 0))
  console.log('============================')

  const cidadesLista = Array.from(cidades).sort()
  if (cidadesLista.length <= 10) {
    console.log('Cidades encontradas: ' + cidadesLista.join(', '))
  } else {
    console.log('Primeiras cidades: ' + cidadesLista.slice(0, 5).join(', ') + '...')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
