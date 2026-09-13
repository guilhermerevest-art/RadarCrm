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
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'

type Overview = {
  total_leads: number
  leads_novos: number
  leads_qualificados: number
  leads_convertidos: number
  leads_descarte: number
  leads_com_deals: number
  total_deals: number
  deals_valor_total: number
  deals_ganhos: number
  deals_perdidos: number
  win_rate: number
  origem_labels: Array<{ origem: string; count: number }>
  leads_por_mes: Array<{ mes: string; count: number }>
}

export default function CrmAnalyticsPage() {
  const supabase = createClient()
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      // Leads por status
      const { data: leads } = await supabase.from('crm_leads').select('origem, status')

      // Deals
      const { data: deals } = await supabase.from('crm_deals').select('fase, valor')

      if (!leads || !deals) { setLoading(false); return }

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

      const dealsTotal = deals.length
      const dealsValor = deals.reduce((s, d) => s + (d.valor || 0), 0)
      const ganhos = deals.filter(d => d.fase === 'fechada_ganho').length
      const perdidos = deals.filter(d => d.fase === 'fechada_perdida').length
      const winRate = dealsTotal > 0 ? Math.round((ganhos / dealsTotal) * 100) : 0

      setData({
        total_leads: total,
        leads_novos: porStatus.novo,
        leads_qualificados: porStatus.qualificado,
        leads_convertidos: porStatus.convertido,
        leads_descarte: porStatus.descarte,
        leads_com_deals: 0,
        total_deals: dealsTotal,
        deals_valor_total: dealsValor,
        deals_ganhos: ganhos,
        deals_perdidos: perdidos,
        win_rate: winRate,
        origem_labels: origemLabels,
        leads_por_mes: [],
      })

      setLoading(false)
    }

    load()
  }, [supabase])

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Carregando...</div>
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
          Visão geral do funil de vendas e leads
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <p className="text-xs text-muted-foreground">Conversão</p>
                <p className="text-2xl font-bold">{data.win_rate}%</p>
              </div>
              <Target className="h-8 w-8 text-green-500/30" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.deals_ganhos}/{data.total_deals} deals ganhos
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
                    ? `R$ ${(data.deals_valor_total / 1000).toFixed(0)}k`
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
                <p className="text-xs text-muted-foreground">Taxa Qualificação</p>
                <p className="text-2xl font-bold">
                  {data.total_leads > 0
                    ? Math.round((data.leads_qualificados / data.total_leads) * 100)
                    : 0}%
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Pipeline de Deals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Proposta', fase: 'proposta', color: 'bg-blue-100 text-blue-700' },
                { label: 'Negociação', fase: 'negociacao', color: 'bg-orange-100 text-orange-700' },
                { label: 'Fechada (Ganho)', fase: 'fechada_ganho', color: 'bg-green-100 text-green-700' },
                { label: 'Fechada (Perdido)', fase: 'fechada_perdida', color: 'bg-red-100 text-red-700' },
                { label: 'Cancelada', fase: 'cancelada', color: 'bg-gray-100 text-gray-600' },
              ].map(stage => {
                const count = stage.fase === 'fechada_ganho' ? data.deals_ganhos :
                  stage.fase === 'fechada_perdida' ? data.deals_perdidos : 0
                return (
                  <div key={stage.fase} className={`rounded-lg p-3 ${stage.color}`}>
                    <p className="text-xs font-medium">{stage.label}</p>
                    <p className="text-2xl font-bold mt-1">{count}</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
