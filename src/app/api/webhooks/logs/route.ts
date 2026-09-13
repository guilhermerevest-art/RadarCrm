// =============================================================================
// GET /api/webhooks/logs - Ver logs de webhooks enviados
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServer } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer()

    // Verificar autenticação
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verificar se é admin do tenant
    const { data: tenantUser } = await supabase
      .from('tenant_users')
      .select('tenant_id, papel')
      .eq('user_id', user.id)
      .eq('papel', 'admin')
      .single()

    if (!tenantUser) {
      return NextResponse.json({ error: 'Forbidden - Admin required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const offset = (page - 1) * limit
    const status = searchParams.get('status')
    const webhookId = searchParams.get('webhook_id')

    let query = supabase
      .from('webhooks_eventos_enviados')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantUser.tenant_id)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    if (webhookId) {
      query = query.eq('webhook_id', webhookId)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('[Webhook Logs] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
    }

    return NextResponse.json({
      data: data || [],
      meta: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error('[Webhook Logs] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
