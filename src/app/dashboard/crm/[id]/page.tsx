'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  Phone,
  Mail,
  MessageSquare,
  Trash2,
  Calendar,
  User,
  Building,
  MapPin,
  DollarSign,
  Plus,
  Clock,
  CheckCircle2,
  Circle,
  X as XIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { TagsInput } from '@/components/crm/TagsInput'
import { TemplateMessageModal } from '@/components/crm/TemplateMessageModal'

type Lead = {
  id: string
  tenant_id?: string
  nome: string
  empresa?: string
  email?: string
  telefone?: string
  origem: string
  status: string
  endereco_cidade?: string
  score_engajamento?: number
  observacoes?: string
  tags?: string[]
  created_at: string
  updated_at?: string
}

const STATUS_OPTIONS = [
  { value: 'novo', label: 'Novo', color: 'bg-blue-100 text-blue-700' },
  { value: 'qualificado', label: 'Qualificado', color: 'bg-primary/10 text-primary' },
  { value: 'convertido', label: 'Convertido', color: 'bg-green-100 text-green-700' },
  { value: 'descarte', label: 'Descarte', color: 'bg-gray-100 text-gray-500' },
]

export default function LeadDetalhePage() {
  const params = useParams()
  const router = useRouter()
  const leadId = params.id as string
  const supabase = createClient()
  const { toast } = useToast()

  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [novaNota, setNovaNota] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [notas, setNotas] = useState<Array<{ id: string; texto: string; created_at: string }>>([])
  const [atividades, setAtividades] = useState<Array<{
    id: string
    tipo: string
    descricao: string
    data_vencimento?: string
    status: string
  }>>([])
  const [novaAtividade, setNovaAtividade] = useState({
    tipo: 'tarefa' as 'tarefa' | 'ligacao' | 'reuniao' | 'email' | 'whatsapp',
    descricao: '',
    data_vencimento: '',
  })

  useEffect(() => {
    async function carregar() {
      const { data, error } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('id', leadId)
        .single()

      if (error) {
        console.error(error)
        toast({ title: 'Erro ao carregar lead', variant: 'destructive' })
        router.push('/dashboard/crm')
        return
      }
      setLead(data)
      setTags(data?.tags ?? [])
      setLoading(false)

      // Carrega notas do localStorage
      const key = `lead_notes_${leadId}`
      const stored = localStorage.getItem(key)
      if (stored) setNotas(JSON.parse(stored))

      // Carrega atividades
      const { data: ats } = await supabase
        .from('crm_atividades')
        .select('*')
        .eq('lead_id', leadId)
        .order('data_vencimento', { ascending: true, nullsFirst: false })
      setAtividades(ats ?? [])
    }
    carregar()
  }, [leadId, router, supabase, toast])

  async function salvar() {
    if (!lead) return
    setSalvando(true)
    try {
      const { error } = await supabase
        .from('crm_leads')
        .update({
          nome: lead.nome,
          empresa: lead.empresa,
          email: lead.email,
          telefone: lead.telefone,
          status: lead.status,
          endereco_cidade: lead.endereco_cidade,
          score_engajamento: lead.score_engajamento,
          observacoes: lead.observacoes,
          tags,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)

      if (error) throw error
      toast({ title: '✅ Lead atualizado' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  async function deletar() {
    if (!lead) return
    if (!confirm(`Tem certeza que quer deletar ${lead.nome}?`)) return

    try {
      const { error } = await supabase.from('crm_leads').delete().eq('id', lead.id)
      if (error) throw error
      toast({ title: 'Lead deletado' })
      router.push('/dashboard/crm')
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  function adicionarNota() {
    if (!novaNota.trim() || !lead) return
    const nota = {
      id: Date.now().toString(),
      texto: novaNota,
      created_at: new Date().toISOString(),
    }
    const updated = [nota, ...notas]
    setNotas(updated)
    localStorage.setItem(`lead_notes_${lead.id}`, JSON.stringify(updated))
    setNovaNota('')
    toast({ title: '📝 Nota adicionada' })
  }

  function whatsappUrl() {
    if (!lead?.telefone) return null
    const num = lead.telefone.replace(/\D/g, '')
    return `https://wa.me/55${num}?text=${encodeURIComponent(`Olá ${lead.nome}, tudo bem?`)}`
  }

  async function adicionarAtividade() {
    if (!lead || !novaAtividade.descricao.trim()) return
    try {
      const { data, error } = await supabase
        .from('crm_atividades')
        .insert({
          tenant_id: lead.tenant_id,
          lead_id: lead.id,
          tipo: novaAtividade.tipo,
          descricao: novaAtividade.descricao,
          data_vencimento: novaAtividade.data_vencimento || null,
          status: 'pendente',
        })
        .select()
        .single()

      if (error) throw error
      setAtividades(prev => [...prev, data])
      setNovaAtividade({ tipo: 'tarefa', descricao: '', data_vencimento: '' })
      toast({ title: '✅ Atividade criada' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  async function toggleAtividade(id: string, novoStatus: string) {
    try {
      const { error } = await supabase
        .from('crm_atividades')
        .update({
          status: novoStatus,
          data_conclusao: novoStatus === 'concluida' ? new Date().toISOString() : null,
        })
        .eq('id', id)

      if (error) throw error
      setAtividades(prev =>
        prev.map(a => a.id === id ? { ...a, status: novoStatus } : a)
      )
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Carregando lead...</div>
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="p-8 text-center">Lead não encontrado.</div>
    )
  }

  const statusAtual = STATUS_OPTIONS.find(s => s.value === lead.status)

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard/crm">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={deletar} className="text-red-600 hover:text-red-700">
          <Trash2 className="h-4 w-4 mr-1" />
          Deletar
        </Button>
      </div>

      {/* Header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge className={statusAtual?.color}>
                  {statusAtual?.label}
                </Badge>
                <Badge variant="outline">{lead.origem}</Badge>
                <Badge variant="outline">Score: {lead.score_engajamento ?? 50}</Badge>
              </div>
              <h1 className="font-heading text-2xl font-bold text-dark">{lead.nome}</h1>
              {lead.empresa && (
                <p className="text-muted-foreground flex items-center gap-1 mt-1">
                  <Building className="h-4 w-4" />
                  {lead.empresa}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={salvar} disabled={salvando}>
                <Save className="h-4 w-4 mr-2" />
                {salvando ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {lead.telefone && (
              <a href={`tel:${lead.telefone}`}>
                <Button variant="outline" size="sm">
                  <Phone className="h-4 w-4 mr-1" />
                  {lead.telefone}
                </Button>
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`}>
                <Button variant="outline" size="sm">
                  <Mail className="h-4 w-4 mr-1" />
                  {lead.email}
                </Button>
              </a>
            )}
            {whatsappUrl() && (
              <a href={whatsappUrl()!} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700">
                  <MessageSquare className="h-4 w-4 mr-1" />
                  WhatsApp
                </Button>
              </a>
            )}
            {lead?.telefone && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const supabase = createClient()
                  const session = (await supabase.auth.getSession()).data.session
                  if (!session?.access_token) return
                  // Envia mensagem via Evolution API (salva no banco)
                  const res = await fetch('/api/whatsapp/send', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                      telefone: lead.telefone,
                      conteudo: `Olá ${lead.nome}, tudo bem? Vim do RadarCRM e gostaria de acompanhar sua obra.`,
                      leadId: lead.id,
                    }),
                  })
                  const result = await res.json()
                  if (result.success) {
                    toast({ title: '✅ Mensagem enviada via WhatsApp!' })
                    router.push('/dashboard/whatsapp')
                  } else {
                    toast({ title: 'Erro', description: result.error, variant: 'destructive' })
                  }
                }}
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Chat no Radar
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTemplateModalOpen(true)}
            >
              <MessageSquare className="h-4 w-4 mr-1" />
              Enviar template
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Nome</label>
                  <Input
                    value={lead.nome}
                    onChange={(e) => setLead({ ...lead, nome: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Empresa</label>
                  <Input
                    value={lead.empresa ?? ''}
                    onChange={(e) => setLead({ ...lead, empresa: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Email</label>
                  <Input
                    value={lead.email ?? ''}
                    onChange={(e) => setLead({ ...lead, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Telefone</label>
                  <Input
                    value={lead.telefone ?? ''}
                    onChange={(e) => setLead({ ...lead, telefone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Cidade</label>
                  <Input
                    value={lead.endereco_cidade ?? ''}
                    onChange={(e) => setLead({ ...lead, endereco_cidade: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Status</label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    value={lead.status}
                    onChange={(e) => setLead({ ...lead, status: e.target.value })}
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tags</label>
                <TagsInput value={tags} onChange={setTags} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Observações</label>
                <textarea
                  className="w-full min-h-[100px] px-3 py-2 rounded-md border border-input bg-background text-sm"
                  value={lead.observacoes ?? ''}
                  onChange={(e) => setLead({ ...lead, observacoes: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Notas / Histórico */}
          <Card>
            <CardHeader>
              <CardTitle>Notas & Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Adicionar nota..."
                  value={novaNota}
                  onChange={(e) => setNovaNota(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && adicionarNota()}
                />
                <Button onClick={adicionarNota}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                {notas.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma nota ainda.
                  </p>
                ) : (
                  notas.map((nota) => (
                    <div key={nota.id} className="border-l-2 border-primary/30 pl-3 py-1">
                      <p className="text-xs text-muted-foreground mb-1">
                        {new Date(nota.created_at).toLocaleString('pt-BR')}
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{nota.texto}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Atividades / Tarefas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Atividades & Tarefas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Form adicionar */}
              <div className="space-y-2 mb-4 p-3 rounded-lg bg-muted/30">
                <div className="flex gap-2">
                  <select
                    className="h-10 px-3 rounded-md border border-input bg-background text-sm"
                    value={novaAtividade.tipo}
                    onChange={(e) => setNovaAtividade({ ...novaAtividade, tipo: e.target.value as any })}
                  >
                    <option value="tarefa">📋 Tarefa</option>
                    <option value="ligacao">📞 Ligação</option>
                    <option value="reuniao">🤝 Reunião</option>
                    <option value="email">📧 Email</option>
                    <option value="whatsapp">💬 WhatsApp</option>
                  </select>
                  <Input
                    placeholder="Descrição..."
                    value={novaAtividade.descricao}
                    onChange={(e) => setNovaAtividade({ ...novaAtividade, descricao: e.target.value })}
                    className="flex-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    type="datetime-local"
                    value={novaAtividade.data_vencimento}
                    onChange={(e) => setNovaAtividade({ ...novaAtividade, data_vencimento: e.target.value })}
                    className="flex-1"
                  />
                  <Button onClick={adicionarAtividade} disabled={!novaAtividade.descricao.trim()}>
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                </div>
              </div>

              {/* Lista */}
              <div className="space-y-2">
                {atividades.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma atividade. Crie lembretes para nunca esquecer do lead!
                  </p>
                ) : (
                  atividades.map(a => {
                    const vencida = a.data_vencimento && new Date(a.data_vencimento) < new Date() && a.status === 'pendente'
                    return (
                      <div
                        key={a.id}
                        className={`flex items-start gap-3 p-2 rounded-lg border ${
                          a.status === 'concluida' ? 'bg-muted/30 opacity-60' :
                          vencida ? 'bg-red-50 border-red-200' : 'bg-paper'
                        }`}
                      >
                        <button
                          onClick={() => toggleAtividade(a.id, a.status === 'concluida' ? 'pendente' : 'concluida')}
                          className="mt-1 flex-shrink-0"
                        >
                          {a.status === 'concluida' ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${a.status === 'concluida' ? 'line-through' : ''}`}>
                            <span className="mr-2">{tipoEmoji(a.tipo)}</span>
                            {a.descricao}
                          </p>
                          {a.data_vencimento && (
                            <p className={`text-xs mt-1 ${vencida ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                              <Clock className="inline h-3 w-3 mr-1" />
                              {vencida ? '⚠️ Vencida · ' : ''}
                              {new Date(a.data_vencimento).toLocaleString('pt-BR')}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Metadados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div>
                <p className="text-muted-foreground">Criado em</p>
                <p className="font-medium">{new Date(lead.created_at).toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Atualizado em</p>
                <p className="font-medium">
                  {lead.updated_at ? new Date(lead.updated_at).toLocaleString('pt-BR') : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Score de engajamento</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${lead.score_engajamento ?? 50}%` }}
                    />
                  </div>
                  <span className="font-bold">{lead.score_engajamento ?? 50}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <TemplateMessageModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        lead={{
          nome: lead.nome,
          empresa: lead.empresa,
          telefone: lead.telefone,
          cidade: lead.endereco_cidade,
        }}
      />
    </div>
  )
}

function tipoEmoji(tipo: string) {
  const map: Record<string, string> = {
    tarefa: '📋',
    ligacao: '📞',
    reuniao: '🤝',
    email: '📧',
    whatsapp: '💬',
  }
  return map[tipo] ?? '📌'
}
