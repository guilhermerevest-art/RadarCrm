import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import fs from 'fs'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const sql = fs.readFileSync('supabase/migrations/014_obra_responsavel.sql', 'utf8')
  console.log(`Aplicando 014_obra_responsavel.sql (${sql.length} chars)...`)

  const { error } = await supabase.rpc('exec_sql', { sql })
  if (error) {
    console.error('Erro:', error.message)
    process.exit(1)
  }

  console.log('OK! Verificando...')
  const { data, error: e2 } = await supabase
    .from('radar_obras')
    .select('id, responsavel_nome, responsavel_documento, responsavel_qualificacao')
    .not('responsavel_documento', 'is', null)
    .limit(3)

  if (e2) {
    console.log('Erro verificação:', e2.message)
  } else {
    console.log(`Amostras com responsavel_documento: ${data?.length}`)
    data?.forEach(r => {
      console.log(`  - ${r.responsavel_nome} | ${r.responsavel_documento} | ${r.responsavel_qualificacao}`)
    })
  }

  const { count } = await supabase
    .from('radar_obras')
    .select('id', { count: 'exact', head: true })
    .not('responsavel_documento', 'is', null)
  console.log(`Total obras com responsavel_documento: ${count}`)
}
main().catch(e => { console.error(e); process.exit(1) })
