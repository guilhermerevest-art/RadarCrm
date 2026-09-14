// =============================================================================
// Backfill v2: usa SQL UPDATE em batch via RPC exec_sql
// Streaming do CSV + constroi uma unica query UPDATE em chunks
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import fs from 'fs'
import readline from 'readline'
config({ path: '.env.local' })

const TENANT_ID = process.env.TENANT_ID || '00000000-0000-0000-0000-000000000001'
const CSV_PATH = process.env.CSV_PATH || 'cno.csv'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Indices (sem header, virgula como separador):
const COL_CNO = 0
const COL_NI = 8
const COL_QUALIFICACAO = 9
const COL_NOME = 10

async function main() {
  console.log(`[1/3] Indexando ${CSV_PATH} (streaming)...`)
  const map = new Map<string, { ni: string; nome: string; qualif: string }>()
  const stream = fs.createReadStream(CSV_PATH, { encoding: 'latin1', highWaterMark: 1024 * 1024 })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  let lines = 0
  for await (const line of rl) {
    lines++
    const f = line.split(',').map(s => s.replace(/^"|"$/g, '').trim())
    const cno = f[COL_CNO]
    if (!cno) continue
    const ni = (f[COL_NI] || '').replace(/\D/g, '')
    if (!ni) continue
    map.set(cno, { ni, nome: f[COL_NOME] || '', qualif: f[COL_QUALIFICACAO] || '' })
    if (lines % 500000 === 0) console.log(`  ${lines} linhas, ${map.size} com CNPJ`)
  }
  console.log(`  Total: ${lines} linhas, ${map.size} CNOs com CNPJ`)

  console.log(`\n[2/3] Buscando obras CNO (paginando)...`)
  const obras: Array<{ id: string; fonte_id: string }> = []
  let offset = 0
  const PAGE = 1000
  while (true) {
    const { data } = await supabase
      .from('radar_obras')
      .select('id, fonte_id')
      .eq('tenant_id', TENANT_ID)
      .eq('fonte', 'cno')
      .is('responsavel_documento', null)
      .range(offset, offset + PAGE - 1)
    if (!data || data.length === 0) break
    obras.push(...data)
    offset += PAGE
    if (data.length < PAGE) break
  }
  console.log(`  ${obras.length} obras sem responsavel_documento`)

  console.log(`\n[3/3] Construindo UPDATE em batch (SQL)...`)
  // Monta VALUES: (id::uuid, ni, nome, qualif)
  // Chunks de 500 para nao exceder limite do Postgres
  const patches: string[] = []
  for (const obra of obras) {
    const info = map.get(obra.fonte_id)
    if (!info) continue
    const safeName = info.nome.replace(/'/g, "''")
    patches.push(`('${obra.id}','${info.ni}','${safeName}','${info.qualif}')`)
  }
  console.log(`  ${patches.length} patches a aplicar`)

  const CHUNK = 500
  let updated = 0
  for (let i = 0; i < patches.length; i += CHUNK) {
    const slice = patches.slice(i, i + CHUNK)
    // Cast explicito na coluna id (nao no VALUES todo) - usar CTE typed
    // Bug anterior: ${p}::uuid foi interpretado como cast do VALUES inteiro.
    // Solucao: subquery com alias + cast explicito por coluna.
    const valuesSql = slice.join(',')
    const sql = `
      WITH v(obra_id, ni, nome, qualif) AS (
        SELECT id::uuid, ni, nome, qualif FROM (VALUES ${valuesSql}) AS x(id, ni, nome, qualif)
      )
      UPDATE radar_obras
      SET responsavel_documento = v.ni,
          responsavel_nome = v.nome,
          responsavel_qualificacao = v.qualif
      FROM v
      WHERE radar_obras.id = v.obra_id
        AND radar_obras.tenant_id = '${TENANT_ID}'
    `
    const { error } = await supabase.rpc('exec_sql', { sql })
    if (error) {
      console.error(`  Erro chunk ${i / CHUNK}:`, error.message.slice(0, 200))
      // Mostrar SQL do primeiro erro para debug
      if (i === 0) console.log('  SQL sample:', sql.slice(0, 400))
    } else {
      updated += slice.length
    }
    if ((i / CHUNK) % 5 === 0) console.log(`  progresso: ${updated}/${patches.length}`)
  }
  console.log(`\n✅ ${updated} obras atualizadas`)

  const { count } = await supabase
    .from('radar_obras')
    .select('id', { count: 'exact', head: true })
    .not('responsavel_documento', 'is', null)
  console.log(`Total com responsavel_documento: ${count}`)
}
main().catch(e => { console.error(e); process.exit(1) })
