'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Plus, Loader2, Building2 } from 'lucide-react'
import Link from 'next/link'

const ESTAGIOS = [
  { key: 'novo', label: 'Novo', color: '#A9B4BA', probability: 10 },
  { key: 'contato', label: 'Contato', color: '#2E6F8E', probability: 25 },
  { key: 'proposta', label: 'Proposta', color: '#D97706', probability: 50 },
  { key: 'negociacao', label: 'Negociação', color: '#7C3AED', probability: 75 },
  { key: 'fechamento', label: 'Fechamento', color: '#059669', probability: 90 },
  { key: 'ganho', label: 'Ganho', color: '#16A34A', probability: 100 },
  { key: 'perdido', label: 'Perdido', color: '#DC2626', probability: 0 },
]

type Deal = {
  id: string
  titulo: string
  estagio: string
  valor_estimado?: number
  probabilidade: number
  responsavel_id?: string
  lead_id: string
  created_at: string
  [key: string]: any
}

function DealCard({ deal, onDrop }: { deal: Deal; onDrop?: () => void }) {
  return (
    <Link href={`/dashboard/deals/${deal.id}`}>
      <div className="rounded-lg border bg-paper p-3 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer mb-2">
        <p className="font-medium text-sm text-dark line-clamp-2">{deal.titulo}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {(deal as any).crm_leads?.nome ?? 'Lead'}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-dark">
            {deal.valor_estimado
              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.valor_estimado)
              : '—'}
          </span>
          <span className="text-xs text-muted-foreground">{deal.probabilidade}%</span>
        </div>
      </div>
    </Link>
  )
}

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newDeal, setNewDeal] = useState({ titulo: '', valor: '' })
  const [leads, setLeads] = useState<any[]>([])
  const [selectedLead, setSelectedLead] = useState('')
  const [saving, setSaving] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: tu } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()

      if (!tu) return
      setTenantId(tu.tenant_id)

      const [{ data: dealsData }, { data: leadsData }] = await Promise.all([
        supabase
          .from('crm_deals')
          .select('*, crm_leads(nome)')
          .eq('tenant_id', tu.tenant_id)
          .order('created_at', { ascending: false }),
        supabase
          .from('crm_leads')
          .select('id, nome, empresa')
          .eq('tenant_id', tu.tenant_id)
          .order('nome'),
      ])

      setDeals(dealsData ?? [])
      setLeads(leadsData ?? [])
      setLoading(false)
    }
    load()
  }, [])

  async function handleCreateDeal(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId || !newDeal.titulo || !selectedLead) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' })
      return
    }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const estagio = 'novo'
    const estagioData = ESTAGIOS.find((e) => e.key === estagio)

    const { error } = await supabase.from('crm_deals').insert({
      tenant_id: tenantId,
      lead_id: selectedLead,
      titulo: newDeal.titulo,
      valor_estimado: newDeal.valor ? parseFloat(newDeal.valor) : null,
      estagio,
      probabilidade: estagioData?.probability ?? 10,
      responsavel_id: user?.id,
    })

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Oportunidade criada!', description: newDeal.titulo })
      setShowForm(false)
      setNewDeal({ titulo: '', valor: '' })
      setSelectedLead('')
      // Recarrega deals
      const { data } = await supabase
        .from('crm_deals')
        .select('*, crm_leads(nome)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      setDeals(data ?? [])
    }
    setSaving(false)
  }

  // Agrupar deals por estágio
  const dealsPorEstagio = ESTAGIOS.reduce((acc, estagio) => {
    acc[estagio.key] = deals.filter((d) => d.estagio === estagio.key)
    return acc
  }, {} as Record<string, Deal[]>)

  const totalValor = deals.reduce((sum, d) => sum + (d.valor_estimado ?? 0), 0)
  const totalValorGanhos = deals
    .filter((d) => d.estagio === 'ganho')
    .reduce((sum, d) => sum + (d.valor_final ?? d.valor_estimado ?? 0), 0)

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
    <div className="flex flex-col h-full p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 className="font-heading text-2xl font-bold text-dark">Pipeline de Vendas</h1>
          <p className="text-sm text-muted-foreground">
            {deals.length} oportunidades ·{' '}
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValor)} total
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nova Oportunidade
        </Button>
      </div>

      {/* Form novo deal */}
      {showForm && (
        <Card className="mb-6 border-primary/30 shadow-md flex-shrink-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Nova Oportunidade</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateDeal} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Título</label>
                <Input
                  placeholder="Ex: Fornecimento de concreto para obra X"
                  value={newDeal.titulo}
                  onChange={(e) => setNewDeal({ ...newDeal, titulo: e.target.value })}
                  required
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Lead</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedLead}
                  onChange={(e) => setSelectedLead(e.target.value)}
                  required
                >
                  <option value="">Selecione um lead</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.nome}{lead.empresa ? ` (${lead.empresa})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-36 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Valor estimado (R$)</label>
                <Input
                  type="number"
                  placeholder="0,00"
                  value={newDeal.valor}
                  onChange={(e) => setNewDeal({ ...newDeal, valor: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Criar
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Pipeline Kanban */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 min-w-max pb-4">
          {ESTAGIOS.filter((e) => e.key !== 'ganho' && e.key !== 'perdido').map((estagio) => {
            const estagioDeals = dealsPorEstagio[estagio.key] ?? []
            const valorEstagio = estagioDeals.reduce((sum, d) => sum + (d.valor_estimado ?? 0), 0)
            return (
              <div
                key={estagio.key}
                className="w-72 flex-shrink-0 flex flex-col"
              >
                {/* Header da coluna */}
                <div
                  className="rounded-t-lg px-3 py-2.5 flex items-center justify-between"
                  style={{ backgroundColor: `${estagio.color}15` }}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: estagio.color }} />
                    <span className="text-sm font-semibold" style={{ color: estagio.color }}>
                      {estagio.label}
                    </span>
                    <span className="text-xs text-muted-foreground bg-background rounded-full px-1.5 py-0.5">
                      {estagioDeals.length}
                    </span>
                  </div>
                  <span className="text-xs font-medium" style={{ color: estagio.color }}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(valorEstagio)}
                  </span>
                </div>
                {/* Cards */}
                <div
                  className="flex-1 rounded-b-lg border-x border-b p-2 space-y-0"
                  style={{ borderColor: `${estagio.color}30`, minHeight: '200px' }}
                >
                  {estagioDeals.length === 0 ? (
                    <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50">
                      Arraste deals para cá
                    </div>
                  ) : (
                    estagioDeals.map((deal) => (
                      <DealCard key={deal.id} deal={deal} />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Ganhos e Perdas */}
        <div className="flex gap-4 mt-4 min-w-max">
          <div className="w-72 flex-shrink-0 bg-green-50 rounded-lg border border-green-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <span className="text-sm font-semibold text-green-700">Ganhos</span>
              <span className="text-xs bg-green-100 text-green-700 rounded-full px-1.5 py-0.5">
                {(dealsPorEstagio['ganho'] ?? []).length}
              </span>
            </div>
            <p className="text-lg font-bold text-green-700">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                totalValorGanhos
              )}
            </p>
          </div>
          <div className="w-72 flex-shrink-0 bg-red-50 rounded-lg border border-red-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="text-sm font-semibold text-red-700">Perdidos</span>
              <span className="text-xs bg-red-100 text-red-700 rounded-full px-1.5 py-0.5">
                {(dealsPorEstagio['perdido'] ?? []).length}
              </span>
            </div>
            <p className="text-lg font-bold text-red-700">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(
                (dealsPorEstagio['perdido'] ?? []).reduce((sum, d) => sum + (d.valor_estimado ?? 0), 0)
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
