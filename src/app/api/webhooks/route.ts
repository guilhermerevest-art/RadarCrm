// =============================================================================
// Webhooks Management
// GET /api/webhooks - Listar webhooks
// POST /api/webhooks - Criar webhook
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServer } from '@/lib/supabase/server'
import { WEBHOOK_EVENTS } from '@/lib/api-auth'
import crypto from 'crypto'

// GET /api/webhooks - Lista webhooks
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

    // Buscar webhooks do tenant
    const { data: webhooks, error } = await supabase
      .from('webhooks_tenant')
      .select('*')
      .eq('tenant_id', tenantUser.tenant_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Webhooks GET] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 })
    }

    return NextResponse.json({
      data: webhooks || [],
      eventos_disponiveis: WEBHOOK_EVENTS,
    })
  } catch (error) {
    console.error('[Webhooks GET] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/webhooks - Criar webhook
export async function POST(request: NextRequest) {
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

    const body = await request.json()

    // Validar campos
    if (!body.nome || typeof body.nome !== 'string' || body.nome.trim() === '') {
      return NextResponse.json({ error: 'nome is required' }, { status: 400 })
    }

    if (!body.url || typeof body.url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }

    // Validar URL
    try {
      new URL(body.url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    // Validar eventos
    if (!Array.isArray(body.eventos) || body.eventos.length === 0) {
      return NextResponse.json({ error: 'eventos array is required' }, { status: 400 })
    }

    const eventosInvalidos = body.eventos.filter(
      (e: string) => !WEBHOOK_EVENTS.includes(e as typeof WEBHOOK_EVENTS[number])
    )
    if (eventosInvalidos.length > 0) {
      return NextResponse.json(
        { error: `Invalid events: ${eventosInvalidos.join(', ')}` },
        { status: 400 }
      )
    }

    // Gerar segredo HMAC
    const secretHmac = crypto.randomBytes(32).toString('hex')

    // Inserir webhook
    const { data: webhook, error } = await supabase
      .from('webhooks_tenant')
      .insert({
        tenant_id: tenantUser.tenant_id,
        nome: body.nome.trim(),
        url: body.url.trim(),
        secret_hmac: secretHmac,
        eventos: body.eventos,
        ativo: true,
        created_by: user.id,
      })
      .select('*')
      .single()

    if (error) {
      console.error('[Webhooks POST] Error:', error)
      return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 })
    }

    return NextResponse.json({
      data: webhook,
      message: 'Store the secret_hmac securely to validate webhook payloads.',
    }, { status: 201 })
  } catch (error) {
    console.error('[Webhooks POST] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
