'use client'

import { EvolutionApiClient, formatPhoneNumber, isValidPhone } from './evolution-api'
import { createClient } from '@/lib/supabase/client'

export type WhatsAppMessage = {
  id: string
  tenant_id: string
  instance_id: string
  contato_id: string | null
  tipo: 'text' | 'image' | 'video' | 'document' | 'audio' | 'template' | 'buttons'
  direcao: 'sent' | 'received'
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  conteudo: string
  midia_url: string | null
  created_at: string
}

export type WhatsAppInstance = {
  id: string
  instance_name: string
  status: 'disconnected' | 'connecting' | 'connected' | 'failed'
  phone_number: string | null
  qr_code: string | null
  evolution_api_url: string
  evolution_api_key: string
  connected_at: string | null
}

export type WhatsAppTemplate = {
  id: string
  nome: string
  categoria: string
  conteudo: string
  variaveis: string[]
  tipo: string
  is_ativo: boolean
}

export type SendMessageOptions = {
  instanceId: string
  telefone: string
  conteudo: string
  tipo?: 'text' | 'image' | 'document'
  midiaUrl?: string
  leadId?: string
  dealId?: string
}

export class WhatsAppProvider {
  private supabase = createClient()

  /** Pegar instancia ativa do tenant */
  async getActiveInstance(tenantId: string): Promise<WhatsAppInstance | null> {
    const { data } = await this.supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'connected')
      .single()
    return data
  }

  /** Pegar QR code pendente */
  async getQRCode(instanceId: string): Promise<{ qr: string; expiresAt: string } | null> {
    const { data } = await this.supabase
      .from('whatsapp_instances')
      .select('qr_code, qr_expires_at')
      .eq('id', instanceId)
      .single()

    if (data?.qr_code && data?.qr_expires_at && new Date(data.qr_expires_at) > new Date()) {
      return { qr: data.qr_code, expiresAt: data.qr_expires_at }
    }
    return null
  }

  /** Enviar mensagem */
  async sendMessage(options: SendMessageOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { instanceId, telefone, conteudo, tipo = 'text', midiaUrl, leadId, dealId } = options

    // Validar telefone
    const phone = formatPhoneNumber(telefone)
    if (!isValidPhone(phone)) {
      return { success: false, error: 'Telefone invalido' }
    }

    // Pegar config da instancia
    const { data: instance } = await this.supabase
      .from('whatsapp_instances')
      .select('instance_name, evolution_api_url, evolution_api_key, tenant_id')
      .eq('id', instanceId)
      .single()

    if (!instance || (instance as any).status !== 'connected') {
      return { success: false, error: 'Instancia nao conectada' }
    }

    // Criar cliente Evolution API
    const client = new EvolutionApiClient(instance.evolution_api_url, instance.evolution_api_key)

    try {
      let result

      if (tipo === 'image' && midiaUrl) {
        result = await client.sendImage(instance.instance_name, phone, midiaUrl, conteudo)
      } else if (tipo === 'document' && midiaUrl) {
        result = await client.sendDocument(instance.instance_name, phone, midiaUrl, conteudo, conteudo)
      } else {
        result = await client.sendText(instance.instance_name, phone, conteudo)
      }

      if (result?.key?.id) {
        // Salvar mensagem no banco
        await this.supabase.from('whatsapp_mensagens').insert({
          tenant_id: instance.tenant_id,
          instance_id: instanceId,
          lead_id: leadId ?? null,
          deal_id: dealId ?? null,
          tipo,
          direcao: 'sent',
          status: 'sent',
          conteudo,
          midia_url: midiaUrl ?? null,
        })

        return { success: true, messageId: result.key.id }
      }

      return { success: false, error: 'Falha ao enviar mensagem' }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }
    }
  }

  /** Pegar historico de mensagens de um contato */
  async getMessages(
    tenantId: string,
    telefone: string,
    limit = 50
  ): Promise<WhatsAppMessage[]> {
    const { data: contato } = await this.supabase
      .from('whatsapp_contatos')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('telefone', telefone)
      .single()

    if (!contato) return []

    const { data } = await this.supabase
      .from('whatsapp_mensagens')
      .select('*')
      .eq('contato_id', contato.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    return (data ?? []) as WhatsAppMessage[]
  }

  /** Salvar ou atualizar contato */
  async upsertContato(tenantId: string, telefone: string, nome?: string): Promise<string> {
    const { data } = await this.supabase
      .from('whatsapp_contatos')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('telefone', formatPhoneNumber(telefone))
      .single()

    if (data) return data.id

    const { data: inserted } = await this.supabase
      .from('whatsapp_contatos')
      .insert({
        tenant_id: tenantId,
        telefone: formatPhoneNumber(telefone),
        nome: nome ?? null,
      })
      .select('id')
      .single()

    return inserted?.id ?? ''
  }

  /** Pegar templates do tenant */
  async getTemplates(tenantId: string): Promise<WhatsAppTemplate[]> {
    const { data } = await this.supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_ativo', true)
      .order('nome')
    return (data ?? []) as WhatsAppTemplate[]
  }

  /** Renderizar template com variaveis */
  renderTemplate(template: WhatsAppTemplate, vars: Record<string, string>): string {
    let content = template.conteudo
    for (const key of template.variaveis) {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), vars[key] ?? `{{${key}}}`)
    }
    return content
  }
}

export const whatsappProvider = new WhatsAppProvider()
