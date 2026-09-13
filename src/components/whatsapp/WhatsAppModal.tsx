'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { whatsappProvider, WhatsAppMessage, WhatsAppTemplate } from '@/lib/whatsapp-provider'
import { MessageSquare, Send, Loader2, Check, CheckCheck, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  open: boolean
  onClose: () => void
  telefone: string
  nome?: string
  leadId?: string
  dealId?: string
  tenantId: string
}

const STATUS_ICONS = {
  pending: <Loader2 className="h-3 w-3 animate-spin" />,
  sent: <Check className="h-3 w-3" />,
  delivered: <CheckCheck className="h-3 w-3" />,
  read: <CheckCheck className="h-3 w-3 text-blue-500" />,
  failed: <AlertCircle className="h-3 w-3 text-red-500" />,
}

const STATUS_LABELS = {
  pending: 'Enviando...',
  sent: 'Enviado',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Falhou',
}

export function WhatsAppModal({ open, onClose, telefone, nome, leadId, dealId, tenantId }: Props) {
  const [conteudo, setConteudo] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    loadHistory()
    loadTemplates()
  }, [open, telefone])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadHistory = async () => {
    setLoadingHistory(true)
    const msgs = await whatsappProvider.getMessages(tenantId, telefone)
    setMessages(msgs)
    setLoadingHistory(false)
  }

  const loadTemplates = async () => {
    const tmpls = await whatsappProvider.getTemplates(tenantId)
    setTemplates(tmpls)
  }

  const applyTemplate = (template: WhatsAppTemplate) => {
    setSelectedTemplate(template.id)
    setTemplateVars({})
    setConteudo(template.conteudo)
  }

  const handleSend = async () => {
    if (!conteudo.trim()) return

    setSending(true)
    setError(null)

    const instance = await whatsappProvider.getActiveInstance(tenantId)
    if (!instance) {
      setError('WhatsApp nao configurado. Configure em Configuracoes > WhatsApp.')
      setSending(false)
      return
    }

    const result = await whatsappProvider.sendMessage({
      instanceId: instance.id,
      telefone,
      conteudo: conteudo.trim(),
      leadId,
      dealId,
    })

    if (result.success) {
      setConteudo('')
      setSelectedTemplate(null)
      await loadHistory()
    } else {
      setError(result.error ?? 'Erro desconhecido')
    }

    setSending(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            WhatsApp
            {nome && <span className="font-normal text-muted-foreground">— {nome}</span>}
          </DialogTitle>
          {telefone && (
            <p className="text-sm text-muted-foreground">{telefone}</p>
          )}
        </DialogHeader>

        {/* Histrico de mensagens */}
        <div className="h-64 overflow-y-auto border rounded-lg p-3 space-y-3 bg-slate-50">
          {loadingHistory ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma mensagem ainda.<br />Use os templates ou escreva uma.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direcao === 'sent' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.direcao === 'sent'
                      ? 'bg-green-600 text-white'
                      : 'bg-white border text-gray-800'
                  }`}
                >
                  <p>{msg.conteudo}</p>
                  <div className={`flex items-center gap-1 mt-1 text-xs ${
                    msg.direcao === 'sent' ? 'text-green-100' : 'text-muted-foreground'
                  }`}>
                    {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                    {msg.direcao === 'sent' && STATUS_ICONS[msg.status]}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Templates */}
        {templates.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-muted-foreground">Templates:</span>
            {templates.slice(0, 4).map((t) => (
              <Badge
                key={t.id}
                variant={selectedTemplate === t.id ? 'default' : 'outline'}
                className="text-xs cursor-pointer"
                onClick={() => applyTemplate(t)}
              >
                {t.nome}
              </Badge>
            ))}
          </div>
        )}

        {/* Campo de mensagem */}
        <Textarea
          placeholder="Digite sua mensagem..."
          value={conteudo}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setConteudo(e.target.value)}
          className="min-h-20 resize-none"
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
        />

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button
            onClick={handleSend}
            disabled={!conteudo.trim() || sending}
            className="bg-green-600 hover:bg-green-700"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
