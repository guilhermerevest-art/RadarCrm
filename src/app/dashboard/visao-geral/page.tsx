import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  MapPin,
  Users,
  TrendingUp,
  Activity,
  ArrowUpRight,
  ArrowRight,
  Clock,
  Target,
  Zap,
  Building2,
  TrendingDown,
  CheckCircle2,
  Circle,
} from 'lucide-react'

async function getDashboardData(userId: string) {
  const supabase = await createClient()

  // Busca tenant do usuário
  const { data: tu } = await supabase
    .from('tenant_users')
    .select('tenant_id, papel, nome')
    .eq('user_id', userId)
    .single()

  if (!tu) return null

  const tenantId = tu.tenant_id

  // Busca métricas em paralelo
  const [
    { count: totalObras },
    { count: obrasAtivas },
    { count: totalLeads },
    { count: leadsNovos },
    { count: totalDeals },
    { data: dealsRecentes },
    { data: leadsRecentes },
    { data: atividadesPendentes },
    { data: tenant },
  ] = await Promise.all([
    supabase.from('radar_obras').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('radar_obras').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'ativa'),
    supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'novo'),
    supabase.from('crm_deals').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase
      .from('crm_deals')
      .select('*, crm_leads(nome)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('crm_leads')
      .select('*, tenant_users(nome)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('crm_atividades')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'pendente')
      .order('data_vencimento', { ascending: true })
      .limit(5),
    supabase.from('tenants').select('nome, plano, trial_expira_em, status, onboard_completo').eq('id', tenantId).single(),
  ])

  return {
    tenant,
    tu,
    metrics: {
      totalObras: totalObras ?? 0,
      obrasAtivas: obrasAtivas ?? 0,
      totalLeads: totalLeads ?? 0,
      leadsNovos: leadsNovos ?? 0,
      totalDeals: totalDeals ?? 0,
    },
    dealsRecentes: dealsRecentes ?? [],
    leadsRecentes: leadsRecentes ?? [],
    atividadesPendentes: atividadesPendentes ?? [],
  }
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  trend,
  trendUp,
  href,
  className,
}: {
  title: string
  value: number | string
  sub?: string
  icon: React.ElementType
  trend?: number
  trendUp?: boolean
  href?: string
  className?: string
}) {
  const content = (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 font-heading text-4xl font-bold tracking-tight">{value}</p>
            {sub && <p className="mt-1.5 text-xs text-muted-foreground/70">{sub}</p>}
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
        {trend !== undefined && (
          <div className="mt-4 flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
              trendUp ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
            }`}>
              {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trend > 0 ? '+' : ''}{trend}%
            </span>
            <span className="text-xs text-muted-foreground">vs semana passada</span>
          </div>
        )}
      </CardContent>
    </Card>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }
  return content
}

export default async function VisaoGeralPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const data = await getDashboardData(user.id)
  const isPrimeiroAcesso = !data?.tenant?.onboard_completo

  if (isPrimeiroAcesso && data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-lg text-center border-border/50 shadow-soft-lg animate-fade-in-up">
          <CardContent className="pt-10 pb-10">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20">
              <Zap className="h-10 w-10 text-white" />
            </div>
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              Bem-vindo ao Radar Canteiro!
            </h2>
            <p className="mt-4 text-muted-foreground max-w-sm mx-auto">
              Sua conta foi criada. Configure sua empresa para começar a receber alertas de obras.
            </p>
            <div className="mt-8 space-y-4 text-left bg-gradient-to-br from-primary/5 to-transparent rounded-xl p-5 border border-primary/10">
              <h3 className="font-heading font-bold text-sm flex items-center gap-2">
                <Circle className="h-4 w-4 text-primary fill-primary" />
                Próximos passos
              </h3>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-white text-xs font-bold flex-shrink-0 shadow-sm">1</span>
                  <span>Configure suas <strong className="text-foreground">cidades de interesse</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-white text-xs font-bold flex-shrink-0 shadow-sm">2</span>
                  <span>Conecte o <strong className="text-foreground">WhatsApp</strong> para alertas</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-white text-xs font-bold flex-shrink-0 shadow-sm">3</span>
                  <span>Cadastre sua <strong className="text-foreground">equipe comercial</strong></span>
                </li>
              </ol>
            </div>
            <Link href="/dashboard/configuracao">
              <Button size="lg" className="mt-8 w-full shadow-md">
                Começar configuração
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) {
    return <div className="p-8 text-center text-muted-foreground">Carregando...</div>
  }

  const { metrics, dealsRecentes, leadsRecentes, atividadesPendentes, tenant } = data

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Olá, {data.tu.nome ?? 'Usuário'} 👋
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{tenant?.nome}</span>
            <span className="text-muted-foreground/50">·</span>
            <Badge variant={tenant?.plano === 'pro' ? 'default' : 'secondary'} className="capitalize">
              {tenant?.plano}
            </Badge>
            {tenant?.status === 'trial' && tenant?.trial_expira_em && (
              <Badge variant="warning" className="capitalize">
                Trial expira {new Date(tenant.trial_expira_em).toLocaleDateString('pt-BR')}
              </Badge>
            )}
            {tenant?.status === 'ativo' && (
              <Badge variant="success" className="capitalize">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Ativo
              </Badge>
            )}
          </div>
        </div>
        <Link href="/dashboard/crm/novo">
          <Button className="shadow-md">
            <Zap className="h-4 w-4 mr-2" />
            Nova Oportunidade
          </Button>
        </Link>
      </div>

      {/* Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Obras Ativas"
          value={metrics.obrasAtivas}
          sub={`de ${metrics.totalObras} obras`}
          icon={MapPin}
          trend={12}
          trendUp={true}
          href="/dashboard/radar"
          className="animate-fade-in-up stagger-1"
        />
        <StatCard
          title="Leads"
          value={metrics.totalLeads}
          sub={`${metrics.leadsNovos} novos`}
          icon={Users}
          trend={8}
          trendUp={true}
          href="/dashboard/crm"
          className="animate-fade-in-up stagger-2"
        />
        <StatCard
          title="Oportunidades"
          value={metrics.totalDeals}
          sub="no pipeline"
          icon={TrendingUp}
          href="/dashboard/deals"
          className="animate-fade-in-up stagger-3"
        />
        <StatCard
          title="Tarefas Pendentes"
          value={atividadesPendentes.length}
          sub="para hoje"
          icon={Activity}
          className="animate-fade-in-up stagger-4"
        />
      </div>

      {/* Gráficos */}
      <GraficosObrasLeads tenantId={data?.tu?.tenant_id ?? ''} />

      {/* Conteúdo principal em 2 colunas */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Deals recentes */}
        <Card className="lg:col-span-2 border-border/50 shadow-soft animate-fade-in-up">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Oportunidades Recentes
            </CardTitle>
            <Link href="/dashboard/deals" className="text-sm text-primary hover:underline font-medium flex items-center gap-1">
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-4">
            {dealsRecentes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                  <Target className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <p className="text-muted-foreground font-medium">Nenhuma oportunidade ainda</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Comece criando sua primeira oportunidade</p>
                <Link href="/dashboard/deals">
                  <Button variant="outline" size="sm" className="mt-4">
                    Criar oportunidade
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {dealsRecentes.map((deal: any, i: number) => (
                  <Link
                    key={deal.id}
                    href={`/dashboard/deals/${deal.id}`}
                    className="group flex items-center justify-between rounded-xl border p-4 hover:bg-accent/50 hover:border-primary/20 transition-all"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm group-hover:text-primary transition-colors">{deal.titulo}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {(deal as any).crm_leads?.nome ?? 'Lead'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">
                        {deal.valor_estimado
                          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.valor_estimado)
                          : '—'}
                      </p>
                      <Badge
                        variant={
                          deal.estagio === 'ganho' ? 'success' :
                          deal.estagio === 'perdido' ? 'destructive' :
                          'secondary'
                        }
                        className="mt-1 capitalize text-[10px]"
                      >
                        {deal.estagio}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Atividades pendentes */}
        <Card className="border-border/50 shadow-soft animate-fade-in-up stagger-2">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Próximas Tarefas
            </CardTitle>
            <Link href="/dashboard/crm" className="text-sm text-primary hover:underline font-medium flex items-center gap-1">
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-4">
            {atividadesPendentes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <p className="text-muted-foreground font-medium">Nenhuma tarefa pendente</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Você está em dia!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {atividadesPendentes.map((atv: any, i: number) => (
                  <div
                    key={atv.id}
                    className="flex items-start gap-3 rounded-xl border p-4 hover:bg-accent/30 transition-colors"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${
                      atv.tipo === 'ligacao' || atv.tipo === 'whatsapp' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                      atv.tipo === 'reuniao' ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20' :
                      'bg-muted text-muted-foreground border border-border'
                    }`}>
                      <Activity className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold line-clamp-1">{atv.descricao}</p>
                      {atv.data_vencimento && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(atv.data_vencimento).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'short'
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leads recentes */}
      <Card className="border-border/50 shadow-soft animate-fade-in-up stagger-3">
        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
          <CardTitle className="text-lg font-heading flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Leads Recentes
          </CardTitle>
          <Link href="/dashboard/crm" className="text-sm text-primary hover:underline font-medium flex items-center gap-1">
            Ver CRM completo <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {leadsRecentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <Users className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <p className="text-muted-foreground font-medium">Nenhum lead cadastrado</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Cadastre seu primeiro lead para começar</p>
              <Link href="/dashboard/crm/novo">
                <Button variant="outline" size="sm" className="mt-4">
                  Cadastrar lead
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Nome</th>
                    <th className="pb-3 font-semibold">Origem</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 font-semibold">Responsável</th>
                    <th className="pb-3 font-semibold">Criado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {leadsRecentes.map((lead: any) => (
                    <tr key={lead.id} className="group hover:bg-accent/30 transition-colors">
                      <td className="py-4">
                        <Link href={`/dashboard/crm/${lead.id}`} className="font-semibold text-sm group-hover:text-primary transition-colors">
                          {lead.nome}
                        </Link>
                        {lead.empresa && (
                          <p className="text-xs text-muted-foreground mt-0.5">{lead.empresa}</p>
                        )}
                      </td>
                      <td className="py-4 text-sm text-muted-foreground capitalize">{lead.origem ?? '—'}</td>
                      <td className="py-4">
                        <Badge
                          variant={
                            lead.status === 'novo' ? 'info' :
                            lead.status === 'qualificado' ? 'default' :
                            lead.status === 'convertido' ? 'success' :
                            'secondary'
                          }
                          className="capitalize"
                        >
                          {lead.status}
                        </Badge>
                      </td>
                      <td className="py-4 text-sm text-muted-foreground">
                        {(lead as any).tenant_users?.nome ?? '—'}
                      </td>
                      <td className="py-4 text-sm text-muted-foreground">
                        {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Componentes de gráficos (SVG inline, sem libs)
// ============================================================================

async function GraficosObrasLeads({ tenantId }: { tenantId: string }) {
  const supabase = await createClient()

  // Obras por cidade (top 10)
  const { data: obrasPorCidade } = await supabase
    .from('radar_obras')
    .select('endereco_cidade')
    .eq('tenant_id', tenantId)
    .limit(1000)

  const cidadeCount: Record<string, number> = {}
  obrasPorCidade?.forEach(o => {
    if (o.endereco_cidade) {
      cidadeCount[o.endereco_cidade] = (cidadeCount[o.endereco_cidade] ?? 0) + 1
    }
  })
  const topCidades = Object.entries(cidadeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Leads por status
  const { data: leadsPorStatus } = await supabase
    .from('crm_leads')
    .select('status')
    .eq('tenant_id', tenantId)

  const statusCount: Record<string, number> = {}
  leadsPorStatus?.forEach(l => {
    statusCount[l.status] = (statusCount[l.status] ?? 0) + 1
  })

  return (
    <div className="grid gap-6 lg:grid-cols-2 animate-fade-in-up">
      {/* Obras por cidade */}
      <Card className="border-border/50 shadow-soft">
        <CardHeader className="pb-4 border-b">
          <CardTitle className="text-lg font-heading flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Top Cidades com Obras
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topCidades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MapPin className="h-10 w-10 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">Sem obras cadastradas ainda</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topCidades.map(([cidade, qty], i) => {
                const max = topCidades[0][1]
                const pct = (qty / max) * 100
                return (
                  <div key={cidade}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{cidade}</span>
                      <span className="text-sm font-bold text-primary">{qty}</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leads por status - donut chart */}
      <Card className="border-border/50 shadow-soft">
        <CardHeader className="pb-4 border-b">
          <CardTitle className="text-lg font-heading flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Leads por Estágio
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(statusCount).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Users className="h-10 w-10 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">Sem leads cadastrados ainda</p>
            </div>
          ) : (
            <div className="flex items-center justify-around gap-4">
              <DonutChart data={statusCount} />
              <div className="space-y-3">
                {Object.entries(statusCount).map(([status, qty]) => (
                  <div key={status} className="flex items-center gap-3">
                    <div className={`w-3.5 h-3.5 rounded-full ${LEAD_COLORS[status] ?? 'bg-gray-400'}`} />
                    <span className="text-sm capitalize text-muted-foreground">{status}</span>
                    <span className="text-sm font-bold">{qty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const LEAD_COLORS: Record<string, string> = {
  novo: 'bg-blue-500',
  qualificado: 'bg-primary',
  convertido: 'bg-emerald-500',
  descarte: 'bg-gray-400',
}

function DonutChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data)
  const total = entries.reduce((sum, [, v]) => sum + v, 0)

  let cumulative = 0
  const radius = 50
  const circumference = 2 * Math.PI * radius

  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <g transform="translate(70, 70) rotate(-90)">
        {entries.map(([status, qty]) => {
          const pct = qty / total
          const offset = (cumulative / total) * circumference
          cumulative += qty
          return (
            <circle
              key={status}
              r={radius}
              cx="0"
              cy="0"
              fill="none"
              stroke={LEAD_COLOR_HEX[status] ?? '#9CA3AF'}
              strokeWidth="18"
              strokeDasharray={`${pct * circumference} ${circumference}`}
              strokeDashoffset={-offset}
              className="transition-all duration-500"
            />
          )
        })}
      </g>
      <text x="70" y="65" textAnchor="middle" dominantBaseline="central" className="font-heading font-bold" fontSize="28" fill="#1F2937">
        {total}
      </text>
      <text x="70" y="85" textAnchor="middle" dominantBaseline="central" className="font-medium" fontSize="10" fill="#6B7280">
        leads
      </text>
    </svg>
  )
}

const LEAD_COLOR_HEX: Record<string, string> = {
  novo: '#3B82F6',
  qualificado: '#E85D04',
  convertido: '#10B981',
  descarte: '#9CA3AF',
}
