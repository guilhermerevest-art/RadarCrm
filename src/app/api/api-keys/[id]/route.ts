// =============================================================================
// DELETE /api/api-keys/[id] - Revogar API key
// PATCH /api/api-keys/[id] - Atualizar API key (ativar/desativar)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServer } from '@/lib/supabase/server'

// DELETE /api/api-keys/[id] - Revogar (desativar) API key
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

    // Verificar se a API key existe e pertence ao tenant
    const { data: apiKey } = await supabase
      .from('api_keys')
      .select('id, tenant_id')
      .eq('id', id)
      .eq('tenant_id', tenantUser.tenant_id)
      .single()

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    // Desativar a key (soft delete)
    const { error } = await supabase
      .from('api_keys')
      .update({ ativo: false })
      .eq('id', id)

    if (error) {
      console.error('[API Keys DELETE] Error:', error)
      return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'API key revoked' })
  } catch (error) {
    console.error('[API Keys DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH /api/api-keys/[id] - Atualizar API key
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

    // Campos permitidos para atualização
    const updates: Record<string, unknown> = {}

    if (typeof body.ativo === 'boolean') {
      updates.ativo = body.ativo
    }

    if (typeof body.nome === 'string' && body.nome.trim() !== '') {
      updates.nome = body.nome.trim()
    }

    if (Array.isArray(body.escopo)) {
      const escoposValidos = ['read', 'write']
      const escopoValido = body.escopo.every((e: string) => escoposValidos.includes(e))
      if (escopoValido) {
        updates.escopo = body.escopo
      }
    }

    if (body.expira_em === null) {
      updates.expira_em = null
    } else if (body.expira_em) {
      updates.expira_em = new Date(body.expira_em).toISOString()
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Verificar se a API key existe e pertence ao tenant
    const { data: apiKey } = await supabase
      .from('api_keys')
      .select('id, tenant_id')
      .eq('id', id)
      .eq('tenant_id', tenantUser.tenant_id)
      .single()

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    // Atualizar
    const { data: updated, error } = await supabase
      .from('api_keys')
      .update(updates)
      .eq('id', id)
      .select('id, tenant_id, nome, prefixo, escopo, ativo, expira_em, created_at')
      .single()

    if (error) {
      console.error('[API Keys PATCH] Error:', error)
      return NextResponse.json({ error: 'Failed to update API key' }, { status: 500 })
    }

    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('[API Keys PATCH] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
