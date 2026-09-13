import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Cron: a cada 15 minutos + diario às 8h
// Deno.cron("Alerta de Obras", "*/15 8-22 * * *", async () => {
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verificar se deve executar (apenas diario 8h ou a cada 15 min se ativado)
    const url = new URL(req.url)
    const force = url.searchParams.get('force') === 'true'

    // Buscar filtros ativos
    const { data: filtros, error: filtrosError } = await supabase
      .from('wa_alerta_filtros')
      .select('*')
      .eq('ativo', true)

    if (filtrosError) {
      throw filtrosError
    }

    const resultados = {
      filtros_processados: 0,
      obras_enviadas: 0,
      erros: [] as string[]
    }

    for (const filtro of filtros || []) {
      try {
        // Verificar se ja enviou hoje (se nao for forcado)
        if (!force && filtro.ultimo_envio_em) {
          const ultimoEnvio = new Date(filtro.ultimo_envio_em)
          const agora = new Date()
          const diffHoras = (agora.getTime() - ultimoEnvio.getTime()) / (1000 * 60 * 60)

          // Se ja enviou nas ultimas 20h, pular
          if (diffHoras < 20) {
            continue
          }
        }

        // Buscar obras via funcao SQL
        const { data: obras, error: obrasError } = await supabase
          .rpc('fn_wa_alerta_obras_montar', {
            p_filtro_id: filtro.id,
            p_max_obras: 5
          })

        if (obrasError) {
          throw obrasError
        }

        if (!obras || obras.length === 0) {
          continue
        }

        // Montar mensagem do alerta
        let mensagem = `🔔 *Alerta Diário de Obras*\n`
        mensagem += `📅 ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}\n\n`
        mensagem += `Encontramos *${obras.length} obra(s) nova(s)* na sua região:\n\n`

        obras.forEach((obra: any, i: number) => {
          mensagem += `${i + 1}️⃣ *${obra.endereco}*\n`
          mensagem += `   📋 Fase: ${obra.fase} | 📏 Porte: ${obra.porte}`
          if (obra.distancia_km) {
            mensagem += ` | 📍 ${obra.distancia_km.toFixed(1)} km`
          }
          mensagem += '\n'
          mensagem += `   🔗 https://radarcanteiro.com.br/radar/${obra.id}\n\n`
        })

        mensagem += '---\n'
        mensagem += '🏗️ *Radar Canteiro* - Prospecção inteligente\n'
        mensagem += '⚙️ Configure filtros: /whatsapp/alertas\n'
        mensagem += '❌ SAIR para cancelar alertas'

        // TODO: Enviar via EvolutionAPI ou Meta Cloud API
        // Por agora, apenas registrar
        console.log(`[wa-alerta-obras] Alerta para filtro ${filtro.id}:`, obras.length, 'obras')

        // Atualizar ultimo_envio_em
        await supabase
          .from('wa_alerta_filtros')
          .update({
            ultimo_envio_em: new Date().toISOString(),
            obras_count: obras.length
          })
          .eq('id', filtro.id)

        resultados.filtros_processados++
        resultados.obras_enviadas += obras.length

      } catch (filtroError) {
        resultados.erros.push(`Filtro ${filtro.id}: ${filtroError.message}`)
        console.error(`Erro no filtro ${filtro.id}:`, filtroError)
      }
    }

    console.log('[wa-alerta-obras] Execucao concluida:', resultados)

    return new Response(
      JSON.stringify({
        sucesso: true,
        ...resultados
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Erro no wa-alerta-obras:', error)
    return new Response(
      JSON.stringify({ sucesso: false, erro: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
// })
