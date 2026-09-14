import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

async function main() {
  // Pegar 3 obras sem responsavel_documento
  const { data: obras } = await s
    .from('radar_obras')
    .select('id, fonte_id')
    .eq('tenant_id', TENANT_ID)
    .eq('fonte', 'cno')
    .is('responsavel_documento', null)
    .limit(3)

  if (!obras || obras.length === 0) {
    console.log('Nenhuma obra sem resp_doc')
    return
  }

  console.log('Obras selecionadas:')
  for (const o of obras) console.log(`  ${o.fonte_id} -> ${o.id}`)

  // Construir SQL de teste (3 valores, dados mock)
  const patches = obras.map((o, idx) => `('${o.id}', '111111110001${String(idx).padStart(2, '0')}', 'TESTE ${idx}', 'TEST')`)
  const valuesSql = patches.join(',')
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
    RETURNING id, responsavel_documento, responsavel_nome
  `

  console.log('\nSQL de teste:')
  console.log(sql)

  const { data, error } = await s.rpc('exec_sql', { sql })
  console.log('\nResultado:', JSON.stringify({ data, error }))
}

main().catch(e => { console.error(e); process.exit(1) })
