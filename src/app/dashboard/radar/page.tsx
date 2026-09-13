'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Search,
  MapPin,
  Building,
  ChevronRight,
  Download,
  ThumbsUp,
  Crosshair,
  Route,
} from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { RadarRotaMiniWidget } from '@/components/radar/RadarRotaDia'

const RadarMap = dynamic(
  () => import('@/components/radar/RadarMap').then((m) => m.RadarMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full bg-[#EEF1F2] animate-pulse flex items-center justify-center">
        <span className="text-xs text-muted-foreground">Carregando mapa...</span>
      </div>
    ),
  }
)

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
  lat?: number
  lng?: number
  distancia_km?: number
  fase_consolidada?: string
  total_marcacoes?: number
}

type GeoPos = { lat: number; lng: number }

const FASE_COLORS: Record<string, { bg: string; text: string }> = {
  alvara: { bg: 'bg-red-50', text: 'text-red-700' },
  fundacao: { bg: 'bg-amber-50', text: 'text-amber-700' },
  estrutura: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
  acabamento: { bg: 'bg-green-50', text: 'text-green-700' },
  concluida: { bg: 'bg-gray-50', text: 'text-gray-500' },
  nao_iniciou: { bg: 'bg-slate-50', text: 'text-slate-600' },
}

const FASE_NAO_IDENTIFICADA = { bg: 'bg-slate-100', text: 'text-slate-500' }

const RAIO_OPCOES = [10, 25, 50, 100]
const UBERLANDIA_CENTER = { lat: -18.9186, lng: -48.2772 }

