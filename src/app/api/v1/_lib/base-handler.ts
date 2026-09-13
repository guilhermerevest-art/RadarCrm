// =============================================================================
// Base Handler para API v1
// Extrai tenant_id da API key e aplica rate limiting
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'
import { extractApiKey, validateApiKey, hasPermission } from '@/lib/api-auth'
import { checkRateLimit, getRateLimitHeaders, DEFAULT_RATE_LIMITS } from '@/lib/rate-limit'

// Contexto da requisição
export interface ApiContext {
  tenantId: string
  escopo: string[]
  supabase: SupabaseClient
}

export type ApiHandler = (
  request: NextRequest,
  context: ApiContext
) => Promise<NextResponse>

/**
 * Cria um handler com autenticação API key
 */
export function withApiAuth(handler: ApiHandler, requireWrite = false) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // 1. Extrair e validar API key
    const apiKey = extractApiKey(request)
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required', code: 'MISSING_API_KEY' },
        { status: 401 }
      )
    }

    const auth = await validateApiKey(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      apiKey
    )

    if (!auth.valida) {
      return NextResponse.json(
        { error: 'Invalid or expired API key', code: 'INVALID_API_KEY' },
        { status: 401 }
      )
    }

    // 2. Verificar permissão de escopo
    const requiredScope = requireWrite ? 'write' : 'read'
    if (!hasPermission(auth.escopo, requiredScope)) {
      return NextResponse.json(
        {
          error: `This endpoint requires ${requiredScope} permission`,
          code: 'INSUFFICIENT_SCOPE'
        },
        { status: 403 }
      )
    }

    // 3. Aplicar rate limiting
    const rateLimitResult = await checkRateLimit(
      `key:${apiKey.substring(0, 8)}`,
      DEFAULT_RATE_LIMITS.api_key
    )

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: rateLimitResult.retryAfter
        },
        {
          status: 429,
          headers: getRateLimitHeaders(rateLimitResult)
        }
      )
    }

    // 4. Criar cliente Supabase com contexto do tenant
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            // Forçar contexto de tenant via RLS
          },
        },
      }
    )

    // 5. Executar handler
    try {
      const response = await handler(request, {
        tenantId: auth.tenantId,
        escopo: auth.escopo,
        supabase,
      })

      // Adicionar headers de rate limit à resposta
      const headers = new Headers(response.headers)
      const rlHeaders = getRateLimitHeaders(rateLimitResult)
      Object.entries(rlHeaders).forEach(([key, value]) => {
        headers.set(key, value)
      })

      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch (error) {
      console.error('[API v1 Error]', error)
      return NextResponse.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }
  }
}

/**
 * Cria resposta JSON padronizada
 */
export function json<T>(data: T, status = 200, meta?: Record<string, unknown>) {
  return NextResponse.json(
    meta ? { data, meta } : { data },
    { status }
  )
}

/**
 * Cria resposta de erro padronizada
 */
export function error(message: string, code: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { error: message, code, details },
    { status }
  )
}

/**
 * Extrai parâmetros de query da request
 */
export function getQueryParams(request: Request): URLSearchParams {
  const url = new URL(request.url)
  return url.searchParams
}

/**
 * Extrai ID da URL
 */
export function getIdFromUrl(request: Request): string | null {
  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)
  return segments[segments.length - 1] || null
}
