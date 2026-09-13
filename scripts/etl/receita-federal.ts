// =============================================================================
// ETL: Receita Federal - Dados de CNPJ
// Enriquecimento de dados de empresas via CNPJ
// API: https://receitaws.com.br/
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

interface DadosReceitaWS {
  uf?: string;
  municipio?: string;
  cep?: string;
  cnpj?: string;
  tipo?: string;
  porte?: string;
  nome?: string;
  fantasia?: string;
  atividade_principal?: Array<{ text: string; code: string }>;
  atividades_secundarias?: Array<{ text: string; code: string }>;
  natureza_juridica?: string;
  situacao?: string;
  data_situacao?: string;
  data_inicio_atividade?: string;
  cnae_fiscal?: number;
  cnae_fiscal_descricao?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  email?: string;
  telefone?: string;
  qsa?: Array<{ nome: string; qual: string }>;
  capital_social?: string;
}

interface EmpresaEnriquecida {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  situacao: string;
  data_inicio: string;
  natureza_juridica: string;
  porte: string;
  municipio: string;
  uf: string;
  cep?: string;
  logradouro: string;
  atividade_principal: string;
  segmento: string[];
  capital_social?: number;
  socios?: number;
  telefone?: string;
  email?: string;
  fonte: 'receita_federal';
  updated_at: string;
}

// =============================================================================
// MAPEAMENTO DE SEGMENTOS
// =============================================================================

const CNAE_SEGMENTOS: Record<string, string[]> = {
  '4110': ['residencial'], // Preparação de terrenos
  '4121': ['residencial', 'comercial'], // Construção de edifícios
  '4211': ['infraestrutura'], // Construção de roads e estradas
  '4222': ['infraestrutura'], // Construção de redes de distribuição
  '4313': ['infraestrutura'], // Sondagens
  '4321': ['comercial', 'residencial'], // Instalações elétricas
  '4322': ['comercial', 'residencial'], // Instalações hidráulicas
  '4330': ['residencial', 'comercial'], // Obras de acabamento
  '4399': ['residencial', 'comercial', 'industrial'], // Construção pesada
};

// =============================================================================
// FUNÇÕES
// =============================================================================

/**
 * Busca dados do CNPJ na API ReceitaWS
 * Limite: 3 requisições por minuto (rate limit da API gratuita)
 */
