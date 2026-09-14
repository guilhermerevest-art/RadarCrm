'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  MapPin,
  Building,
  Download,
  Route,
  Crosshair,
  TrendingUp,
  Clock,
  Filter,
  ArrowUpDown,
  Star,
  ChevronUp,
  ChevronDown,
  X,
  User,
  Building2,
  FileText,
  Briefcase,
} from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { RadarRotaMiniWidget } from '@/components/radar/RadarRotaDia'

const RadarMap = dynamic(
  () => import('@/components/radar/RadarMap').then((m) => m.RadarMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[200px] bg-[#EEF1F2] animate-pulse flex items-center justify-center rounded-lg">
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
  responsavel_nome?: string
  responsavel_documento?: string
  responsavel_qualificacao?: string
}

// Dados enriquecidos da empresa (CNPJ)
type EmpresaEnriquecida = {
  cnpj: string
  cnpj_basico: string
  razao_social?: string
  nome_fantasia?: string
  situacao_cadastral?: string
  natureza_juridica?: string
  cnae_principal?: string
  porte?: string
  capital_social?: number
  data_abertura?: string
  telefone?: string
  email?: string
}

// Formata CNPJ ou CPF para exibição
function formatarDocumento(doc: string | undefined): string {
  if (!doc) return ''
  const digits = doc.replace(/\D/g, '')
  if (digits.length === 14) {
    // CNPJ
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
  } else if (digits.length === 11) {
    // CPF
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  }
  return doc
}

// Verifica se é CNPJ ou CPF
function isCNPJ(doc: string | undefined): boolean {
  if (!doc) return false
  return doc.replace(/\D/g, '').length === 14
}

// Badge do responsável/construtora
function ResponsavelBadge({ obra, empresa }: { obra: Partial<Obra>; empresa?: EmpresaEnriquecida }) {
  const nome = obra.responsavel_nome
  const documento = obra.responsavel_documento
  const ehCNPJ = isCNPJ(documento)

  // Se tem empresa enriquecida, mostrar razão social
  const nomeExibido = empresa?.razao_social || empresa?.nome_fantasia || nome

  if (!nomeExibido && !documento) {
    return (
      <span className="text-xs text-gray-400 italic">Responsável não identificado</span>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {ehCNPJ ? (
          <Building2 className="h-3.5 w-3.5 text-blue-600" />
        ) : (
          <User className="h-3.5 w-3.5 text-gray-500" />
        )}
        <span className="text-sm font-semibold text-gray-800 truncate max-w-[180px]" title={nomeExibido}>
          {nomeExibido}
        </span>
      </div>
      {documento && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          {ehCNPJ ? (
            <FileText className="h-3 w-3" />
          ) : (
            <User className="h-3 w-3" />
          )}
          <span>{formatarDocumento(documento)}</span>
          {empresa?.situacao_cadastral && (
            <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
              empresa.situacao_cadastral === 'Ativa' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {empresa.situacao_cadastral}
            </span>
          )}
        </div>
      )}
      {empresa?.cnae_principal && (
        <div className="text-xs text-gray-400 truncate max-w-[200px]" title={empresa.cnae_principal}>
          CNAE: {empresa.cnae_principal}
        </div>
      )}
    </div>
  )
}

type GeoPos = { lat: number; lng: number }

const UBERLANDIA_CENTER = { lat: -18.9186, lng: -48.2772 }
const RAIO_OPCOES = [10, 25, 50, 100]

// Ordenações disponíveis
type SortKey = 'score' | 'endereco' | 'valor' | 'fase'
type SortDir = 'asc' | 'desc'

const FASE_CONFIG: Record<string, { bg: string; text: string; icon: string; label: string }> = {
  alvara: { bg: 'bg-red-100', text: 'text-red-700', icon: '🚧', label: 'Alvará' },
  fundacao: { bg: 'bg-amber-100', text: 'text-amber-700', icon: '🧱', label: 'Fundação' },
  estrutura: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '🏗️', label: 'Estrutura' },
  acabamento: { bg: 'bg-green-100', text: 'text-green-700', icon: '✨', label: 'Acabamento' },
  concluida: { bg: 'bg-gray-100', text: 'text-gray-500', icon: '✅', label: 'Concluída' },
  nao_iniciou: { bg: 'bg-slate-100', text: 'text-slate-600', icon: '📋', label: 'Não Iniciou' },
}

const FASE_NAO_IDENTIFICADA = { bg: 'bg-slate-100', text: 'text-slate-500', icon: '❓', label: 'Não Identificada' }

// Score badge com cor
function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const color = score > 80 ? '#D9541F' : score > 60 ? '#D97706' : '#2E6F8E'
  const bg = score > 80 ? 'bg-orange-100' : score > 60 ? 'bg-amber-100' : 'bg-blue-50'
  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : size === 'lg' ? 'px-3 py-1.5 text-lg' : 'px-2 py-1 text-sm'
  return (
    <span
      className={`inline-flex items-center font-bold rounded-full ${sizeClasses}`}
      style={{ color, backgroundColor: `${color}15` }}
    >
      {score}
    </span>
  )
}

