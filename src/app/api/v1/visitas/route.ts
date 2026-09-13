// =============================================================================
// POST /api/v1/visitas - Registrar visita a uma obra
// =============================================================================

import { NextRequest } from 'next/server'
import { withApiAuth, json, error } from '../_lib/base-handler'
import type { ApiContext } from '../_lib/base-handler'

export const POST = withApiAuth(
  async (request: NextRequest, context: ApiContext) => {
    const { supabase, tenantId } = context

    try {
      const body = await request.json()

      // Validações
      if (!body.obra_id) {
        return error('obra_id is required', 'VALIDATION_ERROR', 400)
      }

      // Validar UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(body.obra_id)) {
        return error('Invalid obra_id format', 'INVALID_ID', 400)
      }

      // Verificar se obra existe e pertence ao tenant
      const { data: obra, error: obraError } = await supabase
        .from('radar_obras')
        .select('id, tenant_id')
        .eq('id', body.obra_id)
        .eq('tenant_id', tenantId)
        .single()

      if (obraError || !obra) {
        return error('Obra not found', 'NOT_FOUND', 404)
      }

      // Criar registro de visita
      const visitaData = {
        tenant_id: tenantId,
        obra_id: body.obra_id,
        latitude: body.latitude || null,
        longitude: body.longitude || null,
        nota: body.nota?.trim() || null,
        foto_url: body.foto_url || null,
      }

      const { data: visita, error: visitaError } = await supabase
        .from('radar_visitas')
        .insert(visitaData)
        .select()
        .single()

      if (visitaError) {
        // Tentar criar tabela se não existir (compatibilidade)
        if (visitaError.code === '42P01') {
          // Tabela não existe ainda - criar estrutura básica
          await createVisitasTable(supabase)

          // Tentar novamente
          const { data: retry, error: retryError } = await supabase
            .from('radar_visitas')
            .insert(visitaData)
            .select()
            .single()

          if (retryError) {
            console.error('[API Visitas] Retry error:', retryError)
            return error('Failed to register visit', 'INSERT_ERROR', 500)
          }

          // Dispara webhook
          await triggerWebhook(supabase, tenantId, 'visita.registrada', retry)

          return json(retry, 201)
        }

        console.error('[API Visitas] Error:', visitaError)
        return error('Failed to register visit', 'INSERT_ERROR', 500)
      }

      // Dispara webhook
      await triggerWebhook(supabase, tenantId, 'visita.registrada', visita)

      return json(visita, 201)
    } catch (e) {
      console.error('[API Visitas] Parse error:', e)
      return error('Invalid JSON body', 'PARSE_ERROR', 400)
    }
  },
  true // requer write
)

/**
 * Cria tabela de visitas se não existir
 */
async function createVisitasTable(supabase: ApiContext['supabase']) {
  // Executar via SQL direto
  await supabase.rpc('exec', {
    sql: `
      CREATE TABLE IF NOT EXISTS radar_visitas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        obra_id UUID NOT NULL REFERENCES radar_obras(id) ON DELETE CASCADE,
        latitude NUMERIC(10,7),
        longitude NUMERIC(10,7),
        nota TEXT,
        foto_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_visitas_obra ON radar_visitas(obra_id);
      CREATE INDEX IF NOT EXISTS idx_visitas_tenant ON radar_visitas(tenant_id);
    `,
  }) // Ignora erros - a tabela pode já existir
}

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
