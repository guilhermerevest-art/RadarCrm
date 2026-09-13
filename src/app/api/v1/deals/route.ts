// =============================================================================
// Deals API - Listar e Criar Deals
// =============================================================================

import { NextRequest } from 'next/server'
import { withApiAuth, json, error, getQueryParams } from '../_lib/base-handler'
import type { ApiContext } from '../_lib/base-handler'

// GET /api/v1/deals - Lista deals
export const GET = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const { supabase, tenantId } = context
  const params = getQueryParams(request)

  // Paginação
  const page = Math.max(1, parseInt(params.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20')))
  const offset = (page - 1) * limit

  // Filtros
  const estagio = params.get('estagio')
  const leadId = params.get('lead_id')
  const responsavelId = params.get('responsavel_id')

  let query = supabase
    .from('crm_deals')
    .select(`
      *,
      lead:crm_leads(id, nome, empresa, email, telefone)
    `, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false })

  if (estagio) query = query.eq('estagio', estagio)
  if (leadId) query = query.eq('lead_id', leadId)
  if (responsavelId) query = query.eq('responsavel_id', responsavelId)

  const { data, error: dbError, count } = await query

  if (dbError) {
    console.error('[API Deals List] Error:', dbError)
    return json({ error: 'Failed to fetch deals' }, 500)
  }

  return json(data, 200, {
    page,
    limit,
    total: count || 0,
    pages: Math.ceil((count || 0) / limit),
  })
})

// POST /api/v1/deals - Criar deal
export const POST = withApiAuth(
  async (request: NextRequest, context: ApiContext) => {
    const { supabase, tenantId } = context

    try {
      const body = await request.json()

      // Validações básicas
      if (!body.titulo || typeof body.titulo !== 'string' || body.titulo.trim() === '') {
        return error('titulo is required', 'VALIDATION_ERROR', 400)
      }

      if (!body.lead_id) {
        return error('lead_id is required', 'VALIDATION_ERROR', 400)
      }

      // Verificar se lead existe e pertence ao tenant
      const { data: lead, error: leadError } = await supabase
        .from('crm_leads')
        .select('id, tenant_id')
        .eq('id', body.lead_id)
        .eq('tenant_id', tenantId)
        .single()

      if (leadError || !lead) {
        return error('Lead not found', 'LEAD_NOT_FOUND', 404)
      }

      const dealData = {
        tenant_id: tenantId,
        lead_id: body.lead_id,
        obra_id: body.obra_id || null,
        titulo: body.titulo.trim(),
        estagio: body.estagio || 'novo',
        valor_estimado: body.valor_estimado || null,
        probabilidade: body.probabilidade || 10,
        data_fechamento_prevista: body.data_fechamento_prevista || null,
        responsavel_id: body.responsavel_id || null,
      }

      const { data, error: dbError } = await supabase
        .from('crm_deals')
        .insert(dealData)
        .select()
        .single()

      if (dbError) {
        console.error('[API Deals Create] Error:', dbError)
        return error('Failed to create deal', 'INSERT_ERROR', 500)
      }

      // Dispara webhook
      await triggerWebhook(supabase, tenantId, 'deal.criado', data)

      return json(data, 201)
    } catch (e) {
      console.error('[API Deals Create] Parse error:', e)
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
