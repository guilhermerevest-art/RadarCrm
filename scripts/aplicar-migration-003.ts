// Aplica migration SQL via conexão PostgreSQL direta do Supabase
// IMPORTANTE: requer a connection string do Supabase
import { Client } from 'pg'
import { readFileSync } from 'fs'

const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('❌ Defina SUPABASE_DB_URL')
  console.error('   Formato: postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres')
  console.error('   Pegar em: https://supabase.com/dashboard/project/anfczaxpxjlucpwjfsfw/settings/database')
  process.exit(1)
}

async function main() {
  const sql = readFileSync('supabase/migrations/003_obra_marcacoes.sql', 'utf-8')

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  console.log('✓ Conectado ao Supabase Postgres')

  try {
    await client.query(sql)
    console.log('✓ Migration 003 aplicada com sucesso!')
  } catch (err: any) {
    console.error('❌ Erro ao aplicar:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
