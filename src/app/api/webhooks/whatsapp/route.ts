/**
 * WhatsApp Webhook Handler
 * Recebe eventos da Evolution API e processa:
 * - CONNECTION_UPDATE (QR code, connected, disconnected)
 * - QRCODE_UPDATED
 * - MESSAGES_UPSERT (mensagens recebidas)
 * - MESSAGES_UPDATE (status de entrega/leitura)
 * - SEND_MESSAGE (confirmação de envio)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EvolutionApiClient } from '@/lib/evolution-api'
import { formatPhoneNumber } from '@/lib/evolution-api'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = await createClient()

    // Parse do webhook da Evolution API
    // Formato: { instanceName, event, data }
    const { instanceName, event, data } = body

    if (!instanceName) {
      return NextResponse.json({ error: 'Missing instanceName' }, { status: 400 })
    }

    console.log('[WhatsApp Webhook]', event, instanceName, JSON.stringify(body).slice(0, 200))

    // Buscar instancia pelo nome
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id, tenant_id, evolution_api_url, evolution_api_key')
      .eq('instance_name', instanceName)
      .maybeSingle()

    if (!instance) {
      console.log('[WhatsApp Webhook] Instancia nao encontrada:', instanceName)
      return NextResponse.json({ ok: true }) // nao dar erro pro Evolution API
    }

    switch (event) {
      case 'CONNECTION_UPDATE':
        await handleConnectionUpdate(supabase, instance, data)
        break

      case 'QRCODE_UPDATED':
        await handleQRCodeUpdated(supabase, instance, data)
        break

      case 'MESSAGES_UPSERT':
        await handleMessagesUpsert(supabase, instance, data)
        break

      case 'MESSAGES_UPDATE':
        await handleMessagesUpdate(supabase, instance, data)
        break

      case 'SEND_MESSAGE':
        // Confirmação de mensagem enviada (já tratada pelo MESSAGES_UPDATE)
        break

      default:
        console.log('[WhatsApp Webhook] Evento desconhecido:', event)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[WhatsApp Webhook] Erro:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// GET: usado pelo Evolution API para verificar o webhook
export async function GET(req: NextRequest) {
  return NextResponse.json({ status: 'ok', service: 'whatsapp-webhook' })
}

// --- Handlers ---

async function handleConnectionUpdate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  instance: { id: string; tenant_id: string },
  data: { instance?: { status?: string }; state?: string }
) {
  const status = data?.instance?.status ?? data?.state ?? 'unknown'

  const updates: Record<string, unknown> = {}

  if (status === 'open' || status === 'connected') {
    updates.status = 'connected'
    updates.connected_at = new Date().toISOString()
    updates.qr_code = null
    updates.qr_expires_at = null
  } else if (status === 'close' || status === 'disconnected') {
    updates.status = 'disconnected'
    updates.disconnected_at = new Date().toISOString()
  } else if (status === 'fail') {
    updates.status = 'failed'
  }

  if (Object.keys(updates).length > 0) {
    await supabase
      .from('whatsapp_instances')
      .update(updates)
      .eq('id', instance.id)
  }
}

async function handleQRCodeUpdated(
  supabase: Awaited<ReturnType<typeof createClient>>,
  instance: { id: string; tenant_id: string },
  data: { qrcode?: { code?: string; base64?: string } }
) {
  const qr = data?.qrcode?.code ?? data?.qrcode?.base64 ?? null

  if (qr) {
    await supabase
      .from('whatsapp_instances')
      .update({
        qr_code: qr,
        qr_expires_at: new Date(Date.now() + 60_000).toISOString(),
        status: 'connecting',
      })
      .eq('id', instance.id)
  }
}

async function handleMessagesUpsert(
  supabase: Awaited<ReturnType<typeof createClient>>,
  instance: { id: string; tenant_id: string },
  data: { key?: { remoteJid?: string; fromMe?: boolean; id?: string }; message?: Record<string, unknown>; messageTimestamp?: string }
) {
  const { key, message, messageTimestamp } = data

  if (!key?.remoteJid) return

  // Ignorar mensagens de grupo (por enquanto)
  if (key.remoteJid.endsWith('@g.us')) return

  // fromMe = false significa mensagem recebida
  const direcao = key.fromMe ? 'sent' : 'received'

  // Extrair texto da mensagem
  let conteudo = ''
  let tipo = 'text'

  if (message) {
    const msg = message as Record<string, unknown>
    const extMsg = msg.extendedTextMessage as Record<string, unknown> | undefined
    const imgMsg = msg.imageMessage as Record<string, unknown> | undefined
    const vidMsg = msg.videoMessage as Record<string, unknown> | undefined

    if (msg.conversation) {
      conteudo = String(msg.conversation)
    } else if (extMsg?.text) {
      conteudo = String(extMsg.text)
      tipo = 'text'
    } else if (imgMsg?.caption) {
      conteudo = String(imgMsg.caption)
      tipo = 'image'
    } else if (imgMsg) {
      conteudo = '[Imagem]'
      tipo = 'image'
    } else if (vidMsg?.caption) {
      conteudo = String(vidMsg.caption)
      tipo = 'video'
    } else if (vidMsg) {
      conteudo = '[Video]'
      tipo = 'video'
    } else if (msg.documentMessage) {
      conteudo = '[Documento]'
      tipo = 'document'
    } else if (msg.audioMessage) {
      conteudo = '[Audio]'
      tipo = 'audio'
    } else {
      // Tentar serializar
      conteudo = JSON.stringify(message).slice(0, 500)
    }
  }

  const telefone = formatPhoneNumber(key.remoteJid.replace('@s.whatsapp.net', ''))

  // Upsert contato
  const { data: contato } = await supabase
    .from('whatsapp_contatos')
    .upsert({
      tenant_id: instance.tenant_id,
      instance_id: instance.id,
      telefone,
      whatsapp_id: key.remoteJid,
    }, {
      onConflict: 'tenant_id,telefone',
      ignoreDuplicates: false,
    })
    .select('id')
    .single()

  // Inserir mensagem
  if (contato) {
    await supabase.from('whatsapp_mensagens').insert({
      tenant_id: instance.tenant_id,
      instance_id: instance.id,
      contato_id: contato.id,
      tipo: tipo as 'text' | 'image' | 'video' | 'document' | 'audio',
      direcao: direcao as 'sent' | 'received',
      status: direcao === 'received' ? 'delivered' : 'sent',
      conteudo,
      sent_at: messageTimestamp
        ? new Date(Number(messageTimestamp) * 1000).toISOString()
        : new Date().toISOString(),
    })
  }
}

async function handleMessagesUpdate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  instance: { id: string },
  data: { key?: { id?: string }; update?: string }
) {
  // Status updates: 'receipt' ou 'read'
  const { key, update } = data
  if (!key?.id) return

  // Buscar mensagem pelo ID externo (key.id)
  const { data: msg } = await supabase
    .from('whatsapp_mensagens')
    .select('id')
    .eq('instance_id', instance.id)
    .ilike('metadata->>\'wa_message_id\'', `%${key.id}%`)
    .single()

  // Mapeamento de status
  const statusMap: Record<string, string> = {
    receipt: 'delivered',
    read: 'read',
    error: 'failed',
  }

  const newStatus = statusMap[update ?? '']
  if (msg && newStatus) {
    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'delivered') updates.delivered_at = new Date().toISOString()
    if (newStatus === 'read') updates.read_at = new Date().toISOString()

    await supabase
      .from('whatsapp_mensagens')
      .update(updates)
      .eq('id', msg.id)
  }
}
