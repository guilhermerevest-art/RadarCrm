'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Search,
  Plus,
  Filter,
  Users,
  ChevronRight,
  Phone,
  Mail,
  MessageSquare,
  LayoutGrid,
  BarChart3,
  Zap,
  Calendar,
  Upload,
} from 'lucide-react'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ExportCSVButton } from '@/components/crm/ExportCSVButton'
import { ImportLeadsModal } from '@/components/crm/ImportLeadsModal'

type Lead = {
  id: string
  nome: string
  empresa?: string
  email?: string
  telefone?: string
  origem: string
  status: string
  responsavel_id?: string
  created_at: string
  [key: string]: any
}

type Origem = 'todos' | 'whatsapp' | 'formulario_site' | 'indicacao' | 'manual' | 'radar'
type Status = 'todos' | 'novo' | 'qualificado' | 'descarte' | 'convertido'

const STATUS_COLORS: Record<string, string> = {
  novo: 'bg-blue-50 text-blue-700',
  qualificado: 'bg-primary/10 text-primary',
  convertido: 'bg-green-50 text-green-700',
  descarte: 'bg-gray-50 text-gray-500',
}

const ORIGEM_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <MessageSquare className="h-3 w-3" />,
  email: <Mail className="h-3 w-3" />,
  manual: <Users className="h-3 w-3" />,
  radar: <Filter className="h-3 w-3" />,
}

export default function CrmPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroOrigem, setFiltroOrigem] = useState<Origem>('todos')
  const [filtroStatus, setFiltroStatus] = useState<Status>('todos')
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const supabase = createClient()

  async function carregarLeads(tenantId: string) {
    const { data } = await supabase
      .from('crm_leads')
      .select('*, tenant_users(nome)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    setLeads(data ?? [])
  }

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
      await carregarLeads(tu.tenant_id)
      setLoading(false)
    }
    load()
  }, [])

  const leadsFiltrados = leads.filter((lead) => {
    const matchBusca =
      !busca ||
      lead.nome.toLowerCase().includes(busca.toLowerCase()) ||
      lead.empresa?.toLowerCase().includes(busca.toLowerCase()) ||
      lead.email?.toLowerCase().includes(busca.toLowerCase())
    const matchOrigem = filtroOrigem === 'todos' || lead.origem === filtroOrigem
    const matchStatus = filtroStatus === 'todos' || lead.status === filtroStatus
    return matchBusca && matchOrigem && matchStatus
  })

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
          <p className="mt-2 text-sm text-muted-foreground">Carregando CRM...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-dark">CRM</h1>
          <p className="text-sm text-muted-foreground">
            {leads.length} leads · {leadsFiltrados.length} mostrados
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/crm/quadro">
            <Button variant="outline" size="sm">
              <LayoutGrid className="h-4 w-4 mr-1" />
              Pipeline
            </Button>
          </Link>
          <Link href="/dashboard/crm/calendario">
            <Button variant="outline" size="sm">
              <Calendar className="h-4 w-4 mr-1" />
              Calendário
            </Button>
          </Link>
          <Link href="/dashboard/crm/analytics">
            <Button variant="outline" size="sm">
              <BarChart3 className="h-4 w-4 mr-1" />
              Analytics
            </Button>
          </Link>
          <Link href="/dashboard/crm/automacoes">
            <Button variant="outline" size="sm">
              <Zap className="h-4 w-4 mr-1" />
              Automações
            </Button>
          </Link>
          <Link href="/dashboard/crm/novo">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Novo Lead
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Importar CSV
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, empresa ou e-mail..."
            className="pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={filtroOrigem}
            onChange={(e) => setFiltroOrigem(e.target.value as Origem)}
          >
            <option value="todos">Todas origens</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="manual">Manual</option>
            <option value="radar">Radar</option>
            <option value="indicacao">Indicação</option>
            <option value="formulario_site">Formulário</option>
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as Status)}
          >
            <option value="todos">Todos status</option>
            <option value="novo">Novo</option>
            <option value="qualificado">Qualificado</option>
            <option value="convertido">Convertido</option>
            <option value="descarte">Descarte</option>
          </select>
          <ExportCSVButton leads={leadsFiltrados} />
        </div>
      </div>

      {/* Lista de Leads */}
      {leadsFiltrados.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-16 w-16 text-muted-foreground/30 mb-4" />
            {leads.length === 0 ? (
              <>
                <h3 className="font-heading text-lg font-semibold text-dark">Comece a cadastrar leads</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                  Cadastre leads manualmente, importe do WhatsApp ou deixe o radar detectar obras automaticamente.
                </p>
                <Link href="/dashboard/crm/novo">
                  <Button className="mt-6">
                    <Plus className="h-4 w-4 mr-1" />
                    Primeiro lead
                  </Button>
                </Link>
              </>
            ) : (
              <p className="text-muted-foreground">Nenhum lead encontrado com os filtros selecionados.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {leadsFiltrados.map((lead) => (
            <Link key={lead.id} href={`/dashboard/crm/${lead.id}`}>
              <Card className="hover:shadow-md hover:border-primary/30 transition-all cursor-pointer border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm flex-shrink-0">
                        {lead.nome.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-dark">{lead.nome}</p>
                          {ORIGEM_ICONS[lead.origem] && (
                            <span className="text-muted-foreground" title={lead.origem}>
                              {ORIGEM_ICONS[lead.origem]}
                            </span>
                          )}
                        </div>
                        {lead.empresa && (
                          <p className="text-sm text-muted-foreground">{lead.empresa}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
                        {lead.email && (
                          <span className="flex items-center gap-1 truncate max-w-32">
                            <Mail className="h-3 w-3 flex-shrink-0" />
                            {lead.email}
                          </span>
                        )}
                        {lead.telefone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            {lead.telefone}
                          </span>
                        )}
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[lead.status] ?? ''}`}>
                        {lead.status}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <ImportLeadsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImportado={() => tenantId && carregarLeads(tenantId)}
      />
    </div>
  )
}
