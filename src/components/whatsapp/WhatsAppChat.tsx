'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Search,
  MessageCircle,
  Send,
  FileText,
  Check,
  CheckCheck,
  Clock,
  Plus,
  X,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { whatsappProvider } from '@/lib/whatsapp-provider'

type Contato = {
  id: string
  telefone: string
  nome?: string
  whatsapp_id?: string
  avatar_url?: string
  last_seen?: string
  tags: string[]
}

type Mensagem = {
  id: string
  tipo: string
  direcao: 'sent' | 'received'
  status: string
  conteudo: string
  midia_url?: string
  created_at: string
}

type Instance = {
  id: string
  instance_name: string
  status: string
  phone_number?: string
}

export function WhatsAppChat() {
  const supabase = createClient()
  const { toast } = useToast()

  const [tenantId, setTenantId] = useState<string | null>(null)
  const [instances, setInstances] = useState<Instance[]>([])
  const [activeInstance, setActiveInstance] = useState<Instance | null>(null)
  const [contacts, setContacts] = useState<Contato[]>([])
  const [activeContact, setActiveContact] = useState<Contato | null>(null)
  const [messages, setMessages] = useState<Mensagem[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showNewChat, setShowNewChat] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newChatMsg, setNewChatMsg] = useState('')

  useEffect(() => {
    loadInitial()
  }, [])

  useEffect(() => {
    if (activeInstance) loadContacts()
  }, [activeInstance])

  useEffect(() => {
    if (activeContact && tenantId) {
      loadMessages()
      const interval = setInterval(() => loadMessages(), 3000)
      return () => clearInterval(interval)
    }
  }, [activeContact, tenantId])

  async function loadInitial() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: tu } = await supabase
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (tu) setTenantId(tu.tenant_id)

    const { data } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .order('created_at', { ascending: false })

    if (data?.length) {
      setInstances(data)
      setActiveInstance(data[0])
    }
    setLoading(false)
  }

  async function loadContacts() {
    if (!activeInstance) return
    const { data } = await supabase
      .from('whatsapp_contatos')
      .select('*')
      .eq('instance_id', activeInstance.id)
      .order('last_seen', { ascending: false })
      .limit(100)

    setContacts(data ?? [])
  }

  async function loadMessages() {
    if (!activeContact || !tenantId) return
    const msgs = await whatsappProvider.getMessages(tenantId, activeContact.telefone, 100)
    setMessages(msgs as Mensagem[])
  }

  async function sendMessage() {
    if (!newMessage.trim() || !activeContact || !activeInstance) return
    setSending(true)

    const result = await whatsappProvider.sendMessage({
      instanceId: activeInstance.id,
      telefone: activeContact.telefone,
      conteudo: newMessage.trim(),
    })

    if (result.success) {
      setNewMessage('')
      await loadMessages()
    } else {
      toast({ title: 'Erro ao enviar', description: result.error, variant: 'destructive' })
    }
    setSending(false)
  }

  async function startNewChat() {
    if (!newPhone.trim()) return
    if (!tenantId) {
      toast({ title: 'Erro', description: 'Tenant não identificado', variant: 'destructive' })
      return
    }
    if (!activeInstance) {
      toast({ title: 'Nenhuma instância conectada', description: 'Conecte um WhatsApp primeiro', variant: 'destructive' })
      return
    }

    const contatoId = await whatsappProvider.upsertContato(tenantId, newPhone.trim())

    const { data: contato } = await supabase
      .from('whatsapp_contatos')
      .select('*')
      .eq('id', contatoId)
      .single()

    if (contato) {
      setActiveContact(contato)
      setShowNewChat(false)
      setNewPhone('')

      // Se havia mensagem, enviar
      if (newChatMsg.trim()) {
        setNewMessage(newChatMsg.trim())
        setTimeout(() => sendMessage(), 300)
      }
    }
  }

  const filteredContacts = contacts.filter(c =>
    !search ||
    c.nome?.toLowerCase().includes(search.toLowerCase()) ||
    c.telefone.includes(search)
  )

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Carregando WhatsApp...</div>
  }

  if (!instances.length) {
    return (
      <Card>
        <Card className="py-8 text-center">
          <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">WhatsApp não configurado</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Configure uma instância WhatsApp na área de administração.
          </p>
          <Button asChild>
            <a href="/dashboard/admin/whatsapp">Configurar WhatsApp</a>
          </Button>
        </Card>
      </Card>
    )
  }

  return (
    <>
      <div className="flex h-[600px] border rounded-lg overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 flex flex-col border-r bg-card">
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Conversas</h2>
              <Button size="sm" variant="ghost" onClick={() => setShowNewChat(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar contato..."
                className="pl-8 h-8 text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {instances.length > 1 && (
            <div className="flex border-b overflow-x-auto">
              {instances.map(inst => (
                <button
                  key={inst.id}
                  onClick={() => { setActiveInstance(inst); setActiveContact(null) }}
                  className={`px-3 py-1.5 text-xs whitespace-nowrap border-b-2 transition-colors ${
                    activeInstance?.id === inst.id
                      ? 'border-primary text-primary font-medium'
                      : 'border-transparent text-muted-foreground'
                  }`}
                >
                  {inst.phone_number || inst.instance_name}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {filteredContacts.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                {search ? 'Nenhum contato encontrado' : 'Nenhuma conversa ainda'}
              </div>
            ) : (
              filteredContacts.map(contact => (
                <button
                  key={contact.id}
                  onClick={() => setActiveContact(contact)}
                  className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-muted/50 transition-colors text-left ${
                    activeContact?.id === contact.id ? 'bg-muted/70' : ''
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {contact.nome?.[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {contact.nome || contact.telefone}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{contact.telefone}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat */}
        {activeContact ? (
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-card">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {activeContact.nome?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">
                  {activeContact.nome || activeContact.telefone}
                </p>
                <p className="text-xs text-muted-foreground">{activeContact.telefone}</p>
              </div>
              <Badge
                variant={activeInstance?.status === 'connected' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {activeInstance?.status === 'connected' ? '🟢 Online' : '🔴 Offline'}
              </Badge>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Nenhuma mensagem. Envie uma para começar!
                </div>
              ) : (
                messages.map(msg => {
                  const isMine = msg.direcao === 'sent'
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                          isMine
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-card border rounded-bl-md'
                        }`}
                      >
                        {msg.midia_url && (
                          <div className="mb-1">
                            {msg.tipo === 'image' && (
                              <img src={msg.midia_url} alt="" className="rounded-lg max-w-full max-h-48" />
                            )}
                            {msg.tipo === 'document' && (
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                <span className="underline">{msg.midia_url.split('/').pop()}</span>
                              </div>
                            )}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.conteudo}</p>
                        <div className={`flex items-center justify-end gap-1 mt-1 ${isMine ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                          <span className="text-[10px]">
                            {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isMine && (
                            msg.status === 'read' ? <CheckCheck className="h-3 w-3" /> :
                            msg.status === 'delivered' ? <CheckCheck className="h-3 w-3" /> :
                            <Check className="h-3 w-3" />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Input */}
            {activeInstance?.status === 'connected' ? (
              <div className="flex items-center gap-2 px-4 py-3 border-t bg-card">
                <Input
                  placeholder="Digite uma mensagem..."
                  className="flex-1"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                />
                <Button size="icon" onClick={sendMessage} disabled={sending || !newMessage.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 px-4 py-3 border-t bg-muted/50 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                WhatsApp desconectado —{' '}
                <a href="/dashboard/admin/whatsapp" className="underline text-primary">reconecte</a>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-muted/10">
            <div className="text-center">
              <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">Selecione uma conversa</p>
              <Button className="mt-3" onClick={() => setShowNewChat(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nova conversa
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* New chat dialog */}
      <Dialog open={showNewChat} onOpenChange={setShowNewChat}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conversa WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Telefone</label>
              <Input
                placeholder="(34) 99999-9999"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Primeira mensagem (opcional)</label>
              <Input
                placeholder="Digite a mensagem..."
                value={newChatMsg}
                onChange={e => setNewChatMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), startNewChat())}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewChat(false)}>
              Cancelar
            </Button>
            <Button onClick={startNewChat} disabled={!newPhone.trim()}>
              <Send className="h-4 w-4 mr-1" />
              Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
