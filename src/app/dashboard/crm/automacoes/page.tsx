'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Zap,
  Plus,
  Trash2,
  Edit,
  ToggleLeft,
  ToggleRight,
  Activity,
  Bell,
  ArrowRight,
  Target,
  Clock,
} from 'lucide-react'

// ============================================================================
// TIPOS
// ============================================================================

type Automacao = {
  id: string
  tenant_id: string
  nome: string
  descricao?: string
  gatilho_tipo: string
  gatilho_config: Record<string, any>
  acao_tipo: string
  acao_config: Record<string, any>
  ativo: boolean
  created_at: string
}

const GATILHO_OPTIONS = [
  { value: 'deal_entrou_estagio', label: 'Deal entrou no estágio', icon: Target },
  { value: 'deal_saiu_estagio', label: 'Deal saiu do estágio', icon: Target },
  { value: 'lead_novo', label: 'Novo lead criado', icon: Activity },
  { value: 'lead_status_trocou', label: 'Status do lead mudou', icon: Activity },
  { value: 'atividade_vencida', label: 'Atividade vencida', icon: Clock },
  { value: 'deal_sem_atividade_7dias', label: 'Deal sem atividade (7 dias)', icon: Clock },
]

const GATILHO_CONFIG_LABELS: Record<string, string> = {
  deal_entrou_estagio: 'Estágio',
  deal_saiu_estagio: 'Estágio',
}

const ACAO_OPTIONS = [
  { value: 'enviar_whatsapp', label: 'Enviar WhatsApp', icon: Bell },
  { value: 'criar_atividade', label: 'Criar Atividade', icon: Activity },
  { value: 'notificar_responsavel', label: 'Notificar Responsável', icon: Bell },
  { value: 'mover_deal_estagio', label: 'Mover Deal para Estágio', icon: ArrowRight },
  { value: 'atualizar_probabilidade', label: 'Atualizar Probabilidade', icon: Target },
]

const ACAO_CONFIG_LABELS: Record<string, string> = {
  criar_atividade: 'Tipo de Atividade',
  mover_deal_estagio: 'Estágio Destino',
  atualizar_probabilidade: 'Probabilidade (%)',
}

const GATILHO_ESTAGIOS = ['Novo', 'Contato', 'Proposta', 'Negociação', 'Fechamento', 'Ganho', 'Perdido']

