/**
 * Evolution API Client
 * Documentacao: https://doc.evolution-api.com/
 */

export type EvolutionInstanceStatus = 'open' | 'close' | 'connect' | 'disconnect'

export type EvolutionMessageRequest = {
  number: string
  text?: string
  image?: string
  video?: string
  document?: string
  audio?: string
  caption?: string
  mentions?: string[]
  quotedMsgId?: string
  buttons?: Array<{ buttonText: { displayText: string } }>
  quotedMsg?: Record<string, unknown>
}

export type EvolutionMessageResponse = {
  key: {
    remoteJid: string
    fromMe: boolean
    id: string
    participant?: string
  }
  message?: Record<string, unknown>
  messageTimestamp?: string
  pushName?: string
  status?: string
}

export type EvolutionQRResponse = {
  qrcode?: {
    code: string
    base64?: string
  }
}

export class EvolutionApiClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = apiKey
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'apikey': this.apiKey,
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<{ data: T; status: number }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json()
    return { data, status: res.status }
  }

  // === INSTANCES ===

  /** Criar ou pegar instancia */
  async createInstance(instanceName: string): Promise<{ instance?: { instanceName: string; status: string } }> {
    const { data } = await this.request<{ instance?: { instanceName: string; status: string } }>('POST', '/instance/create', {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhookUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp`
        : undefined,
      webhookByEvents: true,
      webhookEvents: [
        'CONNECTION_UPDATE',
        'QRCODE_UPDATED',
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'SEND_MESSAGE',
      ],
    })
    return data
  }

  /** Conectar instancia (gera QR se necessario) */
  async connectInstance(instanceName: string): Promise<{ qrcode?: { code: string; base64?: string } }> {
    const { data } = await this.request<{ qrcode?: { code: string; base64?: string } }>('POST', `/instance/connect/${instanceName}`, {})
    return data
  }

  /** Status da instancia */
  async instanceStatus(instanceName: string): Promise<{ instance?: { status: string } }> {
    const { data } = await this.request<{ instance?: { status: string } }>('GET', `/instance/connectionState/${instanceName}`)
    return data
  }

  /** Desconectar */
  async disconnectInstance(instanceName: string): Promise<void> {
    await this.request('DELETE', `/instance/logout/${instanceName}`)
  }

  // === MESSAGES ===

  /** Enviar texto */
  async sendText(instanceName: string, number: string, text: string): Promise<EvolutionMessageResponse> {
    const { data } = await this.request<EvolutionMessageResponse>(
      'POST',
      `/message/sendText/${instanceName}`,
      { number, text }
    )
    return data
  }

  /** Enviar imagem com caption */
  async sendImage(
    instanceName: string,
    number: string,
    image: string,
    caption?: string
  ): Promise<EvolutionMessageResponse> {
    const { data } = await this.request<EvolutionMessageResponse>(
      'POST',
      `/message/sendMedia/${instanceName}`,
      { number, mediatype: 'image', media: image, caption }
    )
    return data
  }

  /** Enviar documento */
  async sendDocument(
    instanceName: string,
    number: string,
    document: string,
    fileName: string,
    caption?: string
  ): Promise<EvolutionMessageResponse> {
    const { data } = await this.request<EvolutionMessageResponse>(
      'POST',
      `/message/sendMedia/${instanceName}`,
      { number, mediatype: 'document', media: document, fileName, caption }
    )
    return data
  }

  /** Enviar buttons message */
  async sendButtons(
    instanceName: string,
    number: string,
    title: string,
    buttons: Array<{ buttonText: { displayText: string } }>,
    description?: string
  ): Promise<EvolutionMessageResponse> {
    const { data } = await this.request<EvolutionMessageResponse>(
      'POST',
      `/message/sendButtons/${instanceName}`,
      { number, title, description, buttons }
    )
    return data
  }

  // === WEBHOOK PAYLOADS ===

  parseWebhook(data: Record<string, unknown>): {
    event: string
    instance: string
    payload: Record<string, unknown>
  } | null {
    if (data.instanceName) {
      return {
        event: (data.event as string) ?? 'unknown',
        instance: data.instanceName as string,
        payload: (data.data as Record<string, unknown>) ?? {},
      }
    }
    return null
  }

  parseQRCode(qrdata: Array<{ qrcode?: { code?: string; base64?: string } }>): string | null {
    const qr = qrdata?.[0]?.qrcode
    return qr?.code ?? qr?.base64 ?? null
  }
}

export function formatPhoneNumber(phone: string): string {
  // Remove tudo exceto numeros
  const digits = phone.replace(/\D/g, '')

  // Se ja tem codigo do pais (55), retorna como esta
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits
  }

  // Adiciona 55 (Brasil)
  return '55' + digits
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  // Brasil: 55 + DDD (2) + numero (8 ou 9 digitos)
  return digits.length >= 10 && digits.length <= 13
}
