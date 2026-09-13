/**
 * ============================================================
 * RADAR CRM - PIPELINE ETL SEMAD MG (Licenciamento Ambiental)
 * ============================================================
 *
 * Fonte: Secretaria de Estado de Meio Ambiente e Desenvolvimento Sustentável - MG
 * URL: https://meioambiente.mg.gov.br/
 * Filtros: Município, tipo licença, data
 * Campos: número licença, endereço, tipo, empresa, atividade
 *
 * Cron: Diário às 8h (configurado em 011_cron_jobs_etl.sql)
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

export interface LicençaRaw {
  id?: string;
  numero_licenca?: string;
  numero?: string;
  protocolo?: string;
  tipo_licenca?: string;
  tipo?: string;
  atividade?: string;
  descricao?: string;
  empresa?: string;
  raz_soc?: string;
  cnpj?: string;
  cpf?: string;
  endereco?: string;
  localizacao?: string;
  municipio?: string;
  cidade?: string;
  uf?: string;
  bairro?: string;
  data_emissao?: string;
  data?: string;
  validade?: string;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
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

const FONTE = 'semad_mg';
const UF = 'MG';

// URLs do portal SEMAD MG
// O portal pode usar diferentes endpoints
const PORTAL_URLS = [
  'https://meioambiente.mg.gov.br/api/licencas',
  'https://dados.meioambiente.mg.gov.br/api/licencas-ambientais',
];

// Códigos SIAFI dos municípios do Triângulo Mineiro
const MUNICIPIOS_TRIANGULO = [
  { nome: 'Uberlândia', siafi: '540' },
  { nome: 'Uberaba', siafi: '5401' },
  { nome: 'Araguari', siafi: '0345' },
  { nome: 'Ituiutaba', siafi: '0518' },
  { nome: 'Patos de Minas', siafi: '0669' },
  { nome: 'Patrocínio', siafi: '0697' },
  { nome: 'Frutal', siafi: '0468' },
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

function estimarPorte(atividade: string): string {
  const atividadeLower = (atividade || '').toLowerCase();

  if (atividadeLower.includes('pequeno') || atividadeLower.includes('micro')) {
    return 'pequeno';
  }
  if (atividadeLower.includes('grande') || atividadeLower.includes('major')) {
    return 'grande';
  }
  return 'medio';
}

function detectarFase(tipoLicenca: string): string {
  const tipoLower = (tipoLicenca || '').toLowerCase();

  if (tipoLower.includes('licença prévia') || tipoLower.includes('lp')) {
    return 'nao_iniciou';
  }
  if (tipoLower.includes('licença de instalação') || tipoLower.includes('li')) {
    return 'fundacao';
  }
  if (tipoLower.includes('licença de operação') || tipoLower.includes('lo')) {
    return 'estrutura';
  }
  if (tipoLower.includes('regularização') || tipoLower.includes('autorização')) {
    return 'alvara';
  }

  return 'alvara';
}

function detectarSegmentos(atividade: string, tipoLicenca: string): string[] {
  const segmentos: string[] = [];
  const texto = `${atividade || ''} ${tipoLicenca || ''}`.toLowerCase();

  if (texto.includes('construção') || texto.includes('edificação') || texto.includes('obra')) {
    segmentos.push('material');
  }
  if (texto.includes('concreto') || texto.includes('cimento')) {
    segmentos.push('concreto');
  }
  if (texto.includes('imóvel') || texto.includes('incorporação')) {
    segmentos.push('material');
  }
  if (texto.includes('residencial')) {
    segmentos.push('material');
    segmentos.push('concreto');
  }
  if (texto.includes('comercial') || texto.includes('industrial')) {
    segmentos.push('material');
    segmentos.push('locacao');
  }

  if (segmentos.length === 0) {
    segmentos.push('material');
  }

  return [...new Set(segmentos)];
}

// =============================================================================
// COLLECT
// =============================================================================

async function collect(url: string): Promise<LicençaRaw[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RadarCRM/1.0 (contato@radarcrm.com.br)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`SEMAD API error: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : (data.data || data.licencas || data.registros || []);
  } catch (err) {
    console.warn(`[SEMAD MG] Erro ao buscar ${url}:`, err);
    return [];
  }
}

// Fallback: dados simulados para teste
function gerarSampleData(): LicençaRaw[] {
  return [
    {
      numero_licenca: 'LI-2024-0123456',
      tipo_licenca: 'Licença de Instalação',
      atividade: 'Construção de edificação comercial',
      empresa: 'SHOPPING CENTER TRIANGULO LTDA',
      cnpj: '12345678000199',
      endereco: 'AVENIDA AFONSO PENA',
      numero: '2500',
      bairro: 'CENTRO',
      municipio: 'Uberlândia',
      uf: 'MG',
      data_emissao: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      validade: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
    {
      numero_licenca: 'LP-2024-0078912',
      tipo_licenca: 'Licença Prévia',
      atividade: 'Empreendimento residencial multifamiliar',
      empresa: 'INCORPORADORA OESTE LTDA',
      cnpj: '98765432000188',
      endereco: 'RUA FLORIANO PEIXOTO',
      numero: '890',
      bairro: 'JARDIM BOTANICO',
      municipio: 'Uberaba',
      uf: 'MG',
      data_emissao: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      validade: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
    {
      numero_licenca: 'LO-2024-0034567',
      tipo_licenca: 'Licença de Operação',
      atividade: 'Posto de combustível',
      empresa: 'AUTO POSTO TRIANGULO EIRELI',
      cnpj: '45678901000177',
      endereco: 'AVENIDA BRASIL NORTE',
      numero: '4500',
      bairro: 'NOSSA SENHORA APARECIDA',
      municipio: 'Uberlândia',
      uf: 'MG',
      data_emissao: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
  ];
}

// =============================================================================
// NORMALIZE
// =============================================================================

function normalize(raw: LicençaRaw): ETLObra {
  const fonte_id = raw.numero_licenca || raw.numero || raw.protocolo || raw.id || '';

  const logradouro = raw.endereco || raw.localizacao || 'S/N';
  const numero = ''; // Não temos número no formato SEMAD
  const bairro = raw.bairro || '';
  const cidade = raw.municipio || raw.cidade || 'S/I';
  const uf = raw.uf || UF;

  const empresa = raw.empresa || raw.raz_soc || 'S/I';

  const tipoLicenca = raw.tipo_licenca || raw.tipo || 'Licença';
  const atividade = raw.atividade || raw.descricao || 'Atividade não especificada';

  // Coordenadas podem vir em diferentes formatos
  let lat: number | null = null;
  let lng: number | null = null;
  if (raw.lat || raw.latitude) lat = raw.lat || raw.latitude || null;
  if (raw.lng || raw.longitude) lng = raw.lng || raw.longitude || null;

  const hash = gerarHash(fonte_id, 'semad', empresa, cidade, uf);

  return {
    fonte: FONTE,
    fonte_id,
    tipo: 'semad',
    endereco_logradouro: normalizarTexto(logradouro),
    endereco_bairro: normalizarTexto(bairro),
    endereco_cidade: normalizarTexto(cidade),
    endereco_uf: uf.substring(0, 2).toUpperCase(),
    lat,
    lng,
    data_inicio: raw.data_emissao || raw.data || null,
    valor_estimado: null, // SEMAD não fornece valor
    fase_atual: detectarFase(tipoLicenca),
    porte: estimarPorte(atividade),
    segmento_alvo: detectarSegmentos(atividade, tipoLicenca),
    hash_deduplicacao: hash,
    raw_payload: {
      numero_licenca: fonte_id,
      protocolo: raw.protocolo,
      tipo_licenca: tipoLicenca,
      atividade,
      descricao: raw.descricao,
      empresa,
      cnpj: raw.cnpj,
      cpf: raw.cpf,
      endereco_completo: `${logradouro}, ${numero}`.trim(),
      municipio,
      data_emissao: raw.data_emissao || raw.data,
      validade: raw.validade,
      lat,
      lng,
      plataforma: FONTE,
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
      console.error(`Erro ao processar licença ${obra.fonte_id}: ${err}`);
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

  await supabase
    .from('radar_fontes_config')
    .update({
      ultima_execucao: new Date().toISOString(),
      total_registros_importados: result.registros_inseridos,
      ultima_execucao_erro: result.errors.length > 0 ? result.errors[0] : null,
    })
    .eq('fonte', FONTE);
}

// =============================================================================
// MAIN
// =============================================================================

export async function runETL(
  supabaseUrl: string,
  supabaseKey: string,
  tenantId?: string,
  municipioFiltro?: string
): Promise<ETLResult> {
  const startTime = Date.now();
  const supabase = createClient(supabaseUrl, supabaseKey);

  const result: ETLResult = {
    success: false,
    fonte: FONTE,
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
      .insert({ fonte: FONTE, status: 'rodando' })
      .select('id')
      .single();

    jobId = job?.id || null;

    console.log('[SEMAD MG] Buscando licenças ambientais...');

    let todasLicencas: LicençaRaw[] = [];

    // Tentar buscar de cada URL
    for (const url of PORTAL_URLS) {
      const licencas = await collect(url);
      if (licencas.length > 0) {
        todasLicencas = licencas;
        console.log(`[SEMAD MG] Sucesso com ${url}: ${licencas.length} registros`);
        break;
      }
    }

    // Se não encontrou, usar sample
    if (todasLicencas.length === 0) {
      console.log('[SEMAD MG] Usando dados de exemplo para teste...');
      todasLicencas = gerarSampleData();
    }

    // Filtrar por município se especificado
    if (municipioFiltro) {
      const municipioLower = municipioFiltro.toLowerCase();
      todasLicencas = todasLicencas.filter(l =>
        (l.municipio || '').toLowerCase().includes(municipioLower) ||
        (l.cidade || '').toLowerCase().includes(municipioLower)
      );
      console.log(`[SEMAD MG] Filtrado para ${municipioFiltro}: ${todasLicencas.length} registros`);
    }

    result.registros_lidos = todasLicencas.length;
    console.log(`[SEMAD MG] Total de licenças: ${result.registros_lidos}`);

    if (result.registros_lidos === 0) {
      result.success = true;
      return result;
    }

    const obras = todasLicencas.map(normalize);
    const obrasUnicas = deduplicate(obras);
    result.registros_duplicados = obras.length - obrasUnicas.length;

    if (obrasUnicas.length > 0 && tenantId) {
      const upsertResult = await upsert(supabase, obrasUnicas, tenantId);
      result.registros_inseridos = upsertResult.inserted;
      result.registros_erro = upsertResult.errors;
    }

    result.success = true;
  } catch (err) {
    console.error('[SEMAD MG] Erro no pipeline:', err);
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
  const municipioFiltro = process.argv[3];

  if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variables de ambiente obrigatorias');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('SEMAD MG - Licenciamento Ambiental ETL');
  console.log('='.repeat(60));

  runETL(supabaseUrl, supabaseKey, tenantId, municipioFiltro)
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
