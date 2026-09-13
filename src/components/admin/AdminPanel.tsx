'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import {
  Building2, Users, TrendingUp, AlertTriangle, CheckCircle2,
  XCircle, Search, ExternalLink, Pause, Play, Eye, MoreHorizontal,
  DollarSign, Activity, UserCheck, UserX, ChevronLeft, ChevronRight
} from 'lucide-react'

interface TenantMetrics {
  total_tenants: number
  tenants_ativos: number
  tenants_trial: number
  tenants_pagos: number
  tenants_cancelados: number
  total_usuarios: number
  total_leads: number
  total_obras: number
  total_deals: number
  deals_ganhos_mes: number
}

interface Tenant {
  id: string
  nome: string
  slug: string
  plano: string
  status: string
  ativo: boolean
  created_at: string
  users_count: number
  leads_count: number
  obras_count: number
  ultimo_login: string | null
}

const PLAN_COLORS: Record<string, string> = {
  individual: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  equipe: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  regional: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  obras: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
}

const STATUS_COLORS: Record<string, string> = {
  trial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  ativo: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  pausado: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  cancelado: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

export function AdminPanel() {
  const [metrics, setMetrics] = useState<TenantMetrics | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [planoFilter, setPlanoFilter] = useState<string>('')
  const [page, setPage] = useState(0)
  const [impersonating, setImpersonating] = useState<string | null>(null)
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const supabase = createClient()

  const loadMetrics = useCallback(async () => {
    const { data } = await supabase.rpc('fn_admin_global_metrics')
    if (data) {
      const metricsObj: Partial<TenantMetrics> = {}
      for (const row of data) {
        (metricsObj as any)[row.metric_name] = row.metric_value
      }
      setMetrics(metricsObj as TenantMetrics)
    }
  }, [supabase])

  const loadTenants = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('fn_admin_list_tenants', {
      p_status: statusFilter || null,
      p_plano: planoFilter || null,
      p_busca: search || null,
      p_limit: 20,
      p_offset: page * 20,
    })
    setTenants(data ?? [])
    setLoading(false)
  }, [supabase, search, statusFilter, planoFilter, page])

  useEffect(() => {
    loadMetrics()
    loadTenants()
  }, [loadMetrics, loadTenants])

  const handleToggleStatus = async (tenant: Tenant) => {
    const newAtivo = !tenant.ativo
    await supabase.rpc('fn_admin_toggle_tenant_status', {
      p_tenant_id: tenant.id,
      p_ativo: newAtivo,
      p_motivo: newAtivo ? 'Reativado pelo admin' : 'Pausado pelo admin',
    })
    await loadMetrics()
    await loadTenants()
  }

  const handleImpersonate = async (tenant: Tenant) => {
    setImpersonating(tenant.id)
    try {
      const { data } = await supabase.rpc('fn_admin_impersonate_tenant', {
        p_tenant_id: tenant.id,
      })
      if (data) {
        // Abre nova aba com impersonação
        window.open(`/auth/impersonate?token=${data}&tenant=${tenant.slug}`, '_blank')
      }
    } finally {
      setImpersonating(null)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca'
    return new Date(dateStr).toLocaleDateString('pt-BR')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground">
            Gerenciamento de tenants e métricas globais
          </p>
        </div>
        <Button variant="outline" onClick={() => { loadMetrics(); loadTenants(); }}>
          ↻ Atualizar
        </Button>
      </div>

      {/* Métricas Globais */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.total_tenants ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              {metrics?.tenants_ativos ?? 0} ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trial</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.tenants_trial ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              Aguardando upgrade
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.tenants_pagos ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              Assinantes ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.total_usuarios ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              Total cadastrados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deals Ganhos</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.deals_ganhos_mes ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              Este mês
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Tenants */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Tenants</CardTitle>
              <CardDescription>Lista de todos os tenants da plataforma</CardDescription>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou slug..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Todos Status</option>
              <option value="trial">Trial</option>
              <option value="ativo">Ativo</option>
              <option value="pausado">Pausado</option>
              <option value="cancelado">Cancelado</option>
            </select>

            <select
              value={planoFilter}
              onChange={(e) => setPlanoFilter(e.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Todos Planos</option>
              <option value="individual">Individual</option>
              <option value="equipe">Equipe</option>
              <option value="regional">Regional</option>
              <option value="obras">Obras</option>
            </select>
          </div>
        </CardHeader>

        <CardContent>
          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Empresa</th>
                  <th className="text-left py-3 px-4 font-medium">Plano</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Usuários</th>
                  <th className="text-left py-3 px-4 font-medium">Leads</th>
                  <th className="text-left py-3 px-4 font-medium">Obras</th>
                  <th className="text-left py-3 px-4 font-medium">Último Login</th>
                  <th className="text-left py-3 px-4 font-medium">Criado em</th>
                  <th className="text-left py-3 px-4 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted-foreground">
                      Nenhum tenant encontrado
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant) => (
                    <tr key={tenant.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium">{tenant.nome}</div>
                          <div className="text-xs text-muted-foreground">{tenant.slug}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={PLAN_COLORS[tenant.plano] ?? ''}>
                          {tenant.plano}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Badge className={STATUS_COLORS[tenant.status] ?? ''}>
                            {tenant.status}
                          </Badge>
                          {tenant.ativo ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">{tenant.users_count}</td>
                      <td className="py-3 px-4">{tenant.leads_count}</td>
                      <td className="py-3 px-4">{tenant.obras_count}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {formatDate(tenant.ultimo_login)}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {formatDate(tenant.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedTenant(tenant)}
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleStatus(tenant)}
                            title={tenant.ativo ? 'Pausar' : 'Reativar'}
                          >
                            {tenant.ativo ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleImpersonate(tenant)}
                            disabled={impersonating === tenant.id}
                            title="Impersonar (abrir como tenant)"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-between mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {page + 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={tenants.length < 20}
            >
              Próxima
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Detalhes */}
      {selectedTenant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>{selectedTenant.nome}</CardTitle>
              <CardDescription>{selectedTenant.slug}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Plano</Label>
                  <div className="font-medium capitalize">{selectedTenant.plano}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="font-medium capitalize">{selectedTenant.status}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Usuários</Label>
                  <div className="font-medium">{selectedTenant.users_count}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Leads</Label>
                  <div className="font-medium">{selectedTenant.leads_count}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Obras</Label>
                  <div className="font-medium">{selectedTenant.obras_count}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Criado em</Label>
                  <div className="font-medium">{formatDate(selectedTenant.created_at)}</div>
                </div>
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleImpersonate(selectedTenant)}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Impersonar
                </Button>
                <Button
                  variant={selectedTenant.ativo ? 'destructive' : 'default'}
                  className="flex-1"
                  onClick={() => {
                    handleToggleStatus(selectedTenant)
                    setSelectedTenant(null)
                  }}
                >
                  {selectedTenant.ativo ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pausar
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Reativar
                    </>
                  )}
                </Button>
              </div>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setSelectedTenant(null)}
              >
                Fechar
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
