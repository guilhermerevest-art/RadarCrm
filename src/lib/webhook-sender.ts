// =============================================================================
// Edge Function: webhook-sender
// Envia webhooks com retry exponencial
// Backoff: 1m, 5m, 30m
// DLQ apos 3 falhas
// =============================================================================

import { createClient } from '@supabase/supabase-js'

// Configuracoes
const MAX_RETRIES = 3
const BACKOFF_DELAYS = [60, 300, 1800] // 1min, 5min, 30min em segundos

// Cliente Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface WebhookPayload {
  webhook_id: string
  tenant_id: string
  evento: string
  payload: Record<string, unknown>
  tentativa: number
}

interface WebhookConfig {
  url: string
  secret_hmac: string
}

/**
 * Gera assinatura HMAC-SHA256 usando Web Crypto API (Edge compatible)
 */
async function generateHmacSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Envia webhook com retry
 */
async function sendWebhook(
  url: string,
  payload: Record<string, unknown>,
  secret: string
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const body = JSON.stringify(payload)
  const signature = await generateHmacSignature(body, secret)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': Date.now().toString(),
      },
      body,
    })

    return {
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : await response.text(),
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Atualiza status do webhook
 */
async function updateWebhookStatus(
  id: string,
  status: string,
  tentativa: number,
  proximaTentativa?: number
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  await supabase
    .from('webhook_logs')
    .update({
      status,
      tentativa,
      proxima_tentativa: proximaTentativa,
      ultima_erro: null,
    })
    .eq('id', id)
}

/**
 * Processa webhooks pendentes
 */
export async function processWebhooks() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Busca webhooks pendentes ou com falha
  const { data: webhooks } = await supabase
    .from('webhook_logs')
    .select('*')
    .eq('status', 'pending')
    .or(`proxima_tentativa.lt.${Date.now()},proxima_tentativa.is.null`)
    .order('proxima_tentativa', { ascending: true, nullsFirst: true })
    .limit(100)

  if (!webhooks?.length) {
    return { processed: 0 }
  }

  // Busca configs dos webhooks
  const tenantIds = Array.from(new Set(webhooks.map(w => w.tenant_id)))
  const { data: configs } = await supabase
    .from('webhook_configs')
    .select('*')
    .in('tenant_id', tenantIds)
    .eq('ativo', true)

  const configsMap = new Map(configs?.map(c => [`${c.tenant_id}_${c.evento}`, c]) || [])

  const results = await Promise.allSettled(
    webhooks.map(async webhook => {
      const configKey = `${webhook.tenant_id}_${webhook.evento}`
      const config = configsMap.get(configKey) as WebhookConfig | undefined

      if (!config) {
        await updateWebhookStatus(webhook.id, 'no_config', webhook.tentativa)
        return { id: webhook.id, success: false, reason: 'no_config' }
      }

      const result = await sendWebhook(
        config.url,
        webhook.payload,
        config.secret_hmac
      )

      if (result.success) {
        await updateWebhookStatus(webhook.id, 'sent', webhook.tentativa)
        return { id: webhook.id, success: true }
      }

      // Falhou - agendar retry ou marcar como falho
      if (webhook.tentativa < MAX_RETRIES) {
        const delay = BACKOFF_DELAYS[webhook.tentativa] || BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1]
        const proximaTentativa = Math.floor(Date.now() / 1000) + delay

        await updateWebhookStatus(
          webhook.id,
          'pending',
          webhook.tentativa + 1,
          proximaTentativa
        )
        return { id: webhook.id, success: false, reason: 'retry', nextRetry: proximaTentativa }
      } else {
        await updateWebhookStatus(webhook.id, 'failed', webhook.tentativa)
        return { id: webhook.id, success: false, reason: 'max_retries' }
      }
    })
  )

  return {
    processed: webhooks.length,
    results: results.map((r, i) => {
      const id = webhooks[i].id
      if (r.status === 'fulfilled') {
        const { id: _, ...rest } = r.value
        void _
        return { id, ...rest }
      }
      return { id, error: r.reason }
    }),
  }
}

/**
 * Limpa logs antigos (mais de 30 dias)
 */
export async function cleanupOldLogs(daysOld = 30) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysOld)

  const { count } = await supabase
    .from('webhook_logs')
    .delete()
    .lt('created_at', cutoff.toISOString())
    .eq('status', 'sent')

  return { deleted: count }
}
