// =============================================================================
// ETL: TJMG - Tribunal de Justiça de Minas Gerais
// Busca processos judiciais de empresas para qualification de leads
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =============================================================================
// TIPOS
// =============================================================================

interface ProcessoTJMG {
  numero: string;
  classe?: string;
  assunto?: string;
  data_distribuicao?: string;
  orgao?: string;
  situacao?: string;
  movimentacoes?: number;
}

interface LeadEnriched {
  empresa_id?: string;
  cnpj?: string;
  processos_encontrados: number;
  total_movimentacoes: number;
  ultima_atualizacao: string;
  raw_data: object;
}

// =============================================================================
// FUNÇÕES
// =============================================================================

/**
 * Busca processos no TJMG por CNPJ
 * API pública do TJMG
 */
async function buscarProcessosPorCNPJ(cnpj: string): Promise<ProcessoTJMG[]> {
  const cnpjLimpo = cnpj.replace(/\D/g, '');

  try {
    // TJMG tem uma API REST não documentada
    // Alternativa: scraping do portal de consultas
    const response = await fetch(
      `https://www.tjmg.jus.br/api/v1/processos?documento=${cnpjLimpo}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'RadarCRM/1.0'
        }
      }
    );

    if (!response.ok) {
      console.log(`TJMG: Response ${response.status} para CNPJ ${cnpj}`);
      return [];
    }

    const data = await response.json();
    return data.processos || [];
  } catch (error) {
    console.error(`TJMG: Erro ao buscar CNPJ ${cnpj}:`, error);
    return [];
  }
}

/**
 * Salva enriquecimento do lead no banco
 */
async function salvarEnriquecimento(
  cnpj: string,
  processos: ProcessoTJMG[]
): Promise<void> {
  const enriquecimento: LeadEnriched = {
    cnpj,
    processos_encontrados: processos.length,
    total_movimentacoes: processos.reduce((acc, p) => acc + (p.movimentacoes || 0), 0),
    ultima_atualizacao: new Date().toISOString(),
    raw_data: { processos }
  };

  // Armazenar como JSONB na tabela de leads ou criar tabela专门的
  const { error } = await supabase
    .from('leads')
    .update({
      dados_adicionais: {
        ...enriquecimento,
        fonte: 'tjmg',
        updated_at: new Date().toISOString()
      }
    })
    .eq('telefone', cnpj) // Por enquanto busca por telefone ( workaround )
    .or(`email.ilike.%${cnpj}%`);

  if (error) {
    console.error('TJMG: Erro ao salvar enriquecimento:', error);
  }
}

/**
 * Verifica se empresa tem processos de falência/recuperação judicial
 */
function temRiscoFalencia(processos: ProcessoTJMG[]): boolean {
  const classesRisco = [
    'FALENCIA',
    'RECUPERACAO_JUDICIAL',
    'RECUPERACAO_FALENCIA',
    'INSOLVENCIA'
  ];

  return processos.some(p =>
    classesRisco.some(cr =>
      p.classe?.toUpperCase().includes(cr)
    )
  );
}

/**
 * Calcula score de risco baseado nos processos
 */
function calcularRisco(processos: ProcessoTJMG[]): number {
  if (processos.length === 0) return 0;

  // Base: número de processos
  let score = Math.min(processos.length * 10, 50);

  // Penalidade por falência
  if (temRiscoFalencia(processos)) {
    score += 50;
  }

  // Penalidade por execução
  const temExecucao = processos.some(p =>
    p.classe?.toUpperCase().includes('EXECUCAO')
  );
  if (temExecucao) score += 20;

  return Math.min(score, 100);
}

// =============================================================================
// EXECUÇÃO
// =============================================================================

export async function runETL(limit: number = 100): Promise<{
  success: boolean;
  processed: number;
  errors: number;
}> {
  console.log('=== ETL TJMG - Início ===');

  const startTime = Date.now();
  let processed = 0;
  let errors = 0;

  try {
    // Busca leads com CNPJ que ainda não foram enriquecidos
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, empresa, email, telefone, dados_adicionais')
      .not('dados_adicionais', 'cs', '{"fonte":"tjmg"}')
      .limit(limit);

    if (error) {
      console.error('TJMG: Erro ao buscar leads:', error);
      return { success: false, processed: 0, errors: 1 };
    }

    if (!leads || leads.length === 0) {
      console.log('TJMG: Nenhum lead para processar');
      return { success: true, processed: 0, errors: 0 };
    }

    console.log(`TJMG: Processando ${leads.length} leads...`);

    for (const lead of leads) {
      try {
        // Extrai CNPJ do email ou usa identificador
        const cnpj = extrairCNPJ(lead);

        if (!cnpj) {
          // Não tem CNPJ, pula
          processed++;
          continue;
        }

        // Rate limiting: 1 req por segundo
        await sleep(1000);

        // Busca processos
        const processos = await buscarProcessosPorCNPJ(cnpj);

        // Salva enriquecimento
        await salvarEnriquecimento(cnpj, processos);

        // Atualiza score de risco se houver
        if (processos.length > 0) {
          const scoreRisco = calcularRisco(processos);
          await supabase
            .from('leads')
            .update({ score_risco: scoreRisco })
            .eq('id', lead.id);
        }

        processed++;

        if (processed % 10 === 0) {
          console.log(`TJMG: Processados ${processed}/${leads.length}`);
        }
      } catch (err) {
        console.error(`TJMG: Erro ao processar lead ${lead.id}:`, err);
        errors++;
      }
    }

    // Log do job
    await supabase.from('etl_jobs_last_run').upsert({
      fonte: 'tjmg',
      last_run: new Date().toISOString(),
      registros_processados: processed,
      status: errors === 0 ? 'success' : 'partial',
      duracao_ms: Date.now() - startTime
    });

    console.log(`=== ETL TJMG - Fim: ${processed} processados, ${errors} erros ===`);

    return {
      success: errors === 0,
      processed,
      errors
    };
  } catch (error) {
    console.error('TJMG: Erro fatal:', error);
    return { success: false, processed, errors: errors + 1 };
  }
}

// =============================================================================
// UTILIDADES
// =============================================================================

function extrairCNPJ(lead: any): string | null {
  // Tenta extrair do email
  if (lead.email) {
    const match = lead.email.match(/\d{14}/);
    if (match) return match[0];
  }

  // Tenta extrair do telefone
  if (lead.telefone) {
    const match = lead.telefone.match(/\d{14}/);
    if (match) return match[0];
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// EXECUÇÃO DIRETA
// =============================================================================

if (require.main === module) {
  const limit = parseInt(process.argv[2] || '100');
  runETL(limit)
    .then(result => {
      console.log('Resultado:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Erro fatal:', err);
      process.exit(1);
    });
}
