// =============================================================================
// API Keys Management
// POST /api/api-keys - Criar nova API key
// GET /api/api-keys - Listar API keys do tenant
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServer } from '@/lib/supabase/server'
import { generateApiKey } from '@/lib/api-auth'
import crypto from 'crypto'

// GET /api/api-keys - Lista API keys
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

    // Buscar API keys do tenant
    const { data: apiKeys, error } = await supabase
      .from('api_keys')
      .select('id, tenant_id, nome, prefixo, escopo, ativo, ultimo_uso, expira_em, created_at')
      .eq('tenant_id', tenantUser.tenant_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API Keys GET] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 })
    }

    return NextResponse.json({ data: apiKeys || [] })
  } catch (error) {
    console.error('[API Keys GET] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/api-keys - Criar nova API key
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
      return NextResponse.json(
        { error: 'nome is required' },
        { status: 400 }
      )
    }

    // Validar escopo
    const escoposValidos = ['read', 'write', 'read,write']
    const escopo = body.escopo || 'read'
    if (!escoposValidos.includes(escopo)) {
      return NextResponse.json(
        { error: 'escopo must be read, write, or read,write' },
        { status: 400 }
      )
    }

    // Gerar API key
    const { key, prefix, hash } = generateApiKey()

    // Preparar escopo como array JSON
    const escopoArray = escopo === 'write'
      ? ['write']
      : ['read', 'write']

    // Preparar data de expiração
    const expiraEm = body.expira_em
      ? new Date(body.expira_em).toISOString()
      : null

    // Inserir no banco
    const { data: apiKey, error } = await supabase
      .from('api_keys')
      .insert({
        tenant_id: tenantUser.tenant_id,
        nome: body.nome.trim(),
        prefixo: prefix,
        hash_argon2: hash,
        escopo: escopoArray,
        ativo: true,
        expira_em: expiraEm,
        created_by: user.id,
      })
      .select('id, tenant_id, nome, prefixo, escopo, ativo, expira_em, created_at')
      .single()

    if (error) {
      console.error('[API Keys POST] Error:', error)
      return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 })
    }

    // Retornar a key completa apenas na criação (não é possível recuperá-la depois)
    return NextResponse.json({
      data: {
        ...apiKey,
        key, // Apenas na criação!
        message: 'Store this key securely. It will not be shown again.',
      }
    }, { status: 201 })
  } catch (error) {
    console.error('[API Keys POST] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
