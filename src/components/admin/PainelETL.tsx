'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'

const FONTE_LABELS: Record<string, string> = {
  cno: 'CNO (Receita Federal)',
  alvara_prefeitura: 'Alvaras de Prefeitura',
  pncp: 'PNCP',
  semad_mg: 'SEMAD MG',
}

const FONTE_ICONS: Record<string, string> = {
  cno: '🏛️',
  alvara_prefeitura: '🏗️',
  pncp: '📋',
  semad_mg: '🌿',
}

export function PainelETL() {
  const [fontes, setFontes] = useState<Array<{
    fonte: string
    enabled: boolean
    descricao: string | null
    ultima_execucao: string | null
    total_registros_importados: number | null
    ultima_execucao_erro: string | null
  }>>([])
  const [jobs, setJobs] = useState<Array<{
    id: string
    fonte: string
    status: string
    created_at: string
    registros_inseridos: number | null
    registros_duplicados: number | null
    registros_erro: number | null
  }>>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState<string | null>(null)
  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    const [fonteRes, jobRes] = await Promise.all([
      supabase.from('radar_fontes_config').select('*').order('fonte'),
      supabase.from('radar_ingestao_jobs').select('*').order('created_at', { ascending: false }).limit(20),
    ])
    setFontes(fonteRes.data ?? [])
    setJobs(jobRes.data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const toggleFonte = async (fonte: string, enabled: boolean) => {
    await supabase.from('radar_fontes_config').update({ enabled }).eq('fonte', fonte)
    await loadData()
  }

  const runJob = async (fonte: string) => {
    setRunning(fonte)
    try {
      const session = (await supabase.auth.getSession()).data.session
      await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/etl-job-run`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ fonte }),
        }
      )
      await loadData()
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ETL de Obras</h1>
          <p className="text-muted-foreground">
            Configure e monitore a importacao de obras de fontes publicas
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          {loading ? '...' : '↻ Atualizar'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {fontes.map(fonte => (
          <Card key={fonte.fonte}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{FONTE_ICONS[fonte.fonte]}</span>
                <Badge variant={fonte.enabled ? 'default' : 'secondary'}>
                  {fonte.enabled ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <CardTitle className="text-sm mt-2">{FONTE_LABELS[fonte.fonte]}</CardTitle>
              <CardDescription className="text-xs">{fonte.descricao}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground">
                {fonte.ultima_execucao
                  ? `Ultima: ${new Date(fonte.ultima_execucao).toLocaleString('pt-BR')}`
                  : 'Nunca executado'}
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">Importados: </span>
                <span className="font-mono font-medium">
                  {(fonte.total_registros_importados ?? 0).toLocaleString('pt-BR')}
                </span>
              </div>
              {fonte.ultima_execucao_erro && (
                <div className="text-xs text-red-600">⚠ {fonte.ultima_execucao_erro}</div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleFonte(fonte.fonte, !fonte.enabled)}
                >
                  {fonte.enabled ? 'Pausar' : 'Ativar'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => runJob(fonte.fonte)}
                  disabled={!fonte.enabled || running === fonte.fonte}
                >
                  {running === fonte.fonte ? '⏳ Rodando...' : '▶ Executar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      {/* Geocoding batch + Cron status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Geocoding e Infraestrutura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Geocode Batch</p>
              <p className="text-xs text-muted-foreground">
                Encontra coordenadas para obras sem lat/lng (usa Mapbox ou Nominatim)
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const session = (await supabase.auth.getSession()).data.session
                const res = await fetch(
                  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/geocode-batch`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${session?.access_token}`,
                    },
                    body: JSON.stringify({}),
                  }
                )
                const data = await res.json()
                alert(data.success ? `Geocoding: ${data.geocoded} obras processadas` : `Erro: ${data.error}`)
                loadData()
              }}
            >
              <MapPin className="h-4 w-4 mr-1" />
              Executar Geocode
            </Button>
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-sm font-medium">Status Cron</p>
              <p className="text-xs text-muted-foreground">
                Jobs automaticos (via pg_cron): CNO diario 02h, Alvaras 03h, PNCP 04h, SEMAD seg 05h
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={loadData}
              title="pg_cron jobs agendados no banco"
            >
              Agendado via pg_cron
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historico de Execucoes</CardTitle>
          <CardDescription>Ultimas 20 execucoes de ETL</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {jobs.map(job => (
              <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span>{FONTE_ICONS[job.fonte]}</span>
                  <div>
                    <div className="font-medium text-sm">{FONTE_LABELS[job.fonte]}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(job.created_at).toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className={
                    job.status === 'sucesso' ? 'text-green-600' :
                    job.status === 'erro' ? 'text-red-600' : 'text-amber-600'
                  }>
                    {job.status === 'rodando' ? '⏳' : job.status === 'sucesso' ? '✅' : '❌'} {job.status}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    +{(job.registros_inseridos ?? 0).toLocaleString('pt-BR')} inseridos
                  </span>
                  {(job.registros_duplicados ?? 0) > 0 && (
                    <span className="text-muted-foreground text-xs">
                      {(job.registros_duplicados ?? 0).toLocaleString('pt-BR')} duplicados
                    </span>
                  )}
                  {(job.registros_erro ?? 0) > 0 && (
                    <span className="text-red-600 text-xs">{(job.registros_erro ?? 0)} erros</span>
                  )}
                </div>
              </div>
            ))}
            {jobs.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma execucao registrada. Ative uma fonte e clique em Executar.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
