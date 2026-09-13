import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  MapPin,
  Users,
  TrendingUp,
  Activity,
  ArrowUpRight,
  Clock,
  Target,
  Zap,
  ChevronRight,
  Building2,
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

function MetricCard({
  title,
  value,
  sub,
  icon: Icon,
  trend,
  href,
}: {
  title: string
  value: number | string
  sub?: string
  icon: React.ElementType
  trend?: number
  href?: string
}) {
  const content = (
    <Card className="hover:shadow-md transition-shadow border-border/50">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="mt-2 font-heading text-3xl font-bold text-dark">{value}</p>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
        {trend !== undefined && (
          <div className="mt-3 flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3 text-green-600" />
            <span className="text-xs font-medium text-green-600">+{trend}% esta semana</span>
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
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-lg text-center border-primary/30 shadow-lg">
          <CardContent className="pt-8 pb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-dark">
              Bem-vindo ao Radar Canteiro!
            </h2>
            <p className="mt-3 text-muted-foreground">
              Sua conta foi criada. Agora configure sua empresa para começar a receber obras.
            </p>
            <div className="mt-6 space-y-3 text-left bg-muted/30 rounded-lg p-4">
              <h3 className="font-semibold text-sm text-dark">Próximos passos:</h3>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">1</span>
                  Configure suas cidades de interesse
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">2</span>
                  Conecte o WhatsApp para alertas
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">3</span>
                  Comece a cadastrar sua equipe
                </li>
              </ol>
            </div>
            <Link href="/dashboard/configuracao">
              <Button className="mt-6 w-full" size="lg">
                Configurar agora
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
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-dark">
            Olá, {data.tu.nome ?? 'Usuário'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {tenant?.nome} ·{' '}
            <span className="capitalize">{tenant?.plano}</span> ·{' '}
            {tenant?.status === 'trial' && tenant?.trial_expira_em && (
              <span className="text-primary">
                Trial expira em {new Date(tenant.trial_expira_em).toLocaleDateString('pt-BR')}
              </span>
            )}
            {tenant?.status === 'ativo' && <span className="text-green-600">Ativo</span>}
          </p>
        </div>
        <Link href="/dashboard/crm/novo">
          <Button>
            <Zap className="h-4 w-4 mr-1" />
            Nova Oportunidade
          </Button>
        </Link>
      </div>

      {/* Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Obras Ativas"
          value={metrics.obrasAtivas}
          sub={`de ${metrics.totalObras} total`}
          icon={MapPin}
          href="/dashboard/radar"
        />
        <MetricCard
          title="Leads"
          value={metrics.totalLeads}
          sub={`${metrics.leadsNovos} novos`}
          icon={Users}
          href="/dashboard/crm"
        />
        <MetricCard
          title="Oportunidades"
          value={metrics.totalDeals}
          sub="no pipeline"
          icon={TrendingUp}
          href="/dashboard/deals"
        />
        <MetricCard
          title="Tarefas Pendentes"
          value={atividadesPendentes.length}
          sub="para hoje"
          icon={Activity}
        />
      </div>

      {/* Conteúdo principal em 2 colunas */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Deals recentes */}
        <Card className="lg:col-span-2 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-heading">Oportunidades Recentes</CardTitle>
            <Link href="/dashboard/deals" className="text-sm text-primary hover:underline">
              Ver todas
            </Link>
          </CardHeader>
          <CardContent>
            {dealsRecentes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Target className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">Nenhuma oportunidade ainda.</p>
                <Link href="/dashboard/deals">
                  <Button variant="outline" size="sm" className="mt-3">
                    Criar primeira oportunidade
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {dealsRecentes.map((deal: any) => (
                  <Link
                    key={deal.id}
                    href={`/dashboard/deals/${deal.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-dark">{deal.titulo}</p>
                        <p className="text-xs text-muted-foreground">
                          {(deal as any).crm_leads?.nome ?? 'Lead'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-dark">
                        {deal.valor_estimado
                          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.valor_estimado)
                          : '—'}
                      </p>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${deal.estagio === 'ganho' ? '#dcfce7' : deal.estagio === 'perdido' ? '#fee2e2' : '#f3f4f6'}`,
                          color: deal.estagio === 'ganho' ? '#16a34a' : deal.estagio === 'perdido' ? '#dc2626' : '#6b7280',
                        }}
                      >
                        {deal.estagio}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Atividades pendentes */}
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-heading">Próximas Tarefas</CardTitle>
            <Link href="/dashboard/crm" className="text-sm text-primary hover:underline">
              Ver todas
            </Link>
          </CardHeader>
          <CardContent>
            {atividadesPendentes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {atividadesPendentes.map((atv: any) => (
                  <div
                    key={atv.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0 ${
                      atv.tipo === 'ligacao' ? 'bg-green-100 text-green-600' :
                      atv.tipo === 'whatsapp' ? 'bg-green-100 text-green-600' :
                      atv.tipo === 'reuniao' ? 'bg-blue-100 text-blue-600' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      <Activity className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-dark truncate">{atv.descricao}</p>
                      {atv.data_vencimento && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(atv.data_vencimento).toLocaleDateString('pt-BR')}
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
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-heading">Leads Recentes</CardTitle>
          <Link href="/dashboard/crm" className="text-sm text-primary hover:underline">
            Ver CRM completo
          </Link>
        </CardHeader>
        <CardContent>
          {leadsRecentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Nenhum lead cadastrado.</p>
              <Link href="/dashboard/crm/novo">
                <Button variant="outline" size="sm" className="mt-3">
                  Cadastrar primeiro lead
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Nome</th>
                    <th className="pb-2 font-medium">Origem</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Responsável</th>
                    <th className="pb-2 font-medium">Criado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {leadsRecentes.map((lead: any) => (
                    <tr key={lead.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3">
                        <Link href={`/dashboard/crm/${lead.id}`} className="font-medium text-sm text-dark hover:text-primary">
                          {lead.nome}
                        </Link>
                        {lead.empresa && (
                          <p className="text-xs text-muted-foreground">{lead.empresa}</p>
                        )}
                      </td>
                      <td className="py-3 text-sm text-muted-foreground capitalize">{lead.origem}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          lead.status === 'novo' ? 'bg-blue-50 text-blue-700' :
                          lead.status === 'qualificado' ? 'bg-primary/10 text-primary' :
                          lead.status === 'convertido' ? 'bg-green-50 text-green-700' :
                          'bg-gray-50 text-gray-500'
                        }`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {(lead as any).tenant_users?.nome ?? '—'}
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
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