// Fase badge compacto
function FaseBadge({ fase, size = 'sm' }: { fase: string | null; size?: 'sm' | 'md' }) {
  const config = fase ? FASE_CONFIG[fase] : FASE_NAO_IDENTIFICADA
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}>
      <span>{config.icon}</span>
      <span className={size === 'md' ? 'text-sm' : ''}>{config.label}</span>
    </span>
  )
}

// Mini card de estatística
function StatCard({ label, value, color, icon }: { label: string; value: number | string; color: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-white to-gray-50 border border-gray-100">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold" style={{ color }}>{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  )
}

export default function RadarPage() {
  const [obras, setObras] = useState<Obra[]>([])
  const [empresas, setEmpresas] = useState<Map<string, EmpresaEnriquecida>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroFase, setFiltroFase] = useState<string | null>(null)
  const [filtroCidade, setFiltroCidade] = useState<string | null>(null)
  const [filtroScore, setFiltroScore] = useState<'todos' | 'alto' | 'medio'>('todos')
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [cidades, setCidades] = useState<string[]>([])
  const [geoPos, setGeoPos] = useState<GeoPos | null>(UBERLANDIA_CENTER)
  const [raioKm, setRaioKm] = useState(50)
  const [geoLoading, setGeoLoading] = useState(false)
  const [showMap, setShowMap] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 25
  const supabase = createClient()

  // Pegar localização do navegador
  const buscarLocalizacao = useCallback(() => {
    if (navigator.geolocation) {
      setGeoLoading(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoPos({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setGeoLoading(false)
        },
        () => {
          setGeoPos(UBERLANDIA_CENTER)
          setGeoLoading(false)
        },
        { timeout: 5000 }
      )
    }
  }, [])

  useEffect(() => { buscarLocalizacao() }, [buscarLocalizacao])

  // Carregar obras
  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        const { data: tu } = await supabase
          .from('tenant_users')
          .select('tenant_id')
          .eq('user_id', user.id)
          .single()

        if (!tu) {
          setLoading(false)
          return
        }

        let obrasData: Obra[] = []

        if (geoPos) {
          const { data: obrasGeo, error: errGeo } = await supabase.rpc('fn_radar_obras_no_raio', {
            p_lat: geoPos.lat,
            p_lng: geoPos.lng,
            p_raio_km: raioKm,
            p_fase: filtroFase,
            p_cidade: filtroCidade,
            p_limit: 200,
            p_tenant: tu.tenant_id,
          })
          if (!errGeo) {
            obrasData = (obrasGeo ?? []) as Obra[]
          }
        }

        if (obrasData.length === 0) {
          const { data, error } = await supabase
            .from('radar_obras')
            .select('*')
            .eq('tenant_id', tu.tenant_id)
            .order('qualidade_score', { ascending: false })
            .limit(500)

          if (!error) {
            obrasData = (data ?? []) as Obra[]
          }
        }

        // Enriquecer com dados globais
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

        // Enriquecer com dados da empresa (quando responsavel e CNPJ)
        const obrasComCNPJ = obrasData.filter((o) => o.responsavel_documento && isCNPJ(o.responsavel_documento))
        if (obrasComCNPJ.length > 0) {
          const cnpjsSet = new Set(obrasComCNPJ.map((o) => o.responsavel_documento!))
          const cnpjs = Array.from(cnpjsSet)
          const { data: empresasData } = await supabase
            .from('radar_obras_empresas')
            .select('cnpj, cnpj_basico, razao_social, nome_fantasia, situacao_cadastral')
            .eq('tenant_id', tu.tenant_id)
            .in('cnpj', cnpjs)

          if (empresasData) {
            const empresasMap = new Map(empresasData.map((e: any) => [e.cnpj, e as EmpresaEnriquecida]))
            setEmpresas(empresasMap)
          }
        }

        setObras(obrasData)
        const cities = Array.from(new Set(obrasData.map((o) => o.endereco_cidade)))
        setCidades(cities.sort() as string[])
        setLoading(false)
      } catch (err) {
        console.error('[radar] erro:', err)
        setLoading(false)
      }
    }
    load()
  }, [supabase, geoPos, raioKm, filtroFase, filtroCidade])

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [busca, filtroFase, filtroCidade, filtroScore, sortKey, sortDir])

  // Filtrar e ordenar obras
  const obrasProcessadas = useMemo(() => {
    let filtered = obras.filter((obra) => {
      const matchBusca =
        !busca ||
        obra.endereco_logradouro.toLowerCase().includes(busca.toLowerCase()) ||
        obra.endereco_bairro?.toLowerCase().includes(busca.toLowerCase()) ||
        obra.responsavel_nome?.toLowerCase().includes(busca.toLowerCase())
      const matchFase = !filtroFase || obra.fase_atual === filtroFase
      const matchCidade = !filtroCidade || obra.endereco_cidade === filtroCidade
      const score = obra.qualidade_score ?? 50
      const matchScore =
        filtroScore === 'todos' ||
        (filtroScore === 'alto' && score > 80) ||
        (filtroScore === 'medio' && score > 60 && score <= 80)
      return matchBusca && matchFase && matchCidade && matchScore
    })

    // Ordenar
    filtered.sort((a, b) => {
      let aVal: any, bVal: any
      switch (sortKey) {
        case 'score':
          aVal = a.qualidade_score ?? 50
          bVal = b.qualidade_score ?? 50
          break
        case 'endereco':
          aVal = a.endereco_logradouro
          bVal = b.endereco_logradouro
          break
        case 'valor':
          aVal = a.valor_estimado ?? 0
          bVal = b.valor_estimado ?? 0
          break
        case 'fase':
          aVal = a.fase_atual ?? ''
          bVal = b.fase_atual ?? ''
          break
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [obras, busca, filtroFase, filtroCidade, filtroScore, sortKey, sortDir])

  const totalPages = Math.ceil(obrasProcessadas.length / PAGE_SIZE)
  const paginatedObras = obrasProcessadas.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Estatísticas rápidas
  const stats = useMemo(() => {
    const total = obrasProcessadas.length
    const altoPotencial = obrasProcessadas.filter(o => (o.qualidade_score ?? 50) > 80).length
    const medioPotencial = obrasProcessadas.filter(o => {
      const s = o.qualidade_score ?? 50
      return s > 60 && s <= 80
    }).length
    const comValor = obrasProcessadas.filter(o => o.valor_estimado && o.valor_estimado > 0).length
    const valorTotal = obrasProcessadas.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0)
    const fases = Array.from(new Set(obrasProcessadas.map(o => o.fase_atual).filter(Boolean)))
    return { total, altoPotencial, medioPotencial, comValor, valorTotal, fases }
  }, [obrasProcessadas])

  // Contagem de filtros ativos
  const filtrosAtivos = [filtroFase, filtroCidade, filtroScore !== 'todos'].filter(Boolean).length

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function clearFilters() {
    setBusca('')
    setFiltroFase(null)
    setFiltroCidade(null)
    setFiltroScore('todos')
    setMostrarFiltros(false)
  }

  function exportarCSV() {
    const headers = ['Logradouro', 'Número', 'Bairro', 'Cidade', 'UF', 'Fase', 'Porte', 'Valor Estimado', 'Score', 'Status']
    const rows = obrasProcessadas.map(o => [
      o.endereco_logradouro,
      o.endereco_numero || '',
      o.endereco_bairro || '',
      o.endereco_cidade,
      o.endereco_uf,
      o.fase_atual,
      o.porte,
      o.valor_estimado ?? '',
      o.qualidade_score ?? 50,
      o.status,
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-primary border-t-transparent mx-auto" />
          <p className="mt-3 text-sm text-muted-foreground">Carregando radar...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-dark flex items-center gap-2">
            <span className="text-2xl">📡</span>
            Radar de Obras
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {stats.total} obras encontradas em Uberlândia/MG
            {filtrosAtivos > 0 && <span className="ml-2 text-primary font-medium">({filtrosAtivos} filtro{filtrosAtivos > 1 ? 's' : ''} ativo{filtrosAtivos > 1 ? 's' : ''})</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMap(!showMap)}
            className={showMap ? 'bg-blue-50 border-blue-200' : ''}
          >
            <MapPin className="h-4 w-4 mr-1" />
            {showMap ? 'Ocultar' : 'Mostrar'} Mapa
          </Button>
          <Link href="/dashboard/radar/rota">
            <Button variant="outline" size="sm">
              <Route className="h-4 w-4 mr-1" />
              Rota do Dia
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={exportarCSV} disabled={stats.total === 0}>
            <Download className="h-4 w-4 mr-1" />
            Exportar ({stats.total})
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total de Obras"
          value={stats.total}
          color="#2E6F8E"
          icon={<Building className="h-5 w-5 text-[#2E6F8E]" />}
        />
        <StatCard
          label="Alto Potencial"
          value={stats.altoPotencial}
          color="#D9541F"
          icon={<Star className="h-5 w-5 text-[#D9541F]" />}
        />
        <StatCard
          label="Médio Potencial"
          value={stats.medioPotencial}
          color="#D97706"
          icon={<TrendingUp className="h-5 w-5 text-[#D97706]" />}
        />
        <StatCard
          label="Com Valor"
          value={stats.comValor}
          color="#16A34A"
          icon={<span className="text-lg">💰</span>}
        />
      </div>

      {/* Barra de busca e filtros principais */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar por endereço, bairro, responsável..."
            className="pl-10 pr-10 h-11"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Botão de filtros */}
          <Button
            variant={mostrarFiltros ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className="h-11"
          >
            <Filter className="h-4 w-4 mr-1" />
            Filtros
            {filtrosAtivos > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 text-xs justify-center">
                {filtrosAtivos}
              </Badge>
            )}
          </Button>

          {/* Ordenação rápida */}
          <div className="flex items-center border rounded-md h-11 bg-white">
            <button
              onClick={() => toggleSort('score')}
              className={`flex items-center gap-1 px-3 h-full text-xs font-medium ${sortKey === 'score' ? 'bg-primary text-white' : 'hover:bg-gray-50'}`}
            >
              Score
              {sortKey === 'score' && (sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
            </button>
            <div className="w-px h-4 bg-gray-200" />
            <button
              onClick={() => toggleSort('valor')}
              className={`flex items-center gap-1 px-3 h-full text-xs font-medium ${sortKey === 'valor' ? 'bg-primary text-white' : 'hover:bg-gray-50'}`}
            >
              Valor
              {sortKey === 'valor' && (sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
            </button>
            <div className="w-px h-4 bg-gray-200" />
            <button
              onClick={() => toggleSort('endereco')}
              className={`flex items-center gap-1 px-3 h-full text-xs font-medium ${sortKey === 'endereco' ? 'bg-primary text-white' : 'hover:bg-gray-50'}`}
            >
              Endereço
              {sortKey === 'endereco' && (sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
            </button>
          </div>

          {/* Limpar filtros */}
          {filtrosAtivos > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-11 text-gray-500">
              <X className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Painel de filtros expandidos */}
      {mostrarFiltros && (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex flex-wrap gap-4">
            {/* Fase */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Fase da Obra</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFiltroFase(null)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!filtroFase ? 'bg-primary text-white' : 'bg-white border border-gray-200 hover:bg-gray-100'}`}
                >
                  Todas
                </button>
                {Object.entries(FASE_CONFIG).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => setFiltroFase(filtroFase === key ? null : key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filtroFase === key ? `${config.bg} ${config.text} ring-2 ring-offset-1 ring-primary` : 'bg-white border border-gray-200 hover:bg-gray-100'}`}
                  >
                    {config.icon} {config.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Score */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Potencial</label>
              <div className="flex gap-2">
                {[
                  { key: 'todos', label: 'Todos', color: 'gray' },
                  { key: 'alto', label: 'Alto (>80)', color: 'orange' },
                  { key: 'medio', label: 'Médio (60-80)', color: 'amber' },
                ].map(({ key, label, color }) => (
                  <button
                    key={key}
                    onClick={() => setFiltroScore(key as any)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filtroScore === key ? `bg-${color}-100 text-${color}-700 border border-${color}-300` : 'bg-white border border-gray-200 hover:bg-gray-100'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cidade */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Cidade</label>
              <select
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm"
                value={filtroCidade ?? ''}
                onChange={(e) => setFiltroCidade(e.target.value || null)}
              >
                <option value="">Todas</option>
                {cidades.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Raio */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Raio</label>
              <div className="flex gap-1">
                {RAIO_OPCOES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRaioKm(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${raioKm === r ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-white border border-gray-200 hover:bg-gray-100'}`}
                  >
                    {r}km
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mapa + Lista */}
      <div className={`grid gap-6 ${showMap ? 'lg:grid-cols-5' : 'grid-cols-1'}`}>
        {/* Mapa */}
        {showMap && (
          <div className={`lg:col-span-2 ${showMap ? '' : 'hidden'}`}>
            <Card className="border-gray-200 overflow-hidden h-full">
              <CardContent className="p-3 h-full">
                {geoPos ? (
                  <RadarMap
                    center={geoPos}
                    markers={obrasProcessadas.map((o) => ({
                      id: o.id,
                      lat: o.lat ?? 0,
                      lng: o.lng ?? 0,
                      fase: o.fase_atual ?? o.fase_consolidada ?? null,
                      score: o.qualidade_score ?? 50,
                      titulo: `${o.endereco_logradouro}${o.endereco_numero ? `, ${o.endereco_numero}` : ''}`,
                      distancia_km: o.distancia_km,
                    }))}
                    onMarkerClick={(id) => {
                      const el = document.querySelector(`[data-obra-id="${id}"]`)
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      el?.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
                      setTimeout(() => el?.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 2000)
                    }}
                    className="h-[400px] lg:h-full min-h-[300px]"
                  />
                ) : (
                  <div className="h-full min-h-[300px] flex items-center justify-center bg-gray-100 rounded-lg">
                    <div className="text-center">
                      <MapPin className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Mapa indisponível</p>
                      <Button size="sm" variant="outline" onClick={buscarLocalizacao} className="mt-2">
                        <Crosshair className="h-4 w-4 mr-1" />
                        Buscar localização
                      </Button>
                    </div>
                  </div>
                )}

                {/* Legenda do mapa */}
                <div className="flex gap-4 mt-2 text-xs bg-white/80 px-2 py-1 rounded justify-center">
                  {[
                    { color: '#D9541F', label: 'Alto' },
                    { color: '#D97706', label: 'Médio' },
                    { color: '#2E6F8E', label: 'Normal' },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-gray-600">{label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Lista de Obras */}
        <div className={`${showMap ? 'lg:col-span-3' : 'col-span-1'}`}>
          {obrasProcessadas.length === 0 ? (
            <Card className="border-gray-200">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Building className="h-16 w-16 text-gray-300 mb-4" />
                <p className="text-lg font-medium text-gray-600 mb-2">
                  {obras.length === 0 ? 'Nenhuma obra encontrada' : 'Nenhum resultado para os filtros'}
                </p>
                <p className="text-sm text-gray-400 mb-4 max-w-md">
                  {obras.length === 0
                    ? 'As obras aparecem aqui quando o radar detecta alvarás e CNOs na sua região.'
                    : 'Tente ajustar os filtros ou buscar por outros termos.'}
                </p>
                {obras.length > 0 && (
                  <Button variant="outline" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {paginatedObras.map((obra) => (
                <Link href={`/dashboard/radar/${obra.id}`} key={obra.id} data-obra-id={obra.id} className="block">
                  <Card className="border-gray-200 hover:shadow-md hover:border-primary/40 cursor-pointer transition-all bg-white">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Score grande */}
                        <div className="flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200">
                          <span className="text-2xl font-black" style={{
                            color: (obra.qualidade_score ?? 50) > 80 ? '#D9541F' : (obra.qualidade_score ?? 50) > 60 ? '#D97706' : '#2E6F8E'
                          }}>
                            {obra.qualidade_score ?? 50}
                          </span>
                          <span className="text-[10px] text-gray-400 -mt-1">score</span>
                        </div>

                        {/* Info principal */}
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Endereço e fase */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-gray-900 truncate">
                                {obra.endereco_logradouro}
                                {obra.endereco_numero && <span className="text-gray-500">, {obra.endereco_numero}</span>}
                              </p>
                              <p className="text-sm text-gray-500 truncate">
                                {obra.endereco_bairro && `${obra.endereco_bairro} · `}
                                {obra.endereco_cidade} / {obra.endereco_uf}
                              </p>
                            </div>
                            <FaseBadge fase={obra.fase_atual} />
                          </div>

                          {/* Responsável / Construtora - DESTAQUE PRINCIPAL */}
                          <div className="flex items-start gap-3 p-3 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
                            <ResponsavelBadge
                              obra={obra}
                              empresa={obra.responsavel_documento ? empresas.get(obra.responsavel_documento) : undefined}
                            />
                          </div>

                          {/* Tags de info rápida */}
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-xs capitalize">
                              {obra.porte}
                            </Badge>
                            {obra.valor_estimado && (
                              <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50">
                                💰 R$ {obra.valor_estimado.toLocaleString('pt-BR')}
                              </Badge>
                            )}
                            {obra.fonte && (
                              <Badge variant="outline" className="text-xs text-gray-600">
                                {obra.fonte.replace('_', ' ')}
                              </Badge>
                            )}
                            {obra.distancia_km && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {obra.distancia_km.toFixed(1)} km
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Indicador visual de potencial */}
                        <div className="flex-shrink-0">
                          <div
                            className="w-2 h-12 rounded-full"
                            style={{
                              background: (obra.qualidade_score ?? 50) > 80
                                ? 'linear-gradient(to bottom, #D9541F, #FF6B35)'
                                : (obra.qualidade_score ?? 50) > 60
                                  ? 'linear-gradient(to bottom, #D97706, #FBBF24)'
                                  : 'linear-gradient(to bottom, #2E6F8E, #6B9AC4)'
                            }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 mt-4 border-t">
              <p className="text-sm text-gray-500">
                Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, obrasProcessadas.length)} de {obrasProcessadas.length}
              </p>
              <div className="flex gap-2">
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
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
