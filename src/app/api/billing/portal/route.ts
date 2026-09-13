// =============================================================================
// API Route: /api/billing/portal
// Abre o Stripe Customer Portal para gerenciar assinatura
// =============================================================================

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function POST() {
  try {
    const supabase = await createClient()

    // Verificar autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Buscar tenant do usuário
    const { data: tenantUser, error: tuError } = await supabase
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single()

    if (tuError || !tenantUser) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 })
    }

    // Buscar Stripe customer_id
    const { data: tenant } = await supabase
      .from('tenants')
      .select('stripe_customer_id')
      .eq('id', tenantUser.tenant_id)
      .single()

    if (!tenant?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'Customer Stripe não encontrado. Efetue uma assinatura primeiro.' },
        { status: 404 }
      )
    }

    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Stripe não configurado. Configure STRIPE_SECRET_KEY.' },
        { status: 500 }
      )
    }

    // Criar sessão do Customer Portal
    const stripe = await import('stripe')
    const stripeClient = new stripe.default(STRIPE_SECRET_KEY)

    const session = await stripeClient.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${APP_URL}/dashboard/billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Erro ao abrir portal:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
