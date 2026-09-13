import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BotMessage {
  numero: string
  mensagem: string
  user_id?: string
}

interface BotResponse {
  sucesso: boolean
  proxima_mensagem?: string
  estado?: string
  enviar_amostra?: boolean
  segmento?: string
  cidade?: string
  obras?: Array<{
    id: string
    endereco: string
    fase: string
    porte: string
  }>
  erro?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body: BotMessage = await req.json()
    const { numero, mensagem, user_id } = body

    if (!numero || !mensagem) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: 'numero e mensagem sao obrigatorios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Buscar ou criar sessao do bot
    let sessionQuery = supabase
      .from('wa_session')
      .select('*')
      .eq('user_id', user_id || '00000000-0000-0000-0000-000000000000')
      .neq('estado', 'EXPIRADO')
      .neq('estado', 'CONCLUIDO')
      .gt('expira_em', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)

    // Se tem user_id, buscar sessao especifica
    let { data: sessao, error: sessionError } = user_id
      ? await sessionQuery
      : { data: null, error: null }

    // 2. Processar resposta via funcao SQL
    const { data: resultado, error: fnError } = await supabase
      .rpc('fn_wa_bot_processar_resposta', {
        p_user_id: user_id || '00000000-0000-0000-0000-000000000000',
        p_resposta: mensagem,
        p_telefone: numero
      })

    if (fnError) {
      console.error('Erro ao processar resposta:', fnError)
      return new Response(
        JSON.stringify({ sucesso: false, erro: fnError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const resposta = resultado as BotResponse

    // 3. Se deve enviar amostra, buscar obras
    if (resposta.enviar_amostra) {
      const cidade = resposta.cidade
      const segmento = resposta.segmento

      // Buscar 3 obras recentes
      const { data: obras, error: obrasError } = await supabase
        .from('radar_obras')
        .select('id, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, fase_atual, porte')
        .eq('endereco_cidade', cidade)
        .in('fase_atual', ['alvara', 'fundacao'])
        .eq('status', 'ativa')
        .order('created_at', { ascending: false })
        .limit(3)

      if (!obrasError && obras && obras.length > 0) {
        resposta.obras = obras.map(o => ({
          id: o.id,
          endereco: `${o.endereco_logradouro || ''}, ${o.endereco_numero || ''} - ${o.endereco_bairro || ''}, ${o.endereco_cidade}`,
          fase: o.fase_atual,
          porte: o.porte
        }))

        // Montar mensagem com obras
        let msgObras = '🎁 *Aqui estão 3 obras quentes na sua região!*\n\n'
        obras.forEach((obra, i) => {
          msgObras += `${i + 1}️⃣ *${obra.endereco}*\n`
          msgObras += `   📋 Fase: ${obra.fase} | 📏 Porte: ${obra.porte}\n`
          msgObras += `   🔗 https://radarcanteiro.com.br/radar/${obra.id}\n\n`
        })
        msgObras += '🚀 *Quer ver mais? Configure seu filtro em /whatsapp/alertas*'

        resposta.proxima_mensagem = msgObras

        // Atualizar sessao para CONCLUIDO
        if (user_id) {
          await supabase
            .from('wa_session')
            .update({
              estado: 'CONCLUIDO',
              contexto: {
                ...resposta,
                obras_enviadas: obras.map((o: any) => o.id)
              },
              expira_em: new Date(Date.now() - 1000).toISOString()
            })
            .eq('user_id', user_id)
            .eq('estado', 'AMOSTRA')
        }
      } else {
        resposta.proxima_mensagem = '😕 Desculpe, não consegui encontrar obras na sua região no momento.\n\n' +
          'Mas não se preocupe! Vou te incluir no Alerta Diário de Obras. 🚀'
        resposta.estado = 'CONCLUIDO'
      }
    }

    return new Response(
      JSON.stringify(resposta),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Erro no wa-bot-process:', error)
    return new Response(
      JSON.stringify({ sucesso: false, erro: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
