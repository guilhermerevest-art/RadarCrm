'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart3,
  TrendingUp,
  Users,
  Target,
  DollarSign,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  XCircle,
  Briefcase,
} from 'lucide-react'

type Overview = {
  total_leads: number
  leads_novos: number
  leads_qualificados: number
  leads_convertidos: number
  leads_descarte: number
  total_deals: number
  deals_valor_total: number
  deals_valor_ponderado: number
  deals_ganhos: number
  deals_perdidos: number
  deals_em_andamento: number
  win_rate: number
  taxa_qualificacao: number
  valor_medio_deal: number
  tempo_medio_dias: number
  origem_labels: Array<{ origem: string; count: number }>
  leads_por_mes: Array<{ mes: string; count: number }>
  deals_por_estagio: Array<{ estagio: string; cor: string; count: number; valor: number }>
}

type EstagioPipeline = {
  id: string
  nome: string
  cor: string
  probabilidade_padrao: number
  ordem: number
}

export default function CrmAnalyticsPage() {
  const supabase = createClient()
  const [data, setData] = useState<Overview | null>(null)
  const [estagios, setEstagios] = useState<EstagioPipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [tenantId, setTenantId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
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

      // Carregar estágios do pipeline
      const { data: stages } = await supabase
        .from('crm_pipeline_estagios')
        .select('*')
        .eq('tenant_id', tu.tenant_id)
        .order('ordem', { ascending: true })

      // Leads
      const { data: leads } = await supabase
        .from('crm_leads')
        .select('origem, status, created_at')
        .eq('tenant_id', tu.tenant_id)

      // Deals
      const { data: deals } = await supabase
        .from('crm_deals')
        .select('estagio, valor_estimado, probabilidade, created_at, updated_at')
        .eq('tenant_id', tu.tenant_id)

      if (!leads || !deals) { setLoading(false); return }

      // Processar dados
      const total = leads.length
      const porStatus = {
        novo: leads.filter(l => l.status === 'novo').length,
        qualificado: leads.filter(l => l.status === 'qualificado').length,
        convertido: leads.filter(l => l.status === 'convertido').length,
        descarte: leads.filter(l => l.status === 'descarte').length,
      }

      const origemCount: Record<string, number> = {}
      leads.forEach(l => {
        origemCount[l.origem] = (origemCount[l.origem] || 0) + 1
      })
      const origemLabels = Object.entries(origemCount)
        .map(([origem, count]) => ({ origem, count }))
        .sort((a, b) => b.count - a.count)

      // Deals
      const dealsTotal = deals.length
      const dealsValor = deals.reduce((s, d) => s + (d.valor_estimado || 0), 0)
      const ganhos = deals.filter(d => d.estagio === 'Ganho').length
      const perdidos = deals.filter(d => d.estagio === 'Perdido').length
      const emAndamento = deals.filter(d => !['Ganho', 'Perdido'].includes(d.estagio)).length
      const winRate = (ganhos + perdidos) > 0 ? Math.round((ganhos / (ganhos + perdidos)) * 100) : 0

      // Valor ponderado (probabilidade)
      const valorPonderado = deals.reduce((s, d) => {
        const prob = stages?.find(e => e.nome === d.estagio)?.probabilidade_padrao || d.probabilidade || 10
        return s + ((d.valor_estimado || 0) * prob / 100)
      }, 0)

      // Valor médio
      const valorMedio = dealsTotal > 0 ? dealsValor / dealsTotal : 0

      // Tempo médio (dias desde criação)
      const now = new Date()
      const tempos = deals
        .filter(d => d.estagio !== 'Ganho' && d.estagio !== 'Perdido')
        .map(d => {
          const created = new Date(d.created_at)
          return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
        })
      const tempoMedio = tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0

      // Deals por estágio
      const dealsPorEstagio = stages?.map(e => {
        const estDeals = deals.filter(d => d.estagio === e.nome)
        return {
          estagio: e.nome,
          cor: e.cor,
          count: estDeals.length,
          valor: estDeals.reduce((s, d) => s + (d.valor_estimado || 0), 0),
        }
      }) || []

      setEstagios(stages || [])
      setData({
        total_leads: total,
        leads_novos: porStatus.novo,
        leads_qualificados: porStatus.qualificado,
        leads_convertidos: porStatus.convertido,
        leads_descarte: porStatus.descarte,
        total_deals: dealsTotal,
        deals_valor_total: dealsValor,
        deals_valor_ponderado: valorPonderado,
        deals_ganhos: ganhos,
        deals_perdidos: perdidos,
        deals_em_andamento: emAndamento,
        win_rate: winRate,
        taxa_qualificacao: total > 0 ? Math.round((porStatus.qualificado / total) * 100) : 0,
        valor_medio_deal: valorMedio,
        tempo_medio_dias: tempoMedio,
        origem_labels: origemLabels,
        leads_por_mes: [],
        deals_por_estagio: dealsPorEstagio,
      })
    } catch (err) {
      console.error(err)
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Analytics CRM
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visão geral do funil de vendas e métricas de performance
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Leads</p>
                <p className="text-2xl font-bold">{data.total_leads}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Deals Ativos</p>
                <p className="text-2xl font-bold">{data.deals_em_andamento}</p>
              </div>
              <Briefcase className="h-8 w-8 text-blue-500/30" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.total_deals} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold">{data.win_rate}%</p>
              </div>
              <Target className="h-8 w-8 text-green-500/30" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.deals_ganhos}G / {data.deals_ganhos + data.deals_perdidos}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Valor Pipeline</p>
                <p className="text-2xl font-bold">
                  {data.deals_valor_total > 0
                    ? `R$ ${(data.deals_valor_total / 1000).toFixed(1)}k`
                    : '—'}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-amber-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Valor Ponderado</p>
                <p className="text-2xl font-bold">
                  {data.deals_valor_ponderado > 0
                    ? `R$ ${(data.deals_valor_ponderado / 1000).toFixed(1)}k`
                    : '—'}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500/30" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              por prob.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Segunda linha de KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Taxa Qualificação</p>
                <p className="text-2xl font-bold">{data.taxa_qualificacao}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Ticket Médio</p>
                <p className="text-2xl font-bold">
                  {data.valor_medio_deal > 0
                    ? `R$ ${(data.valor_medio_deal / 1000).toFixed(1)}k`
                    : '—'}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Tempo Médio</p>
                <p className="text-2xl font-bold">{data.tempo_medio_dias}d</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Leads Convertidos</p>
                <p className="text-2xl font-bold">{data.leads_convertidos}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Funil de Leads */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funil de Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: 'Novos', count: data.leads_novos, color: 'bg-blue-500', pct: data.total_leads > 0 ? (data.leads_novos / data.total_leads) * 100 : 0 },
                { label: 'Qualificados', count: data.leads_qualificados, color: 'bg-orange-500', pct: data.total_leads > 0 ? (data.leads_qualificados / data.total_leads) * 100 : 0 },
                { label: 'Convertidos', count: data.leads_convertidos, color: 'bg-green-500', pct: data.total_leads > 0 ? (data.leads_convertidos / data.total_leads) * 100 : 0 },
                { label: 'Descarte', count: data.leads_descarte, color: 'bg-gray-400', pct: data.total_leads > 0 ? (data.leads_descarte / data.total_leads) * 100 : 0 },
              ].map(stage => (
                <div key={stage.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span>{stage.label}</span>
                    <span className="font-mono font-medium">
                      {stage.count} <span className="text-muted-foreground text-xs">({stage.pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${stage.color} transition-all`}
                      style={{ width: `${stage.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Origem dos Leads */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads por Origem</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.origem_labels.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum lead registrado ainda
                </p>
              ) : (
                data.origem_labels.map(origem => (
                  <div key={origem.origem} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full bg-primary"
                        style={{
                          width: `${8 + (origem.count / (data.origem_labels[0]?.count || 1)) * 8}px`,
                          height: `${8 + (origem.count / (data.origem_labels[0]?.count || 1)) * 8}px`,
                        }}
                      />
                      <span className="text-sm capitalize">{origem.origem}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{origem.count}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {data.total_leads > 0
                          ? ((origem.count / data.total_leads) * 100).toFixed(0)
                          : 0}%
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pipeline de Deals */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline de Deals</CardTitle>
          </CardHeader>
          <CardContent>
            {data.deals_por_estagio.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum deal registrado ainda
              </p>
            ) : (
              <div className="space-y-3">
                {data.deals_por_estagio.map((estagio, idx) => (
                  <div key={estagio.estagio}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: estagio.cor }}
                        />
                        <span>{estagio.estagio}</span>
                      </div>
                      <span className="font-mono font-medium">
                        {estagio.count} <span className="text-muted-foreground text-xs">
                          {estagio.valor > 0 ? `(R$ ${(estagio.valor / 1000).toFixed(1)}k)` : ''}
                        </span>
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${data.deals_em_andamento > 0 ? (estagio.count / data.total_deals) * 100 : 0}%`,
                          backgroundColor: estagio.cor,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resumo de Ganhos/Perdas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo de Conversões</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-green-700">{data.deals_ganhos}</p>
                <p className="text-xs text-green-600">Ganhos</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50">
              <XCircle className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-red-700">{data.deals_perdidos}</p>
                <p className="text-xs text-red-600">Perdidos</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50">
              <TrendingUp className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-blue-700">{data.win_rate}%</p>
                <p className="text-xs text-blue-600">Taxa Aprov.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50">
              <Clock className="h-8 w-8 text-amber-600" />
              <div>
                <p className="text-2xl font-bold text-amber-700">{data.tempo_medio_dias}d</p>
                <p className="text-xs text-amber-600">Tempo Médio</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
