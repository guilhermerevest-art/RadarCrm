/**
 * ============================================================
 * RADAR CRM - ETL Pipeline Index
 * ============================================================
 *
 * Este arquivo exporta todos os módulos ETL disponíveis.
 * Use para orquestrar execuções ou importar funções individualmente.
 *
 * Uso:
 *   import { runAllETL, runETLBySource } from './scripts/etl';
 *   await runETLBySource('pncp', supabaseUrl, supabaseKey, tenantId);
 */

export { runETL as runPNCPETL } from './pncp';
export { runETL as runAlvaraUberlandiaETL } from './alvaras/uberlandia';
export { runETL as runAlvaraUberabaETL } from './alvaras/uberaba';
export { runETL as runSEMADETL } from './semad-mg';
export { runETL as runTJMGETL } from './tjmg';
export { runETL as runReceitaFederalETL } from './receita-federal';
export { runETL as runRegularidadeFiscalETL } from './regularidade-fiscal';

import { runETL as runPNCPETL } from './pncp';
import { runETL as runAlvaraUberlandiaETL } from './alvaras/uberlandia';
import { runETL as runAlvaraUberabaETL } from './alvaras/uberaba';
import { runETL as runSEMADETL } from './semad-mg';
import { runETL as runTJMGETL } from './tjmg';
import { runETL as runReceitaFederalETL } from './receita-federal';
import { runETL as runRegularidadeFiscalETL } from './regularidade-fiscal';

export interface ETLObra {
  fonte: string;
  fonte_id: string;
  tipo: string;
  endereco_logradouro: string;
  endereco_bairro: string;
  endereco_cidade: string;
  endereco_uf: string;
  lat?: number | null;
  lng?: number | null;
  data_inicio?: string | null;
  valor_estimado?: number | null;
  fase_atual: string;
  porte: string;
  segmento_alvo: string[];
  hash_deduplicacao: string;
  raw_payload: Record<string, unknown>;
}

export interface ETLJobResult {
  fonte: string;
  success: boolean;
  duracao_ms: number;
  registros_lidos: number;
  registros_inseridos: number;
  registros_duplicados: number;
  registros_erro: number;
  errors: string[];
}

/**
 * Executa ETL de uma fonte específica
 */
export async function runETLBySource(
  fonte: 'pncp' | 'alvara_uberlandia' | 'alvara_uberaba' | 'semad_mg',
  supabaseUrl: string,
  supabaseKey: string,
  tenantId?: string
): Promise<ETLJobResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`ETL: ${fonte}`);
  console.log('='.repeat(60));

  let result: ETLJobResult;

  switch (fonte) {
    case 'pncp':
      result = await runPNCPETL(supabaseUrl, supabaseKey, tenantId);
      break;
    case 'alvara_uberlandia':
      result = await runAlvaraUberlandiaETL(supabaseUrl, supabaseKey, tenantId);
      break;
    case 'alvara_uberaba':
      result = await runAlvaraUberabaETL(supabaseUrl, supabaseKey, tenantId);
      break;
    case 'semad_mg':
      result = await runSEMADETL(supabaseUrl, supabaseKey, tenantId);
      break;
    default:
      throw new Error(`Fonte desconhecida: ${fonte}`);
  }

  console.log(`\nResultado ${fonte}: ${result.success ? 'OK' : 'ERRO'}`);
  console.log(`  Lidos: ${result.registros_lidos}`);
  console.log(`  Inseridos: ${result.registros_inseridos}`);
  console.log(`  Duplicados: ${result.registros_duplicados}`);
  console.log(`  Erros: ${result.registros_erro}`);
  console.log(`  Duração: ${result.duracao_ms}ms`);

  return result;
}

/**
 * Executa todos os ETL em sequência
 */
export async function runAllETL(
  supabaseUrl: string,
  supabaseKey: string,
  tenantId?: string
): Promise<ETLJobResult[]> {
  console.log('\n' + '='.repeat(60));
  console.log('EXECUTANDO TODOS OS ETL PIPELINES');
  console.log('='.repeat(60));

  const fontes: Array<'pncp' | 'alvara_uberlandia' | 'alvara_uberaba' | 'semad_mg'> = [
    'pncp',
    'alvara_uberlandia',
    'alvara_uberaba',
    'semad_mg',
  ];

  const results: ETLJobResult[] = [];
  const startTime = Date.now();

  for (const fonte of fontes) {
    try {
      const result = await runETLBySource(fonte, supabaseUrl, supabaseKey, tenantId);
      results.push(result);
    } catch (err) {
      console.error(`Erro ao executar ${fonte}:`, err);
      results.push({
        fonte,
        success: false,
        duracao_ms: 0,
        registros_lidos: 0,
        registros_inseridos: 0,
        registros_duplicados: 0,
        registros_erro: 0,
        errors: [String(err)],
      });
    }
  }

  const totalTime = Date.now() - startTime;

  console.log('\n' + '='.repeat(60));
  console.log('RESUMO GERAL');
  console.log('='.repeat(60));
  console.log(`Tempo total: ${totalTime}ms`);
  console.log(`ETLs executados: ${results.length}`);
  console.log(`ETLs com sucesso: ${results.filter(r => r.success).length}`);
  console.log(`Total registros lidos: ${results.reduce((sum, r) => sum + r.registros_lidos, 0)}`);
  console.log(`Total registros inseridos: ${results.reduce((sum, r) => sum + r.registros_inseridos, 0)}`);

  return results;
}

// =============================================================================
// CLI
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tenantId = process.env.DEFAULT_TENANT_ID || process.argv[2];
  const fonte = process.argv[3] as 'pncp' | 'alvara_uberlandia' | 'alvara_uberaba' | 'semad_mg' | 'all';

  if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variables NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatorias');
    console.error('Configure no arquivo .env.local');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('RADAR CRM - ETL Orchestrator');
  console.log('='.repeat(60));

  if (fonte === 'all' || !fonte) {
    runAllETL(supabaseUrl, supabaseKey, tenantId)
      .then(results => {
        const todosSucesso = results.every(r => r.success);
        console.log('\n' + '='.repeat(60));
        console.log(todosSucesso ? 'TODOS OS ETLs CONCLUÍDOS COM SUCESSO' : 'ALGUNS ETLs FALHARAM');
        console.log('='.repeat(60));
        process.exit(todosSucesso ? 0 : 1);
      })
      .catch(err => {
        console.error('Erro fatal:', err);
        process.exit(1);
      });
  } else {
    runETLBySource(fonte, supabaseUrl, supabaseKey, tenantId)
      .then(result => {
        process.exit(result.success ? 0 : 1);
      })
      .catch(err => {
        console.error('Erro fatal:', err);
        process.exit(1);
      });
  }
}
