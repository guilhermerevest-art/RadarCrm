/**
 * Job de atualização diária do CNO
 *
 * O que faz:
 * 1. Baixa o CNO.zip mais recente (se tiver URL)
 * 2. Descompacta e importa APENAS obras novas (delta)
 * 3. Marca obras que sumiram como 'inativa'
 *
 * Uso:
 *   node scripts/job-diario-cno.js
 *
 * Agendamento (cron):
 *   0 6 * * * cd /path/to/RadarCrm && node scripts/job-diario-cno.js >> /var/log/radar.log 2>&1
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

async function marcarInativas() {
  await log('🔍 Verificando obras inativas (sem atualização há 60 dias)...')

  const { data: obras } = await supabase
    .from('radar_obras')
    .select('id, fonte_id, status')
    .eq('status', 'ativa')
    .lt('updated_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())

  if (!obras || obras.length === 0) {
    await log('✅ Nenhuma obra para marcar como inativa.')
    return 0
  }

  const ids = obras.map(o => o.id)
  const { error } = await supabase
    .from('radar_obras')
    .update({ status: 'inativa' })
    .in('id', ids)

  if (error) {
    await log(`❌ Erro: ${error.message}`)
    return 0
  }

  await log(`📉 Marcadas ${ids.length} obras como inativas.`)
  return ids.length
}

async function importarDelta() {
  await log('📥 Iniciando importação delta (somente Triângulo Mineiro ativas)...')

  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['scripts/import-cno-triangulo-ativas.js'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
    proc.on('exit', (code) => {
      if (code === 0) resolve(0)
      else reject(new Error(`Import exited with code ${code}`))
    })
  })
}

async function main() {
  await log('🚀 Iniciando job diário CNO')
  try {
    await importarDelta()
    await marcarInativas()
    await log('✅ Job concluído com sucesso')
  } catch (err) {
    await log(`❌ Erro no job: ${err.message}`)
    process.exit(1)
  }
}

main()