export default function RadarPage() {
  const [obras, setObras] = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroFase, setFiltroFase] = useState('todos')
  const [filtroCidade, setFiltroCidade] = useState('todos')
  const [cidades, setCidades] = useState<string[]>([])
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [geoPos, setGeoPos] = useState<GeoPos | null>(UBERLANDIA_CENTER)
  const [raioKm, setRaioKm] = useState(50)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 20
  const supabase = createClient()

  // Pegar localização do navegador
  const buscarLocalizacao = useCallback(() => {
    // Primeiro tenta geolocalização do navegador
    if (navigator.geolocation) {
      setGeoLoading(true)
      setGeoError(null)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoPos({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setGeoLoading(false)
        },
        () => {
          // Fallback: Uberlandia
          setGeoPos(UBERLANDIA_CENTER)
          setGeoLoading(false)
        },
        { timeout: 5000 }
      )
    } else {
      setGeoPos(UBERLANDIA_CENTER)
    }
  }, [])

  useEffect(() => { buscarLocalizacao() }, [buscarLocalizacao])

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

        let obrasData: Obra[] = []

        // Se temos posicao geografica, usar funcao com raio
        if (geoPos) {
          const { data: obrasGeo, error: errGeo } = await supabase.rpc('fn_radar_obras_no_raio', {
            p_lat: geoPos.lat,
            p_lng: geoPos.lng,
            p_raio_km: raioKm,
            p_fase: filtroFase !== 'todos' ? filtroFase : null,
            p_cidade: filtroCidade !== 'todos' ? filtroCidade : null,
            p_limit: 200,
            p_tenant: tu.tenant_id,
          })
          if (errGeo) {
            console.error('[radar] fn_radar_obras_no_raio error:', errGeo.message)
          } else {
            obrasData = (obrasGeo ?? []) as Obra[]
          }
        }

        // Se não tem geo ou falha, carregar todas
        if (obrasData.length === 0) {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 15000)

          const { data, error } = await supabase
            .from('radar_obras')
            .select('*')
            .eq('tenant_id', tu.tenant_id)
            .order('qualidade_score', { ascending: false })
            .limit(500)

          clearTimeout(timeoutId)
          if (error) {
            console.error('[radar] obras error:', error.message)
            setLoading(false)
            return
          }
          obrasData = (data ?? []) as Obra[]
        }

        // Enriquecer com dados da global
        const obrasComGlobal = obrasData.filter((o) => o.obra_global_id)
        if (obrasComGlobal.length > 0) {
          const ids = obrasComGlobal.map((o) => o.obra_global_id!)
          const { data: globais } = await supabase
            .from('radar_obras_globais')
            .select('id, total_marcacoes, total_confirmacoes')
            .in('id', ids)
          if (globais) {
            const map = new Map((globais as any[]).map((g) => [g.id, g]))
            obrasData = obrasData.map((o) => ({
              ...o,
              total_marcacoes: o.obra_global_id ? map.get(o.obra_global_id)?.total_marcacoes ?? 0 : 0,
            })) as Obra[]
          }
        }

        setObras(obrasData)
        const cities = Array.from(new Set(obrasData.map((o) => o.endereco_cidade)))
        setCidades(cities.sort() as string[])
        setLoading(false)
      } catch (err: any) {
        console.error('[radar] erro fatal:', err?.message || err)
        setLoading(false)
      }
    }
    load()
  }, [supabase, geoPos, raioKm, filtroFase, filtroCidade])

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [busca, filtroFase, filtroCidade, raioKm])

  const obrasFiltradas = obras.filter((obra) => {
    const matchBusca =
      !busca ||
      obra.endereco_logradouro.toLowerCase().includes(busca.toLowerCase()) ||
      obra.endereco_bairro?.toLowerCase().includes(busca.toLowerCase())
    const matchFase = filtroFase === 'todos' || obra.fase_atual === filtroFase
    const matchCidade = filtroCidade === 'todos' || obra.endereco_cidade === filtroCidade
    return matchBusca && matchFase && matchCidade
  })

  const totalPages = Math.ceil(obrasFiltradas.length / PAGE_SIZE)
  const paginatedObras = obrasFiltradas.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

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
            {obras.length} obras · {obrasFiltradas.length} mostradas · Uberlândia/MG
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/radar/rota">
            <Button variant="outline" size="sm">
              <Route className="h-4 w-4 mr-1" />
              Rota do Dia
            </Button>
          </Link>
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

      {/* Score overview + Rota */}
      <div className="grid gap-4 lg:grid-cols-4">
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
        <RadarRotaMiniWidget className="col-span-1" />
      </div>

      {/* Geo + Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por endereco, bairro..."
            className="pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {/* Geo badge */}
        <div className="flex items-center gap-2">
          {geoPos && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 text-primary" />
              <span>Uberlândia</span>
            </div>
          )}
          <select
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            value={raioKm}
            onChange={(e) => setRaioKm(Number(e.target.value))}
            disabled={!geoPos}
          >
            {RAIO_OPCOES.map((r) => (
              <option key={r} value={r}>{r} km</option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={buscarLocalizacao}
            disabled={geoLoading}
            title="Atualizar localizacao"
          >
            <Crosshair className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={filtroFase}
            onChange={(e) => setFiltroFase(e.target.value)}
          >
            <option value="todos">Todas fases</option>
            <option value="alvara">Alvara</option>
            <option value="fundacao">Fundacao</option>
            <option value="estrutura">Estrutura</option>
            <option value="acabamento">Acabamento</option>
            <option value="concluida">Concluida</option>
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

      {/* Mapa + Lista */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mapa interativo */}
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-0">
            {geoPos ? (
              <RadarMap
                center={geoPos}
                markers={obrasFiltradas.map((o) => ({
                  id: o.id,
                  lat: o.lat ?? 0,
                  lng: o.lng ?? 0,
                  fase: o.fase_atual ?? o.fase_consolidada ?? null,
                  score: o.qualidade_score ?? 50,
                  titulo: `${o.endereco_logradouro}${o.endereco_numero ? `, ${o.endereco_numero}` : ''}`,
                  distancia_km: o.distancia_km,
                }))}
                onMarkerClick={(id) => {
                  const obras = document.querySelector(`[data-obra-id="${id}"]`)
                  obras?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
                className="h-64"
              />
            ) : (
              <div className="h-64 flex items-center justify-center bg-[#EEF1F2]">
                {geoLoading ? (
                  <div className="text-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                    <p className="text-xs text-muted-foreground mt-2">Buscando localizacao...</p>
                  </div>
                ) : geoError ? (
                  <div className="text-center px-4">
                    <MapPin className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">{geoError}</p>
                    <Button size="sm" variant="outline" onClick={buscarLocalizacao} className="mt-2">
                      Tentar novamente
                    </Button>
                  </div>
                ) : (
                  <div className="text-center">
                    <Crosshair className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Clique em "buscar localizacao" para ver o mapa</p>
                  </div>
                )}
              </div>
            )}
            <div className="absolute bottom-2 left-2 flex gap-3 text-xs bg-white/80 px-2 py-1 rounded">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-[#D9541F]"/>
                <span className="text-muted-foreground">Alto</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-[#D97706]"/>
                <span className="text-muted-foreground">Medio</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-[#2E6F8E]"/>
                <span className="text-muted-foreground">Normal</span>
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
            paginatedObras.map((obra) => (
              <Link href={`/dashboard/radar/${obra.id}`} key={obra.id} data-obra-id={obra.id} className="block">
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
          {/* Pagination */}
          {obrasFiltradas.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, obrasFiltradas.length)} de {obrasFiltradas.length} obras
              </p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const page = i + Math.max(1, currentPage - 2)
                  if (page > totalPages) return null
                  return (
                    <Button
                      key={page}
                      size="sm"
                      variant={page === currentPage ? 'default' : 'outline'}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  )
                })}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Proxima
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
