'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  Circle,
  X,
  GripVertical,
} from 'lucide-react'

// ============================================================================
// TIPOS
// ============================================================================

type Atividade = {
  id: string
  tenant_id: string
  lead_id?: string
  deal_id?: string
  tipo: string
  descricao: string
  data_vencimento?: string
  data_conclusao?: string | null
  responsavel_id?: string
  status: string
  created_at: string
  leads?: { nome: string }
  deals?: { titulo: string }
}

type Responsavel = {
  id: string
  nome: string
}

const TIPO_OPTIONS = [
  { value: 'tarefa', label: '📋 Tarefa', color: 'bg-blue-100 text-blue-700' },
  { value: 'ligacao', label: '📞 Ligação', color: 'bg-green-100 text-green-700' },
  { value: 'reuniao', label: '🤝 Reunião', color: 'bg-purple-100 text-purple-700' },
  { value: 'email', label: '📧 Email', color: 'bg-orange-100 text-orange-700' },
  { value: 'whatsapp', label: '💬 WhatsApp', color: 'bg-green-100 text-green-700' },
]

const STATUS_COLORS: Record<string, string> = {
  pendente: 'border-l-yellow-500',
  concluida: 'border-l-green-500 opacity-60',
  cancelada: 'border-l-gray-400 opacity-40',
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function CalendarioPage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([])
  const [loading, setLoading] = useState(true)
  const [tenantId, setTenantId] = useState<string | null>(null)

  // Data atual
  const [dataAtual, setDataAtual] = useState(new Date())
  const [mes, setMes] = useState(dataAtual.getMonth())
  const [ano, setAno] = useState(dataAtual.getFullYear())

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [atividadeEditando, setAtividadeEditando] = useState<Atividade | null>(null)
  const [dataSelecionada, setDataSelecionada] = useState<string | null>(null)

  // Semana selecionada para ver detalhes
  const [semanaExpandida, setSemanaExpandida] = useState<number | null>(null)

  useEffect(() => {
    carregar()
  }, [mes, ano])

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

      // Carregar atividades do mês
      const inicioMes = `${ano}-${String(mes + 1).padStart(2, '0')}-01`
      const fimMes = new Date(ano, mes + 1, 0).toISOString().split('T')[0]

      const { data: ativData } = await supabase
        .from('crm_atividades')
        .select(`
          *,
          leads:nome,
          deals:titulo
        `)
        .eq('tenant_id', tu.tenant_id)
        .gte('data_vencimento', inicioMes)
        .lte('data_vencimento', fimMes)
        .order('data_vencimento', { ascending: true })

      // Também carregar atividades sem data (pendentes)
      const { data: pendentes } = await supabase
        .from('crm_atividades')
        .select(`
          *,
          leads:nome,
          deals:titulo
        `)
        .eq('tenant_id', tu.tenant_id)
        .is('data_vencimento', null)
        .eq('status', 'pendente')

      // Carregar responsáveis
      const { data: users } = await supabase
        .from('tenant_users')
        .select('id, nome')
        .eq('tenant_id', tu.tenant_id)
        .eq('ativo', true)

      setAtividades([...(ativData ?? []), ...(pendentes ?? [])])
      setResponsaveis(users ?? [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  // Navegação de mês
  function mesAnterior() {
    if (mes === 0) {
      setMes(11)
      setAno(ano - 1)
    } else {
      setMes(mes - 1)
    }
  }

  function proximoMes() {
    if (mes === 11) {
      setMes(0)
      setAno(ano + 1)
    } else {
      setMes(mes + 1)
    }
  }

  function irParaHoje() {
    const hoje = new Date()
    setMes(hoje.getMonth())
    setAno(hoje.getFullYear())
  }

  // Gerar calendário
  function gerarCalendario() {
    const primeiroDia = new Date(ano, mes, 1)
    const ultimoDia = new Date(ano, mes + 1, 0)
    const diasNoMes = ultimoDia.getDate()
    const diaSemanaPrimeiro = primeiroDia.getDay()

    const semanas: Array<Array<{ dia: number | null; dateStr: string }>> = []
    let semana: Array<{ dia: number | null; dateStr: string }> = []

    // Preencher dias vazios antes do primeiro dia
    for (let i = 0; i < diaSemanaPrimeiro; i++) {
      semana.push({ dia: null, dateStr: '' })
    }

    // Preencher dias do mês
    for (let dia = 1; dia <= diasNoMes; dia++) {
      const dateStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      semana.push({ dia, dateStr })

      if (semana.length === 7) {
        semanas.push(semana)
        semana = []
      }
    }

    // Preencher dias vazios depois do último dia
    if (semana.length > 0) {
      while (semana.length < 7) {
        semana.push({ dia: null, dateStr: '' })
      }
      semanas.push(semana)
    }

    return semanas
  }

  // Filtrar atividades por data
  function atividadesDoDia(dateStr: string) {
    return atividades.filter(a => {
      if (!a.data_vencimento) return false
      return a.data_vencimento.startsWith(dateStr)
    })
  }

  // Atividades pendentes (sem data)
  function atividadesPendentes() {
    return atividades.filter(a => !a.data_vencimento)
  }

  // Toggle atividade
  async function toggleAtividade(atividade: Atividade) {
    const novoStatus = atividade.status === 'concluida' ? 'pendente' : 'concluida'

    const { error } = await supabase
      .from('crm_atividades')
      .update({
        status: novoStatus,
        data_conclusao: novoStatus === 'concluida' ? new Date().toISOString() : null,
      })
      .eq('id', atividade.id)

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    } else {
      setAtividades(prev =>
        prev.map(a => a.id === atividade.id
          ? { ...a, status: novoStatus, data_conclusao: novoStatus === 'concluida' ? new Date().toISOString() : null }
          : a
        )
      )
    }
  }

  // Modal
  function novaAtividade(data?: string) {
    setAtividadeEditando(null)
    setDataSelecionada(data || null)
    setModalOpen(true)
  }

  function editarAtividade(atividade: Atividade) {
    setAtividadeEditando(atividade)
    setDataSelecionada(atividade.data_vencimento?.split('T')[0] || null)
    setModalOpen(true)
  }

  function aoSalvar(atividade: Atividade) {
    if (atividadeEditando) {
      setAtividades(prev => prev.map(a => a.id === atividade.id ? atividade : a))
    } else {
      setAtividades(prev => [...prev, atividade])
    }
    setModalOpen(false)
  }

  async function deletarAtividade(id: string) {
    if (!confirm('Deletar esta atividade?')) return

    const { error } = await supabase.from('crm_atividades').delete().eq('id', id)
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    } else {
      setAtividades(prev => prev.filter(a => a.id !== id))
      toast({ title: 'Atividade deletada' })
    }
  }

  // Drag to reschedule (simplificado)
  function moverAtividade(atividade: Atividade, novaData: string) {
    setAtividades(prev =>
      prev.map(a => a.id === atividade.id
        ? { ...a, data_vencimento: novaData + 'T12:00:00Z' }
        : a
      )
    )

    // Persistir
    supabase
      .from('crm_atividades')
      .update({ data_vencimento: novaData + 'T12:00:00Z' })
      .eq('id', atividade.id)
      .then(({ error }) => {
        if (error) {
          toast({ title: 'Erro ao mover', description: error.message, variant: 'destructive' })
          carregar()
        } else {
          toast({ title: 'Atividade movida' })
        }
      })
  }

  const calendario = gerarCalendario()
  const hoje = new Date()
  const ehMesAtual = hoje.getMonth() === mes && hoje.getFullYear() === ano

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 lg:p-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold text-dark flex items-center gap-2">
              <CalendarIcon className="h-6 w-6 text-primary" />
              Calendário
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {atividades.filter(a => a.status === 'pendente').length} atividades pendentes
              {atividadesPendentes().length > 0 && ` · ${atividadesPendentes().length} sem data`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={irParaHoje}>
              Hoje
            </Button>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={mesAnterior}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium min-w-[140px] text-center">
                {MESES[mes]} {ano}
              </span>
              <Button variant="ghost" size="icon" onClick={proximoMes}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => novaAtividade()} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Nova
            </Button>
          </div>
        </div>
      </div>

      {/* Calendário */}
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {/* Dias da semana */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DIAS_SEMANA.map((dia, i) => (
            <div
              key={dia}
              className={`text-center text-sm font-medium py-2 ${
                i === 0 || i === 6 ? 'text-muted-foreground' : ''
              }`}
            >
              {dia}
            </div>
          ))}
        </div>

        {/* Grid do calendário */}
        <div className="grid grid-cols-7 gap-1">
          {calendario.flat().map((cell, idx) => {
            const ehHoje = cell.dia !== null &&
              ehMesAtual &&
              cell.dia === hoje.getDate()

            const dayAtividades = cell.dia ? atividadesDoDia(cell.dateStr) : []

            return (
              <div
                key={idx}
                className={`
                  min-h-[100px] rounded-lg border p-1 transition-colors
                  ${cell.dia ? 'bg-background cursor-pointer hover:bg-muted/50' : 'bg-muted/20'}
                  ${ehHoje ? 'ring-2 ring-primary ring-inset' : ''}
                `}
                onClick={() => cell.dia && novaAtividade(cell.dateStr)}
              >
                {cell.dia && (
                  <>
                    <div className={`text-sm font-medium p-1 ${
                      ehHoje ? 'text-primary' : ''
                    }`}>
                      {cell.dia}
                    </div>
                    <div className="space-y-1">
                      {dayAtividades.slice(0, 3).map(ativ => {
                        const tipoInfo = TIPO_OPTIONS.find(t => t.value === ativ.tipo)
                        const vencida = new Date(ativ.data_vencimento!) < new Date() && ativ.status === 'pendente'

                        return (
                          <div
                            key={ativ.id}
                            className={`
                              text-xs p-1 rounded border-l-2 truncate cursor-pointer
                              ${STATUS_COLORS[ativ.status]}
                              ${vencida ? 'bg-red-50 text-red-700 border-l-red-500' : 'bg-card'}
                              ${ativ.status === 'concluida' ? 'line-through' : ''}
                            `}
                            onClick={(e) => {
                              e.stopPropagation()
                              editarAtividade(ativ)
                            }}
                            title={ativ.descricao}
                          >
                            <span className="mr-1">
                              {ativ.status === 'concluida' ? (
                                <CheckCircle2 className="h-3 w-3 inline text-green-600" />
                              ) : (
                                <Circle className="h-3 w-3 inline" />
                              )}
                            </span>
                            {ativ.descricao.substring(0, 20)}
                            {ativ.descricao.length > 20 && '...'}
                          </div>
                        )
                      })}
                      {dayAtividades.length > 3 && (
                        <div className="text-xs text-muted-foreground text-center">
                          +{dayAtividades.length - 3} mais
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Atividades sem data */}
        {atividadesPendentes().length > 0 && (
          <div className="mt-6">
            <h3 className="font-medium text-sm text-muted-foreground mb-2">
              Sem data definida ({atividadesPendentes().length})
            </h3>
            <div className="space-y-2">
              {atividadesPendentes().slice(0, 5).map(ativ => (
                <div
                  key={ativ.id}
                  className={`flex items-center gap-3 p-2 rounded-lg bg-card border-l-4 ${STATUS_COLORS[ativ.status]}`}
                >
                  <button
                    onClick={() => toggleAtividade(ativ)}
                    className="flex-shrink-0"
                  >
                    {ativ.status === 'concluida' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${ativ.status === 'concluida' ? 'line-through text-muted-foreground' : ''}`}>
                      {ativ.descricao}
                    </p>
                    {ativ.leads?.nome && (
                      <p className="text-xs text-muted-foreground">
                        Lead: {ativ.leads.nome}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => editarAtividade(ativ)}
                    >
                      <Clock className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-600"
                      onClick={() => deletarAtividade(ativ.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && tenantId && (
        <AtividadeModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={aoSalvar}
          atividade={atividadeEditando}
          tenantId={tenantId}
          dataInicial={dataSelecionada}
          responsaveis={responsaveis}
        />
      )}
    </div>
  )
}

// ============================================================================
// COMPONENTE: MODAL DE ATIVIDADE
// ============================================================================

type AtividadeModalProps = {
  open: boolean
  onClose: () => void
  onSave: (atividade: Atividade) => void
  atividade: Atividade | null
  tenantId: string
  dataInicial: string | null
  responsaveis: Responsavel[]
}

function AtividadeModal({
  open,
  onClose,
  onSave,
  atividade,
  tenantId,
  dataInicial,
  responsaveis,
}: AtividadeModalProps) {
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    tipo: 'tarefa',
    descricao: '',
    data_vencimento: '',
    responsavel_id: '',
    lead_id: '',
  })

  useEffect(() => {
    if (atividade) {
      setForm({
        tipo: atividade.tipo,
        descricao: atividade.descricao,
        data_vencimento: atividade.data_vencimento?.split('T')[0] || '',
        responsavel_id: atividade.responsavel_id || '',
        lead_id: atividade.lead_id || '',
      })
    } else {
      setForm({
        tipo: 'tarefa',
        descricao: '',
        data_vencimento: dataInicial || '',
        responsavel_id: '',
        lead_id: '',
      })
    }
  }, [atividade, dataInicial])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.descricao.trim()) {
      toast({ title: 'Erro', description: 'Descrição é obrigatória', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      const payload = {
        tenant_id: tenantId,
        tipo: form.tipo,
        descricao: form.descricao.trim(),
        data_vencimento: form.data_vencimento ? `${form.data_vencimento}T12:00:00Z` : null,
        responsavel_id: form.responsavel_id || null,
        lead_id: form.lead_id || null,
        status: 'pendente',
      }

      let result
      if (atividade?.id) {
        result = await supabase
          .from('crm_atividades')
          .update(payload)
          .eq('id', atividade.id)
          .select()
          .single()
      } else {
        result = await supabase
          .from('crm_atividades')
          .insert(payload)
          .select()
          .single()
      }

      if (result.error) throw result.error

      toast({ title: atividade?.id ? 'Atividade atualizada' : 'Atividade criada' })
      onSave(result.data)
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {atividade?.id ? 'Editar Atividade' : 'Nova Atividade'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4">
          {/* Tipo */}
          <div className="space-y-2">
            <Label>Tipo</Label>
            <div className="grid grid-cols-5 gap-2">
              {TIPO_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`
                    p-2 rounded-lg border text-center text-sm transition-colors
                    ${form.tipo === opt.value
                      ? 'border-primary bg-primary/10'
                      : 'border-input hover:bg-muted/50'
                    }
                  `}
                  onClick={() => setForm(f => ({ ...f, tipo: opt.value }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição *</Label>
            <textarea
              id="descricao"
              className="w-full min-h-[80px] px-3 py-2 rounded-md border border-input bg-background text-sm"
              placeholder="O que precisa ser feito..."
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              required
            />
          </div>

          {/* Data */}
          <div className="space-y-2">
            <Label htmlFor="data">Data de Vencimento</Label>
            <Input
              id="data"
              type="date"
              value={form.data_vencimento}
              onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))}
            />
          </div>

          {/* Responsável */}
          <div className="space-y-2">
            <Label htmlFor="responsavel">Responsável</Label>
            <select
              id="responsavel"
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={form.responsavel_id}
              onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}
            >
              <option value="">Sem responsável</option>
              {responsaveis.map(r => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </select>
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : atividade?.id ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
