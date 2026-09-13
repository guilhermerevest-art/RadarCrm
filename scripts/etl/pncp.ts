/**
 * ============================================================
 * RADAR CRM - PIPELINE ETL PNCP (Contratações Públicas)
 * ============================================================
 *
 * Fonte: Portal Nacional de Contratações Públicas
 * API: https://api.pncp.gov.br/
 * Filtros: Município (340880 = Uberlândia), valor mínimo, segmento
 * Campos: número do processo, objeto, órgão, valor, data publicação
 *
 * Cron: Diário às 6h (configurado em 011_cron_jobs_etl.sql)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// =============================================================================
// TIPOS
// =============================================================================

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

export interface PNCPContratacao {
  id: string;
  numeroContratacao: string;
  descricaoObjeto: string;
  nomeUnidade: string;
  municipioSiafi?: string;
  uf: string;
  valorContratado?: number;
  dataPublicacao?: string;
  nomeOrgão: string;
  cnpjOrgão: string;
  tipoEndObjeto?: string;
  localExecucao?: string;
  cpfCnpjContratado?: string;
  nomeContratado?: string;
}

interface ETLResult {
  success: boolean;
  fonte: string;
  registros_lidos: number;
  registros_inseridos: number;
  registros_duplicados: number;
  registros_erro: number;
  errors: string[];
  duracao_ms: number;
}

// =============================================================================
// CONFIG
// =============================================================================

const PNCP_BASE_URL = 'https://api.pncp.gov.br/api/1/pub';
const ITENS_POR_PAGINA = 100;
const MAX_PAGINAS = 50;

// Códigos SIAFI dos municípios do Triângulo Mineiro
const MUNICIPIOS_SIAFI: Record<string, { nome: string; codigo: string }> = {
  '540': { nome: 'Uberlândia', codigo: '540' },
  '5401': { nome: 'Uberaba', codigo: '5401' },
  '0345': { nome: 'Araguari', codigo: '0345' },
  '0518': { nome: 'Ituiutaba', codigo: '0518' },
  '0669': { nome: 'Patos de Minas', codigo: '0669' },
  '0697': { nome: 'Patrocínio', codigo: '0697' },
  '0468': { nome: 'Frutal', codigo: '0468' },
};

// =============================================================================
// UTILIDADES
// =============================================================================

/**
 * Normaliza string para uppercase sem acentos
 */
