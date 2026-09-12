# Cloudflare Workers + Upstash QStash — Arquitetura da Fila WhatsApp

Objetivo: substituir Edge Functions do Supabase (que tem limite de 150s e restartam a cada invocacao) por uma stack mais robusta para a fila de envio de WhatsApp e webhook da EvolutionAPI.
Quando usar: quando voce tem mais de 10 clientes mandando mensagem simultaneamente, ou quando precisa agendar mensagens com garantia de execucao.

---

## 1. Por que nao usar so Supabase Edge Functions

| Limitacao | Impacto |
|---|---|
| Timeout de 150 segundos (free) ou 400s (pro) | Mensagens que travam no envio podem estourar |
| Cold start imprevisivel | Latencia alta no webhook |
| Sem fila persistente nativa | Precisa de pg_cron + tabela wa_envios_fila |
| Custo cresce com invocacoes | A partir de 500k/mes, Workers e mais barato |
| Sem retry automatico confiavel | Cada restart perde contexto |
| Sem agendamento nativo | Cron tem granularidade de 1 min |

Cloudflare Workers resolve: timeout 30s (free) / 5min (paid), cold start < 50ms, sempre disponivel.

Upstash QStash resolve: fila persistente, agendamento, retry com backoff, dead letter queue.

---

## 2. Stack final

```
Frontend (React)
       |
       v
Supabase (Postgres + Auth + Storage)
   - banco multi-tenant com RLS
   - tabelas wa_* com wa_accounts.provider
   - Edge Functions (webhooks, workers)
       |
       | webhook            | API REST
       v                    v
EvolutionAPI (VPS)    Cloudflare Workers
   - instancia/tenant   - fila de envio
   - Baileys multi      - rate limit Redis
   - webhook -> Sup     - retry/backoff
       |
       v
Upstash Redis
   - rate limit por tenant
   - fila persistente (QStash)
   - cache de geocoding
```

---

## 3. Custos estimados

| Servico | Custo Free | Custo com volume (100 clientes) |
|---|---|---|
| Cloudflare Workers | 100k req/dia gratis | ~R$ 30/mes (10M req) |
| Cloudflare R2 (backup) | 10 GB gratis | ~R$ 5/mes |
| Upstash QStash | 500 msgs/dia gratis | ~R$ 80/mes (500k msgs) |
| Upstash Redis | 10k req/dia gratis | ~R$ 50/mes (1M req) |
| Cloudflare Tunnel | gratis | gratis |
| Total | R$ 0 para MVP | ~R$ 165/mes |

---

## 4. Cloudflare Worker: webhook-router

Funcao: recebe webhook da EvolutionAPI, enfileira para processamento assincrono.

```typescript
import { Receiver } from 'upstash-qstash/cloudflare'

interface Env {
  QSTASH_TOKEN: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  WEBHOOK_BASE_URL: string
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url)

    if (req.method !== 'POST' || !url.pathname.startsWith('/webhook/wa/')) {
      return new Response('Not Found', { status: 404 })
    }

    const instanceId = url.pathname.split('/').pop()
    const token = url.searchParams.get('token')

    const isValid = await validateToken(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, instanceId, token)
    if (!isValid) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body = await req.json()

    const receiver = new Receiver({ token: env.QSTASH_TOKEN })
    await receiver.publish({
      url: env.WEBHOOK_BASE_URL + '/wa-process',
      body: JSON.stringify({ instanceId, event: body }),
      retries: 3,
      delay: 0,
    })

    return new Response('OK', { status: 200 })
  }
}

async function validateToken(supabaseUrl: string, serviceKey: string, instanceId: string, token: string): Promise<boolean> {
  const res = await fetch(supabaseUrl + '/rest/v1/wa_contas?evolution_instance_id=eq.' + instanceId + '&webhook_secret=eq.' + token + '&select=id', {
    headers: {
      'apikey': serviceKey,
      'Authorization': 'Bearer ' + serviceKey,
    }
  })
  const data = await res.json()
  return Array.isArray(data) && data.length > 0
}
```