const ACAO_TIPOS_ATIVIDADE = [
  { value: 'tarefa', label: '📋 Tarefa' },
  { value: 'ligacao', label: '📞 Ligação' },
  { value: 'reuniao', label: '🤝 Reunião' },
  { value: 'email', label: '📧 Email' },
  { value: 'whatsapp', label: '💬 WhatsApp' },
]

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function AutomacoesPage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [automacoes, setAutomacoes] = useState<Automacao[]>([])
  const [loading, setLoading] = useState(true)
  const [tenantId, setTenantId] = useState<string | null>(null)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Automacao | null>(null)

  useEffect(() => {
    carregar()
  }, [])

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

      const { data } = await supabase
        .from('crm_automacoes')
        .select('*')
        .eq('tenant_id', tu.tenant_id)
        .order('created_at', { ascending: false })

      setAutomacoes(data ?? [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  async function toggleAtivo(automacao: Automacao) {
    const { error } = await supabase
      .from('crm_automacoes')
      .update({ ativo: !automacao.ativo })
      .eq('id', automacao.id)

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    } else {
      setAutomacoes(prev =>
        prev.map(a => a.id === automacao.id ? { ...a, ativo: !a.ativo } : a)
      )
      toast({ title: automacao.ativo ? 'Automação desativada' : 'Automação ativada' })
    }
  }

  async function deletar(id: string) {
    if (!confirm('Tem certeza que deseja deletar esta automação?')) return

    const { error } = await supabase.from('crm_automacoes').delete().eq('id', id)
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    } else {
      setAutomacoes(prev => prev.filter(a => a.id !== id))
      toast({ title: 'Automação deletada' })
    }
  }

  function editar(automacao: Automacao) {
    setEditando(automacao)
    setModalOpen(true)
  }

  function novo() {
    setEditando(null)
    setModalOpen(true)
  }

  function aoSalvar(automacao: Automacao) {
    if (editando) {
      setAutomacoes(prev => prev.map(a => a.id === automacao.id ? automacao : a))
    } else {
      setAutomacoes(prev => [automacao, ...prev])
    }
    setModalOpen(false)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-dark flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-500" />
            Automações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {automacoes.length} automação{automacoes.length !== 1 ? 'ões' : ''} configurada{automacoes.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={novo}>
          <Plus className="h-4 w-4 mr-1" />
          Nova Automação
        </Button>
      </div>

      {/* Lista */}
      {automacoes.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Zap className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="font-heading text-lg font-semibold text-dark">Sem automações</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
              Crie automações para executar ações automaticamente quando eventos acontecerem.
            </p>
            <Button className="mt-6" onClick={novo}>
              <Plus className="h-4 w-4 mr-1" />
              Primeira automação
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {automacoes.map(automacao => (
            <AutomacaoCard
              key={automacao.id}
              automacao={automacao}
              onToggle={() => toggleAtivo(automacao)}
              onEdit={() => editar(automacao)}
              onDelete={() => deletar(automacao.id)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && tenantId && (
        <AutomacaoModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={aoSalvar}
          automacao={editando}
          tenantId={tenantId}
        />
      )}
    </div>
  )
}

// ============================================================================
// COMPONENTE: AUTOMACAO CARD
// ============================================================================

type AutomacaoCardProps = {
  automacao: Automacao
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

function AutomacaoCard({ automacao, onToggle, onEdit, onDelete }: AutomacaoCardProps) {
  const gatilho = GATILHO_OPTIONS.find(g => g.value === automacao.gatilho_tipo)
  const acao = ACAO_OPTIONS.find(a => a.value === automacao.acao_tipo)
  const GatilhoIcon = gatilho?.icon || Activity
  const AcaoIcon = acao?.icon || Bell

  return (
    <Card className={`transition-opacity ${automacao.ativo ? '' : 'opacity-60'}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Zap className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-dark">{automacao.nome}</h3>
                <Badge variant={automacao.ativo ? 'default' : 'outline'}>
                  {automacao.ativo ? 'Ativa' : 'Inativa'}
                </Badge>
              </div>
              {automacao.descricao && (
                <p className="text-sm text-muted-foreground mt-1">{automacao.descricao}</p>
              )}

              {/* Gatilho e Ação */}
              <div className="flex items-center gap-4 mt-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <GatilhoIcon className="h-4 w-4" />
                  <span>Quando:</span>
                  <span className="font-medium text-foreground">{gatilho?.label || automacao.gatilho_tipo}</span>
                  {automacao.gatilho_config?.estagio && (
                    <Badge variant="outline" className="text-xs">
                      {automacao.gatilho_config.estagio}
                    </Badge>
                  )}
                </div>

                <span className="text-muted-foreground">→</span>

                <div className="flex items-center gap-2 text-muted-foreground">
                  <AcaoIcon className="h-4 w-4" />
                  <span>Então:</span>
                  <span className="font-medium text-foreground">{acao?.label || automacao.acao_tipo}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className={automacao.ativo ? 'text-green-600' : 'text-muted-foreground'}
            >
              {automacao.ativo ? (
                <ToggleRight className="h-5 w-5" />
              ) : (
                <ToggleLeft className="h-5 w-5" />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-600">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// COMPONENTE: AUTOMACAO MODAL
// ============================================================================

type AutomacaoModalProps = {
  open: boolean
  onClose: () => void
  onSave: (automacao: Automacao) => void
  automacao: Automacao | null
  tenantId: string
}

function AutomacaoModal({ open, onClose, onSave, automacao, tenantId }: AutomacaoModalProps) {
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    gatilho_tipo: 'deal_entrou_estagio',
    gatilho_estagio: '',
    acao_tipo: 'criar_atividade',
    acao_tipo_atividade: 'tarefa',
    acao_descricao: '',
    acao_estagio: '',
    acao_probabilidade: '',
  })

  // Preencher form ao editar
  useEffect(() => {
    if (automacao) {
      setForm({
        nome: automacao.nome,
        descricao: automacao.descricao || '',
        gatilho_tipo: automacao.gatilho_tipo,
        gatilho_estagio: automacao.gatilho_config?.estagio || '',
        acao_tipo: automacao.acao_tipo,
        acao_tipo_atividade: automacao.acao_config?.tipo || 'tarefa',
        acao_descricao: automacao.acao_config?.descricao || '',
        acao_estagio: automacao.acao_config?.estagio || '',
        acao_probabilidade: automacao.acao_config?.probabilidade || '',
      })
    } else {
      setForm({
        nome: '',
        descricao: '',
        gatilho_tipo: 'deal_entrou_estagio',
        gatilho_estagio: '',
        acao_tipo: 'criar_atividade',
        acao_tipo_atividade: 'tarefa',
        acao_descricao: '',
        acao_estagio: '',
        acao_probabilidade: '',
      })
    }
  }, [automacao])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim()) {
      toast({ title: 'Erro', description: 'Nome é obrigatório', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      // Montar configs
      const gatilho_config: Record<string, any> = {}
      if (['deal_entrou_estagio', 'deal_saiu_estagio'].includes(form.gatilho_tipo)) {
        gatilho_config.estagio = form.gatilho_estagio
      }

      const acao_config: Record<string, any> = {}
      switch (form.acao_tipo) {
        case 'criar_atividade':
          acao_config.tipo = form.acao_tipo_atividade
          acao_config.descricao = form.acao_descricao
          acao_config.dias_prazo = '1'
          break
        case 'mover_deal_estagio':
          acao_config.estagio = form.acao_estagio
          break
        case 'atualizar_probabilidade':
          acao_config.probabilidade = form.acao_probabilidade
          break
      }

      const payload = {
        tenant_id: tenantId,
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        gatilho_tipo: form.gatilho_tipo,
        gatilho_config,
        acao_tipo: form.acao_tipo,
        acao_config,
        ativo: true,
      }

      let result
      if (automacao?.id) {
        result = await supabase
          .from('crm_automacoes')
          .update(payload)
          .eq('id', automacao.id)
          .select()
          .single()
      } else {
        result = await supabase
          .from('crm_automacoes')
          .insert(payload)
          .select()
          .single()
      }

      if (result.error) throw result.error

      toast({ title: automacao?.id ? 'Automação atualizada' : 'Automação criada' })
      onSave(result.data)
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
    setLoading(false)
  }

  const precisaEstagioGatilho = ['deal_entrou_estagio', 'deal_saiu_estagio'].includes(form.gatilho_tipo)
  const precisaEstagioAcao = form.acao_tipo === 'mover_deal_estagio'

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {automacao?.id ? 'Editar Automação' : 'Nova Automação'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4">
          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              placeholder="Ex: Notificar ao entrar em Proposta"
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              required
            />
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Input
              id="descricao"
              placeholder="Opcional..."
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            />
          </div>

          {/* Gatilho */}
          <div className="space-y-2">
            <Label htmlFor="gatilho">Quando...</Label>
            <select
              id="gatilho"
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={form.gatilho_tipo}
              onChange={e => setForm(f => ({ ...f, gatilho_tipo: e.target.value }))}
            >
              {GATILHO_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Config Gatilho - Estágio */}
          {precisaEstagioGatilho && (
            <div className="space-y-2">
              <Label htmlFor="gatilhoEstagio">Estágio</Label>
              <select
                id="gatilhoEstagio"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={form.gatilho_estagio}
                onChange={e => setForm(f => ({ ...f, gatilho_estagio: e.target.value }))}
              >
                <option value="">Qualquer estágio</option>
                {GATILHO_ESTAGIOS.map(est => (
                  <option key={est} value={est}>{est}</option>
                ))}
              </select>
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              Então executar...
            </p>
          </div>

          {/* Ação */}
          <div className="space-y-2">
            <Label htmlFor="acao">Ação</Label>
            <select
              id="acao"
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={form.acao_tipo}
              onChange={e => setForm(f => ({ ...f, acao_tipo: e.target.value }))}
            >
              {ACAO_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Config Ações */}
          {form.acao_tipo === 'criar_atividade' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="acaoTipoAtividade">Tipo de Atividade</Label>
                <select
                  id="acaoTipoAtividade"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  value={form.acao_tipo_atividade}
                  onChange={e => setForm(f => ({ ...f, acao_tipo_atividade: e.target.value }))}
                >
                  {ACAO_TIPOS_ATIVIDADE.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="acaoDescricao">Descrição da Atividade</Label>
                <Input
                  id="acaoDescricao"
                  placeholder="Ex: Fazer contato inicial"
                  value={form.acao_descricao}
                  onChange={e => setForm(f => ({ ...f, acao_descricao: e.target.value }))}
                />
              </div>
            </>
          )}

          {precisaEstagioAcao && (
            <div className="space-y-2">
              <Label htmlFor="acaoEstagio">Estágio de Destino</Label>
              <select
                id="acaoEstagio"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={form.acao_estagio}
                onChange={e => setForm(f => ({ ...f, acao_estagio: e.target.value }))}
              >
                <option value="">Selecione...</option>
                {GATILHO_ESTAGIOS.map(est => (
                  <option key={est} value={est}>{est}</option>
                ))}
              </select>
            </div>
          )}

          {form.acao_tipo === 'atualizar_probabilidade' && (
            <div className="space-y-2">
              <Label htmlFor="acaoProbabilidade">Probabilidade (%)</Label>
              <Input
                id="acaoProbabilidade"
                type="number"
                min="0"
                max="100"
                placeholder="Ex: 50"
                value={form.acao_probabilidade}
                onChange={e => setForm(f => ({ ...f, acao_probabilidade: e.target.value }))}
              />
            </div>
          )}

          {/* Ações */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : automacao?.id ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
