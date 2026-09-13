'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Building2,
  Plus,
  Search,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  MessageSquare,
  DollarSign,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
} from 'lucide-react'
import Link from 'next/link'

type CadastroComercial = {
  id: string
  tenant_id: string
  nome: string
  cnpj?: string
  telefone?: string
  email?: string
  segmento?: string
  porte: string
  etapa: string
  origem: string
  responsavel_id?: string
  valor_estimado?: number
  probabilidade?: number
  ultimo_contato?: string
  created_at: string
}

const ETAPA_COLORS: Record<string, string> = {
  novo: 'bg-blue-50 text-blue-700 border-blue-200',
  contato_inicial: 'bg-purple-50 text-purple-700 border-purple-200',
  qualificacao: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  proposta: 'bg-amber-50 text-amber-700 border-amber-200',
  negociacao: 'bg-orange-50 text-orange-700 border-orange-200',
  fechado_ganho: 'bg-green-50 text-green-700 border-green-200',
  fechado_perdido: 'bg-red-50 text-red-700 border-red-200',
  inativo: 'bg-gray-50 text-gray-500 border-gray-200',
}

const ETAPA_LABELS: Record<string, string> = {
  novo: 'Novo',
  contato_inicial: 'Contato',
  qualificacao: 'Qualificacao',
  proposta: 'Proposta',
  negociacao: 'Negociacao',
  fechado_ganho: 'Ganho',
  fechado_perdido: 'Perdido',
  inativo: 'Inativo',
}

const ORIGEM_LABELS: Record<string, string> = {
  radar: 'Radar',
  indicacao: 'Indicacao',
  formulario: 'Formulario',
  manual: 'Manual',
  importacao: 'Importacao',
}

const PORTE_LABELS: Record<string, string> = {
  micro: 'Micro',
  pequeno: 'Pequeno',
  medio: 'Medio',
  grande: 'Grande',
  desconhecido: 'Porte Desconhecido',
}

export default function ComerciaisPage() {
  const [cadastros, setCadastros] = useState<CadastroComercial[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState<string>('todos')
  const [tenantId, setTenantId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: tu } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()

      if (!tu) return
      setTenantId(tu.tenant_id)

      const { data: cadastrosData } = await supabase
        .from('cadastros_comerciais')
        .select('*')
        .eq('tenant_id', tu.tenant_id)
        .order('created_at', { ascending: false })

      setCadastros((cadastrosData ?? []) as CadastroComercial[])
      setLoading(false)
    }

    loadData()
  }, [])

  const cadastrosFiltrados = cadastros.filter((c) => {
    const matchBusca = !busca ||
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.cnpj?.includes(busca) ||
      c.email?.toLowerCase().includes(busca.toLowerCase()) ||
      c.segmento?.toLowerCase().includes(busca.toLowerCase())

    const matchEtapa = filtroEtapa === 'todos' || c.etapa === filtroEtapa

    return matchBusca && matchEtapa
  })

  // Stats
  const totalValor = cadastros
    .filter(c => c.valor_estimado)
    .reduce((sum, c) => sum + (c.valor_estimado ?? 0), 0)

  const emProposta = cadastros.filter(c =>
    ['proposta', 'negociacao'].includes(c.etapa)
  ).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Cadastros Comerciais
          </h1>
          <p className="text-sm text-muted-foreground">
            Empresas identificadas no radar que podem se tornar clientes
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/comerciais/novo">
            <Plus className="h-4 w-4 mr-1" />
            Novo Cadastro
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{cadastros.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Valor estimado</p>
            <p className="text-2xl font-bold">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValor)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Em proposta/negociacao</p>
            <p className="text-2xl font-bold">{emProposta}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Taxa de ganho</p>
            <p className="text-2xl font-bold">
              {cadastros.length > 0
                ? Math.round(
                    (cadastros.filter(c => c.etapa === 'fechado_ganho').length /
                    cadastros.filter(c => ['fechado_ganho', 'fechado_perdido'].includes(c.etapa)).length || 0) * 100
                  )
                : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CNPJ, email, segmento..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filtroEtapa}
          onChange={(e) => setFiltroEtapa(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="todos">Todas etapas</option>
          {Object.entries(ETAPA_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {cadastrosFiltrados.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">
            {cadastros.length === 0 ? 'Nenhum cadastro comercial ainda' : 'Nenhum resultado para os filtros'}
          </p>
          <p className="text-sm mt-1">
            {cadastros.length === 0
              ? 'Cadastre empresas identificadas no radar para gerenciar o pipeline comercial.'
              : 'Tente ajustar os filtros ou buscar por outro termo.'}
          </p>
          {cadastros.length === 0 && (
            <Button asChild className="mt-4">
              <Link href="/dashboard/comerciais/novo">
                <Plus className="h-4 w-4 mr-1" />
                Criar primeiro cadastro
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {cadastrosFiltrados.map((c) => (
            <Card key={c.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{c.nome}</p>
                    <Badge
                      variant="outline"
                      className={`text-xs ${ETAPA_COLORS[c.etapa] ?? ''}`}
                    >
                      {ETAPA_LABELS[c.etapa] ?? c.etapa}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    {c.cnpj && <span>{c.cnpj}</span>}
                    {c.segmento && <span>{c.segmento}</span>}
                    {c.porte !== 'desconhecido' && (
                      <span>{PORTE_LABELS[c.porte] ?? c.porte}</span>
                    )}
                    <span className="text-muted-foreground/60">{ORIGEM_LABELS[c.origem] ?? c.origem}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  {c.telefone && (
                    <a
                      href={`tel:${c.telefone}`}
                      className="flex items-center gap-1 text-muted-foreground hover:text-primary"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {c.telefone}
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="flex items-center gap-1 text-muted-foreground hover:text-primary"
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                {c.valor_estimado && (
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.valor_estimado)}
                    </p>
                    {c.probabilidade && (
                      <p className="text-xs text-muted-foreground">{c.probabilidade}% prob.</p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/dashboard/comerciais/${c.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/dashboard/comerciais/${c.id}?edit=true`}>
                      <Edit className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
