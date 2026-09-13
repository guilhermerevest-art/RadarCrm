// =============================================================================
// API Route: /api/billing/checkout
// Inicia fluxo de checkout com Stripe
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Mapeamento de planos para Stripe Price IDs
const PRICE_IDS: Record<string, string> = {
  individual: process.env.STRIPE_PRICE_INDIVIDUAL || 'price_individual',
  equipe: process.env.STRIPE_PRICE_EQUIPE || 'price_equipe',
  regional: process.env.STRIPE_PRICE_REGIONAL || 'price_regional',
  obras: process.env.STRIPE_PRICE_OBRAS || 'price_obras',
}

export async function POST(request: NextRequest) {
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
      .select('tenant_id, papel')
      .eq('user_id', user.id)
      .single()

    if (tuError || !tenantUser) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 })
    }

    // Apenas admin pode gerenciar billing
    if (tenantUser.papel !== 'admin') {
      return NextResponse.json(
        { error: 'Apenas administradores podem gerenciar billing' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { plano_id } = body

    // Validar plano
    if (!plano_id || !PRICE_IDS[plano_id]) {
      return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
    }

    // Obter ou criar Stripe customer
    const { data: tenant } = await supabase
      .from('tenants')
      .select('stripe_customer_id, nome')
      .eq('id', tenantUser.tenant_id)
      .single()

    let customerId = tenant?.stripe_customer_id

    // Se não tem customer_id, criar um novo
    if (!customerId && STRIPE_SECRET_KEY) {
      const stripe = await import('stripe')
      const stripeClient = new stripe.default(STRIPE_SECRET_KEY)

      const customer = await stripeClient.customers.create({
        email: user.email,
        name: tenant?.nome || user.user_metadata?.full_name || user.email || 'Cliente',
        metadata: {
          tenant_id: tenantUser.tenant_id,
        },
      })

      customerId = customer.id

      // Salvar customer_id no tenant
      await supabase
        .from('tenants')
        .update({ stripe_customer_id: customerId })
        .eq('id', tenantUser.tenant_id)
    }

    if (!customerId) {
      return NextResponse.json(
        { error: 'Stripe não configurado. Configure STRIPE_SECRET_KEY.' },
        { status: 500 }
      )
    }

    // Verificar se já tem assinatura ativa
    const { data: existingSubscription } = await supabase
      .from('assinaturas')
      .select('id, status')
      .eq('tenant_id', tenantUser.tenant_id)
      .in('status', ['active', 'trialing'])
      .single()

    if (existingSubscription) {
      return NextResponse.json(
        {
          error: 'Já existe uma assinatura ativa',
          subscription_id: existingSubscription.id,
          status: existingSubscription.status,
        },
        { status: 409 }
      )
    }

    // Criar sessão de checkout
    const stripe = await import('stripe')
    const stripeClient = new stripe.default(STRIPE_SECRET_KEY!)

    const session = await stripeClient.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: PRICE_IDS[plano_id],
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 14, // Trial de 14 dias
        metadata: {
          tenant_id: tenantUser.tenant_id,
          plano: plano_id,
        },
      },
      success_url: `${APP_URL}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/dashboard/billing?canceled=true`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url, session_id: session.id })
  } catch (error) {
    console.error('Erro no checkout:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
