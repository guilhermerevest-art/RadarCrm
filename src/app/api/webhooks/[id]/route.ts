// =============================================================================
// Webhooks Management - Individual Operations
// DELETE /api/webhooks/[id] - Deletar webhook
// PATCH /api/webhooks/[id] - Atualizar webhook
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServer } from '@/lib/supabase/server'
import { WEBHOOK_EVENTS } from '@/lib/api-auth'

// DELETE /api/webhooks/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Verificar se o webhook existe e pertence ao tenant
    const { data: webhook } = await supabase
      .from('webhooks_tenant')
      .select('id, tenant_id')
      .eq('id', id)
      .eq('tenant_id', tenantUser.tenant_id)
      .single()

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('webhooks_tenant')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[Webhooks DELETE] Error:', error)
      return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Webhooks DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH /api/webhooks/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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
    const updates: Record<string, unknown> = {}

    if (typeof body.nome === 'string' && body.nome.trim() !== '') {
      updates.nome = body.nome.trim()
    }

    if (typeof body.url === 'string') {
      try {
        new URL(body.url)
        updates.url = body.url.trim()
      } catch {
        return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
      }
    }

    if (typeof body.ativo === 'boolean') {
      updates.ativo = body.ativo
    }

    if (Array.isArray(body.eventos) && body.eventos.length > 0) {
      const eventosInvalidos = body.eventos.filter(
        (e: string) => !WEBHOOK_EVENTS.includes(e as typeof WEBHOOK_EVENTS[number])
      )
      if (eventosInvalidos.length > 0) {
        return NextResponse.json(
          { error: `Invalid events: ${eventosInvalidos.join(', ')}` },
          { status: 400 }
        )
      }
      updates.eventos = body.eventos
    }

    if (body.regenerate_secret === true) {
      const crypto = require('crypto')
      updates.secret_hmac = crypto.randomBytes(32).toString('hex')
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Verificar se o webhook existe
    const { data: webhook } = await supabase
      .from('webhooks_tenant')
      .select('id, tenant_id')
      .eq('id', id)
      .eq('tenant_id', tenantUser.tenant_id)
      .single()

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    const { data: updated, error } = await supabase
      .from('webhooks_tenant')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('[Webhooks PATCH] Error:', error)
      return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 })
    }

    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('[Webhooks PATCH] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
