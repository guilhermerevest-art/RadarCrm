'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WAAlertaFiltrosList } from '@/components/whatsapp/WAAlertaFiltroForm'
import { WASaudeConta } from '@/components/whatsapp/WASaudeConta'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Bell, Activity, Settings, Loader2 } from 'lucide-react'

export default function WhatsAppAlertasPage() {
  const supabase = createClient()
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [instanceId, setInstanceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTenant()
  }, [])

  async function loadTenant() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: tu } = await supabase
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (tu) {
      setTenantId(tu.tenant_id)

      // Buscar instancia padrao
      const { data: instancias } = await supabase
        .from('whatsapp_instances')
        .select('id')
        .eq('tenant_id', tu.tenant_id)
        .eq('is_default', true)
        .limit(1)

      if (instancias?.[0]) {
        setInstanceId(instancias[0].id)
      }
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!tenantId) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <Card className="p-8 text-center">
          <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">Configure sua conta primeiro</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Você precisa ter uma instância WhatsApp configurada para receber alertas.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          Alertas WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure alertas de obras novas e monitore sua conta
        </p>
      </div>

      <Tabs defaultValue="filtros" className="space-y-6">
        <TabsList>
          <TabsTrigger value="filtros">
            <Bell className="h-4 w-4 mr-2" />
            Filtros de Alerta
          </TabsTrigger>
          <TabsTrigger value="saude">
            <Activity className="h-4 w-4 mr-2" />
            Saúde da Conta
          </TabsTrigger>
        </TabsList>

        <TabsContent value="filtros">
          <Card className="p-6">
            <WAAlertaFiltrosList tenantId={tenantId} />
          </Card>
        </TabsContent>

        <TabsContent value="saude">
          <WASaudeConta tenantId={tenantId} instanceId={instanceId || undefined} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