---

## 5. Cloudflare Worker: wa-process

Funcao: processa o evento (mensagem recebida, status, conexao), atualiza Supabase.

```typescript
import { createClient } from '@supabase/supabase-js'

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  EVOLUTION_BASE_URL: string
}

interface ProcessPayload {
  instanceId: string
  event: any
}

export default {
  async fetch(req: Request, env: Env) {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

    const payload: ProcessPayload = await req.json()
    const { instanceId, event } = payload
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

    const { data: conta } = await supabase
      .from('wa_contas')
      .select('tenant_id, evolution_api_key')
      .eq('evolution_instance_id', instanceId)
      .single()

    if (!conta) {
      return new Response('OK', { status: 200 })
    }

    const eventType = event.event

    switch (eventType) {
      case 'messages.upsert':
        await handleMessageReceived(supabase, conta, event.data)
        break
      case 'messages.update':
        await handleMessageStatus(supabase, event.data)
        break
      case 'connection.update':
        await handleConnectionUpdate(supabase, instanceId, event.data)
        break
      case 'qrcode.updated':
        await handleQRUpdate(supabase, instanceId, event.data)
        break
      default:
        console.log('Evento ignorado: ' + eventType)
    }

    return new Response('OK', { status: 200 })
  }
}

async function handleMessageReceived(supabase: any, conta: any, data: any) {
  if (!data.messages) return

  for (const msg of data.messages) {
    if (msg.key.fromMe) continue

    const numero = msg.key.remoteJid.replace('@s.whatsapp.net', '')
    const messageId = msg.key.id

    const { data: existing } = await supabase
      .from('wa_mensagens')
      .select('id')
      .eq('message_id', messageId)
      .single()

    if (existing) continue

    await supabase.from('wa_mensagens').insert({
      tenant_id: conta.tenant_id,
      message_id: messageId,
      de_numero: numero,
      conteudo: extractMessageContent(msg.message),
      tipo: msg.messageType || 'texto',
      raw_payload: msg,
      recebida_em: new Date(msg.messageTimestamp * 1000).toISOString(),
      lida: false,
    })

    const texto = extractMessageContent(msg.message)?.toLowerCase().trim()
    if (texto === 'sair' || texto === 'parar') {
      await handleOptOut(supabase, conta.tenant_id, numero)
    } else if (texto?.startsWith('visitei')) {
      const obraId = texto.replace('visitei', '').trim()
      await handleVisitMark(supabase, conta.tenant_id, obraId, numero)
    }

    await supabase
      .from('wa_fluxo_execucoes')
      .update({ encerrada_em: new Date().toISOString(), motivo_encerramento: 'resposta_cliente' })
      .eq('tenant_id', conta.tenant_id)
      .eq('contato_numero', numero)
      .is('encerrada_em', null)
  }
}

async function handleMessageStatus(supabase: any, data: any) {
  if (!data || !data.id) return

  const statusMap: Record<string, string> = {
    'DELIVERED': 'entregue',
    'READ': 'lida',
    'PLAYED': 'tocado_audio',
    'ERROR': 'erro',
  }

  const status = statusMap[data.update?.status] || data.update?.status
  if (!status) return

  await supabase
    .from('wa_envios')
    .update({ status_entrega: status, atualizado_em: new Date().toISOString() })
    .eq('message_id', data.id)
}

async function handleConnectionUpdate(supabase: any, instanceId: string, data: any) {
  const state = data.state
  const statusMap: Record<string, string> = {
    'open': 'connected',
    'close': 'disconnected',
    'connecting': 'connecting',
    'refused': 'error',
  }

  await supabase
    .from('wa_contas')
    .update({
      connection_status: statusMap[state] || 'error',
      last_seen_at: new Date().toISOString(),
    })
    .eq('evolution_instance_id', instanceId)
}

function extractMessageContent(message: any): string {
  if (!message) return ''
  if (message.conversation) return message.conversation
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text
  if (message.imageMessage?.caption) return message.imageMessage.caption
  if (message.videoMessage?.caption) return message.videoMessage.caption
  return '[midia]'
}

async function handleOptOut(supabase: any, tenantId: string, numero: string) {
  await supabase.from('wa_optins').update({
    revoked_at: new Date().toISOString(),
    revoked_via: 'palavra_chave',
  }).eq('tenant_id', tenantId).eq('numero', numero).is('revoked_at', null)
}

async function handleVisitMark(supabase: any, tenantId: string, obraId: string, numero: string) {
  await supabase.from('radar_obras_visitas').insert({
    tenant_id: tenantId,
    obra_id: obraId,
    registrado_por: numero,
    registrado_em: new Date().toISOString(),
    origem: 'whatsapp_comando',
  })
}
```

