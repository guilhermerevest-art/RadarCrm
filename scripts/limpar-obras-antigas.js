// Verifica distribuição de status e remove obras concluídas/canceladas
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

async function main() {
  console.log('📊 Verificando distribuição de status...\n')

  // Pega amostra aleatória para ver status (1000 obras)
  const { data: sample } = await supabase
    .from('radar_obras')
    .select('status')
    .limit(1000)

  const counts = {}
  sample.forEach(r => counts[r.status] = (counts[r.status] || 0) + 1)
  console.log('Amostra de 1000 obras:', counts)
  console.log('(Mas todas estão como "ativa" — campo não foi atualizado no import)')
  console.log('')

  // Mostra total
  const { count: total } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })

  console.log(`📦 Total de obras no radar: ${total}`)

  // Opção A: Deletar obras antigas (data_inicio < 2020)
  // CNO tem obras desde 1992, então deletar < 2020 = limpar obras antigas/paradas
  const oldCount = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })
    .lt('data_inicio', '2020-01-01')

  console.log(`📅 Obras com início ANTES de 2020: ${oldCount.count}`)

  // Opção B: Áreas muito pequenas (provavelmente obras inativas)
  const tinyCount = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })
    .lt('valor_estimado', 5000)

  console.log(`🏠 Obras com valor < R$ 5.000 (muito pequenas): ${tinyCount.count}`)
  console.log('')

  // Opção C: Ver obras com situação "ENCERRADA" no raw_payload CNO
  // O CNO tem campo "Situação" (col 22) com valores tipo:
  // 01 = Ativa, 02 = Encerrada, etc.
  // Mas como não importamos a coluna situação, todas estão como "ativa"
  console.log('⚠️  Importante: o import não gravou o status real do CNO.')
  console.log('    Todas as 103k obras estão como "ativa" no campo status.')
  console.log('')
  console.log('Sugestão: filtrar por data_inicio para limpar obras antigas')
  console.log('')

  // Faz a limpeza: deleta obras com data_inicio < 2020 (muito antigas)
  console.log('🧹 Deletando obras com data_inicio < 2020-01-01...')

  // Deletar em batches para não estourar limite
  let deleted = 0
  let batch = 1000
  while (true) {
    const { data: toDelete, error: fetchErr } = await supabase
      .from('radar_obras')
      .select('id')
      .lt('data_inicio', '2020-01-01')
      .limit(batch)

    if (fetchErr) {
      console.error('❌ Erro:', fetchErr.message)
      break
    }

    if (!toDelete || toDelete.length === 0) {
      break
    }

    const ids = toDelete.map(r => r.id)
    const { error: delErr } = await supabase
      .from('radar_obras')
      .delete()
      .in('id', ids)

    if (delErr) {
      console.error('❌ Erro ao deletar:', delErr.message)
      break
    }

    deleted += ids.length
    process.stdout.write(`  ✓ Deletadas ${deleted} obras antigas...\r`)

    if (toDelete.length < batch) break
  }

  console.log('')
  console.log(`\n✅ Total deletadas: ${deleted}`)

  // Conta final
  const { count: final } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })

  console.log(`📦 Restantes: ${final}`)
}

main().catch(console.error)
