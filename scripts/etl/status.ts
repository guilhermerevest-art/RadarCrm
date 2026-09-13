/**
 * Script para verificar status dos ETL jobs
 * Uso: npm run etl:status
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variables de ambiente obrigatorias');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('='.repeat(70));
  console.log('STATUS DOS JOBS ETL - RADAR CRM');
  console.log('='.repeat(70));
  console.log('');

  // Buscar configuração das fontes
  const { data: fontes, error: fontesError } = await supabase
    .from('radar_fontes_config')
    .select('*')
    .order('fonte');

  if (fontesError) {
    console.error('Erro ao buscar fontes:', fontesError.message);
    process.exit(1);
  }

  // Buscar status dos jobs
  const { data: jobs, error: jobsError } = await supabase
    .from('etl_jobs_last_run')
    .select('*')
    .order('fonte');

  if (jobsError) {
    console.error('Erro ao buscar jobs:', jobsError.message);
    process.exit(1);
  }

  // Buscar últimos jobs executados
  const { data: ultimoJob, error: ultimoError } = await supabase
    .from('radar_ingestao_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('CONFIGURAÇÃO DAS FONTES');
  console.log('-'.repeat(70));
  for (const fonte of fontes || []) {
    console.log(`  ${fonte.fonte.padEnd(20)} Habilitada: ${fonte.enabled ? 'SIM' : 'NAO'} | Total importado: ${fonte.total_registros_importados}`);
  }

  console.log('');
  console.log('STATUS DOS JOBS');
  console.log('-'.repeat(70));

  const statusEmoji: Record<string, string> = {
    sucesso: '✅',
    erro: '❌',
    em_andamento: '⏳',
    nunca_rodou: '⚪',
    desconhecido: '❓',
  };

  for (const job of jobs || []) {
    const emoji = statusEmoji[job.status] || statusEmoji.desconhecido;
    const ultimaExec = job.ultima_execucao
      ? new Date(job.ultima_execucao).toLocaleString('pt-BR')
      : 'Nunca';

    const horasAtraso = job.ultima_execucao
      ? Math.floor((Date.now() - new Date(job.ultima_execucao).getTime()) / (1000 * 60 * 60))
      : null;

    let alerta = '';
    if (job.status === 'erro') {
      alerta = ' [ERRO]';
    } else if (horasAtraso !== null && horasAtraso > 24) {
      alerta = ` [ATRASADO ${horasAtraso}h]`;
    }

    console.log(`  ${emoji} ${job.fonte.padEnd(20)} Status: ${job.status.padEnd(15)} Ultima: ${ultimaExec}${alerta}`);
    if (job.erro_mensagem) {
      console.log(`    Erro: ${job.erro_mensagem.substring(0, 60)}...`);
    }
    console.log(`    Registros: ${job.registros_importados} | Duracao: ${job.duracao_segundos || '-'}s`);
  }

  console.log('');
  console.log('ÚLTIMOS JOBS EXECUTADOS');
  console.log('-'.repeat(70));

  for (const job of ultimoJob || []) {
    const data = new Date(job.created_at).toLocaleString('pt-BR');
    console.log(`  ${data} | ${job.fonte.padEnd(20)} | ${job.status.padEnd(10)} | Lidos: ${job.registros_lidos} | Inseridos: ${job.registros_inseridos}`);
  }

  console.log('');
  console.log('='.repeat(70));

  // Verificar jobs atrasados
  const { data: atrasados } = await supabase.rpc('fn_etl_jobs_atrasados');

  if (atrasados && atrasados.length > 0) {
    console.log('\n⚠️  JOBS ATRASADOS (mais de 24h sem executar):');
    for (const job of atrasados) {
      console.log(`  - ${job.fonte}: ${job.horas_atraso.toFixed(1)}h de atraso`);
    }
    process.exit(1);
  } else {
    console.log('\n✅ Todos os jobs ETL estão em dia.');
  }
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
