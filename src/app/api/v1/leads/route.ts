// =============================================================================
// Leads API - Listar e Criar Leads
// =============================================================================

import { NextRequest } from 'next/server'
import { withApiAuth, json, error, getQueryParams } from '../_lib/base-handler'
import type { ApiContext } from '../_lib/base-handler'

// GET /api/v1/leads - Lista leads
export const GET = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const { supabase, tenantId } = context
  const params = getQueryParams(request)

  // Paginação
  const page = Math.max(1, parseInt(params.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20')))
  const offset = (page - 1) * limit

  // Filtros
  const status = params.get('status')
  const origem = params.get('origem')
  const responsavelId = params.get('responsavel_id')

  let query = supabase
    .from('crm_leads')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (origem) query = query.eq('origem', origem)
  if (responsavelId) query = query.eq('responsavel_id', responsavelId)

  const { data, error: dbError, count } = await query

  if (dbError) {
    console.error('[API Leads List] Error:', dbError)
    return json({ error: 'Failed to fetch leads' }, 500)
  }

  return json(data, 200, {
    page,
    limit,
    total: count || 0,
    pages: Math.ceil((count || 0) / limit),
  })
})

// POST /api/v1/leads - Criar lead
export const POST = withApiAuth(
  async (request: NextRequest, context: ApiContext) => {
    const { supabase, tenantId } = context

    try {
      const body = await request.json()

      // Validações básicas
      if (!body.nome || typeof body.nome !== 'string' || body.nome.trim() === '') {
        return error('nome is required', 'VALIDATION_ERROR', 400)
      }

      const leadData = {
        tenant_id: tenantId,
        nome: body.nome.trim(),
        empresa: body.empresa?.trim() || null,
        email: body.email?.trim() || null,
        telefone: body.telefone?.trim() || null,
        origem: body.origem || 'api',
        utm_source: body.utm_source || null,
        utm_campaign: body.utm_campaign || null,
        utm_medium: body.utm_medium || null,
        utm_content: body.utm_content || null,
        endereco_cidade: body.endereco_cidade?.trim() || null,
        observacoes: body.observacoes?.trim() || null,
        status: 'novo',
      }

      const { data, error: dbError } = await supabase
        .from('crm_leads')
        .insert(leadData)
        .select()
        .single()

      if (dbError) {
        console.error('[API Leads Create] Error:', dbError)
        return error('Failed to create lead', 'INSERT_ERROR', 500)
      }

      // Dispara webhook se configurado
      await triggerWebhook(supabase, tenantId, 'lead.criado', data)

      return json(data, 201)
    } catch (e) {
      console.error('[API Leads Create] Parse error:', e)
      return error('Invalid JSON body', 'PARSE_ERROR', 400)
    }
  },
  true // requer write
)

/**
 * Dispara webhook para um evento
 */
async function triggerWebhook(
  supabase: ApiContext['supabase'],
  tenantId: string,
  evento: string,
  data: unknown
) {
  try {
    await supabase.rpc('fn_webhook_disparar', {
      p_evento: evento,
      p_tenant_id: tenantId,
      p_payload: JSON.parse(JSON.stringify(data)),
    })
  } catch (e) {
    console.error('[Webhook] Failed to trigger:', e)
  }
}