---

## 6. Cloudflare Worker: wa-sender

Funcao: consome fila de envio, chama EvolutionAPI, atualiza status.

```typescript
import { Redis } from '@upstash/redis/cloudflare'
import { createClient } from '@supabase/supabase-js'

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  UPSTASH_REDIS_REST_URL: string
  UPSTASH_REDIS_REST_TOKEN: string
  EVOLUTION_BASE_URL: string
}

interface SendPayload {
  envioId: string
  tenantId: string
  instanceName: string
  apiKey: string
  numero: string
  mensagem: string
  tipo?: string
  mediaUrl?: string
  viaProvider: string
}

export default {
  async fetch(req: Request, env: Env) {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

    const payload: SendPayload = await req.json()
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    const redis = Redis.fromEnv()

    const checks = await Promise.all([
      checkRateLimit(redis, payload.tenantId, 'min'),
      checkRateLimit(redis, payload.tenantId, 'day'),
      checkRatePerContact(redis, payload.tenantId, payload.numero),
      checkHorario(),
    ])

    const failed = checks.find(c => !c.ok)
    if (failed) {
      const nextSlot = computeNextSlot(failed)
      await supabase.from('wa_envios_fila').update({
        status: 'agendado',
        agendado_para: nextSlot.toISOString(),
        motivo_adiamento: failed.reason,
      }).eq('id', payload.envioId)
      return new Response(JSON.stringify({ ok: false, reason: failed.reason }), { status: 200 })
    }

    const { data: optin } = await supabase
      .from('wa_optins')
      .select('id')
      .eq('tenant_id', payload.tenantId)
      .eq('numero', payload.numero)
      .is('revoked_at', null)
      .single()

    if (!optin) {
      await supabase.from('wa_envios_fila').update({
        status: 'cancelado',
        motivo_cancelamento: 'sem_optin',
      }).eq('id', payload.envioId)
      return new Response(JSON.stringify({ ok: false, reason: 'sem_optin' }), { status: 200 })
    }

    let result
    try {
      const endpoint = payload.tipo === 'media'
        ? '/message/sendMedia/' + payload.instanceName
        : '/message/sendText/' + payload.instanceName

      result = await fetch(env.EVOLUTION_BASE_URL + endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': payload.apiKey,
        },
        body: JSON.stringify({
          number: payload.numero,
          text: payload.mensagem,
          ...(payload.mediaUrl && { media: payload.mediaUrl }),
        }),
      })

      if (!result.ok) {
        const errorText = await result.text()
        throw new Error('EvolutionAPI ' + result.status + ': ' + errorText)
      }
    } catch (err: any) {
      await supabase.from('wa_envios_fila').update({
        status: 'erro',
        tentativas: supabase.raw('tentativas + 1'),
        ultimo_erro: err.message,
      }).eq('id', payload.envioId)

      const { data: envio } = await supabase.from('wa_envios_fila').select('tentativas').eq('id', payload.envioId).single()
      if (envio && envio.tentativas < 5) {
        const delay = Math.pow(2, envio.tentativas) * 60
      }
      return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 200 })
    }

    const sent = await result.json()
    await supabase.from('wa_envios_fila').update({
      status: 'enviado',
      enviado_em: new Date().toISOString(),
      evolution_message_id: sent.key?.id,
    }).eq('id', payload.envioId)

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
}

async function checkRateLimit(redis: Redis, tenantId: string, window: 'min' | 'day') {
  const now = Date.now()
  const bucket = window === 'min' ? Math.floor(now / 60000) : Math.floor(now / 86400000)
  const key = 'wa:limit:' + tenantId + ':' + window + ':' + bucket
  const count = await redis.incr(key)
  await redis.expire(key, window === 'min' ? 60 : 86400)

  const limit = window === 'min' ? 30 : 500
  return count > limit ? { ok: false, reason: 'rate_per_' + window } : { ok: true }
}

async function checkRatePerContact(redis: Redis, tenantId: string, numero: string) {
  const day = Math.floor(Date.now() / 86400000)
  const key = 'wa:limit:' + tenantId + ':contact:' + numero + ':' + day
  const count = await redis.incr(key)
  await redis.expire(key, 86400)
  return count > 1 ? { ok: false, reason: 'already_messaged_today' } : { ok: true }
}

function checkHorario() {
  const hour = new Date().getHours()
  return (hour >= 8 && hour < 21) ? { ok: true } : { ok: false, reason: 'horario_fora' }
}

function computeNextSlot(failed: { reason: string }) {
  const now = new Date()
  switch (failed.reason) {
    case 'rate_per_min':
      return new Date(now.getTime() + 60000)
    case 'rate_per_day':
      return new Date(now.getTime() + 86400000)
    case 'already_messaged_today':
      return new Date(now.getTime() + 86400000)
    case 'horario_fora':
      const tomorrow = new Date(now)
      tomorrow.setHours(8, 0, 0, 0)
      if (tomorrow.getTime() < now.getTime()) tomorrow.setDate(tomorrow.getDate() + 1)
      return tomorrow
    default:
      return new Date(now.getTime() + 300000)
  }
}
```

