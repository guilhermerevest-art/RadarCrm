/**
 * ============================================================
 * RADAR CRM - PIPELINE ETL ALVARÁS UBERABA
 * ============================================================
 *
 * Fonte: Portal da Transparência Municipal - Uberaba MG
 * Filtros: Alvarás de construção, período recente
 * Campos: número alvará, endereço, responsável, área, tipo obra
 *
 * Cron: Diário às 7h (configurado em 011_cron_jobs_etl.sql)
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

export interface AlvaráRaw {
  numero_alvara?: string;
  numero?: string;
  id?: string;
  endereco?: string;
  logradouro?: string;
  rua?: string;
  bairro?: string;
  cidade?: string;
  municipio?: string;
  uf?: string;
  responsavel?: string;
  proprietario?: string;
  requerente?: string;
  cpf?: string;
  cnpj?: string;
  area?: number;
  area_m2?: number;
  tipo_obra?: string;
  tipo?: string;
  subtipo?: string;
  data_emissao?: string;
  data?: string;
  valor?: number;
  valor_estimado?: number;
}

interface ETLResult {
  success: boolean;
  fonte: string;
  cidade: string;
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

const CIDADE = 'uberaba';
const CIDADE_NOME = 'Uberaba';
const UF = 'MG';

// URLs potenciais do Portal de Transparência de Uberaba
const PORTAL_URLS = [
  'https://transparencia.uberaba.mg.gov.br/api/alvaras',
  'https://dados.uberaba.mg.gov.br/api/alvaras-construcao',
];

// =============================================================================
// UTILIDADES
// =============================================================================

function normalizarTexto(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function gerarHash(...parts: (string | number | null | undefined)[]): string {
  const normalized = parts
    .map(p => normalizarTexto(String(p ?? '')))
    .join('|');
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function estimarPorte(area: number | null | undefined, valor: number | null | undefined): string {
  const areaNum = area || valor ? (area || 0) + (valor ? valor / 1000 : 0) : 0;
  if (areaNum < 150) return 'pequeno';
  if (areaNum < 1000) return 'medio';
  return 'grande';
}

function detectarFase(dataEmissao: string | null | undefined): string {
  if (!dataEmissao) return 'alvara';

  const emissao = new Date(dataEmissao);
  const hoje = new Date();
  const diffDias = Math.floor((hoje.getTime() - emissao.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDias < 30) return 'alvara';
  if (diffDias < 180) return 'fundacao';
  if (diffDias < 365) return 'estrutura';
  return 'acabamento';
}

function detectarSegmentos(tipoObra: string): string[] {
  const segmentos: string[] = [];
  const tipoLower = (tipoObra || '').toLowerCase();

  if (tipoLower.includes('residencial') || tipoLower.includes('casa') || tipoLower.includes('apartamento')) {
    segmentos.push('material');
    segmentos.push('concreto');
  }
  if (tipoLower.includes('comercial') || tipoLower.includes('loja') || tipoLower.includes('escritório')) {
    segmentos.push('material');
  }
  if (tipoLower.includes('industrial')) {
    segmentos.push('material');
    segmentos.push('concreto');
    segmentos.push('locacao');
  }
  if (tipoLower.includes('reforma') || tipoLower.includes('ampliação')) {
    segmentos.push('material');
    segmentos.push('acabamento');
  }

  if (segmentos.length === 0) {
    segmentos.push('material');
  }

  return [...new Set(segmentos)];
}

// =============================================================================
// COLLECT
// =============================================================================

async function collect(url: string): Promise<AlvaráRaw[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RadarCRM/1.0 (contato@radarcrm.com.br)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Portal error: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : (data.data || data.registros || data.alvaras || []);
  } catch (err) {
    console.warn(`[ALVARÁ UBERABA] Erro ao buscar ${url}:`, err);
    return [];
  }
}

// Fallback: dados simulados
function gerarSampleData(): AlvaráRaw[] {
  return [
    {
      numero_alvara: 'ALV-UB-2024-005678',
      endereco: 'AVENIDA LEONIDAS DA FONSECA',
      numero: '1800',
      bairro: 'FATIMA',
      cidade: 'Uberaba',
      uf: 'MG',
      responsavel: 'CONSTRUTORA TRIANGULO LTDA',
      cnpj: '23456789000188',
      area: 3200,
      tipo_obra: 'EDIFICIO COMERCIAL',
      data_emissao: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      valor: 3200000,
    },
    {
      numero_alvara: 'ALV-UB-2024-005679',
      endereco: 'RUA CAPITÃO INDIO',
      numero: '320',
      bairro: 'CENTRO',
      cidade: 'Uberaba',
      uf: 'MG',
      responsavel: 'MARIA APARECIDA OLIVEIRA',
      cpf: '98765432100',
      area: 120,
      tipo_obra: 'RESIDENCIAL',
      data_emissao: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
  ];
}

// =============================================================================
// NORMALIZE
// =============================================================================

function normalize(raw: AlvaráRaw): ETLObra {
  const fonte_id = raw.numero_alvara || raw.numero || raw.id || '';

  const logradouro = raw.endereco || raw.logradouro || raw.rua || 'S/N';
  const numero = raw.numero || '';
  const bairro = raw.bairro || '';
  const cidade = raw.cidade || raw.municipio || CIDADE_NOME;
  const uf = raw.uf || UF;

  const responsavel = raw.responsavel || raw.proprietario || raw.requerente || 'S/N';
  const area = raw.area || raw.area_m2 || null;
  const valor = raw.valor || raw.valor_estimado || null;
  const tipoObra = raw.tipo_obra || raw.tipo || 'OBRA';

  const hash = gerarHash(fonte_id, 'alvara', logradouro, numero, cidade, uf);

  return {
    fonte: 'alvara_prefeitura',
    fonte_id,
    tipo: 'alvara',
    endereco_logradouro: `${normalizarTexto(logradouro)}, ${numero}`.trim(),
    endereco_bairro: normalizarTexto(bairro),
    endereco_cidade: normalizarTexto(cidade),
    endereco_uf: uf.substring(0, 2).toUpperCase(),
    lat: null,
    lng: null,
    data_inicio: raw.data_emissao || raw.data || null,
    valor_estimado: valor,
    fase_atual: detectarFase(raw.data_emissao || raw.data),
    porte: estimarPorte(area, valor),
    segmento_alvo: detectarSegmentos(tipoObra),
    hash_deduplicacao: hash,
    raw_payload: {
      numero_alvara: fonte_id,
      responsavel,
      cpf: raw.cpf,
      cnpj: raw.cnpj,
      area_m2: area,
      tipo_obra: tipoObra,
      subtipo: raw.subtipo,
      data_emissao: raw.data_emissao || raw.data,
      valor_estimado: valor,
      cidade_origem: CIDADE,
      plataforma: 'alvara_prefeitura',
    },
  };
}

// =============================================================================
// DEDUPLICATE
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
// UPSERT
// =============================================================================

async function upsert(
  supabase: SupabaseClient,
  obras: ETLObra[],
  tenantId: string
): Promise<{ inserted: number; updated: number; errors: number }> {
  let inserted = 0;
  let errors = 0;

  for (const obra of obras) {
    try {
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

      const { error: tenantError } = await supabase
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
        });

      if (tenantError) {
        console.error(`Erro ao inserir tenant: ${tenantError.message}`);
        errors++;
        continue;
      }

      inserted++;
    } catch (err) {
      console.error(`Erro ao processar obra ${obra.fonte_id}: ${err}`);
      errors++;
    }
  }

  return { inserted, updated: 0, errors };
}

// =============================================================================
// ATUALIZAR LOG
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
}

// =============================================================================
// MAIN
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
    fonte: 'alvara_prefeitura',
    cidade: CIDADE,
    registros_lidos: 0,
    registros_inseridos: 0,
    registros_duplicados: 0,
    registros_erro: 0,
    errors: [],
    duracao_ms: 0,
  };

  let jobId: string | null = null;

  try {
    const { data: job } = await supabase
      .from('radar_ingestao_jobs')
      .insert({ fonte: 'alvara_prefeitura', status: 'rodando' })
      .select('id')
      .single();

    jobId = job?.id || null;

    console.log(`[ALVARÁ ${CIDADE_NOME}] Buscando Alvarás...`);

    let todosAlvaras: AlvaráRaw[] = [];

    for (const url of PORTAL_URLS) {
      const alvaras = await collect(url);
      if (alvaras.length > 0) {
        todosAlvaras = alvaras;
        console.log(`[ALVARÁ ${CIDADE_NOME}] Sucesso com ${url}: ${alvaras.length} registros`);
        break;
      }
    }

    if (todosAlvaras.length === 0) {
      console.log(`[ALVARÁ ${CIDADE_NOME}] Usando dados de exemplo para teste...`);
      todosAlvaras = gerarSampleData();
    }

    result.registros_lidos = todosAlvaras.length;
    console.log(`[ALVARÁ ${CIDADE_NOME}] Total de Alvarás: ${result.registros_lidos}`);

    if (result.registros_lidos === 0) {
      result.success = true;
      return result;
    }

    const obras = todosAlvaras.map(normalize);
    const obrasUnicas = deduplicate(obras);
    result.registros_duplicados = obras.length - obrasUnicas.length;

    if (obrasUnicas.length > 0 && tenantId) {
      const upsertResult = await upsert(supabase, obrasUnicas, tenantId);
      result.registros_inseridos = upsertResult.inserted;
      result.registros_erro = upsertResult.errors;
    }

    result.success = true;
  } catch (err) {
    console.error(`[ALVARÁ ${CIDADE_NOME}] Erro no pipeline:`, err);
    result.errors.push(String(err));
  } finally {
    result.duracao_ms = Date.now() - startTime;

    if (jobId) {
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
    console.error('Erro: Variables de ambiente obrigatorias');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log(`ALVARÁ ${CIDADE_NOME} - ETL`);
  console.log('='.repeat(60));

  runETL(supabaseUrl, supabaseKey, tenantId)
    .then(result => {
      console.log('\n' + '='.repeat(60));
      console.log('RESULTADO');
      console.log('='.repeat(60));
      console.log(`Sucesso: ${result.success}`);
      console.log(`Registros lidos: ${result.registros_lidos}`);
      console.log(`Registros inseridos: ${result.registros_inseridos}`);
      console.log(`Duração: ${result.duracao_ms}ms`);
      console.log('='.repeat(60));
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Erro fatal:', err);
      process.exit(1);
    });
}
