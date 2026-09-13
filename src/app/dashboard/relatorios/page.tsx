'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  TrendingDown,
  MapPin,
  Users,
  DollarSign,
  Download,
  Building2,
  Calendar,
} from 'lucide-react'

type MesData = {
  mes: string
  label: string
  obras: number
  leads: number
  negocios_fechados: number
  receita_estimada: number
}

export default function RelatoriosPage() {
  const supabase = createClient()
  const [periodo, setPeriodo] = useState('6')
  const [dados, setDados] = useState<MesData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregar()
  }, [periodo])

  async function carregar() {
    setLoading(true)
    const mesesCount = parseInt(periodo)

    // Buscar obras e leads dos últimos X meses
    const inicio = new Date()
    inicio.setMonth(inicio.getMonth() - mesesCount)

    const [obrasRes, leadsRes, dealsRes] = await Promise.all([
      supabase
        .from('radar_obras')
        .select('id, created_at, fase_atual')
        .gte('created_at', inicio.toISOString()),
      supabase
        .from('crm_leads')
        .select('id, created_at')
        .gte('created_at', inicio.toISOString()),
      supabase
        .from('crm_deals')
        .select('id, created_at, valor, status')
        .gte('created_at', inicio.toISOString()),
    ])

    // Agrupar por mês
    const map = new Map<string, MesData>()

    function addMes(date: Date) {
      const mes = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(mes)) {
        map.set(mes, {
          mes,
          label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          obras: 0,
          leads: 0,
          negocios_fechados: 0,
          receita_estimada: 0,
        })
      }
      return mes
    }

    ;(obrasRes.data ?? []).forEach(o => addMes(new Date(o.created_at)))
    ;(leadsRes.data ?? []).forEach(l => addMes(new Date(l.created_at)))

    ;(obrasRes.data ?? []).forEach(o => {
      const mes = addMes(new Date(o.created_at))
      map.get(mes)!.obras++
    })
    ;(leadsRes.data ?? []).forEach(l => {
      const mes = addMes(new Date(l.created_at))
      map.get(mes)!.leads++
    })
    ;(dealsRes.data ?? []).forEach(d => {
      const mes = addMes(new Date(d.created_at))
      const item = map.get(mes)!
      if (d.status === 'ganho') {
        item.negocios_fechados++
        item.receita_estimada += d.valor ?? 0
      }
    })

    const ordenado = Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes))
    setDados(ordenado)
    setLoading(false)
  }

  // Calcular tendências
  function calcVariacao(idx: number) {
    if (idx === 0) return null
    const atual = dados[idx].obras
    const anterior = dados[idx - 1].obras
    if (!anterior) return null
    return Math.round(((atual - anterior) / anterior) * 100)
  }

  // Totais
  const totais = {
    obras: dados.reduce((s, m) => s + m.obras, 0),
    leads: dados.reduce((s, m) => s + m.leads, 0),
    negocios: dados.reduce((s, m) => s + m.negocios_fechados, 0),
    receita: dados.reduce((s, m) => s + m.receita_estimada, 0),
  }

  // Máx para gráfico
  const maxObras = Math.max(1, ...dados.map(d => d.obras))
  const maxLeads = Math.max(1, ...dados.map(d => d.leads))

  function exportarCSV() {
    const headers = ['Mês', 'Obras', 'Leads', 'Negócios Fechados', 'Receita (R$)']
    const rows = dados.map(d => [
      d.label,
      d.obras,
      d.leads,
      d.negocios_fechados,
      d.receita_estimada.toFixed(2),
    ])

    const csv = [
      headers.join(';'),
      ...rows.map(r => r.join(';')),
      '',
      'TOTAIS',
      totais.obras,
      totais.leads,
      totais.negocios,
      totais.receita.toFixed(2),
    ].join('\n')

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-dark flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Relatórios & Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhe seu funil de obras e leads ao longo do tempo
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="3">Últimos 3 meses</option>
            <option value="6">Últimos 6 meses</option>
            <option value="12">Últimos 12 meses</option>
          </select>
          <Button onClick={exportarCSV} variant="outline">
            <Download className="h-4 w-4 mr-1" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Obras detectadas</p>
                <p className="text-3xl font-bold text-dark mt-2">{totais.obras}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-amber-700" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Leads criados</p>
                <p className="text-3xl font-bold text-dark mt-2">{totais.leads}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-700" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Negócios ganhos</p>
                <p className="text-3xl font-bold text-dark mt-2">{totais.negocios}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-700" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Receita estimada</p>
                <p className="text-3xl font-bold text-dark mt-2">
                  {totais.receita.toLocaleString('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico simples em barra */}
      <Card>
        <CardHeader>
          <CardTitle>Evolução mensal</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : dados.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Sem dados no período.</p>
          ) : (
            <div className="space-y-6">
              {/* Obras */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-amber-700" />
                    <p className="text-sm font-medium">Obras detectadas</p>
                  </div>
                </div>
                <div className="flex items-end gap-2 h-32">
                  {dados.map((m, idx) => {
                    const variacao = calcVariacao(idx)
                    return (
                      <div key={m.mes} className="flex-1 flex flex-col items-center justify-end">
                        <div className="relative w-full flex items-end justify-center">
                          <div
                            className="w-full bg-amber-500 rounded-t hover:bg-amber-600 transition-colors relative"
                            style={{ height: `${(m.obras / maxObras) * 100}%`, minHeight: m.obras > 0 ? '4px' : '0' }}
                          >
                            {m.obras > 0 && (
                              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold text-amber-700">
                                {m.obras}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 truncate">{m.label}</p>
                        {variacao !== null && variacao !== 0 && (
                          <p className={`text-[10px] flex items-center mt-1 ${variacao > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {variacao > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {Math.abs(variacao)}%
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Leads */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-700" />
                    <p className="text-sm font-medium">Leads criados</p>
                  </div>
                </div>
                <div className="flex items-end gap-2 h-32">
                  {dados.map(m => (
                    <div key={m.mes} className="flex-1 flex flex-col items-center justify-end">
                      <div className="relative w-full flex items-end justify-center">
                        <div
                          className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors relative"
                          style={{ height: `${(m.leads / maxLeads) * 100}%`, minHeight: m.leads > 0 ? '4px' : '0' }}
                        >
                          {m.leads > 0 && (
                            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold text-blue-700">
                              {m.leads}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 truncate">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela resumo */}
      {!loading && dados.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Detalhamento</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left border-b">
                <tr>
                  <th className="pb-2 font-semibold">Mês</th>
                  <th className="pb-2 font-semibold text-right">Obras</th>
                  <th className="pb-2 font-semibold text-right">Leads</th>
                  <th className="pb-2 font-semibold text-right">Ganhos</th>
                  <th className="pb-2 font-semibold text-right">Receita</th>
                </tr>
              </thead>
              <tbody>
                {dados.map(d => (
                  <tr key={d.mes} className="border-b last:border-0">
                    <td className="py-3 capitalize">{d.label}</td>
                    <td className="py-3 text-right">{d.obras}</td>
                    <td className="py-3 text-right">{d.leads}</td>
                    <td className="py-3 text-right">{d.negocios_fechados}</td>
                    <td className="py-3 text-right">
                      {d.receita_estimada > 0
                        ? d.receita_estimada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : '—'}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold bg-muted/30">
                  <td className="py-3">Total</td>
                  <td className="py-3 text-right">{totais.obras}</td>
                  <td className="py-3 text-right">{totais.leads}</td>
                  <td className="py-3 text-right">{totais.negocios}</td>
                  <td className="py-3 text-right">
                    {totais.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
