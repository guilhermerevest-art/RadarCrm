import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import fs from 'fs'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function applyMigration(filename: string) {
  const sqlPath = `supabase/migrations/${filename}`
  const sql = fs.readFileSync(sqlPath, 'utf8')
  console.log(`\n📋 Aplicando ${filename}...`)
  console.log(`   (${sql.length} caracteres, ${sql.split('\n').length} linhas)`)

  const { error } = await supabase.rpc('exec_sql', { sql })
  if (error) {
    console.error(`❌ Erro em ${filename}:`, error.message)
    return false
  }
  console.log(`✅ ${filename} aplicada com sucesso`)
  return true
}

async function main() {
  const args = process.argv.slice(2)
  const targetFile = args.find(a => a.startsWith('--file='))?.split('=')[1]

  const migrations = targetFile
    ? [targetFile]
    : ['018_enrich_cnpj_schema.sql', '019_cron_enrich_cnpj.sql']

  for (const m of migrations) {
    const ok = await applyMigration(m)
    if (!ok) {
      console.error('\nAborta na primeira falha.')
      process.exit(1)
    }
  }

  console.log('\n🔍 Verificacoes pos-migration:')
  for (const table of ['radar_obras_empresas', 'radar_obras_socios']) {
    const { data, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
    if (error) {
      console.log(`  ${table}: ERRO - ${error.message}`)
    } else {
      console.log(`  ${table}: ${data?.length ?? 0} linhas (esperado 0)`)
    }
  }

  const { data: colInfo } = await supabase.rpc('exec_sql', {
    sql: `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'crm_leads' AND column_name = 'obra_id'`
  })
  console.log(`  crm_leads.obra_id: ${colInfo ? 'OK' : 'AUSENTE'}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