function normalizarTexto(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Gera hash de deduplicação
 */
function gerarHash(...parts: (string | number | null | undefined)[]): string {
  const normalized = parts
    .map(p => normalizarTexto(String(p ?? '')))
    .join('|');
  // Simple hash using SubtleCrypto if available, else fallback
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = crypto.subtle.digestSync('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: simple string hash
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Estima porte pela valor contratado
 */
function estimarPorte(valor: number | null | undefined): string {
  if (!valor) return 'medio';
  if (valor < 150000) return 'pequeno';
  if (valor < 1500000) return 'medio';
  return 'grande';
}

/**
 * Detecta segmentos-alvo baseados no objeto da contratação
 */
function detectarSegmentos(objeto: string): string[] {
  const segmentos: string[] = [];
  const objLower = (objeto || '').toLowerCase();

  if (objLower.includes('concreto') || objLower.includes('cimento') || objLower.includes('argamassa')) {
    segmentos.push('concreto');
  }
  if (objLower.includes('locação') || objLower.includes('aluguel') || objLower.includes('máquina') || objLower.includes('equipamento')) {
    segmentos.push('locacao');
  }
  if (objLower.includes('material') || objLower.includes('construção') || objLower.includes('obra')) {
    segmentos.push('material');
  }
  if (objLower.includes('elétrica') || objLower.includes('elétrico') || objLower.includes('fiação')) {
    segmentos.push('eletrica');
  }
  if (objLower.includes('hidráulica') || objLower.includes('encanamento') || objLower.includes('tubulação')) {
    segmentos.push('hidraulica');
  }
  if (objLower.includes('pintura') || objLower.includes('revestimento')) {
    segmentos.push('acabamento');
  }

  // Default para construção civil
  if (segmentos.length === 0) {
    segmentos.push('material');
  }

  return segmentos;
}

// =============================================================================
// COLLECT - Busca dados brutos da API PNCP
// =============================================================================

async function collect(url: string): Promise<PNCPContratacao[]> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'RadarCRM/1.0 (contato@radarcrm.com.br)',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`PNCP API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : (data.data || data.items || []);
}

// =============================================================================
// NORMALIZE - Converte dados brutos para ETLObra
// =============================================================================

function normalize(raw: PNCPContratacao): ETLObra {
  const fonte_id = raw.id || raw.numeroContratacao || '';

  // Extrair endereço do local de execução
  const logradouro = raw.localExecucao || raw.nomeUnidade || 'S/N';
  const uf = raw.uf || 'MG';
  const cidade = raw.municipioSiafi
    ? Object.values(MUNICIPIOS_SIAFI).find(m => m.codigo === raw.municipioSiafi)?.nome || raw.municipioSiafi
    : 'UBERLANDIA';

  // Hash único para deduplicação
  const hash = gerarHash(fonte_id, 'pncp', cidade, uf);

  return {
    fonte: 'pncp',
    fonte_id,
    tipo: 'pncp',
    endereco_logradouro: normalizarTexto(logradouro),
    endereco_bairro: '',
    endereco_cidade: normalizarTexto(cidade),
    endereco_uf: uf.substring(0, 2).toUpperCase(),
    lat: null,
    lng: null,
    data_inicio: raw.dataPublicacao || null,
    valor_estimado: raw.valorContratado || null,
    fase_atual: 'alvara', // Contratações públicas iniciam com fase de projeto
    porte: estimarPorte(raw.valorContratado),
    segmento_alvo: detectarSegmentos(raw.descricaoObjeto || ''),
    hash_deduplicacao: hash,
    raw_payload: {
      numero_contratacao: raw.numeroContratacao,
      objeto: raw.descricaoObjeto,
      orgao: raw.nomeOrgão,
      cnpj_orgao: raw.cnpjOrgão,
      nome_unidade: raw.nomeUnidade,
      municipio_siafi: raw.municipioSiafi,
      valor_contratado: raw.valorContratado,
      data_publicacao: raw.dataPublicacao,
      tipo_end_objeto: raw.tipoEndObjeto,
      local_execucao: raw.localExecucao,
      cpf_cnpj_contratado: raw.cpfCnpjContratado,
      nome_contratado: raw.nomeContratado,
      plataforma: 'pncp',
      url_original: `https://pncp.gov.br/edital/${fonte_id}`,
    },
  };
}

// =============================================================================
// DEDUPLICATE - Remove duplicados por hash
// =============================================================================

function deduplicate(obras: ETLObra[]): ETLObra[] {
  const seen = new Set<string>();
  return obras.filter(obra => {
    if (seen.has(obra.hash_deduplicacao)) {
      return false;
    }
    seen.add(obra.hash_deduplicacao);
    return true;
  });
}

// =============================================================================
// UPSERT - Insere/atualiza no banco
// =============================================================================

