// =============================================================================
// Helpers do Sistema de Marcações (Waze-style)
// =============================================================================

import { createClient } from '@/lib/supabase/client'
import type {
  ObraGlobal,
  ObraMarcacao,
  UserPontuacao,
  BadgeInfo,
  FaseMacro,
} from '@/lib/supabase/types'

/**
 * Busca a obra global correspondente a uma obra do tenant.
 * Se não existir ainda, cria uma nova (1 vez só).
 */
export async function getOrCreateObraGlobal(params: {
  hash_deduplicacao?: string
  endereco_logradouro: string
  endereco_numero?: string
  endereco_bairro?: string
  endereco_cidade: string
  endereco_uf: string
  endereco_cep?: string
  lat?: number
  lng?: number
}): Promise<ObraGlobal | null> {
  const supabase = createClient()

  if (params.hash_deduplicacao) {
    const { data: existente } = await supabase
      .from('radar_obras_globais')
      .select('*')
      .eq('hash_deduplicacao', params.hash_deduplicacao)
      .maybeSingle()

    if (existente) return existente as ObraGlobal
  }

  // Criar nova obra global
  const { data, error } = await supabase
    .from('radar_obras_globais')
    .insert({
      hash_deduplicacao: params.hash_deduplicacao || `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      endereco_logradouro: params.endereco_logradouro,
      endereco_numero: params.endereco_numero,
      endereco_bairro: params.endereco_bairro,
      endereco_cidade: params.endereco_cidade,
      endereco_uf: params.endereco_uf,
      endereco_cep: params.endereco_cep,
      lat: params.lat,
      lng: params.lng,
    })
    .select()
    .single()

  if (error) {
    console.error('Erro ao criar obra global:', error)
    return null
  }

  return data as ObraGlobal
}

/**
 * Busca obra global pelo ID.
 */
export async function getObraGlobal(id: string): Promise<ObraGlobal | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('radar_obras_globais')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('Erro ao buscar obra global:', error)
    return null
  }

  return data as ObraGlobal | null
}

/**
 * Lista todas as marcações de uma obra global, com contagem de confirmações
 * e flag "eu já confirmei".
 */
export async function getMarcacoes(obraGlobalId: string, userId?: string): Promise<ObraMarcacao[]> {
  const supabase = createClient()

  // 1. Buscar marcações
  const { data: marcacoes, error } = await supabase
    .from('radar_obra_marcacoes')
    .select('*')
    .eq('obra_global_id', obraGlobalId)
    .order('created_at', { ascending: false })

  if (error || !marcacoes) {
    console.error('Erro ao buscar marcações:', error)
    return []
  }

  // 2. Buscar confirmações (separado, para contagem + flag "já confirmei")
  const marcacaoIds = (marcacoes as any[]).map((m) => m.id)
  let confirmacoesMap: Record<string, { count: number; euConfirmei: boolean }> = {}

  if (marcacaoIds.length > 0) {
    const { data: confirmacoes } = await supabase
      .from('radar_obra_confirmacoes')
      .select('marcacao_id, user_id')
      .in('marcacao_id', marcacaoIds)

    if (confirmacoes) {
      for (const c of confirmacoes as any[]) {
        if (!confirmacoesMap[c.marcacao_id]) {
          confirmacoesMap[c.marcacao_id] = { count: 0, euConfirmei: false }
        }
        confirmacoesMap[c.marcacao_id].count++
        if (userId && c.user_id === userId) {
          confirmacoesMap[c.marcacao_id].euConfirmei = true
        }
      }
    }
  }

  // 3. Buscar nomes dos autores (1 query separada)
  const userIds = Array.from(new Set((marcacoes as any[]).map((m) => m.user_id)))
  let usersMap: Record<string, { nome: string; avatar_url?: string }> = {}
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('tenant_users')
      .select('user_id, nome, avatar_url')
      .in('user_id', userIds)
    if (users) {
      for (const u of users as any[]) {
        usersMap[u.user_id] = { nome: u.nome || 'Usuário', avatar_url: u.avatar_url }
      }
    }
  }

  return (marcacoes as any[]).map((m) => ({
    ...m,
    autor_nome: usersMap[m.user_id]?.nome || 'Usuário',
    autor_avatar: usersMap[m.user_id]?.avatar_url,
    total_confirmacoes: confirmacoesMap[m.id]?.count || 0,
    ja_confirmei: confirmacoesMap[m.id]?.euConfirmei || false,
  })) as ObraMarcacao[]
}

/**
 * Cria uma nova marcação de fase para a obra.
 */
export async function criarMarcacao(params: {
  obraGlobalId: string
  tenantId: string
  userId: string
  fase: string
  faseMacro: FaseMacro
  nota?: string
}): Promise<ObraMarcacao | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('radar_obra_marcacoes')
    .insert({
      obra_global_id: params.obraGlobalId,
      tenant_id: params.tenantId,
      user_id: params.userId,
      fase: params.fase,
      fase_macro: params.faseMacro,
      nota: params.nota,
    })
    .select()
    .single()

  if (error) {
    console.error('Erro ao criar marcação:', error)
    return null
  }

  return data as ObraMarcacao
}

/**
 * Confirma uma marcação (estilo Waze: 1x por usuário).
 * Retorna false se já havia confirmado (UNIQUE constraint).
 */
export async function confirmarMarcacao(marcacaoId: string, userId: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('radar_obra_confirmacoes')
    .insert({
      marcacao_id: marcacaoId,
      user_id: userId,
    })

  if (error) {
    if (error.code === '23505') {
      // unique violation - já confirmou antes
      return false
    }
    console.error('Erro ao confirmar marcação:', error)
    return false
  }

  return true
}

/**
 * Desfaz uma confirmação.
 */
export async function desconfirmarMarcacao(marcacaoId: string, userId: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('radar_obra_confirmacoes')
    .delete()
    .eq('marcacao_id', marcacaoId)
    .eq('user_id', userId)

  if (error) {
    console.error('Erro ao desconfirmar:', error)
    return false
  }

  return true
}

/**
 * Busca pontuação do usuário (gamificação).
 */
export async function getMinhaPontuacao(userId: string): Promise<UserPontuacao | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('radar_user_pontuacao')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('Erro ao buscar pontuação:', error)
    return null
  }

  return data as UserPontuacao | null
}

/**
 * Busca catálogo de badges.
 */
export async function getBadges(): Promise<BadgeInfo[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('radar_badges')
    .select('*')
    .order('criterio_pontos', { ascending: true })

  if (error) {
    console.error('Erro ao buscar badges:', error)
    return []
  }

  return (data || []) as BadgeInfo[]
}

/**
 * Próximo nível e quantos pontos faltam.
 */
export function calcularProximoNivel(pontos: number): {
  nivelAtual: string
  proximoNivel: string | null
  pontosParaProximo: number | null
} {
  const niveis = [
    { nome: 'observador', min: 0 },
    { nome: 'colaborador', min: 10 },
    { nome: 'especialista', min: 50 },
    { nome: 'validador', min: 100 },
    { nome: 'lenda', min: 200 },
  ]

  let nivelAtual = niveis[0].nome
  let proximoNivel: string | null = null
  let pontosParaProximo: number | null = null

  for (let i = 0; i < niveis.length; i++) {
    if (pontos >= niveis[i].min) {
      nivelAtual = niveis[i].nome
      if (i + 1 < niveis.length) {
        proximoNivel = niveis[i + 1].nome
        pontosParaProximo = niveis[i + 1].min - pontos
      }
    }
  }

  return { nivelAtual, proximoNivel, pontosParaProximo }
}

/**
 * Labels legíveis para fases macro.
 */
export const FASE_MACRO_LABELS: Record<FaseMacro, string> = {
  alvara: 'Alvará',
  fundacao: 'Fundação',
  estrutura: 'Estrutura',
  acabamento: 'Acabamento',
  concluida: 'Concluída',
  paralisada: 'Paralisada',
  nao_iniciou: 'Não iniciou',
}

export const FASE_MACRO_COLORS: Record<FaseMacro, string> = {
  alvara: 'bg-red-100 text-red-700',
  fundacao: 'bg-amber-100 text-amber-700',
  estrutura: 'bg-yellow-100 text-yellow-700',
  acabamento: 'bg-green-100 text-green-700',
  concluida: 'bg-gray-100 text-gray-500',
  paralisada: 'bg-orange-100 text-orange-700',
  nao_iniciou: 'bg-slate-100 text-slate-600',
}

export const NIVEL_LABELS: Record<string, string> = {
  observador: 'Observador',
  colaborador: 'Colaborador',
  especialista: 'Especialista',
  validador: 'Validador',
  lenda: 'Lenda do Radar',
}

export const NIVEL_COLORS: Record<string, string> = {
  observador: 'bg-slate-100 text-slate-700',
  colaborador: 'bg-green-100 text-green-700',
  especialista: 'bg-blue-100 text-blue-700',
  validador: 'bg-purple-100 text-purple-700',
  lenda: 'bg-amber-100 text-amber-700',
}