---

## 7. Cron Worker: wa-dispatch

Funcao: roda a cada 1 minuto, le envios pendentes do Supabase, enfileira no QStash.

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(dispatchPending(env))
  }
}

async function dispatchPending(env: Env) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const receiver = new Receiver({ token: env.QSTASH_TOKEN })

  const { data: envios } = await supabase
    .from('wa_envios_fila')
    .select('id, tenant_id, wa_contas!inner(evolution_instance_id, evolution_api_key), contato_numero, mensagem, tipo, media_url, tentativas')
    .eq('status', 'pendente')
    .lte('agendado_para', new Date().toISOString())
    .limit(100)

  if (!envios || envios.length === 0) return

  for (const envio of envios) {
    await supabase.from('wa_envios_fila')
      .update({ status: 'processando' })
      .eq('id', envio.id)

    await receiver.publish({
      url: env.WEBHOOK_BASE_URL + '/wa-sender',
      body: JSON.stringify({
        envioId: envio.id,
        tenantId: envio.tenant_id,
        instanceName: envio.wa_contas.evolution_instance_id,
        apiKey: envio.wa_contas.evolution_api_key,
        numero: envio.contato_numero,
        mensagem: envio.mensagem,
        tipo: envio.tipo,
        mediaUrl: envio.media_url,
        viaProvider: 'evolution',
      }),
      retries: 3,
    })
  }
}
```

Configuracao no wrangler.toml:

```toml
name = "wa-dispatch"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[triggers]
crons = ["* * * * *"]

[vars]
SUPABASE_URL = "https://xxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "..."
UPSTASH_REDIS_REST_URL = "https://xxx.upstash.io"
UPSTASH_REDIS_REST_TOKEN = "..."
EVOLUTION_BASE_URL = "https://evolution.seudominio.com.br"
WEBHOOK_BASE_URL = "https://api.radarcanteiro.com.br"

