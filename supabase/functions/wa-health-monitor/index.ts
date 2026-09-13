import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface HealthCheckResult {
  instance_id: string
  instance_name: string
  tenant_id: string
  status: 'connected' | 'disconnected' | 'connecting' | 'failed'
  disconnected_at: string | null
  health_check_success: boolean
  error?: string
  should_alert: boolean
}

// Cron: a cada 6 horas
// Deno.cron("Health Monitor", "0 */6 * * *", async () => {
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const slackWebhook = Deno.env.get('SLACK_WEBHOOK_URL')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar todas instancias ativas
    const { data: instancias, error: instanciasError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .neq('status', 'failed')

    if (instanciasError) {
      throw instanciasError
    }

    const resultados: HealthCheckResult[] = []
    const alertas: string[] = []

    for (const instancia of instancias || []) {
      const resultado: HealthCheckResult = {
        instance_id: instancia.id,
        instance_name: instancia.instance_name,
        tenant_id: instancia.tenant_id,
        status: instancia.status,
        disconnected_at: instancia.disconnected_at,
        health_check_success: false,
        should_alert: false
      }

      try {
        // Chamar API da Evolution para verificar status
        const response = await fetch(
          `${instancia.evolution_api_url}/instance/connectionState/${instancia.instance_name}`,
          {
            headers: {
              'Content-Type': 'application/json',
              'apikey': instancia.evolution_api_key
            }
          }
        )

        if (response.ok) {
          const data = await response.json()
          const state = data?.instance?.state || data?.state || 'unknown'

          resultado.health_check_success = true

          // Mapear estado
          let novoStatus: string
          switch (state) {
            case 'open':
            case 'connected':
              novoStatus = 'connected'
              break
            case 'close':
            case 'disconnected':
              novoStatus = 'disconnected'
              break
            default:
              novoStatus = 'connecting'
          }

          resultado.status = novoStatus as any

          // Atualizar no banco
          await supabase
            .from('whatsapp_instances')
            .update({
              status: novoStatus,
              disconnected_at: novoStatus === 'connected' ? null :
                novoStatus === 'disconnected' && !instancia.disconnected_at ? new Date().toISOString() : instancia.disconnected_at,
              updated_at: new Date().toISOString()
            })
            .eq('id', instancia.id)

          // Verificar se deve alertar
          if (novoStatus === 'disconnected' && instancia.disconnected_at) {
            const disconnectedAt = new Date(instancia.disconnected_at)
            const hoursDisconnected = (Date.now() - disconnectedAt.getTime()) / (1000 * 60 * 60)

            if (hoursDisconnected > 1) {
              resultado.should_alert = true
              alertas.push(`⚠️ *${instancia.instance_name}* desconectado há ${hoursDisconnected.toFixed(1)}h`)
            }
          }

        } else {
          resultado.error = `HTTP ${response.status}`
          resultado.status = 'failed'
        }

      } catch (e: any) {
        resultado.error = e.message
        resultado.status = 'failed'
        resultado.should_alert = true
        alertas.push(`❌ *${instancia.instance_name}* - Erro: ${e.message}`)
      }

      resultados.push(resultado)
    }

    // Enviar alerta para Slack se houver
    if (alertas.length > 0 && slackWebhook) {
      const payload = {
        text: '🚨 *WhatsApp Health Monitor*\n\n' + alertas.join('\n'),
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '🚨 WhatsApp Health Alert' }
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: alertas.join('\n') }
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `Verificado em: ${new Date().toISOString()}` }
            ]
          }
        ]
      }

      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    }

    const summary = {
      total: resultados.length,
      connected: resultados.filter(r => r.status === 'connected').length,
      disconnected: resultados.filter(r => r.status === 'disconnected').length,
      failed: resultados.filter(r => r.status === 'failed').length,
      withAlerts: resultados.filter(r => r.should_alert).length
    }

    console.log('[wa-health-monitor] Resultado:', summary)

    return new Response(
      JSON.stringify({
        sucesso: true,
        summary,
        detalhes: resultados,
        alertas_enviados: alertas.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Erro no wa-health-monitor:', error)
    return new Response(
      JSON.stringify({ sucesso: false, erro: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
// })