async function upsert(
  supabase: SupabaseClient,
  obras: ETLObra[],
  tenantId: string,
  jobId: string
): Promise<{ inserted: number; updated: number; errors: number }> {
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const obra of obras) {
    try {
      // Primeiro, inserir/atualizar na tabela global
      const { data: globalData, error: globalError } = await supabase
        .from('radar_obras_globais')
        .upsert({
          hash_deduplicacao: obra.hash_deduplicacao,
          endereco_logradouro: obra.endereco_logradouro,
          endereco_cidade: obra.endereco_cidade,
          endereco_uf: obra.endereco_uf,
          lat: obra.lat,
          lng: obra.lng,
          fase_macro_consolidada: obra.fase_atual,
        }, {
          onConflict: 'hash_deduplicacao',
        })
        .select('id')
        .single();

      if (globalError) {
        console.error(`Erro ao inserir global: ${globalError.message}`);
        errors++;
        continue;
      }

      // Depois, inserir/atualizar na tabela do tenant
      const { data: tenantData, error: tenantError } = await supabase
        .from('radar_obras')
        .upsert({
          tenant_id: tenantId,
          obra_global_id: globalData!.id,
          fonte: obra.fonte,
          fonte_id: obra.fonte_id,
          tipo: obra.tipo,
          endereco_logradouro: obra.endereco_logradouro,
          endereco_bairro: obra.endereco_bairro,
          endereco_cidade: obra.endereco_cidade,
          endereco_uf: obra.endereco_uf,
          lat: obra.lat,
          lng: obra.lng,
          data_inicio: obra.data_inicio,
          valor_estimado: obra.valor_estimado,
          fase_atual: obra.fase_atual,
          porte: obra.porte,
          segmento_alvo: obra.segmento_alvo,
          status: 'ativa',
          hash_deduplicacao: obra.hash_deduplicacao,
          raw_payload: obra.raw_payload,
        }, {
          onConflict: 'tenant_id,hash_deduplicacao',
        })
        .select('id')
        .single();

      if (tenantError) {
        console.error(`Erro ao inserir tenant: ${tenantError.message}`);
        errors++;
        continue;
      }

      // Verificar se foi insert ou update
      if (tenantData) {
        // Verificar se a obra já existia
        const { data: existing } = await supabase
          .from('radar_obras')
          .select('id, created_at')
          .eq('id', tenantData.id)
          .single();

        if (existing) {
          // Se created_at é recente (< 1 min), foi insert
          const createdAt = new Date(existing.created_at);
          const now = new Date();
          const diffMs = now.getTime() - createdAt.getTime();
          if (diffMs < 60000) {
            inserted++;
          } else {
            updated++;
          }
        }
      }
    } catch (err) {
      console.error(`Erro ao processar obra ${obra.fonte_id}: ${err}`);
      errors++;
    }
  }

  return { inserted, updated, errors };
}

// =============================================================================
// ATUALIZAR LOG DE EXECUÇÃO
// =============================================================================