[secrets]
QSTASH_TOKEN
```

---

## 8. Como fazer deploy

Pre-requisitos:
- Conta Cloudflare (gratis)
- Conta Upstash (gratis ate limites)
- Wrangler CLI: npm install -g wrangler

Setup:

```bash
wrangler login

# criar R2 bucket para backup de sessoes
wrangler r2 bucket create wa-sessions-backup

# para cada worker
cd workers/webhook-router
wrangler deploy

cd ../wa-process
wrangler deploy

cd ../wa-sender
wrangler deploy

cd ../wa-dispatch
wrangler deploy

# secrets
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put QSTASH_TOKEN
wrangler secret put EVOLUTION_BASE_URL
```

---

## 9. Monitoramento

### Cloudflare Workers Analytics
Gratis no dashboard: requests, erros, latencia p50/p99, CPU time.

### Upstash Console
Ver no painel:
- Mensagens enfileiradas por dia
- Taxa de sucesso
- DLQ (dead letter queue)

### Sentry
Adicionar nos workers:

```typescript
import * as Sentry from '@sentry/cloudflare'

Sentry.init({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 0.1,
})

export default Sentry.wrap(handler)
```

---

## 10. Testes locais

```bash
# rodar worker localmente
wrangler dev

# simular webhook
curl -X POST http://localhost:8787/webhook/wa/test-instance?token=abc123 \
  -H "Content-Type: application/json" \
  -d '{"event":"messages.upsert","data":{"messages":[{"key":{"id":"abc","remoteJid":"5534999999999@s.whatsapp.net","fromMe":false},"message":{"conversation":"ola"}}]}}'
```

---

## 11. Quando NAO usar Cloudflare Workers

| Situacao | Use |
|---|---|
| < 5 clientes ativos | Supabase Edge Functions basta |
| Precisa de Node.js APIs (fs, child_process) | Cloudflare Workers nao tem, use AWS Lambda |
| Quer rodar binarios pesados (FFmpeg, Chrome) | Cloudflare nao roda, use Railway ou Fly.io |
| Time < 10k mensagens/dia | Supabase Edge Functions e mais simples |

---

## 12. Resumo dos entregaveis

| Worker | Funcao | Trigger | Custo/mes (10k req/dia) |
|---|---|---|---|
| webhook-router | Recebe webhook EvolutionAPI | HTTP | R$ 5 |
| wa-process | Processa eventos | QStash | R$ 15 |
| wa-sender | Envia mensagem com rate limit | QStash | R$ 40 |
| wa-dispatch | Cron 1 min, le fila | Cron | R$ 5 |
| Upstash QStash | Fila persistente com retry | — | R$ 80 |
| Upstash Redis | Rate limit counters | — | R$ 50 |
| Total | | | R$ 195/mes |

Custo-beneficio: R$ 195/mes para processar ate 500 mil mensagens com garantia de execucao. Equivale a pagar 1 dev junior 1 dia.

---

## 13. Comparacao final: Supabase Edge Functions vs Workers + QStash

| Criterio | Supabase Edge Functions | Workers + QStash |
|---|---|---|
| Custo com 500k msgs/mes | R$ 250 | R$ 195 |
| Custo com 2M msgs/mes | R$ 800 | R$ 350 |
| Timeout | 150s (free) / 400s (pro) | 30s (free) / 5min (paid) |
| Cold start | 200 a 800ms | < 50ms |
| Fila persistente | Nao (precisa implementar) | Sim (QStash nativo) |
| Retry automatico | Nao | Sim (configuravel) |
| DLQ (dead letter) | Nao | Sim |
| Cron | Nao (precisa pg_cron) | Sim (1 min) |
| Complexidade de setup | Media | Alta |
| Lock-in | Supabase | Cloudflare + Upstash |

Recomendacao: comece com Supabase Edge Functions. Migre pra Workers + QStash quando ultrapassar 50 clientes ativos ou 100k mensagens/mes.

Esta arquitetura complementa a secao 11 (EvolutionAPI). Nao substitui nada da spec — apenas detalha a infra recomendada para escala.