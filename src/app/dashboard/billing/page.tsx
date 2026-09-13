'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  CreditCard,
  Check,
  X,
  AlertTriangle,
  Clock,
  TrendingUp,
  Download,
  ExternalLink,
  Zap,
  Users,
  MapPin,
  MessageSquare,
  Package,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ============================================================================
// TIPOS
// ============================================================================

interface Plano {
  id: string
  nome: string
  preco: number
  usuarios: number
  limite_obras_mes: number
  limite_leads: number
  limite_mensagens_dia: number
}

interface Assinatura {
  id: string
  plano_id: string
  status: string
  status_pagamento: string
  periodo_inicio: string
  periodo_fim: string
  trial_expira_em: string
  data_cancelamento: string
  ultimo_pagamento_em: string
  proximo_pagamento_em: string
  valor_mensal: number
}

interface UsoPlano {
  obras_mes: number
  leads_mes: number
  envios_wa_dia: number
  envios_wa_mes: number
  propostas_mes: number
  usuarios: number
  produtos_ativos: number
}

interface Fatura {
  id: string
  numero: string
  status: string
  metodo_pagamento: string
  valor: number
  valor_pago: number
  data_emissao: string
  data_vencimento: string
  data_pagamento: string
  url_nota_fiscal: string
  link_pdf: string
}

interface MotivoCancelamento {
  id: string
  slug: string
  texto: string
}

// ============================================================================
// CONSTANTES
// ============================================================================

const PLANOS_INFO: Record<string, {
  nome: string
  preco: number
  recursos: string[]
  icon: typeof Users
}> = {
  individual: {
    nome: 'Individual',
    preco: 197,
    recursos: ['1 usuário', '500 obras/mes', '200 leads', '100 envios WA/dia'],
    icon: Users,
  },
  equipe: {
    nome: 'Equipe',
    preco: 397,
    recursos: ['5 usuários', '2.500 obras/mes', '1.000 leads', '500 envios WA/dia'],
    icon: Users,
  },
  regional: {
    nome: 'Regional',
    preco: 797,
    recursos: ['20 usuários', '10.000 obras/mes', '5.000 leads', '2.000 envios WA/dia'],
    icon: MapPin,
  },
  obras: {
    nome: 'Obras',
    preco: 0,
    recursos: ['Usuários ilimitados', 'Obras ilimitadas', 'Leads ilimitados', 'WhatsApp ilimitado'],
    icon: Package,
  },
}

const STATUS_COLORS: Record<string, { variant: 'success' | 'warning' | 'destructive' | 'info' | 'default'; label: string }> = {
  trialing: { variant: 'info', label: 'Trial' },
  active: { variant: 'success', label: 'Ativo' },
  past_due: { variant: 'warning', label: 'Atrasado' },
  canceled: { variant: 'destructive', label: 'Cancelado' },
  unpaid: { variant: 'destructive', label: 'Inadimplente' },
  paused: { variant: 'default', label: 'Pausado' },
}

