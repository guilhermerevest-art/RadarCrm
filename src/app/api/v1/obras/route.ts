// =============================================================================
// GET /api/v1/obras - Lista obras com filtros
// =============================================================================

import { NextRequest } from 'next/server'
import { withApiAuth, json, getQueryParams } from '../_lib/base-handler'
import type { ApiContext } from '../_lib/base-handler'

export const GET = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const { supabase, tenantId } = context
  const params = getQueryParams(request)

  // Parâmetros de paginação
  const page = Math.max(1, parseInt(params.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20')))
  const offset = (page - 1) * limit

  // Parâmetros de filtro
  const cidade = params.get('cidade')
  const uf = params.get('uf')
  const fase = params.get('fase')
  const porte = params.get('porte')
  const status = params.get('status') || 'ativa'
  const fonte = params.get('fonte')

  // Parâmetros de ordenação
  const sortBy = params.get('sortBy') || 'created_at'
  const sortOrder = params.get('sortOrder') === 'asc' ? 'asc' : 'desc'

  // Construir query
  let query = supabase
    .from('radar_obras')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('status', status)
    .range(offset, offset + limit - 1)
    .order(sortBy, { ascending: sortOrder === 'asc' })

  if (cidade) query = query.ilike('endereco_cidade', `%${cidade}%`)
  if (uf) query = query.eq('endereco_uf', uf.toUpperCase())
  if (fase) query = query.eq('fase_atual', fase)
  if (porte) query = query.eq('porte', porte)
  if (fonte) query = query.eq('fonte', fonte)

  const { data, error, count } = await query

  if (error) {
    console.error('[API Obras List] Error:', error)
    return json({ error: 'Failed to fetch obras', details: error.message }, 500)
  }

  return json(data, 200, {
    page,
    limit,
    total: count || 0,
    pages: Math.ceil((count || 0) / limit),
  })
})