async function updateJobLog(
  supabase: SupabaseClient,
  jobId: string,
  result: ETLResult
): Promise<void> {
  await supabase
    .from('radar_ingestao_jobs')
    .update({
      status: result.success ? 'sucesso' : 'erro',
      registros_lidos: result.registros_lidos,
      registros_inseridos: result.registros_inseridos,
      registros_duplicados: result.registros_duplicados,
      registros_erro: result.registros_erro,
      erro_detalhe: result.errors.length > 0 ? result.errors.slice(0, 5).join('; ') : null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  // Atualizar configuração da fonte
  await supabase
    .from('radar_fontes_config')
    .update({
      ultima_execucao: new Date().toISOString(),
      total_registros_importados: result.registros_inseridos,
      ultima_execucao_erro: result.errors.length > 0 ? result.errors[0] : null,
    })
    .eq('fonte', 'pncp');
}

// =============================================================================
// MAIN - Orquestra o pipeline completo
// =============================================================================

export async function runETL(
  supabaseUrl: string,
  supabaseKey: string,
  tenantId?: string
): Promise<ETLResult> {
  const startTime = Date.now();
  const supabase = createClient(supabaseUrl, supabaseKey);

  const result: ETLResult = {
    success: false,
    fonte: 'pncp',
    registros_lidos: 0,
    registros_inseridos: 0,
    registros_duplicados: 0,
    registros_erro: 0,
    errors: [],
    duracao_ms: 0,
  };

  let jobId: string | null = null;

  try {
    // 1. Criar job de rastreamento
    const { data: job } = await supabase
      .from('radar_ingestao_jobs')
      .insert({ fonte: 'pncp', status: 'rodando' })
      .select('id')
      .single();

    jobId = job?.id || null;

    // 2. Collect - Buscar dados de contratações públicas de MG
    console.log('[PNCP ETL] Buscando contratações públicas...');

    const todasContratacoes: PNCPContratacao[] = [];

    // Busca por UF (MG) - pode filtrar por municipio via parâmetro
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      try {
        const url = `${PNCP_BASE_URL}/contratacoes?uf=MG&itensPorPagina=${ITENS_POR_PAGINA}&pagina=${pagina}`;
        const contratacoes = await collect(url);

        if (contratacoes.length === 0) break;

        // Filtrar apenas obras de construção civil
        const obrasConstrucao = contratacoes.filter(c =>
          c.tipoEndObjeto === 'Obras' ||
          c.descricaoObjeto?.toLowerCase().includes('construção') ||
          c.descricaoObjeto?.toLowerCase().includes('edificação') ||
          c.descricaoObjeto?.toLowerCase().includes('reforma')
        );

        todasContratacoes.push(...obrasConstrucao);
        console.log(`[PNCP ETL] Página ${pagina}: ${contratacoes.length} contratações, ${obrasConstrucao.length} obras`);

        if (contratacoes.length < ITENS_POR_PAGINA) break;
      } catch (err) {
        console.error(`[PNCP ETL] Erro na página ${pagina}: ${err}`);
        result.errors.push(`Erro página ${pagina}: ${err}`);
        break;
      }
    }

    result.registros_lidos = todasContratacoes.length;
    console.log(`[PNCP ETL] Total de contratações encontradas: ${result.registros_lidos}`);

    if (result.registros_lidos === 0) {
      result.success = true;
      result.errors.push('Nenhuma contratação pública encontrada');
      return result;
    }

    // 3. Normalize - Converter para formato ETLObra
    const obras = todasContratacoes.map(normalize);

    // 4. Deduplicate - Remover duplicados
    const obrasUnicas = deduplicate(obras);
    result.registros_duplicados = obras.length - obrasUnicas.length;

    // 5. Upsert - Inserir no banco
    if (obrasUnicas.length > 0 && tenantId) {
      const upsertResult = await upsert(supabase, obrasUnicas, tenantId, jobId || '');
      result.registros_inseridos = upsertResult.inserted;
      result.registros_erro = upsertResult.errors;
    }

    result.success = true;
  } catch (err) {
    console.error('[PNCP ETL] Erro no pipeline:', err);
    result.errors.push(String(err));
    result.success = false;
  } finally {
    result.duracao_ms = Date.now() - startTime;

    // Atualizar job log
    if (jobId && supabase) {
      await updateJobLog(supabase, jobId, result);
    }
  }

  return result;
}

// =============================================================================
// CLI
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const tenantId = process.env.DEFAULT_TENANT_ID || process.argv[2];

  if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('PNCP - Contratações Públicas ETL');
  console.log('='.repeat(60));

  runETL(supabaseUrl, supabaseKey, tenantId)
    .then(result => {
      console.log('\n' + '='.repeat(60));
      console.log('RESULTADO');
      console.log('='.repeat(60));
      console.log(`Sucesso: ${result.success}`);
      console.log(`Registros lidos: ${result.registros_lidos}`);
      console.log(`Registros inseridos: ${result.registros_inseridos}`);
      console.log(`Duplicados ignorados: ${result.registros_duplicados}`);
      console.log(`Erros: ${result.registros_erro}`);
      console.log(`Duração: ${result.duracao_ms}ms`);
      if (result.errors.length > 0) {
        console.log('Erros:', result.errors);
      }
      console.log('='.repeat(60));
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Erro fatal:', err);
      process.exit(1);
    });
}
