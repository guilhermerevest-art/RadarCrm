// =============================================================================
// Tipos do banco de dados — Radar Canteiro
// Correspondentes ao schema SQL do Supabase
// =============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------
export type Plano = 'individual' | 'equipe' | 'regional' | 'obras'

export interface PlanoInfo {
  id: Plano
  nome: string
  preco: number
  usuarios: number
  limiteObrasMes: number
  limiteLeads: number
  limiteMensagensDia: number
}

// ---------------------------------------------------------------------------
// Tenants (empresas/clientes do SaaS)
// ---------------------------------------------------------------------------
export interface Tenant {
  id: string
  nome: string
  slug: string
  plano: Plano
  cnpj?: string
  status: 'trial' | 'ativo' | 'inadimplente' | 'pausado' | 'cancelado'
  logo_url?: string
  cor_primaria?: string
  trial_expira_em?: string
  created_at: string
  updated_at: string
}

export interface TenantUsers {
  id: string
  tenant_id: string
  user_id: string
  papel: 'admin' | 'gerente' | 'vendedor' | 'leitor'
  nome?: string
  email: string
  avatar_url?: string
  created_at: string
}

export interface TenantConvites {
  id: string
  tenant_id: string
  email: string
  papel: 'admin' | 'gerente' | 'vendedor' | 'leitor'
  token: string
  expira_em: string
  aceito_em?: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Radar de Obras
// ---------------------------------------------------------------------------
export type FonteObra = 'cno' | 'alvara_prefeitura' | 'pncp' | 'semad_mg'
export type FaseObra = 'alvara' | 'fundacao' | 'estrutura' | 'acabamento' | 'concluida'
export type PorteObra = 'pequeno' | 'medio' | 'grande'
export type StatusObra = 'ativa' | 'pausada' | 'concluida' | 'cancelada'

export interface RadarObra {
  id: string
  tenant_id: string
  fonte: FonteObra
  fonte_id?: string
  tipo: FonteObra
  endereco_logradouro: string
  endereco_numero?: string
  endereco_bairro?: string
  endereco_cidade: string
  endereco_uf: string
  endereco_cep?: string
  lat?: number
  lng?: number
  fase_atual: FaseObra
  data_inicio?: string
  data_previsao_termino?: string
  valor_estimado?: number
  porte: PorteObra
  segmento_alvo?: string[]
  descricao?: string
  status: StatusObra
  qualidade_score?: number
  hash_deduplicacao?: string
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// CRM — Leads
// ---------------------------------------------------------------------------
export type OrigemLead = 'whatsapp' | 'formulario_site' | 'indicacao' | 'manual' | 'radar'
export type StatusLead = 'novo' | 'qualificado' | 'descarte' | 'convertido'

export interface CrmLead {
  id: string
  tenant_id: string
  nome: string
  empresa?: string
  empresa_id?: string
  email?: string
  telefone?: string
  origem: OrigemLead
  utm_source?: string
  utm_campaign?: string
  utm_medium?: string
  utm_content?: string
  endereco_cidade?: string
  score_engajamento?: number
  status: StatusLead
  responsavel_id?: string
  observacoes?: string
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// CRM — Deals (oportunidades)
// ---------------------------------------------------------------------------
export type EstagioDeal = 'novo' | 'contato' | 'proposta' | 'negociacao' | 'fechamento' | 'ganho' | 'perdido'

export interface CrmDeal {
  id: string
  tenant_id: string
  lead_id: string
  obra_id?: string
  titulo: string
  estagio: EstagioDeal
  valor_estimado?: number
  valor_final?: number
  probabilidade: number
  data_fechamento_prevista?: string
  data_fechamento_real?: string
  motivo_perda?: string
  responsavel_id?: string
  comissao_percentual?: number
  comissao_valor?: number
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// CRM — Atividades
// ---------------------------------------------------------------------------
export type TipoAtividade = 'tarefa' | 'ligacao' | 'reuniao' | 'email' | 'whatsapp'
export type StatusAtividade = 'pendente' | 'concluida' | 'cancelada'

export interface CrmAtividade {
  id: string
  tenant_id: string
  lead_id?: string
  deal_id?: string
  tipo: TipoAtividade
  descricao: string
  data_vencimento?: string
  data_conclusao?: string
  responsavel_id?: string
  status: StatusAtividade
  created_at: string
}

// ---------------------------------------------------------------------------
// CRM — Pipeline (estágios do kanban)
// ---------------------------------------------------------------------------
export interface CrmPipelineEstagio {
  id: string
  tenant_id: string
  nome: string
  ordem: number
  cor: string
  probabilidade_padrao: number
  created_at: string
}

// ---------------------------------------------------------------------------
// Perfil do usuário (dados extras além do auth do Supabase)
// ---------------------------------------------------------------------------
export interface UsuarioPerfil {
  id: string
  email: string
  nome?: string
  avatar_url?: string
  telefone?: string
  created_at: string
}
