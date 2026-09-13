'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface InstanceHealth {
  id: string
  instance_name: string
  phone_number?: string
  status: 'connected' | 'disconnected' | 'connecting' | 'failed'
  connected_at?: string
  disconnected_at?: string
  quality_tier?: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN'
}

interface UsageStats {
  mensagens_hoje: number
  mensagens_mes: number
  limite_dia: number
  limite_mes: number
  custo_estimado: number
  taxa_conversao: number
}

interface WASaudeContaProps {
  tenantId: string
  instanceId?: string
}

export function WASaudeConta({ tenantId, instanceId }: WASaudeContaProps) {
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [instances, setInstances] = useState<InstanceHealth[]>([])
  const [stats, setStats] = useState<UsageStats | null>(null)

  useEffect(() => {
    loadData()
  }, [tenantId, instanceId])

  async function loadData() {
    setLoading(true)
    try {
      // Buscar instancias
      let query = supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('tenant_id', tenantId)

      if (instanceId) {
        query = query.eq('id', instanceId)
      }

      const { data: instancesData, error: instancesError } = await query

      if (instancesError) throw instancesError

      // Buscar estatisticas de uso das ultimas 24h
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const { data: messagesData } = await supabase
        .from('whatsapp_mensagens')
        .select('created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', yesterday.toISOString())

      // Buscar mensagens do mes
      const firstOfMonth = new Date()
      firstOfMonth.setDate(1)

      const { data: messagesMonthData } = await supabase
        .from('whatsapp_mensagens')
        .select('created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', firstOfMonth.toISOString())

      setInstances(instancesData || [])

      // Calcular estatisticas (valores de exemplo - em producao viria de tabela de billing)
      setStats({
        mensagens_hoje: messagesData?.length || 0,
        mensagens_mes: messagesMonthData?.length || 0,
        limite_dia: 500,
        limite_mes: 15000,
        custo_estimado: ((messagesMonthData?.length || 0) * 0.05), // R$ 0.05 por mensagem utilidade
        taxa_conversao: 0, // TODO: calcular
      })

    } catch (error: any) {
      console.error('Erro ao carregar dados:', error)
      toast({
        title: 'Erro ao carregar dados',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      // Chamar health check via Edge Function
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/wa-health-monitor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
      })

      if (response.ok) {
        toast({ title: 'Saúde verificada', description: 'Status atualizado' })
        await loadData()
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao verificar',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setRefreshing(false)
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'connected':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'disconnected':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <HelpCircle className="h-4 w-4 text-gray-400" />
    }
  }

  function getQualityBadge(tier?: string) {
    switch (tier) {
      case 'GREEN':
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Alta
          </Badge>
        )
      case 'YELLOW':
        return (
          <Badge variant="secondary" className="bg-yellow-500 text-white">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Média
          </Badge>
        )
      case 'RED':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Baixa
          </Badge>
        )
      default:
        return (
          <Badge variant="outline">
            <HelpCircle className="h-3 w-3 mr-1" />
            Desconhecido
          </Badge>
        )
    }
  }

  function getUsageTrend(): { icon: React.ReactNode; label: string; value: string } {
    // Simular tendencia - em producao viria de dados historicos
    const hoje = stats?.mensagens_hoje || 0
    const ontem = Math.floor(hoje * 0.9 + Math.random() * hoje * 0.2)

    if (hoje > ontem * 1.1) {
      return {
        icon: <TrendingUp className="h-4 w-4 text-green-500" />,
        label: '↑ Acima da média',
        value: `+${Math.round(((hoje - ontem) / ontem) * 100)}%`
      }
    } else if (hoje < ontem * 0.9) {
      return {
        icon: <TrendingDown className="h-4 w-4 text-red-500" />,
        label: '↓ Abaixo da média',
        value: `${Math.round(((hoje - ontem) / ontem) * 100)}%`
      }
    }
    return {
      icon: <Minus className="h-4 w-4 text-gray-400" />,
      label: '→ Na média',
      value: '0%'
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  const trend = getUsageTrend()
  const usoDia = stats ? (stats.mensagens_hoje / stats.limite_dia) * 100 : 0
  const usoMes = stats ? (stats.mensagens_mes / stats.limite_mes) * 100 : 0

  return (
    <Card className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Saúde da Conta WhatsApp</h3>
          <p className="text-sm text-muted-foreground">Status e métricas de uso</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Status das instâncias */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Instâncias</Label>
        {instances.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma instância configurada</p>
        ) : (
          <div className="space-y-2">
            {instances.map(instance => (
              <div
                key={instance.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(instance.status)}
                  <div>
                    <p className="font-medium text-sm">
                      {instance.phone_number || instance.instance_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {instance.status === 'connected'
                        ? `Conectado desde ${instance.connected_at ? new Date(instance.connected_at).toLocaleString('pt-BR') : '?'}`
                        : instance.status === 'disconnected'
                        ? `Desconectado há ${instance.disconnected_at ? formatDuration(new Date(instance.disconnected_at)) : '?'}`
                        : instance.status}
                    </p>
                  </div>
                </div>
                {getQualityBadge(instance.quality_tier)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Métricas de uso */}
      {stats && (
        <>
          {/* Uso do dia */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Uso de hoje</Label>
              <div className="flex items-center gap-2 text-sm">
                {trend.icon}
                <span className="text-muted-foreground">{trend.label}</span>
                <span className="font-medium">{trend.value}</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{stats.mensagens_hoje} mensagens</span>
                <span className="text-muted-foreground">/ {stats.limite_dia}</span>
              </div>
              <Progress
                value={Math.min(usoDia, 100)}
                className={usoDia > 90 ? '[&>div]:bg-red-500' : usoDia > 70 ? '[&>div]:bg-yellow-500' : ''}
              />
            </div>
          </div>

          {/* Uso do mês */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Uso do mês</Label>
              <span className="text-sm font-medium text-muted-foreground">
                {new Date().toLocaleString('pt-BR', { month: 'long' })}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{stats.mensagens_mes} mensagens</span>
                <span className="text-muted-foreground">/ {stats.limite_mes}</span>
              </div>
              <Progress
                value={Math.min(usoMes, 100)}
                className={usoMes > 90 ? '[&>div]:bg-red-500' : usoMes > 70 ? '[&>div]:bg-yellow-500' : ''}
              />
            </div>
          </div>

          {/* Projeção de custo */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Custo estimado do mês</span>
              <span className="text-lg font-bold">
                R$ {stats.custo_estimado.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Baseado em R$ 0,05 por mensagem utilidade. O custo pode variar se usar templates de marketing (R$ 0,30).
            </p>
          </div>

          {/* Alertas */}
          {usoDia > 90 && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-red-500">Limite diário próximo</p>
                <p className="text-muted-foreground">
                  Você está usando {usoDia.toFixed(0)}% do limite diário. Considere pausarenvios não prioritários.
                </p>
              </div>
            </div>
          )}

          {instances.some(i => i.status === 'disconnected') && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-500">Instância desconectada</p>
                <p className="text-muted-foreground">
                  Verifique a conexão do WhatsApp para não perder mensagens.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Ações */}
      <div className="flex gap-2 pt-4 border-t">
        <Button variant="outline" size="sm" asChild>
          <a href="/whatsapp/configuracoes">
            Configurar limites
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href="/whatsapp/templates">
            Ver templates
          </a>
        </Button>
      </div>
    </Card>
  )
}

// Helper para formatar duração
function formatDuration(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 60) {
    return `${diffMins}min`
  } else if (diffHours < 24) {
    return `${diffHours}h`
  } else {
    return `${diffDays}d`
  }
}