const METRIC_LABELS: Record<string, { label: string; icon: typeof MapPin }> = {
  obras_mes: { label: 'Obras este mês', icon: MapPin },
  leads_mes: { label: 'Leads este mês', icon: Users },
  envios_wa_dia: { label: 'Envios WhatsApp hoje', icon: MessageSquare },
  usuarios: { label: 'Usuários', icon: Users },
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function BillingPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [papel, setPapel] = useState<string | null>(null)

  // Dados
  const [plano, setPlano] = useState<Plano | null>(null)
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [uso, setUso] = useState<UsoPlano | null>(null)
  const [faturas, setFaturas] = useState<Fatura[]>([])
  const [motivosCancelamento, setMotivosCancelamento] = useState<MotivoCancelamento[]>([])

  // UI
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string>('equipe')
  const [selectedMotivo, setSelectedMotivo] = useState<string | null>(null)
  const [cancelComment, setCancelComment] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Carregar dados
  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      try {
        // 1. Obter usuário logado
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setError('Usuário não autenticado')
          return
        }

        // 2. Obter tenant do usuário
        const { data: tu, error: tuError } = await supabase
          .from('tenant_users')
          .select('tenant_id, papel')
          .eq('user_id', user.id)
          .single()

        if (tuError || !tu) {
          setError('Não foi possível encontrar o tenant')
          return
        }

        setTenantId(tu.tenant_id)
        setPapel(tu.papel)

        // 3. Carregar dados em paralelo
        const [
          planosRes,
          assinaturasRes,
          usoRes,
          faturasRes,
          motivosRes,
        ] = await Promise.all([
          supabase.from('planos').select('*'),
          tu.tenant_id ? supabase
            .from('assinaturas')
            .select('*')
            .eq('tenant_id', tu.tenant_id)
            .order('created_at', { ascending: false })
            .limit(1) : { data: null },
          tu.tenant_id ? supabase
            .from('uso_plano')
            .select('*')
            .eq('tenant_id', tu.tenant_id)
            .order('mes_referencia', { ascending: false })
            .limit(1) : { data: null },
          tu.tenant_id ? supabase
            .from('faturas')
            .select('*')
            .eq('tenant_id', tu.tenant_id)
            .order('data_emissao', { ascending: false })
            .limit(12) : { data: null },
          supabase.from('motivos_cancelamento').select('*').eq('ativo', true).order('ordem'),
        ])

        setPlano(planosRes.data?.find(p => p.id === tu.tenant_id) || null)
        setAssinatura(assinaturasRes?.data?.[0] || null)
        setUso(usoRes?.data?.[0] || null)
        setFaturas(faturasRes?.data || [])
        setMotivosCancelamento(motivosRes.data || [])

      } catch (err) {
        console.error('Erro ao carregar billing:', err)
        setError('Erro ao carregar dados de cobrança')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [supabase])

  // Handlers
  const handleUpgrade = useCallback(async () => {
    if (!tenantId) return
    setProcessing(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/billing-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'checkout', plano_id: selectedPlan }),
      })

      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else if (data.mock) {
        // Modo de desenvolvimento
        alert('Modo de desenvolvimento: Checkout simulado\n\nPlano: ' + selectedPlan)
      } else {
        throw new Error(data.error || 'Erro ao criar checkout')
      }
    } catch (err) {
      console.error('Erro no checkout:', err)
      alert('Erro: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setProcessing(false)
    }
  }, [tenantId, selectedPlan, supabase])

  const handleCancel = useCallback(async () => {
    if (!tenantId || !selectedMotivo) return
    setProcessing(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/billing-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'cancel',
          assinatura_id: assinatura?.id,
        }),
      })

      const data = await res.json()

      if (data.success || data.mock) {
        alert('Pedido de cancelamento enviado. Use o portal do cliente para confirmar.')
        setShowCancelModal(false)
        // Recarregar dados
        window.location.reload()
      } else {
        throw new Error(data.error || 'Erro ao solicitar cancelamento')
      }
    } catch (err) {
      console.error('Erro no cancelamento:', err)
      alert('Erro: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setProcessing(false)
    }
  }, [tenantId, selectedMotivo, assinatura, supabase])

  const handleOpenPortal = useCallback(async () => {
    if (!tenantId) return
    setProcessing(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/billing-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'portal' }),
      })

      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else if (data.mock) {
        alert('Modo de desenvolvimento: Portal simulado')
      } else {
        throw new Error(data.error || 'Erro ao abrir portal')
      }
    } catch (err) {
      console.error('Erro ao abrir portal:', err)
      alert('Erro: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setProcessing(false)
    }
  }, [tenantId, supabase])

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando informações de cobrança...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-warning" />
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statusInfo = STATUS_COLORS[assinatura?.status || 'trialing'] || STATUS_COLORS.default
  const isTrial = assinatura?.status === 'trialing'
  const isAdmin = papel === 'admin'

  // Calcular dias restantes do trial
  const diasRestantesTrial = assinatura?.trial_expira_em
    ? Math.max(0, Math.ceil((new Date(assinatura.trial_expira_em).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-3">
            <CreditCard className="h-7 w-7 text-primary" />
            Billing e Planos
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie sua assinatura e visualize seu uso
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={handleOpenPortal} disabled={processing}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Portal do Cliente
          </Button>
        )}
      </div>

      {/* Status Banner */}
      {isTrial && (
        <Card className="border-info bg-gradient-to-r from-blue-500/10 to-blue-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20">
                <Clock className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Período de teste gratuito</p>
                <p className="text-sm text-muted-foreground">
                  Você tem <span className="font-bold text-blue-600">{diasRestantesTrial} dias</span> restantes para experimentar o Radar Canteiro.
                  Após isso, será cobrado R$ {plano?.preco || 197}/mês.
                </p>
              </div>
              <Button onClick={() => setShowUpgradeModal(true)}>
                Assinar agora
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status de Inadimplência */}
      {assinatura?.status === 'past_due' && (
        <Card className="border-warning bg-gradient-to-r from-amber-500/10 to-amber-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-amber-700">Pagamento pendente</p>
                <p className="text-sm text-amber-600/80">
                  Houve um problema com o último pagamento. Por favor, atualize seus dados de pagamento.
                </p>
              </div>
              <Button variant="warning" onClick={handleOpenPortal}>
                Atualizar pagamento
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Plano Atual */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Plano Atual
            </CardTitle>
            <CardDescription>
              Suas informações de assinatura
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{PLANOS_INFO[plano?.id || 'individual']?.nome || 'Individual'}</span>
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </div>
                <p className="text-muted-foreground mt-1">
                  R$ {plano?.preco || 197}/mês
                </p>
              </div>
            </div>

            <Separator />

            {/* Período */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Período</p>
                <p className="font-medium">
                  {assinatura?.periodo_inicio
                    ? new Date(assinatura.periodo_inicio).toLocaleDateString('pt-BR')
                    : '-'}
                  {' → '}
                  {assinatura?.periodo_fim
                    ? new Date(assinatura.periodo_fim).toLocaleDateString('pt-BR')
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Próxima cobrança</p>
                <p className="font-medium">
                  {assinatura?.proximo_pagamento_em
                    ? new Date(assinatura.proximo_pagamento_em).toLocaleDateString('pt-BR')
                    : isTrial
                      ? new Date(assinatura.trial_expira_em).toLocaleDateString('pt-BR')
                      : '-'}
                </p>
              </div>
            </div>

            {/* Recursos do plano */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Recursos incluídos</p>
              <ul className="space-y-1">
                {(PLANOS_INFO[plano?.id || 'individual']?.recursos || []).map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>

            {isAdmin && !isTrial && (
              <Button variant="outline" className="w-full mt-4" onClick={() => setShowUpgradeModal(true)}>
                <TrendingUp className="h-4 w-4 mr-2" />
                Alterar Plano
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Uso Atual */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Uso Atual
            </CardTitle>
            <CardDescription>
              Comparativo com os limites do seu plano
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Obras */}
            <UsoBar
              label="Obras este mês"
              usado={uso?.obras_mes || 0}
              limite={plano?.limite_obras_mes || 500}
              icon={MapPin}
            />

            {/* Leads */}
            <UsoBar
              label="Leads"
              usado={uso?.leads_mes || 0}
              limite={plano?.limite_leads || 200}
              icon={Users}
            />

            {/* Envios WA */}
            <UsoBar
              label="Envios WhatsApp hoje"
              usado={uso?.envios_wa_dia || 0}
              limite={plano?.limite_mensagens_dia || 100}
              icon={MessageSquare}
            />

            {/* Usuários */}
            <UsoBar
              label="Usuários"
              usado={uso?.usuarios || 1}
              limite={plano?.usuarios || 1}
              icon={Users}
            />

            {((uso?.obras_mes ?? 0) > ((plano?.limite_obras_mes ?? 500) * 0.8)) && (
              <div className="pt-2">
                <p className="text-sm text-warning flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Você está usando mais de 80% do limite de obras.
                  {' '}
                  <button
                    className="underline font-medium"
                    onClick={() => setShowUpgradeModal(true)}
                  >
                    Fazer upgrade
                  </button>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Histórico de Faturas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Histórico de Faturas
          </CardTitle>
          <CardDescription>
            Suas últimas faturas e pagamentos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {faturas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma fatura encontrada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {faturas.map((fatura) => (
                <div
                  key={fatura.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {fatura.numero || `Fatura ${new Date(fatura.data_emissao).toLocaleDateString('pt-BR')}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(fatura.data_emissao).toLocaleDateString('pt-BR')}
                        {' • '}
                        {fatura.data_vencimento && `Vence em ${new Date(fatura.data_vencimento).toLocaleDateString('pt-BR')}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold">
                        R$ {(fatura.valor_pago || fatura.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <Badge
                        variant={
                          fatura.status === 'paga' ? 'success' :
                          fatura.status === 'vencida' ? 'destructive' :
                          fatura.status === 'aberta' ? 'warning' : 'default'
                        }
                      >
                        {fatura.status === 'paga' ? 'Paga' :
                         fatura.status === 'vencida' ? 'Vencida' :
                         fatura.status === 'aberta' ? 'Aberta' :
                         fatura.status}
                      </Badge>
                    </div>
                    {fatura.link_pdf && (
                      <Button variant="ghost" size="icon" asChild>
                        <a href={fatura.link_pdf} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancelamento */}
      {isAdmin && assinatura?.status !== 'canceled' && (
        <Card className="border-destructive/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Cancelar assinatura</p>
                <p className="text-sm text-muted-foreground">
                  Sua assinatura permanecerá ativa até o final do período pago.
                </p>
              </div>
              <Button variant="outline" onClick={() => setShowCancelModal(true)}>
                Cancelar assinatura
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal de Upgrade */}
      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        currentPlan={plano?.id || 'individual'}
        selectedPlan={selectedPlan}
        onSelectPlan={setSelectedPlan}
        onUpgrade={handleUpgrade}
        processing={processing}
      />

      {/* Modal de Cancelamento */}
      <CancelModal
        open={showCancelModal}
        onOpenChange={setShowCancelModal}
        motivos={motivosCancelamento}
        selectedMotivo={selectedMotivo}
        onSelectMotivo={setSelectedMotivo}
        comment={cancelComment}
        onCommentChange={setCancelComment}
        onCancel={handleCancel}
        processing={processing}
      />
    </div>
  )
}

// ============================================================================
// COMPONENTE: UsoBar
// ============================================================================

function UsoBar({
  label,
  usado,
  limite,
  icon: Icon,
}: {
  label: string
  usado: number
  limite: number
  icon: typeof MapPin
}) {
  const percentage = limite > 0 ? Math.min((usado / limite) * 100, 100) : 0
  const isUnlimited = limite >= 999
  const isNearLimit = percentage >= 80
  const isOverLimit = usado > limite

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span>{label}</span>
        </div>
        <span className="font-medium">
          {isUnlimited ? (
            <span className="text-muted-foreground">∞</span>
          ) : (
            <>
              {usado} / {limite}
            </>
          )}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isOverLimit ? 'bg-destructive' :
            isNearLimit ? 'bg-warning' :
            'bg-primary'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENTE: UpgradeModal
// ============================================================================

function UpgradeModal({
  open,
  onOpenChange,
  currentPlan,
  selectedPlan,
  onSelectPlan,
  onUpgrade,
  processing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPlan: string
  selectedPlan: string
  onSelectPlan: (plan: string) => void
  onUpgrade: () => void
  processing: boolean
}) {
  const planos = ['individual', 'equipe', 'regional', 'obras']
  const currentIndex = planos.indexOf(currentPlan)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Alterar Plano</DialogTitle>
          <DialogDescription>
            Escolha o plano que melhor atende às necessidades da sua empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {planos.map((planId) => {
            const plan = PLANOS_INFO[planId]
            const isCurrent = planId === currentPlan
            const isUpgrade = planos.indexOf(planId) > currentIndex
            const isSelected = planId === selectedPlan

            return (
              <button
                key={planId}
                onClick={() => onSelectPlan(planId)}
                className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${isCurrent ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                    isSelected ? 'bg-primary text-white' : 'bg-muted'
                  }`}>
                    <plan.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{plan.nome}</span>
                      {isCurrent && <Badge variant="default">Atual</Badge>}
                      {isUpgrade && !isCurrent && <Badge variant="success">Upgrade</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {plan.preco === 0 ? 'Sob consulta' : `R$ ${plan.preco}/mês`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {planId !== 'obras' ? (
                    <div className="flex flex-wrap gap-1 max-w-48">
                      {plan.recursos.slice(0, 2).map((r, i) => (
                        <span key={i} className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          {r}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Ilimitado</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={onUpgrade}
            disabled={processing || selectedPlan === currentPlan}
          >
            {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {selectedPlan === currentPlan ? 'Plano atual' : 'Confirmar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// COMPONENTE: CancelModal
// ============================================================================

function CancelModal({
  open,
  onOpenChange,
  motivos,
  selectedMotivo,
  onSelectMotivo,
  comment,
  onCommentChange,
  onCancel,
  processing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  motivos: MotivoCancelamento[]
  selectedMotivo: string | null
  onSelectMotivo: (id: string | null) => void
  comment: string
  onCommentChange: (comment: string) => void
  onCancel: () => void
  processing: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancelar Assinatura
          </DialogTitle>
          <DialogDescription>
            Sua assinatura permanecerá ativa até o final do período pago.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Por que você está cancelando? <span className="text-destructive">*</span>
            </label>
            <div className="space-y-2">
              {motivos.map((motivo) => (
                <button
                  key={motivo.id}
                  onClick={() => onSelectMotivo(motivo.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    selectedMotivo === motivo.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    selectedMotivo === motivo.id
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground'
                  }`}>
                    {selectedMotivo === motivo.id && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>
                  <span className="text-sm">{motivo.texto}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Comentário adicional (opcional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder="Nos conte mais sobre o que podemos melhorar..."
              className="w-full p-3 rounded-lg border bg-background text-sm resize-none h-24"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Manter assinatura
          </Button>
          <Button
            variant="destructive"
            onClick={onCancel}
            disabled={processing || !selectedMotivo}
          >
            {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar cancelamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