async function buscarCNPJ(cnpj: string): Promise<DadosReceitaWS | null> {
  const cnpjLimpo = cnpj.replace(/\D/g, '');

  if (cnpjLimpo.length !== 14) {
    console.log(`CNPJ inválido: ${cnpj}`);
    return null;
  }

  try {
    // API gratuita: https://receitaws.com.br/
    const response = await fetch(
      `https://receitaws.com.br/v1/cnpj/${cnpjLimpo}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'RadarCRM/contact@radarcrm.com.br'
        }
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        console.log('Rate limit atingido, aguardando...');
        await sleep(60000); // Aguarda 1 minuto
        return buscarCNPJ(cnpj); // Retry
      }
      console.log(`ReceitaWS: Response ${response.status} para CNPJ ${cnpj}`);
      return null;
    }

    const data: DadosReceitaWS & { status?: string } = await response.json();

    // API retorna status: 'OK' ou 'ERROR'
    if (data.status !== 'OK') {
      console.log(`ReceitaWS: CNPJ ${cnpj} não encontrado`);
      return null;
    }

    return data;
  } catch (error) {
    console.error(`ReceitaWS: Erro ao buscar CNPJ ${cnpj}:`, error);
    return null;
  }
}

/**
 * Mapeia CNAE para segmentos de construção
 */
function mapearSegmentos(cnaeFiscal: number | undefined): string[] {
  if (!cnaeFiscal) return [];

  const cnaeStr = cnaeFiscal.toString();
  const segmentos: string[] = [];

  // Busca por prefixo do CNAE
  for (const [prefixo, segs] of Object.entries(CNAE_SEGMENTOS)) {
    if (cnaeStr.startsWith(prefixo.substring(0, 4))) {
      segmentos.push(...segs);
    }
  }

  // Se não encontrou, tenta categorizar por descrição genérica
  if (segmentos.length === 0) {
    if (cnaeStr.startsWith('41') || cnaeStr.startsWith('42')) {
      segmentos.push('construcao');
    }
  }

  return [...new Set(segmentos)]; // Remove duplicatas
}

/**
 * Determina o porte baseado no capital social
 */
function determinarPorte(capitalSocial: string | undefined): string {
  if (!capitalSocial) return 'nao_informado';

  const valor = parseFloat(capitalSocial.replace(/[R$\s.,]/g, '').replace(',', '.'));

  if (valor <= 360000) return 'micro';
  if (valor <= 4800000) return 'pequeno';
  if (valor <= 30000000) return 'medio';
  return 'grande';
}

/**
 * Salva dados enriquecidos no Supabase
 */
async function salvarEnriquecimento(
  cnpj: string,
  dados: DadosReceitaWS
): Promise<void> {
  const enriquecimento: EmpresaEnriquecida = {
    cnpj,
    razao_social: dados.nome || '',
    nome_fantasia: dados.fantasia || dados.nome || '',
    situacao: dados.situacao || '',
    data_inicio: dados.data_inicio_atividade || '',
    natureza_juridica: dados.natureza_juridica || '',
    porte: determinarPorte(dados.capital_social),
    municipio: dados.municipio || '',
    uf: dados.uf || '',
    cep: dados.cep,
    logradouro: `${dados.logradouro || ''}, ${dados.numero || ''} ${dados.complemento || ''}`.trim(),
    atividade_principal: dados.cnae_fiscal_descricao || dados.atividade_principal?.[0]?.text || '',
    segmento: mapearSegmentos(dados.cnae_fiscal),
    capital_social: dados.capital_social
      ? parseFloat(dados.capital_social.replace(/[R$\s.,]/g, '').replace(',', '.'))
      : undefined,
    socios: dados.qsa?.length || 0,
    telefone: dados.telefone,
    email: dados.email,
    fonte: 'receita_federal',
    updated_at: new Date().toISOString()
  };

  // Atualiza empresa no CRM
  const { error } = await supabase
    .from('leads')
    .update({
      empresa: enriquecimento.razao_social,
      telefone: dados.telefone || undefined,
      dados_adicionais: {
        ...enriquecimento,
        enriquecido_em: new Date().toISOString()
      }
    })
    .eq('email', `%.${cnpj}%`);

  if (error) {
    // Tentaupsert na tabela de empresas se existir
    console.log('ReceitaWS: Salvando na tabela empresas...');
    await supabase.from('empresas').upsert({
      cnpj,
      ...enriquecimento
    }, {
      onConflict: 'cnpj'
    });
  }
}

/**
 * Valida CNPJ com dígito verificador
 */
function validarCNPJ(cnpj: string): boolean {
  const cnpjLimpo = cnpj.replace(/\D/g, '');

  if (cnpjLimpo.length !== 14) return false;

  // Validação de dígitos
  const calc = (nums: number[]): number => {
    const peso1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const peso2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let sum = 0;
    nums.slice(0, 12).forEach((n, i) => sum += n * peso1[i]);
    let remainder = sum % 11;
    let digit1 = remainder < 2 ? 0 : 11 - remainder;

    sum = 0;
    nums.slice(0, 13).forEach((n, i) => sum += n * peso2[i]);
    remainder = sum % 11;
    let digit2 = remainder < 2 ? 0 : 11 - remainder;

    return digit1 * 10 + digit2;
  };

  const nums = cnpjLimpo.split('').map(Number);
  const expected = calc(nums);
  const received = parseInt(cnpjLimpo.slice(-2));

  return received === expected;
}

// =============================================================================
// EXECUÇÃO
// =============================================================================

export async function runETL(limit: number = 50): Promise<{
  success: boolean;
  processed: number;
  errors: number;
}> {
  console.log('=== ETL Receita Federal - Início ===');

  const startTime = Date.now();
  let processed = 0;
  let errors = 0;

  try {
    // Busca leads que precisam de enriquecimento
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, empresa, email, telefone, dados_adicionais')
      .or(`empresa.neq.''`)
      .limit(limit);

    if (error) {
      console.error('ReceitaWS: Erro ao buscar leads:', error);
      return { success: false, processed: 0, errors: 1 };
    }

    if (!leads || leads.length === 0) {
      console.log('ReceitaWS: Nenhum lead para processar');
      return { success: true, processed: 0, errors: 0 };
    }

    console.log(`ReceitaWS: Processando ${leads.length} leads...`);

    for (const lead of leads) {
      try {
        // Extrai CNPJ do email ou usa identificador
        const cnpj = extrairCNPJ(lead);

        if (!cnpj || !validarCNPJ(cnpj)) {
          processed++;
          continue;
        }

        // Rate limiting: 3 req/min = 1 req a cada 20s
        await sleep(21000);

        // Busca dados
        const dados = await buscarCNPJ(cnpj);

        if (dados) {
          await salvarEnriquecimento(cnpj, dados);
        }

        processed++;

        if (processed % 5 === 0) {
          console.log(`ReceitaWS: Processados ${processed}/${leads.length}`);
        }
      } catch (err) {
        console.error(`ReceitaWS: Erro ao processar lead ${lead.id}:`, err);
        errors++;
      }
    }

    // Log do job
    await supabase.from('etl_jobs_last_run').upsert({
      fonte: 'receita_federal',
      last_run: new Date().toISOString(),
      registros_processados: processed,
      status: errors === 0 ? 'success' : 'partial',
      duracao_ms: Date.now() - startTime
    });

    console.log(`=== ETL Receita Federal - Fim: ${processed} processados, ${errors} erros ===`);

    return {
      success: errors === 0,
      processed,
      errors
    };
  } catch (error) {
    console.error('ReceitaWS: Erro fatal:', error);
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
