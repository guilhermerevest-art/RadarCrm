// =============================================================================
// API Key Authentication Utilities
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Tipos
export interface ApiKeyAuth {
  tenantId: string
  escopo: string[]
  valida: boolean
}

export interface ApiKeyInfo {
  id: string
  tenant_id: string
  nome: string
  prefixo: string
  escopo: string[]
  ativo: boolean
  ultimo_uso: string | null
  expira_em: string | null
  created_at: string
}

/**
 * Gera uma nova API key aleatória
 * Formato: prefixo(8) + "-" + random(64 chars hex)
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const randomBytes = crypto.randomBytes(32)
  const randomHex = randomBytes.toString('hex')
  const prefix = crypto.randomBytes(4).toString('hex').toUpperCase()
  const key = `${prefix}-${randomHex}`

  // Hash simples para armazenamento (em produção usar Argon2)
  const hash = crypto
    .createHash('sha256')
    .update(key)
    .digest('hex')

  return { key, prefix, hash }
}

/**
 * Extrai a API key do header Authorization
 */
export function extractApiKey(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')

  if (!authHeader) return null

  // Suporta Bearer token
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  // Suporta X-API-Key header
  const apiKeyHeader = request.headers.get('X-API-Key')
  if (apiKeyHeader) return apiKeyHeader

  return null
}

/**
 * Valida uma API key usando o banco de dados
 */
export async function validateApiKey(
  supabaseUrl: string,
  supabaseServiceKey: string,
  key: string
): Promise<ApiKeyAuth> {
  const prefix = key.substring(0, 8)

  // Criar cliente admin para bypass RLS
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // Buscar chave pelo prefixo
  const { data: apiKey, error } = await supabase
    .from('api_keys')
    .select('id, tenant_id, prefixo, hash_argon2, escopo, ativo, expira_em, ultimo_uso')
    .eq('prefixo', prefix)
    .eq('ativo', true)
    .single()

  if (error || !apiKey) {
    return { tenantId: '', escopo: [], valida: false }
  }

  // Verificar expiração
  if (apiKey.expira_em && new Date(apiKey.expira_em) < new Date()) {
    return { tenantId: '', escopo: [], valida: false }
  }

  // Verificar hash
  const hash = crypto
    .createHash('sha256')
    .update(key)
    .digest('hex')

  if (apiKey.hash_argon2 !== hash) {
    return { tenantId: '', escopo: [], valida: false }
  }

  // Atualizar último uso (não esperar)
  supabase
    .from('api_keys')
    .update({ ultimo_uso: new Date().toISOString() })
    .eq('id', apiKey.id)
    .then(() => {}) // fire and forget

  return {
    tenantId: apiKey.tenant_id,
    escopo: apiKey.escopo as string[],
    valida: true,
  }
}

/**
 * Verifica se a API key tem permissão para uma ação
 */
export function hasPermission(escopo: string[], required: 'read' | 'write'): boolean {
  if (required === 'read') {
    return escopo.includes('read') || escopo.includes('write')
  }
  return escopo.includes('write')
}

// Escopos disponíveis
export const API_SCOPES = {
  READ: 'read' as const,
  WRITE: 'write' as const,
  READ_WRITE: ['read', 'write'] as const,
}

// Eventos disponíveis para webhooks
export const WEBHOOK_EVENTS = [
  'obra.nova',
  'obra.atualizada',
  'lead.criado',
  'lead.atualizado',
  'lead.convertido',
  'deal.criado',
  'deal.ganho',
  'deal.perdido',
  'visita.registrada',
  'whatsapp.mensagem',
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]
