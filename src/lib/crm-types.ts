// =============================================================================
// TIPOS COMPARTILHADOS CRM
// =============================================================================

export type PipelineEstagio = {
  id: string
  tenant_id: string
  nome: string
  ordem: number
  cor: string
  probabilidade_padrao: number
}

export type Responsavel = {
  id: string
  nome: string
}

export type Deal = {
  id: string
  tenant_id: string
  lead_id: string
  obra_id?: string
  titulo: string
  estagio: string
  valor_estimado?: number
  valor_final?: number
  probabilidade: number
  data_fechamento_prevista?: string
  data_fechamento_real?: string
  motivo_perda?: string
  responsavel_id?: string
  created_at: string
  updated_at?: string
  leads?: { nome: string; empresa?: string }
  responsavel?: Responsavel
}

export type Lead = {
  id: string
  tenant_id?: string
  nome: string
  empresa?: string
  email?: string
  telefone?: string
  origem?: string
  status?: string
}

export type Atividade = {
  id: string
  tenant_id: string
  lead_id?: string
  deal_id?: string
  tipo: string
  descricao: string
  data_vencimento?: string
  data_conclusao?: string | null
  responsavel_id?: string
  status: string
  created_at: string
  leads?: { nome: string }
  deals?: { titulo: string }
}
