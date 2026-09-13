'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  DollarSign,
  Calendar,
  User,
  Target,
  Trash2,
  Plus,
  Clock,
  CheckCircle2,
  Circle,
  X,
  MessageSquare,
  Briefcase,
  Phone,
  Mail,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

type Deal = {
  id: string
  tenant_id?: string
  lead_id?: string
  titulo: string
  estagio: string
  valor_estimado?: number
  valor_final?: number
  probabilidade: number
  data_fechamento_prevista?: string
  data_fechamento_real?: string
  motivo_perda?: string
  responsavel_id?: string
  created_at: string
  updated_at?: string
}

type Lead = {
  id: string
  nome: string
  empresa?: string
  email?: string
  telefone?: string
}

type Estagio = {
  id: string
  nome: string
  cor: string
  probabilidade_padrao: number
}

type Atividade = {
  id: string
  tipo: string
  descricao: string
  data_vencimento?: string
  status: string
}

export default function DealDetalhePage() {
  const params = useParams()
  const router = useRouter()
  const dealId = params.id as string
  const supabase = createClient()
  const { toast } = useToast()

  const [deal, setDeal] = useState<Deal | null>(null)
  const [lead, setLead] = useState<Lead | null>(null)
  const [estagios, setEstagios] = useState<Estagio[]>([])
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)

  // Form nova atividade
  const [novaAtividade, setNovaAtividade] = useState({
    tipo: 'tarefa' as 'tarefa' | 'ligacao' | 'reuniao' | 'email' | 'whatsapp',
    descricao: '',
    data_vencimento: '',
  })

  useEffect(() => {
    carregar()
  }, [dealId])

  async function carregar() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: tu } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()

      if (!tu) return
      setTenantId(tu.tenant_id)

      // Deal
      const { data: dealData } = await supabase
        .from('crm_deals')
        .select('*')
        .eq('id', dealId)
        .single()

      if (dealData) {
        setDeal(dealData)

        // Lead (se existir)
        if (dealData.lead_id) {
          const { data: leadData } = await supabase
            .from('crm_leads')
            .select('*')
            .eq('id', dealData.lead_id)
            .single()
          setLead(leadData)
        }

        // Estágios
        const { data: stages } = await supabase
          .from('crm_pipeline_estagios')
          .select('*')
          .eq('tenant_id', tu.tenant_id)
          .order('ordem', { ascending: true })
        setEstagios(stages ?? [])

        // Atividades
        const { data: ativs } = await supabase
          .from('crm_atividades')
          .select('*')
          .eq('deal_id', dealId)
          .order('data_vencimento', { ascending: true, nullsFirst: false })
        setAtividades(ativs ?? [])
      }
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  async function salvar() {
    if (!deal) return
    setSalvando(true)
    try {
      const { error } = await supabase
        .from('crm_deals')
        .update({
          titulo: deal.titulo,
          estagio: deal.estagio,
          valor_estimado: deal.valor_estimado,
          probabilidade: deal.probabilidade,
          data_fechamento_prevista: deal.data_fechamento_prevista || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deal.id)

      if (error) throw error
      toast({ title: 'Deal atualizado' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  async function deletar() {
    if (!deal) return
    if (!confirm(`Tem certeza que quer deletar ${deal.titulo}?`)) return

    try {
      const { error } = await supabase.from('crm_deals').delete().eq('id', deal.id)
      if (error) throw error
      toast({ title: 'Deal deletado' })
      router.push('/dashboard/crm/quadro')
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  async function adicionarAtividade() {
    if (!deal || !novaAtividade.descricao.trim()) return
    try {
      const { data, error } = await supabase
        .from('crm_atividades')
        .insert({
          tenant_id: deal.tenant_id,
          deal_id: deal.id,
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
      toast({ title: 'Atividade criada' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  async function toggleAtividade(id: string, status: string) {
    const novoStatus = status === 'concluida' ? 'pendente' : 'concluida'
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

  // Estagio atual
  const estagioAtual = estagios.find(e => e.nome === deal?.estagio)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Carregando deal...</div>
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="p-8 text-center">Deal não encontrado.</div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard/crm/quadro">
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
                <Badge
                  style={{ backgroundColor: estagioAtual?.cor + '20', color: estagioAtual?.cor, borderColor: estagioAtual?.cor }}
                  className="border"
                >
                  {estagioAtual?.nome || deal.estagio}
                </Badge>
                <Badge variant="outline">{deal.probabilidade}% prob.</Badge>
              </div>
              <h1 className="font-heading text-2xl font-bold text-dark">{deal.titulo}</h1>
              {lead && (
                <Link href={`/dashboard/crm/${lead.id}`} className="text-muted-foreground hover:text-primary">
                  <p className="flex items-center gap-1 mt-1">
                    <Briefcase className="h-4 w-4" />
                    {lead.nome} {lead.empresa ? `(${lead.empresa})` : ''}
                  </p>
                </Link>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={salvar} disabled={salvando}>
                <Save className="h-4 w-4 mr-2" />
                {salvando ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>

          {lead && (
            <div className="flex gap-2 flex-wrap mt-4">
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
              {lead.telefone && (
                <a
                  href={`https://wa.me/55${lead.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${lead.nome}!`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="outline" size="sm" className="text-green-600">
                    <MessageSquare className="h-4 w-4 mr-1" />
                    WhatsApp
                  </Button>
                </a>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Deal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground">Título</label>
                <Input
                  value={deal.titulo}
                  onChange={(e) => setDeal({ ...deal, titulo: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Estágio</label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    value={deal.estagio}
                    onChange={(e) => {
                      const novoEstagio = estagios.find(s => s.nome === e.target.value)
                      setDeal({
                        ...deal,
                        estagio: e.target.value,
                        probabilidade: novoEstagio?.probabilidade_padrao ?? deal.probabilidade,
                      })
                    }}
                  >
                    {estagios.map(s => (
                      <option key={s.id} value={s.nome}>{s.nome} ({s.probabilidade_padrao}%)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Probabilidade (%)</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={deal.probabilidade}
                    onChange={(e) => setDeal({ ...deal, probabilidade: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Valor Estimado (R$)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="pl-9"
                      value={deal.valor_estimado || ''}
                      onChange={(e) => setDeal({ ...deal, valor_estimado: parseFloat(e.target.value) || undefined })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Fechamento Previsto</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="date"
                      className="pl-9"
                      value={deal.data_fechamento_prevista?.split('T')[0] || ''}
                      onChange={(e) => setDeal({ ...deal, data_fechamento_prevista: e.target.value || undefined })}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Atividades */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Atividades
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
                    Nenhuma atividade. Adicione tarefas, ligações e reuniões!
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
                          onClick={() => toggleAtividade(a.id, a.status)}
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
                              {vencida ? 'Vencida · ' : ''}
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
              <CardTitle className="text-sm">Métricas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Valor Estimado</p>
                <p className="text-xl font-bold text-green-600">
                  {deal.valor_estimado
                    ? `R$ ${deal.valor_estimado.toLocaleString('pt-BR')}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Probabilidade Ponderada</p>
                <p className="text-xl font-bold">
                  R$ {deal.valor_estimado
                    ? ((deal.valor_estimado * deal.probabilidade) / 100).toLocaleString('pt-BR')
                    : '0'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Probabilidade</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${deal.probabilidade}%` }}
                    />
                  </div>
                  <span className="font-bold">{deal.probabilidade}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Metadados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div>
                <p className="text-muted-foreground">Criado em</p>
                <p className="font-medium">{new Date(deal.created_at).toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Atualizado em</p>
                <p className="font-medium">
                  {deal.updated_at ? new Date(deal.updated_at).toLocaleString('pt-BR') : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Dias desde criação</p>
                <p className="font-medium">
                  {Math.floor((new Date().getTime() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24))} dias
                </p>
              </div>
            </CardContent>
          </Card>

          {lead && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Lead Vinculado</CardTitle>
              </CardHeader>
              <CardContent>
                <Link href={`/dashboard/crm/${lead.id}`} className="block hover:text-primary">
                  <p className="font-medium">{lead.nome}</p>
                  {lead.empresa && <p className="text-sm text-muted-foreground">{lead.empresa}</p>}
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
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
