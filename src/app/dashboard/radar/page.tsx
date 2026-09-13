'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Search,
  Plus,
  MapPin,
  Filter,
  Building,
  ChevronRight,
  Download,
  ThumbsUp,
} from 'lucide-react'
import Link from 'next/link'

type Obra = {
  id: string
  fonte: string
  endereco_logradouro: string
  endereco_numero?: string
  endereco_bairro?: string
  endereco_cidade: string
  endereco_uf: string
  fase_atual: string | null
  porte: string
  valor_estimado?: number
  status: string
  qualidade_score?: number
  created_at: string
  obra_global_id?: string
}

const FASE_COLORS: Record<string, { bg: string; text: string }> = {
  alvara: { bg: 'bg-red-50', text: 'text-red-700' },
  fundacao: { bg: 'bg-amber-50', text: 'text-amber-700' },
  estrutura: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
  acabamento: { bg: 'bg-green-50', text: 'text-green-700' },
  concluida: { bg: 'bg-gray-50', text: 'text-gray-500' },
  nao_iniciou: { bg: 'bg-slate-50', text: 'text-slate-600' },
}

const FASE_NAO_IDENTIFICADA = {
  bg: 'bg-slate-100',
  text: 'text-slate-500',
}

export default function RadarPage() {
  const [obras, setObras] = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroFase, setFiltroFase] = useState('todos')
  const [filtroCidade, setFiltroCidade] = useState('todos')
  const [cidades, setCidades] = useState<string[]>([])
  const [tenantId, setTenantId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.log('[radar] sem usuario')
          setLoading(false)
          return
        }

        const { data: tu, error: errTu } = await supabase
          .from('tenant_users')
          .select('tenant_id')
          .eq('user_id', user.id)
          .single()

        if (errTu || !tu) {
          console.error('[radar] tenant_users error:', errTu?.message)
          setLoading(false)
          return
        }
        setTenantId(tu.tenant_id)
        console.log('[radar] tenant_id:', tu.tenant_id)

        // Timeout de seguranca: 10s
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
          console.error('[radar] timeout 10s')
          controller.abort()
        }, 10000)

        const { data, error } = await supabase
          .from('radar_obras')
          .select('*')
          .eq('tenant_id', tu.tenant_id)
          .order('created_at', { ascending: false })
          .limit(200)

        clearTimeout(timeoutId)

        if (error) {
          console.error('[radar] obras error:', error.message)
          setLoading(false)
          return
        }

        console.log('[radar] carregou', data?.length, 'obras')
        let obrasCarregadas = (data ?? []) as Obra[]

        const obrasComGlobal = obrasCarregadas.filter((o) => o.obra_global_id)
        if (obrasComGlobal.length > 0) {
          const ids = obrasComGlobal.map((o) => o.obra_global_id!)
          const { data: globais } = await supabase
            .from('radar_obras_globais')
            .select('id, total_marcacoes, total_confirmacoes')
            .in('id', ids)
          if (globais) {
            const map = new Map((globais as any[]).map((g) => [g.id, g]))
            obrasCarregadas = obrasCarregadas.map((o) => ({
              ...o,
              total_marcacoes_globais: o.obra_global_id ? map.get(o.obra_global_id)?.total_marcacoes ?? 0 : 0,
              total_confirmacoes_globais: o.obra_global_id ? map.get(o.obra_global_id)?.total_confirmacoes ?? 0 : 0,
            })) as any
          }
        }

        setObras(obrasCarregadas)

        const cities = Array.from(new Set((data ?? []).map((o: any) => o.endereco_cidade)))
        setCidades(cities.sort() as string[])
        setLoading(false)
      } catch (err: any) {
        console.error('[radar] erro fatal:', err?.message || err)
        setLoading(false)
      }
    }
    load()
  }, [])

  const obrasFiltradas = obras.filter((obra) => {
    const matchBusca =
      !busca ||
      obra.endereco_logradouro.toLowerCase().includes(busca.toLowerCase()) ||
      obra.endereco_bairro?.toLowerCase().includes(busca.toLowerCase())
    const matchFase = filtroFase === 'todos' || obra.fase_atual === filtroFase
    const matchCidade = filtroCidade === 'todos' || obra.endereco_cidade === filtroCidade
    return matchBusca && matchFase && matchCidade
  })

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
          <p className="mt-2 text-sm text-muted-foreground">Carregando radar...</p>
        </div>
      </div>
    )
  }

  const obrasPorScore = {
    alto: obrasFiltradas.filter((o) => (o.qualidade_score ?? 50) > 80).length,
    medio: obrasFiltradas.filter((o) => {
      const s = o.qualidade_score ?? 50
      return s > 60 && s <= 80
    }).length,
    baixo: obrasFiltradas.filter((o) => (o.qualidade_score ?? 50) <= 60).length,
  }

  function exportarCSV() {
    const headers = [
      'Logradouro', 'Número', 'Bairro', 'Cidade', 'UF', 'CEP',
      'Fase', 'Porte', 'Valor Estimado', 'Score', 'Status', 'Fonte', 'Data Início'
    ]
    const rows = obrasFiltradas.map(o => [
      o.endereco_logradouro,
      o.endereco_numero || '',
      o.endereco_bairro || '',
      o.endereco_cidade,
      o.endereco_uf,
      (o as any).endereco_cep ?? '',
      o.fase_atual,
      o.porte,
      o.valor_estimado ?? '',
      o.qualidade_score ?? 50,
      o.status,
      o.fonte,
      '', // data_inicio se quiser puxar depois
    ])

    const csv = [
      headers.join(';'),
      ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
    ].join('\n')

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `radar-obras-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-dark">Radar de Obras</h1>
          <p className="text-sm text-muted-foreground">
            {obras.length} obras · {obrasPorScore.alto} alto potencial · últimas 24h
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportarCSV}
            disabled={obrasFiltradas.length === 0}
          >
            <Download className="h-4 w-4 mr-1" />
            Exportar CSV ({obrasFiltradas.length})
          </Button>
        </div>
      </div>

      {/* Score overview */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Alto potencial', count: obrasPorScore.alto, color: 'text-primary' },
          { label: 'Médio potencial', count: obrasPorScore.medio, color: 'text-amber-600' },
          { label: 'Em andamento', count: obrasPorScore.baixo, color: 'text-secondary' },
        ].map(({ label, count, color }) => (
          <Card key={label} className="border-border/50">
            <CardContent className="p-4 text-center">
              <p className={`font-heading text-3xl font-bold ${color}`}>{count}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por endereço, bairro..."
            className="pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={filtroFase}
            onChange={(e) => setFiltroFase(e.target.value)}
          >
            <option value="todos">Todas fases</option>
            <option value="alvara">Alvará</option>
            <option value="fundacao">Fundação</option>
            <option value="estrutura">Estrutura</option>
            <option value="acabamento">Acabamento</option>
            <option value="concluida">Concluída</option>
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={filtroCidade}
            onChange={(e) => setFiltroCidade(e.target.value)}
          >
            <option value="todos">Todas cidades</option>
            {cidades.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mapa placeholder + Lista */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mini mapa */}
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="relative h-64 bg-[#EEF1F2]">
              <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid2" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#0F1B24" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid2)" />
                <line x1="0" y1="80" x2="100%" y2="80" stroke="#2E6F8E" strokeWidth="2"/>
                <line x1="100" y1="0" x2="100" y2="100%" stroke="#2E6F8E" strokeWidth="2"/>
                <line x1="200" y1="0" x2="200" y2="100%" stroke="#2E6F8E" strokeWidth="1.5"/>
                <line x1="0" y1="150" x2="100%" y2="150" stroke="#2E6F8E" strokeWidth="1.5"/>
              </svg>
              {obrasFiltradas.slice(0, 15).map((obra, i) => {
                const x = 10 + (i % 5) * 18 + Math.random() * 10
                const y = 10 + Math.floor(i / 5) * 30 + Math.random() * 15
                const score = obra.qualidade_score ?? 50
                return (
                  <div
                    key={obra.id}
                    className="absolute group"
                    style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                  >
                    <div
                      className="h-5 w-5 rounded-full shadow-md cursor-pointer transition-transform group-hover:scale-150 flex items-center justify-center"
                      style={{
                        backgroundColor: score > 80 ? '#D9541F' : score > 60 ? '#D97706' : '#2E6F8E',
                      }}
                    />
                  </div>
                )
              })}
              <div className="absolute bottom-2 left-2 flex gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-primary"/>
                  <span className="text-muted-foreground">Alto</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-amber-500"/>
                  <span className="text-muted-foreground">Médio</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-secondary"/>
                  <span className="text-muted-foreground">Normal</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista */}
        <div className="space-y-3">
          {obrasFiltradas.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <MapPin className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">
                  {obras.length === 0
                    ? 'Nenhuma obra detectada ainda. As obras aparecem aqui quando o radar encontra alvarás e CNOs.'
                    : 'Nenhuma obra encontrada com os filtros.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            obrasFiltradas.slice(0, 10).map((obra) => (
              <Link href={`/dashboard/radar/${obra.id}`} key={obra.id} className="block">
              <Card className="border-border/50 hover:shadow-md hover:border-primary/40 cursor-pointer transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 ${
                        (obra.qualidade_score ?? 50) > 80 ? 'bg-primary/10' : 'bg-secondary/10'
                      }`}>
                        <Building className={`h-4 w-4 ${
                          (obra.qualidade_score ?? 50) > 80 ? 'text-primary' : 'text-secondary'
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-dark truncate">
                          {obra.endereco_logradouro}{obra.endereco_numero ? `, ${obra.endereco_numero}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {obra.endereco_bairro ? `${obra.endereco_bairro} · ` : ''}
                          {obra.endereco_cidade} / {obra.endereco_uf}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">
                          {obra.fonte.replace('_', ' ')} · {obra.porte}
                          {obra.valor_estimado && (
                            <> · R$ {obra.valor_estimado.toLocaleString('pt-BR')}</>
                          )}
                        </p>
                        {(obra as any).total_marcacoes_globais > 0 && (
                          <p className="text-xs mt-1.5 inline-flex items-center gap-1 text-primary">
                            <ThumbsUp className="h-3 w-3" />
                            <strong>{(obra as any).total_confirmacoes_globais}</strong>
                            <span className="text-muted-foreground">confirmações · {(obra as any).total_marcacoes_globais} marcações</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        obra.fase_atual ? FASE_COLORS[obra.fase_atual]?.bg : FASE_NAO_IDENTIFICADA.bg
                      } ${obra.fase_atual ? FASE_COLORS[obra.fase_atual]?.text : FASE_NAO_IDENTIFICADA.text}`}>
                        {obra.fase_atual ? obra.fase_atual : 'Não identificada'}
                      </span>
                      <span className="text-xs font-semibold" style={{
                        color: (obra.qualidade_score ?? 50) > 80 ? '#D9541F' : (obra.qualidade_score ?? 50) > 60 ? '#D97706' : '#2E6F8E'
                      }}>
                        {obra.qualidade_score ?? 50}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              </Link>
            ))
          )}
          {obrasFiltradas.length > 10 && (
            <Button variant="outline" className="w-full">
              Ver todas as {obrasFiltradas.length} obras
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
