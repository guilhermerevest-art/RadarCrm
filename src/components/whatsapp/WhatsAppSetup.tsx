'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { whatsappProvider } from '@/lib/whatsapp-provider'
import { EvolutionApiClient } from '@/lib/evolution-api'
import { MessageSquare, RefreshCw, CheckCircle2, XCircle, Wifi, WifiOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Instance = {
  id: string
  instance_name: string
  status: 'disconnected' | 'connecting' | 'connected' | 'failed'
  phone_number: string | null
  evolution_api_url: string
  evolution_api_key: string
  created_at: string
  connected_at: string | null
}

export function WhatsAppSetup({ tenantId }: { tenantId: string }) {
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [apiUrl, setApiUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [instanceName, setInstanceName] = useState('radarcrm')
  const [saving, setSaving] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const supabase = createClient()

  const loadInstances = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    setInstances((data ?? []) as Instance[])
    setLoading(false)
  }, [supabase, tenantId])

  useEffect(() => { loadInstances() }, [loadInstances])

  const saveConfig = async () => {
    if (!apiUrl || !apiKey) return
    setSaving(true)

    // Criar/atualizar instancia no banco
    const { data: existing } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('instance_name', instanceName)
      .single()

    if (existing) {
      await supabase
        .from('whatsapp_instances')
        .update({
          evolution_api_url: apiUrl,
          evolution_api_key: apiKey,
          status: 'connecting',
        })
        .eq('id', existing.id)
    } else {
      await supabase.from('whatsapp_instances').insert({
        tenant_id: tenantId,
        instance_name: instanceName,
        evolution_api_url: apiUrl,
        evolution_api_key: apiKey,
        status: 'disconnected',
      })
    }

    // Tentar conectar via Evolution API
    try {
      const client = new EvolutionApiClient(apiUrl, apiKey)
      const qrRes = await client.connectInstance(instanceName)
      const qr = (qrRes?.qrcode?.code ?? qrRes?.qrcode?.base64 ?? null) as string | null
      setQrCode(qr)

      // Atualizar status
      const { data: inst } = await supabase
        .from('whatsapp_instances')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('instance_name', instanceName)
        .single()

      if (inst) {
        await supabase.from('whatsapp_instances').update({
          qr_code: qr,
          qr_expires_at: new Date(Date.now() + 60_000).toISOString(),
          status: 'connecting',
        }).eq('id', inst.id)
      }
    } catch (e) {
      console.error('Falha ao conectar:', e)
    }

    await loadInstances()
    setSaving(false)
  }

  const pollQRStatus = async (instanceId: string) => {
    setQrLoading(true)
    const client = new EvolutionApiClient(
      instances.find(i => i.id === instanceId)?.evolution_api_url ?? apiUrl,
      instances.find(i => i.id === instanceId)?.evolution_api_key ?? apiKey
    )

    const poll = setInterval(async () => {
      try {
        const status = await client.instanceStatus(instanceName)
        if (status?.instance?.status === 'open') {
          clearInterval(poll)
          await supabase
            .from('whatsapp_instances')
            .update({
              status: 'connected',
              qr_code: null,
              connected_at: new Date().toISOString(),
            })
            .eq('id', instanceId)
          setQrCode(null)
          await loadInstances()
        }
      } catch {
        // keep polling
      }
    }, 3000)

    setTimeout(() => {
      clearInterval(poll)
      setQrLoading(false)
    }, 120_000)
  }

  const connectedInstance = instances.find(i => i.status === 'connected')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            WhatsApp
          </h2>
          <p className="text-sm text-muted-foreground">
            Conecte seu WhatsApp via Evolution API para enviar mensagens
          </p>
        </div>
        {connectedInstance ? (
          <Badge className="bg-green-100 text-green-700 gap-1">
            <Wifi className="h-3 w-3" />
            {connectedInstance.phone_number ?? 'Conectado'}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-red-600">
            <WifiOff className="h-3 w-3" />
            Desconectado
          </Badge>
        )}
      </div>

      {/* Status atual */}
      {connectedInstance ? (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-green-800">
                <CheckCircle2 className="h-4 w-4 inline mr-1" />
                WhatsApp Conectado
              </p>
              <p className="text-sm text-green-600">
                {connectedInstance.phone_number}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={loadInstances}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Atualizar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Configure a Evolution API</CardTitle>
            <CardDescription>
              Instale a Evolution API em um servidor e informe URL e chave API.
              <br />
              <a
                href="https://doc.evolution-api.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Ver documentacao
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">URL da API</label>
                <Input
                  placeholder="https://evolution-api.exemplo.com.br"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Chave API</label>
                <Input
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="mt-1"
                  type="password"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Nome da Instancia</label>
                <Input
                  placeholder="radarcrm"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <Button
              onClick={saveConfig}
              disabled={!apiUrl || !apiKey || saving}
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : null}
              {saving ? 'Conectando...' : 'Conectar WhatsApp'}
            </Button>

            {/* QR Code */}
            {(qrCode || qrLoading) && (
              <div className="mt-4 p-4 border rounded-lg text-center bg-white">
                <p className="text-sm text-muted-foreground mb-3">
                  Escaneie o QR Code com seu WhatsApp
                </p>
                {qrCode ? (
                  <img
                    src={qrCode.startsWith('data:')
                      ? qrCode
                      : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`
                    }
                    alt="QR Code"
                    className="mx-auto h-48 w-48"
                  />
                ) : (
                  <div className="flex items-center justify-center h-48">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  QR expira em 60 segundos. Se expirou, clique em Conectar novamente.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Instances */}
      {instances.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-sm">Historico de instancias</h3>
          {instances.map((inst) => (
            <div key={inst.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium text-sm">{inst.instance_name}</p>
                <p className="text-xs text-muted-foreground">
                  {inst.connected_at
                    ? `Conectado em ${new Date(inst.connected_at).toLocaleString('pt-BR')}`
                    : 'Nunca conectado'}
                </p>
              </div>
              <Badge
                variant={inst.status === 'connected' ? 'default' : 'secondary'}
                className={inst.status === 'connected' ? 'bg-green-600' : ''}
              >
                {inst.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
