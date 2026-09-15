'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Filter,
  DollarSign,
  Calendar,
  User,
  Clock,
  LayoutGrid,
  TrendingUp,
  MoreHorizontal,
  Trash2,
  Edit,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import DealModal from './deal-modal'
import { MotivoPerdaModal } from '@/components/crm/MotivoPerdaModal'

// TIPOS COMPARTILHADOS CRM
import type { PipelineEstagio, Responsavel, Deal } from '@/lib/crm-types'

type Filtros = {
  responsavel: string
  estagio: string
  valorMin: string
  valorMax: string
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function DealsKanbanPage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [estagios, setEstagios] = useState<PipelineEstagio[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([])
  const [loading, setLoading] = useState(true)
  const [tenantId, setTenantId] = useState<string | null>(null)

  // Drag state
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  // Filters
  const [filtros, setFiltros] = useState<Filtros>({
    responsavel: '',
    estagio: '',
    valorMin: '',
    valorMax: '',
  })
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [dealEditando, setDealEditando] = useState<Deal | null>(null)

  // Motivo perda modal
  const [perdaModal, setPerdaModal] = useState<{ dealId: string; novoEstagio: string } | null>(
    null
  )

  // Carregar dados
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

      // Carregar estágios
      const { data: stages } = await supabase
        .from('crm_pipeline_estagios')
        .select('*')
        .eq('tenant_id', tu.tenant_id)
        .order('ordem', { ascending: true })

      // Carregar deals
      const { data: dealsData } = await supabase
        .from('crm_deals')
        .select(`
          *,
          leads:nome,
          responsavel:tenant_users(nome)
        `)
        .eq('tenant_id', tu.tenant_id)
        .order('created_at', { ascending: false })

      // Carregar responsáveis
      const { data: users } = await supabase
        .from('tenant_users')
        .select('id, nome')
        .eq('tenant_id', tu.tenant_id)
        .eq('ativo', true)

      setEstagios(stages ?? [])
      setDeals(dealsData ?? [])
      setResponsaveis(users ?? [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  // Filtrar deals
  const dealsFiltrados = useCallback(() => {
    return deals.filter(deal => {
      if (filtros.responsavel && deal.responsavel_id !== filtros.responsavel) return false
      if (filtros.estagio && deal.estagio !== filtros.estagio) return false
      if (filtros.valorMin && (!deal.valor_estimado || deal.valor_estimado < parseFloat(filtros.valorMin))) return false
      if (filtros.valorMax && (!deal.valor_estimado || deal.valor_estimado > parseFloat(filtros.valorMax))) return false
      return true
    })
  }, [deals, filtros])

  // Agrupar por estágio
  const dealsPorEstagio = useCallback(() => {
    const agrupado: Record<string, Deal[]> = {}
    estagios.forEach(e => { agrupado[e.nome] = [] })
    dealsFiltrados().forEach(d => {
      if (agrupado[d.estagio]) {
        agrupado[d.estagio].push(d)
      }
    })
    return agrupado
  }, [estagios, dealsFiltrados])

  // Drag handlers
  function onDragStart(e: React.DragEvent, dealId: string) {
    setDraggedId(dealId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e: React.DragEvent, estagio: string) {
    e.preventDefault()
    setDragOverCol(estagio)
  }

  function onDragLeave() {
    setDragOverCol(null)
  }

  async function onDrop(e: React.DragEvent, novoEstagio: string) {
    e.preventDefault()
    setDragOverCol(null)

    if (!draggedId) return

    const deal = deals.find(d => d.id === draggedId)
    if (!deal || deal.estagio === novoEstagio) {
      setDraggedId(null)
      return
    }

    // Se movendo para "perdido", abrir modal de motivo
    if (novoEstagio === 'perdido') {
      setPerdaModal({ dealId: deal.id, novoEstagio })
      setDraggedId(null)
      return
    }

    const estagioInfo = estagios.find(es => es.nome === novoEstagio)
    const novaProbabilidade = estagioInfo?.probabilidade_padrao ?? deal.probabilidade

    // Atualizar local (otimista)
    setDeals(prev => prev.map(d =>
      d.id === draggedId
        ? { ...d, estagio: novoEstagio, probabilidade: novaProbabilidade }
        : d
    ))

    // Persistir
    const { error } = await supabase
      .from('crm_deals')
      .update({
        estagio: novoEstagio,
        probabilidade: novaProbabilidade,
        updated_at: new Date().toISOString(),
      })
      .eq('id', draggedId)

    if (error) {
      toast({ title: 'Erro ao mover deal', description: error.message, variant: 'destructive' })
      carregar() // Reverter
    } else {
      toast({ title: `Deal movido para ${novoEstagio}` })
    }

    setDraggedId(null)
  }

  async function confirmarPerda(motivo: string, observacao: string) {
    if (!perdaModal) return
    const deal = deals.find(d => d.id === perdaModal.dealId)
    if (!deal) return

    // Otimista
    setDeals(prev =>
      prev.map(d =>
        d.id === perdaModal.dealId
          ? { ...d, estagio: 'perdido', probabilidade: 0 }
          : d
      )
    )

    const { error } = await supabase
      .from('crm_deals')
      .update({
        estagio: 'perdido',
        probabilidade: 0,
        motivo_perda: motivo,
        observacao_perda: observacao || null,
        data_fechamento: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', perdaModal.dealId)

    if (error) throw error
    toast({ title: 'Deal marcado como perdido' })
    setPerdaModal(null)
  }

  // CRUD
  async function deletarDeal(id: string) {
    if (!confirm('Tem certeza que deseja deletar este deal?')) return

    const { error } = await supabase.from('crm_deals').delete().eq('id', id)
    if (error) {
      toast({ title: 'Erro ao deletar', description: error.message, variant: 'destructive' })
    } else {
      setDeals(prev => prev.filter(d => d.id !== id))
      toast({ title: 'Deal deletado' })
    }
  }

  function editarDeal(deal: Deal) {
    setDealEditando(deal)
    setModalOpen(true)
  }

  function novoDeal() {
    setDealEditando(null)
    setModalOpen(true)
  }

  function aoSalvarDeal(deal: Deal) {
    if (dealEditando) {
      setDeals(prev => prev.map(d => d.id === deal.id ? deal : d))
    } else {
      setDeals(prev => [deal, ...prev])
    }
    setModalOpen(false)
  }

  // Calcular valores
  const totalPipeline = deals.reduce((sum, d) => sum + (d.valor_estimado || 0), 0)
  const dealsAtivos = deals.filter(d => !['ganho', 'perdido'].includes(d.estagio)).length

  // Dias no estagio
  function diasNoEstagio(createdAt: string): number {
    const created = new Date(createdAt)
    const now = new Date()
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
          <p className="mt-2 text-sm text-muted-foreground">Carregando pipeline...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 lg:p-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-heading text-2xl font-bold text-dark flex items-center gap-2">
                <LayoutGrid className="h-6 w-6 text-primary" />
                Pipeline de Deals
              </h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <span>{dealsAtivos} deals ativos</span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  R$ {(totalPipeline / 1000).toFixed(0)}k no pipeline
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMostrarFiltros(!mostrarFiltros)}
              >
                <Filter className="h-4 w-4 mr-1" />
                Filtros
              </Button>
              <Button onClick={novoDeal}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Deal
              </Button>
            </div>
          </div>

          {/* Filtros */}
          {mostrarFiltros && (
            <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/30">
              <select
                className="h-9 px-3 rounded-md border border-input bg-background text-sm"
                value={filtros.responsavel}
                onChange={e => setFiltros(f => ({ ...f, responsavel: e.target.value }))}
              >
                <option value="">Todos responsáveis</option>
                {responsaveis.map(r => (
                  <option key={r.id} value={r.id}>{r.nome}</option>
                ))}
              </select>
              <select
                className="h-9 px-3 rounded-md border border-input bg-background text-sm"
                value={filtros.estagio}
                onChange={e => setFiltros(f => ({ ...f, estagio: e.target.value }))}
              >
                <option value="">Todos estágios</option>
                {estagios.map(e => (
                  <option key={e.id} value={e.nome}>{e.nome}</option>
                ))}
              </select>
              <Input
                placeholder="Valor mín (R$)"
                type="number"
                className="h-9 w-32"
                value={filtros.valorMin}
                onChange={e => setFiltros(f => ({ ...f, valorMin: e.target.value }))}
              />
              <Input
                placeholder="Valor máx (R$)"
                type="number"
                className="h-9 w-32"
                value={filtros.valorMax}
                onChange={e => setFiltros(f => ({ ...f, valorMax: e.target.value }))}
              />
              {(filtros.responsavel || filtros.estagio || filtros.valorMin || filtros.valorMax) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFiltros({ responsavel: '', estagio: '', valorMin: '', valorMax: '' })}
                >
                  Limpar
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-4 lg:p-6">
        <div className="flex gap-4 min-w-max">
          {estagios.map(estagio => {
            const estagioDeals = dealsPorEstagio()[estagio.nome] || []
            const totalEstagio = estagioDeals.reduce((sum, d) => sum + (d.valor_estimado || 0), 0)

            return (
              <div
                key={estagio.id}
                className="w-80 flex-shrink-0"
                onDragOver={e => onDragOver(e, estagio.nome)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, estagio.nome)}
              >
                {/* Header coluna */}
                <div
                  className="rounded-t-lg p-3 border-b-4"
                  style={{ borderColor: estagio.cor }}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading font-bold text-sm flex items-center gap-2">
                      {estagio.nome}
                      <Badge variant="outline" className="ml-1">
                        {estagioDeals.length}
                      </Badge>
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {estagio.probabilidade_padrao}%
                    </span>
                  </div>
                  {totalEstagio > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      R$ {(totalEstagio / 1000).toFixed(1)}k
                    </p>
                  )}
                </div>

                {/* Cards */}
                <div
                  className={`bg-muted/20 rounded-b-lg p-2 min-h-[200px] transition-all ${
                    dragOverCol === estagio.nome ? 'ring-2 ring-primary bg-primary/5' : ''
                  }`}
                >
                  {estagioDeals.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-8 border-2 border-dashed rounded-lg">
                      Solte deals aqui
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {estagioDeals.map(deal => (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          estagioCor={estagio.cor}
                          onDragStart={onDragStart}
                          onEdit={() => editarDeal(deal)}
                          onDelete={() => deletarDeal(deal.id)}
                          diasNoEstagio={diasNoEstagio(deal.created_at)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && tenantId && (
        <DealModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={aoSalvarDeal}
          deal={dealEditando}
          tenantId={tenantId}
          responsaveis={responsaveis}
          estagios={estagios}
        />
      )}

      {/* Motivo perda */}
      {perdaModal && tenantId && (
        <MotivoPerdaModal
          open={true}
          onClose={() => setPerdaModal(null)}
          dealId={perdaModal.dealId}
          tenantId={tenantId}
          onConfirm={confirmarPerda}
        />
      )}
    </div>
  )
}

// ============================================================================
// COMPONENTE: DEAL CARD
// ============================================================================

type DealCardProps = {
  deal: Deal
  estagioCor: string
  onDragStart: (e: React.DragEvent, id: string) => void
  onEdit: () => void
  onDelete: () => void
  diasNoEstagio: number
}

function DealCard({ deal, estagioCor, onDragStart, onEdit, onDelete, diasNoEstagio }: DealCardProps) {
  const [menuAberto, setMenuAberto] = useState(false)

  return (
    <Card
      draggable
      onDragStart={e => onDragStart(e, deal.id)}
      className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow border-l-4"
      style={{ borderLeftColor: estagioCor }}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <Link href={`/dashboard/crm/deals/${deal.id}`}>
              <p className="font-semibold text-sm text-dark truncate hover:text-primary transition-colors">
                {deal.titulo}
              </p>
            </Link>
            {deal.leads?.nome && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {deal.leads.nome}
              </p>
            )}
          </div>
          <DropdownMenu open={menuAberto} onOpenChange={setMenuAberto}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem onCheckedChange={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                onCheckedChange={onDelete}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Deletar
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {deal.valor_estimado && (
          <p className="text-sm font-bold text-green-600 mt-2">
            R$ {deal.valor_estimado.toLocaleString('pt-BR')}
          </p>
        )}

        <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {deal.responsavel_id && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {deal.responsavel?.nome || 'Responsável'}
              </span>
            )}
          </div>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {diasNoEstagio}d
          </span>
        </div>

        {deal.data_fechamento_prevista && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(deal.data_fechamento_prevista).toLocaleDateString('pt-BR')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
