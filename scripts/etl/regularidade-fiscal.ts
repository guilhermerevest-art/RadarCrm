// =============================================================================
// ETL: INSS/PGFN - Certidão Negativa de Débitos
// Verifica regularidade fiscal de empresas/CNPJs
// API: https://api.conomicas.ap.gov.br (ou scraping)
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

interface CertidaoCND {
  cnpj: string;
  tipo: 'inss' | 'pgfpn';
  situacao: 'regular' | 'irregular' | 'pendente' | 'nao_encontrado';
  data_emissao: string;
  data_validade?: string;
  codigo_autenticidade?: string;
  dividas_encontradas?: number;
  valor_total?: number;
}

interface RegularidadeFiscal {
  cnpj: string;
  cnd_inss?: CertidaoCND;
  cnd_pgfn?: CertidaoCND;
  score_regularidade: number; // 0-100
  nivel_risco: 'baixo' | 'medio' | 'alto';
  ultima_verificacao: string;
}

// =============================================================================
// FUNÇÕES
// =============================================================================

/**
 * Consulta certidão negativa do INSS
 * API: https://www.inss.gov.br/servicos-do-inss/certidao-negativa/
 */
async function consultarINSS(cnpj: string): Promise<CertidaoCND | null> {
  const cnpjLimpo = cnpj.replace(/\D/g, '');

  try {
    // O INSS não tem API pública, mas a PGFN tem
    // Alternativa: usar a API da PGFN que também verifica INSS
    const response = await fetch(
      'https://api.conomicas.ap.gov.br/receitafederal/certidao-negativa',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'RadarCRM/1.0'
        },
        body: JSON.stringify({
          cnpj: cnpjLimpo,
          tipo: 'inss'
        })
      }
    );

    if (!response.ok) {
      console.log(`INSS: Response ${response.status} para CNPJ ${cnpj}`);
      return null;
    }

    const data = await response.json();

    return {
      cnpj,
      tipo: 'inss',
      situacao: mapearSituacao(data.situacao),
      data_emissao: data.dataEmissao || new Date().toISOString(),
      data_validade: data.dataValidade,
      codigo_autenticidade: data.codigo,
      dividas_encontradas: data.quantidadeDebitos,
      valor_total: data.valorTotal
    };
  } catch (error) {
    console.error(`INSS: Erro ao consultar CNPJ ${cnpj}:`, error);
    return null;
  }
}

/**
 * Consulta certidão negativa da PGFN
 * API: https://www.gov.br/pgfn
 */
