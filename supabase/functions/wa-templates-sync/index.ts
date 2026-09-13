import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MetaTemplate {
  id: string
  name: string
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DELETED'
  category: string
  language: string
  components?: Array<{
    type: string
    text?: string
  }>
}

// Cron: a cada 1 hora
// Deno.cron("Templates Sync", "0 * * * *", async () => {
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const metaAccessToken = Deno.env.get('META_ACCESS_TOKEN')
    const metaWabaId = Deno.env.get('META_WABA_ID')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const resultados = {
      templates_sync: 0,
      updated: 0,
      created: 0,
      errors: [] as string[]
    }

    // Se tem credenciais da Meta, sincronizar com API
    if (metaAccessToken && metaWabaId) {
      // Buscar templates locais que tem meta_template_id
      const { data: templatesLocais, error: templatesError } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .not('namespace', 'is', null) // Templates submetidos tem namespace

      if (templatesError) {
        throw templatesError
      }

      // Buscar templates da Meta
      const metaResponse = await fetch(
        `https://graph.facebook.com/v18.0/${metaWabaId}/message_templates?access_token=${metaAccessToken}`
      )

      if (metaResponse.ok) {
        const metaData = await metaResponse.json()
        const metaTemplates: MetaTemplate[] = metaData.data || []

        for (const templateLocal of templatesLocais || []) {
          const metaTemplate = metaTemplates.find(
            t => t.name === templateLocal.nome
          )

          if (metaTemplate) {
            // Atualizar status local
            const novoStatus = metaTemplate.status.toUpperCase()

            if (templateLocal.meta_status !== novoStatus) {
              await supabase
                .from('whatsapp_templates')
                .update({
                  meta_status: novoStatus,
                  updated_at: new Date().toISOString()
                })
                .eq('id', templateLocal.id)

              resultados.updated++
              console.log(`[wa-templates-sync] Template ${templateLocal.nome}: ${templateLocal.meta_status} -> ${novoStatus}`)
            }

            resultados.templates_sync++
          } else {
            // Template nao existe mais na Meta
            await supabase
              .from('whatsapp_templates')
              .update({
                meta_status: 'DELETED',
                is_ativo: false,
                updated_at: new Date().toISOString()
              })
              .eq('id', templateLocal.id)

            resultados.updated++
          }
        }

        // Verificar templates novos na Meta que ainda nao temos
        for (const metaTemplate of metaTemplates) {
          const existe = (templatesLocais || []).find(
            t => t.nome === metaTemplate.name
          )

          if (!existe && metaTemplate.status === 'APPROVED') {
            // Criar registro local
            const conteudo = metaTemplate.components
              ?.find(c => c.type === 'BODY')
              ?.text || ''

            await supabase
              .from('whatsapp_templates')
              .insert({
                tenant_id: null, // Global
                escopo: 'global',
                nome: metaTemplate.name,
                categoria: metaTemplate.category.toLowerCase(),
                conteudo,
                tipo: 'text',
                namespace: metaTemplate.id,
                meta_status: metaTemplate.status,
                is_ativo: true
              })

            resultados.created++
            console.log(`[wa-templates-sync] Novo template criado: ${metaTemplate.name}`)
          }
        }
      } else {
        const errorText = await metaResponse.text()
        resultados.errors.push(`Meta API error: ${metaResponse.status} - ${errorText}`)
        console.error('[wa-templates-sync] Meta API error:', errorText)
      }
    } else {
      // Sem credenciais Meta - apenas marcar como PENDING
      await supabase
        .from('whatsapp_templates')
        .update({ meta_status: 'PENDING' })
        .is('meta_status', null)
        .eq('escopo', 'global')
    }

    console.log('[wa-templates-sync] Sincronizacao concluida:', resultados)

    return new Response(
      JSON.stringify({
        sucesso: true,
        ...resultados
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Erro no wa-templates-sync:', error)
    return new Response(
      JSON.stringify({ sucesso: false, erro: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
// })
