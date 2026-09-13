// =============================================================================
// GET /api/v1/obras/:id - Detalhe de obra
// =============================================================================

import { NextRequest } from 'next/server'
import { withApiAuth, json, error } from '../../_lib/base-handler'
import type { ApiContext } from '../../_lib/base-handler'

export const GET = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const { supabase, tenantId } = context

  // Extrair ID da URL
  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const id = segments[segments.length - 1]

  if (!id) {
    return error('Obra ID is required', 'MISSING_ID', 400)
  }

  // Validar UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return error('Invalid obra ID format', 'INVALID_ID', 400)
  }

  const { data, error: dbError } = await supabase
    .from('radar_obras')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (dbError || !data) {
    return error('Obra not found', 'NOT_FOUND', 404)
  }

  // Buscar marcações da comunidade (fase consolidada)
  const { data: marcacoes } = await supabase
    .from('radar_obra_marcacoes')
    .select(`
      id,
      fase,
      fase_macro,
      nota,
      created_at,
      total_confirmacoes:radar_obra_confirmacoes(count)
    `)
    .eq('obra_global_id', data.obra_global_id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Buscar número de confirmações total
  const { count: totalConfirmacoes } = await supabase
    .from('radar_obra_confirmacoes')
    .select('*', { count: 'exact', head: true })
    .eq('obra_global_id', data.obra_global_id)

  return json({
    ...data,
    marcacoes: marcacoes || [],
    fase_comunidade: {
      total_confirmacoes: totalConfirmacoes || 0,
      marcacao_ativa: data.fase_consolidada,
      fase_macro: data.fase_macro_consolidada,
    },
  })
})