async function consultarPGFN(cnpj: string): Promise<CertidaoCND | null> {
  const cnpjLimpo = cnpj.replace(/\D/g, '');

  try {
    // PGFN tem API para consulta
    const response = await fetch(
      `https://api.conomicas.ap.gov.br/pgfn/certidao-negativa/${cnpjLimpo}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'RadarCRM/1.0'
        }
      }
    );

    if (!response.ok) {
      console.log(`PGFN: Response ${response.status} para CNPJ ${cnpj}`);
      return null;
    }

    const data = await response.json();

    return {
      cnpj,
      tipo: 'pgfpn',
      situacao: mapearSituacao(data.situacao),
      data_emissao: data.dataEmissao || new Date().toISOString(),
      data_validade: data.dataValidade,
      codigo_autenticidade: data.codigo,
      dividas_encontradas: data.quantidadeDebitos,
      valor_total: data.valorTotal
    };
  } catch (error) {
    console.error(`PGFN: Erro ao consultar CNPJ ${cnpj}:`, error);
    return null;
  }
}

/**
 * Mapeia situação da API para nosso formato
 */
function mapearSituacao(situacaoApi: string): CertidaoCND['situacao'] {
  const situacao = situacaoApi?.toLowerCase() || '';

  if (situacao.includes('negativa') || situacao.includes('regular') || situacao.includes('ativa')) {
    return 'regular';
  }

  if (situacao.includes('positiva') || situacao.includes('irregular') || situacao.includes('inadimplente')) {
    return 'irregular';
  }

  if (situacao.includes('pendente') || situacao.includes('processando')) {
    return 'pendente';
  }

  return 'nao_encontrado';
}

/**
 * Calcula score de regularidade baseado nas certidões
 */
function calcularScoreRegularidade(
  cndINSS: CertidaoCND | null,
  cndPGFN: CertidaoCND | null
): { score: number; nivel: RegularidadeFiscal['nivel_risco'] } {
  let score = 100;

  // Penalidades baseadas no INSS
  if (cndINSS) {
    if (cndINSS.situacao === 'irregular') {
      score -= 60;
    } else if (cndINSS.situacao === 'pendente') {
      score -= 30;
    } else if (cndINSS.situacao === 'nao_encontrado') {
      score -= 20;
    }

    // Penalidade por valor de dívidas
    if (cndINSS.valor_total && cndINSS.valor_total > 100000) {
      score -= 20;
    } else if (cndINSS.valor_total && cndINSS.valor_total > 10000) {
      score -= 10;
    }
  } else {
    score -= 50; // Não conseguiu consultar
  }

  // Penalidades baseadas na PGFN
  if (cndPGFN) {
    if (cndPGFN.situacao === 'irregular') {
      score -= 40;
    } else if (cndPGFN.situacao === 'pendente') {
      score -= 20;
    } else if (cndPGFN.situacao === 'nao_encontrado') {
      score -= 15;
    }

    // Penalidade por valor de dívidas
    if (cndPGFN.valor_total && cndPGFN.valor_total > 50000) {
      score -= 15;
    }
  } else {
    score -= 30;
  }

  score = Math.max(0, Math.min(100, score));

  let nivel: RegularidadeFiscal['nivel_risco'];
  if (score >= 80) {
    nivel = 'baixo';
  } else if (score >= 50) {
    nivel = 'medio';
  } else {
    nivel = 'alto';
  }

  return { score, nivel };
}

/**
 * Salva dados de regularidade no Supabase
 */
async function salvarRegularidade(
  cnpj: string,
  regularidade: RegularidadeFiscal
): Promise<void> {
  const { error } = await supabase
    .from('leads')
    .update({
      score_regularidade: regularidade.score_regularidade,
      nivel_risco_fiscal: regularidade.nivel_risco,
      dados_adicionais: {
        ...regularidade,
        fonte: 'inss_pgfpn',
        updated_at: new Date().toISOString()
      }
    })
    .eq('email', `%.${cnpj}%`);

  if (error) {
    console.log('Regularidade: Salvando na tabela empresas...');
    await supabase.from('empresas').upsert({
      cnpj,
      regularidade_fiscal: regularidade
    }, {
      onConflict: 'cnpj'
    });
  }
}

/**
 * Extrai CNPJ de um lead
 */
function extrairCNPJ(lead: any): string | null {
  if (lead.email) {
    const match = lead.email.match(/\d{14}/);
    if (match) return match[0];
  }

  if (lead.telefone) {
    const match = lead.telefone.match(/\d{14}/);
    if (match) return match[0];
  }

  return null;
}

/**
 * Valida CNPJ
 */
function validarCNPJ(cnpj: string): boolean {
  const cnpjLimpo = cnpj.replace(/\D/g, '');
  return cnpjLimpo.length === 14;
}

/**
 * Sleep com promise
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// EXECUÇÃO
// =============================================================================

export async function runETL(limit: number = 50): Promise<{
  success: boolean;
  processed: number;
  errors: number;
}> {
  console.log('=== ETL INSS/PGFN - Início ===');

  const startTime = Date.now();
  let processed = 0;
  let errors = 0;

  try {
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, empresa, email, telefone, dados_adicionais')
      .not('score_regularidade', 'not.is', null)
      .limit(limit);

    if (error) {
      console.error('Regularidade: Erro ao buscar leads:', error);
      return { success: false, processed: 0, errors: 1 };
    }

    if (!leads || leads.length === 0) {
      console.log('Regularidade: Nenhum lead para processar');
      return { success: true, processed: 0, errors: 0 };
    }

    console.log(`Regularidade: Processando ${leads.length} leads...`);

    for (const lead of leads) {
      try {
        const cnpj = extrairCNPJ(lead);

        if (!cnpj || !validarCNPJ(cnpj)) {
          processed++;
          continue;
        }

        // Rate limiting
        await sleep(2000);

        // Consulta INSS e PGFN
        const [cndINSS, cndPGFN] = await Promise.all([
          consultarINSS(cnpj).catch(() => null),
          consultarPGFN(cnpj).catch(() => null)
        ]);

        // Calcula score
        const { score, nivel } = calcularScoreRegularidade(cndINSS, cndPGFN);

        const regularidade: RegularidadeFiscal = {
          cnpj,
          cnd_inss: cndINSS || undefined,
          cnd_pgfn: cndPGFN || undefined,
          score_regularidade: score,
          nivel_risco: nivel,
          ultima_verificacao: new Date().toISOString()
        };

        await salvarRegularidade(cnpj, regularidade);

        processed++;

        if (processed % 10 === 0) {
          console.log(`Regularidade: Processados ${processed}/${leads.length}`);
        }
      } catch (err) {
        console.error(`Regularidade: Erro ao processar lead ${lead.id}:`, err);
        errors++;
      }
    }

    // Log do job
    await supabase.from('etl_jobs_last_run').upsert({
      fonte: 'inss_pgfpn',
      last_run: new Date().toISOString(),
      registros_processados: processed,
      status: errors === 0 ? 'success' : 'partial',
      duracao_ms: Date.now() - startTime
    });

    console.log(`=== ETL INSS/PGFN - Fim: ${processed} processados, ${errors} erros ===`);

    return {
      success: errors === 0,
      processed,
      errors
    };
  } catch (error) {
    console.error('Regularidade: Erro fatal:', error);
    return { success: false, processed, errors: errors + 1 };
  }
}

// =============================================================================
// EXECUÇÃO DIRETA
// =============================================================================

if (require.main === module) {
  const limit = parseInt(process.argv[2] || '50');
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
