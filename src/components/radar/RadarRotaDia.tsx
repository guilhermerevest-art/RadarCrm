'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Navigation,
  MapPin,
  Clock,
  Ruler,
  Play,
  CheckCircle2,
  Circle,
  ChevronRight,
  Route,
  Calendar,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { RadarScoreBadge, RadarFaseTag } from './RadarScoreBadge'

interface RotaObra {
  id: string
  endereco: string
  numero?: string
  bairro?: string
  cidade: string
  uf: string
  fase?: string
  porte?: string
  lat?: number
  lng?: number
  valor_estimado?: number
  score?: number
  visita_status?: string
  visita_chegada?: string
}

interface RotaData {
  encontrou: boolean
  rota_id?: string
  data: string
  nome?: string
  distancia_km?: number
  duracao_min?: number
  status?: string
  started_at?: string
  obras: RotaObra[]
  centro_lat?: number
  centro_lng?: number
}

interface RadarRotaDiaProps {
  className?: string
  onRouteChange?: (hasRoute: boolean) => void
}

export function RadarRotaDia({ className, onRouteChange }: RadarRotaDiaProps) {
  const [rota, setRota] = useState<RotaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [mapsUrl, setMapsUrl] = useState<string | null>(null)
  const [wazeUrl, setWazeUrl] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [segmento, setSegmento] = useState<string>('geral')
  const supabase = createClient()

  // Carregar rota do dia
  const carregarRota = useCallback(async () => {
    if (!tenantId || !userId) return

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('fn_radar_rota_do_dia', {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_data: new Date().toISOString().split('T')[0],
      })

      if (error) throw error

      const rotaData = data as RotaData
      setRota(rotaData)

      if (rotaData.encontrou && rotaData.rota_id) {
        onRouteChange?.(true)

        // Buscar URLs de navegação
        const [maps, waze] = await Promise.all([
          supabase.rpc('fn_radar_rota_google_maps_url', {
            p_rota_id: rotaData.rota_id,
          }),
          supabase.rpc('fn_radar_rota_waze_url', {
            p_rota_id: rotaData.rota_id,
          }),
        ])

        setMapsUrl(maps.data)
        setWazeUrl(waze.data)
      } else {
        onRouteChange?.(false)
      }
    } catch (err) {
      console.error('[rota] erro ao carregar:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase, tenantId, userId, onRouteChange])

  // Inicializar
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      const { data: tu } = await supabase
        .from('tenant_users')
        .select('tenant_id, users!inner(segmento)')
        .eq('user_id', user?.id || '')
        .maybeSingle()

      if (tu) {
        setTenantId(tu.tenant_id)
      }

      // Buscar segmento principal do tenant
      const { data: tenant } = await supabase
        .from('tenants')
        .select('segmento_principal')
        .eq('id', tu?.tenant_id || '')
        .maybeSingle()

      if (tenant?.segmento_principal?.[0]) {
        setSegmento(tenant.segmento_principal[0])
      }
    }
    init()
  }, [supabase])

  // Carregar rota quando tiver dados
  useEffect(() => {
    if (tenantId && userId) {
      carregarRota()
    }
  }, [tenantId, userId, carregarRota])

  // Gerar nova rota
  async function gerarRota() {
    if (!tenantId || !userId) return

    setGerando(true)
    try {
      // Montar rota
      const { data: rotaData, error: rotaError } = await supabase.rpc('fn_radar_rota_montar', {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_data: new Date().toISOString().split('T')[0],
        p_max_obras: 8,
        p_segmento: segmento,
      })

      if (rotaError) throw rotaError

      // Salvar rota
      const { error: salvarError } = await supabase.rpc('fn_radar_rota_salvar', {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_data: new Date().toISOString().split('T')[0],
        p_obra_ids: rotaData.obra_ids || [],
        p_distancia_km: rotaData.distancia_km || 0,
        p_duracao_min: rotaData.duracao_min || 0,
        p_centro_lat: rotaData.centro_lat,
        p_centro_lng: rotaData.centro_lng,
        p_nome: rotaData.nome,
      })

      if (salvarError) throw salvarError

      // Recarregar
      await carregarRota()
    } catch (err: any) {
      console.error('[rota] erro ao gerar:', err)
      alert('Erro ao gerar rota: ' + (err.message || 'erro desconhecido'))
    } finally {
      setGerando(false)
    }
  }

  // Iniciar navegação
  async function iniciarRota() {
    if (!rota?.rota_id) return

    try {
      await supabase.rpc('fn_radar_rota_iniciar', {
        p_rota_id: rota.rota_id,
        p_user_id: userId,
      })
    } catch (err) {
      console.error('[rota] erro ao iniciar:', err)
    }

    // Abrir Google Maps
    if (mapsUrl) {
      window.open(mapsUrl, '_blank')
    } else if (wazeUrl) {
      window.open(wazeUrl, '_blank')
    }
  }

  // Registrar visita
  async function registrarVisita(obraId: string) {
    if (!rota?.rota_id || !userId) return

    try {
      // Tentar pegar geolocalização
      let lat: number | null = null
      let lng: number | null = null

      if (navigator.geolocation) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        })
        lat = position.coords.latitude
        lng = position.coords.longitude
      }

      await supabase.rpc('fn_radar_rota_visitar', {
        p_rota_id: rota.rota_id,
        p_obra_id: obraId,
        p_user_id: userId,
        p_lat: lat,
        p_lng: lng,
        p_status: 'visitado',
      })

      // Recarregar dados
      await carregarRota()
    } catch (err) {
      console.error('[rota] erro ao registrar visita:', err)
    }
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  // Sem rota - mostrar CTA para criar
  if (!rota?.encontrou || rota.obras.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Route className="h-5 w-5 text-primary" />
              Rota do Dia
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              <Calendar className="h-3 w-3 mr-1" />
              {new Date().toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
              })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-6">
            <Navigation className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm mb-1">
              Nenhuma rota planejada para hoje
            </p>
            <p className="text-xs text-muted-foreground/70">
              Gere uma rota com as melhores obras do dia
            </p>
          </div>

          <Button
            onClick={gerarRota}
            disabled={gerando}
            className="w-full"
            size="lg"
          >
            {gerando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando rota...
              </>
            ) : (
              <>
                <Route className="h-4 w-4 mr-2" />
                Gerar Rota do Dia
              </>
            )}
          </Button>

          {segmento !== 'geral' && (
            <p className="text-xs text-center text-muted-foreground">
              Segmento: <span className="font-medium capitalize">{segmento}</span>
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  // Com rota - mostrar lista
  const visitasFeitas = rota.obras.filter((o) => o.visita_status === 'visitado').length
  const progresso = (visitasFeitas / rota.obras.length) * 100

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Route className="h-5 w-5 text-primary" />
            {rota.nome || 'Rota do Dia'}
          </CardTitle>
          <Badge
            variant={rota.status === 'em_andamento' ? 'default' : 'outline'}
            className="text-xs"
          >
            {visitasFeitas}/{rota.obras.length} visitas
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          {rota.distancia_km && (
            <div className="flex items-center gap-1">
              <Ruler className="h-3 w-3" />
              {rota.distancia_km} km
            </div>
          )}
          {rota.duracao_min && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{rota.duracao_min} min
            </div>
          )}
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {rota.obras.length} obras
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <Button
            onClick={iniciarRota}
            size="sm"
            className="flex-1"
            disabled={!mapsUrl && !wazeUrl}
          >
            <Navigation className="h-4 w-4 mr-1" />
            Iniciar Rota
          </Button>

          <div className="flex gap-1">
            {mapsUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(mapsUrl, '_blank')}
                title="Google Maps"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {rota.obras.map((obra, index) => (
          <div
            key={obra.id}
            className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
          >
            {/* Numero da parada */}
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                obra.visita_status === 'visitado'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {obra.visita_status === 'visitado' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                index + 1
              )}
            </div>

            {/* Info da obra */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {obra.endereco}
                {obra.numero && `, ${obra.numero}`}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {obra.bairro && `${obra.bairro} · `}
                {obra.cidade}/{obra.uf}
              </p>

              <div className="flex items-center gap-2 mt-1.5">
                {obra.fase && <RadarFaseTag fase={obra.fase} size="sm" />}
                {obra.score !== undefined && (
                  <RadarScoreBadge score={obra.score} size="sm" />
                )}
              </div>
            </div>

            {/* Acoes */}
            <div className="flex-shrink-0">
              {obra.visita_status === 'visitado' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => registrarVisita(obra.id)}
                  className="h-8 w-8 p-0"
                  title="Registrar visita"
                >
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </div>

            {/* Link para detalhes */}
            <Link href={`/dashboard/radar/${obra.id}`}>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </div>
        ))}

        {/* Footer com geracao de nova rota */}
        <div className="pt-3 border-t mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={gerarRota}
            disabled={gerando}
            className="w-full"
          >
            {gerando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Regenerando...
              </>
            ) : (
              <>
                <Route className="h-4 w-4 mr-2" />
                Regenerar Rota
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Mini widget de rota para exibir na barra lateral
 */
export function RadarRotaMiniWidget({ className }: { className?: string }) {
  const [hasRoute, setHasRoute] = useState(false)
  const [visitas, setVisitas] = useState(0)
  const [total, setTotal] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: tu } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!tu) return

      const { data } = await supabase.rpc('fn_radar_rota_do_dia', {
        p_tenant_id: tu.tenant_id,
        p_user_id: user.id,
        p_data: new Date().toISOString().split('T')[0],
      })

      if (data?.encontrou && data.obras) {
        setHasRoute(true)
        setTotal(data.obras.length)
        setVisitas(data.obras.filter((o: any) => o.visita_status === 'visitado').length)
      }
    }
    check()
  }, [supabase])

  if (!hasRoute) return null

  return (
    <Link href="/dashboard/radar/rota" className={className}>
      <Card className="cursor-pointer hover:border-primary/50 transition-colors">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Rota do Dia</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {visitas}/{total}
            </Badge>
          </div>
          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${total > 0 ? (visitas / total) * 100 : 0}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
