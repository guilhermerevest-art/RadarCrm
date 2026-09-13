// =============================================================================
// Rate Limiting com Upstash Redis
// =============================================================================

// Tipos
export interface RateLimitConfig {
  limit: number        // Máximo de requisições
  window: number       // Janela em segundos
  keyPrefix: string    // Prefixo da chave Redis
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  reset: number        // Timestamp quando o limite reseta
  retryAfter?: number  // Segundos até retry (só se denied)
}

export interface RateLimitInfo {
  limit: number
  remaining: number
  reset: number
}

// Configurações padrão de rate limit
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // 100 requisições por minuto por API key
  api_key: { limit: 100, window: 60, keyPrefix: 'rl:api:' },
  // 10 requisições por segundo para webhooks
  webhook: { limit: 10, window: 1, keyPrefix: 'rl:webhook:' },
}

/**
 * Cria cliente Upstash Redis
 */
function createRedisClient() {
  // Lazy import para evitar erro se não configurado
  const { Redis } = require('@upstash/redis')

  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

/**
 * Verifica e atualiza rate limit para uma chave
 * Retorna headers para resposta HTTP
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMITS.api_key
): Promise<RateLimitResult> {
  const key = `${config.keyPrefix}${identifier}`
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - config.window

  try {
    const redis = createRedisClient()

    // Remover entradas antigas (pipeline atômico)
    await redis.zremrangebyscore(key, 0, windowStart)

    // Contar requisições na janela atual
    const count = await redis.zcard(key)

    if (count >= config.limit) {
      // Rate limit excedido
      const oldestEntry = await redis.zrange(key, 0, 0, { withScores: true })
      const oldestTimestamp = oldestEntry ? Number(oldestEntry[1]) : now
      const retryAfter = Math.ceil((oldestTimestamp + config.window) - now)

      return {
        allowed: false,
        remaining: 0,
        reset: oldestTimestamp + config.window,
        retryAfter,
      }
    }

    // Adicionar nova requisição
    await redis.zadd(key, { score: now, member: `${now}:${Math.random()}` })

    // Definir TTL na chave
    await redis.expire(key, config.window + 1)

    return {
      allowed: true,
      remaining: config.limit - count - 1,
      reset: now + config.window,
    }
  } catch (error) {
    // Se Redis falhar, permitir requisição (fail open)
    console.error('[RateLimit] Redis error:', error)
    return {
      allowed: true,
      remaining: config.limit,
      reset: now + config.window,
    }
  }
}

/**
 * Retorna headers de rate limit para resposta HTTP
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.remaining + (result.allowed ? 1 : 0)),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.reset),
  }

  if (!result.allowed && result.retryAfter) {
    headers['Retry-After'] = String(result.retryAfter)
  }

  return headers
}

/**
 * Middleware simples para verificar rate limit
 * Lança erro 429 se exceder
 */
export async function withRateLimit(
  request: Request,
  getIdentifier: (request: Request) => string,
  config?: RateLimitConfig
): Promise<{ allowed: boolean; headers: Record<string, string> }> {
  const identifier = getIdentifier(request)
  const result = await checkRateLimit(identifier, config)

  return {
    allowed: result.allowed,
    headers: getRateLimitHeaders(result),
  }
}

/**
 * Verifica se o tenant está bloqueado
 */
export async function isTenantBlocked(tenantId: string): Promise<boolean> {
  try {
    const redis = createRedisClient()
    const blocked = await redis.get(`blocked:tenant:${tenantId}`)
    return blocked === 'true'
  } catch {
    return false
  }
}

/**
 * Bloqueia um tenant temporariamente
 */
export async function blockTenant(tenantId: string, seconds: number = 300): Promise<void> {
  try {
    const redis = createRedisClient()
    await redis.setex(`blocked:tenant:${tenantId}`, seconds, 'true')
  } catch (error) {
    console.error('[RateLimit] Failed to block tenant:', error)
  }
}
