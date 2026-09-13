// =============================================================================
// API Route: /api/webhooks/stripe
// Recebe webhooks do Stripe para assinaturas e pagamentos
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

interface StripeEvent {
  id: string
  type: string
  data: {
    object: Record<string, unknown>
  }
  created: number
}

async function fnTenantAplicarPlano(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string
) {
  // Busca assinatura ativa
  const { data: assinatura, error: assinaturaError } = await supabase
    .from('assinaturas')
    .select('*')
    .in('status', ['active', 'trialing'])
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (assinaturaError || !assinatura) {
    return { success: false, error: 'Nenhuma assinatura ativa encontrada' }
  }

  // Atualiza tenant
  const status =
    assinatura.status === 'trialing'
      ? 'trial'
      : assinatura.status === 'active'
        ? 'ativo'
        : assinatura.status === 'past_due' || assinatura.status === 'unpaid'
          ? 'inadimplente'
          : null

  const updates: Record<string, unknown> = {
    plano: assinatura.plano_id,
    updated_at: new Date().toISOString(),
  }

  if (status) {
    updates.status = status
  }

  const { error: updateError } = await supabase
    .from('tenants')
    .update(updates)
    .eq('id', tenantId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Registra em audit_log
  await supabase.from('audit_log').insert({
    tenant_id: tenantId,
    acao: 'tenant.plano_atualizado',
    entidade_tipo: 'assinatura',
    entidade_id: assinatura.id,
    detalhes: {
      plano: assinatura.plano_id,
      status: assinatura.status,
    },
  })

  return { success: true }
}

async function handleSubscriptionCreated(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subscription: Record<string, unknown>
) {
  const customerId = subscription.customer as string
  const subscriptionId = subscription.id as string
  const status = subscription.status as string
  const priceId = (
    (subscription.items as { data: Array<{ price: { id: string } }> })?.data?.[0]?.price?.id ?? ''
  )

  // Mapeia price_id para plano
  const planoId =
    priceId.includes('equipe')
      ? 'equipe'
      : priceId.includes('regional')
        ? 'regional'
        : priceId.includes('obras')
          ? 'obras'
          : 'individual'

  const currentPeriodStart = new Date(
    ((subscription.current_period_start as number) ?? 0) * 1000
  )
  const currentPeriodEnd = new Date(
    ((subscription.current_period_end as number) ?? 0) * 1000
  )

  // Busca tenant pelo customer_id
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (tenantError || !tenant) {
    console.error('Tenant não encontrado para customer:', customerId)
    return { success: false, error: 'Tenant não encontrado' }
  }

  // Insere ou atualiza assinatura
  const { error: upsertError } = await supabase
    .from('assinaturas')
    .upsert(
      {
        tenant_id: tenant.id,
        plano_id: planoId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: priceId,
        status: status === 'trialing' ? 'trialing' : status === 'active' ? 'active' : status,
        status_pagamento: status === 'active' ? 'ativa' : 'inadimplente',
        periodo_inicio: currentPeriodStart.toISOString(),
        periodo_fim: currentPeriodEnd.toISOString(),
        trial_expira_em:
          status === 'trialing'
            ? new Date(((subscription.trial_end as number) ?? 0) * 1000).toISOString()
            : null,
        ultimo_pagamento_em: status === 'active' ? new Date().toISOString() : null,
        proximo_pagamento_em: currentPeriodEnd.toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'stripe_subscription_id',
      }
    )

  if (upsertError) {
    console.error('Erro ao criar assinatura:', upsertError)
    return { success: false, error: upsertError.message }
  }

  // Aplica plano ao tenant
  await fnTenantAplicarPlano(supabase, tenant.id)

  return { success: true }
}

async function handleSubscriptionUpdated(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subscription: Record<string, unknown>
) {
  const subscriptionId = subscription.id as string
  const status = subscription.status as string
  const priceId = (
    (subscription.items as { data: Array<{ price: { id: string } }> })?.data?.[0]?.price?.id ?? ''
  )

  const planoId =
    priceId.includes('equipe')
      ? 'equipe'
      : priceId.includes('regional')
        ? 'regional'
        : priceId.includes('obras')
          ? 'obras'
          : 'individual'

  const currentPeriodStart = new Date(
    ((subscription.current_period_start as number) ?? 0) * 1000
  )
  const currentPeriodEnd = new Date(
    ((subscription.current_period_end as number) ?? 0) * 1000
  )

  // Atualiza assinatura
  const { data: assinatura, error: assinaturaError } = await supabase
    .from('assinaturas')
    .select('tenant_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single()

  if (assinaturaError || !assinatura) {
    console.error('Assinatura não encontrada:', subscriptionId)
    return { success: false, error: 'Assinatura não encontrada' }
  }

  const updates: Record<string, unknown> = {
    status,
    status_pagamento:
      status === 'active'
        ? 'ativa'
        : status === 'past_due' || status === 'unpaid'
          ? 'inadimplente'
          : status === 'canceled'
            ? 'cancelada'
            : null,
    stripe_price_id: priceId,
    plano_id: planoId,
    periodo_inicio: currentPeriodStart.toISOString(),
    periodo_fim: currentPeriodEnd.toISOString(),
    ultimo_pagamento_em: status === 'active' ? new Date().toISOString() : null,
    proximo_pagamento_em: currentPeriodEnd.toISOString(),
    updated_at: new Date().toISOString(),
  }

  // Remove null values
  Object.keys(updates).forEach((key) => {
    if (updates[key] === null) delete updates[key]
  })

  const { error: updateError } = await supabase
    .from('assinaturas')
    .update(updates)
    .eq('stripe_subscription_id', subscriptionId)

  if (updateError) {
    console.error('Erro ao atualizar assinatura:', updateError)
    return { success: false, error: updateError.message }
  }

  // Aplica plano ao tenant
  await fnTenantAplicarPlano(supabase, assinatura.tenant_id)

  return { success: true }
}

async function handleSubscriptionDeleted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subscription: Record<string, unknown>
) {
  const subscriptionId = subscription.id as string

  const { data: assinatura, error: assinaturaError } = await supabase
    .from('assinaturas')
    .select('tenant_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single()

  if (assinaturaError || !assinatura) {
    console.error('Assinatura não encontrada:', subscriptionId)
    return { success: false, error: 'Assinatura não encontrada' }
  }

  // Atualiza assinatura
  await supabase
    .from('assinaturas')
    .update({
      status: 'canceled',
      status_pagamento: 'cancelada',
      data_cancelamento: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId)

  // Atualiza tenant
  await supabase
    .from('tenants')
    .update({
      status: 'cancelado',
      updated_at: new Date().toISOString(),
    })
    .eq('id', assinatura.tenant_id)

  // Registra em audit_log
  await supabase.from('audit_log').insert({
    tenant_id: assinatura.tenant_id,
    acao: 'assinatura.cancelada_stripe',
    entidade_tipo: 'assinatura',
    detalhes: { subscription_id: subscriptionId },
  })

  return { success: true }
}

async function handleInvoicePaid(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoice: Record<string, unknown>
) {
  const customerId = invoice.customer as string
  const invoiceId = invoice.id as string
  const subscriptionId = invoice.subscription as string
  const amountPaid = (invoice.amount_paid as number) / 100
  const amountDue = (invoice.amount_due as number) / 100
  const dueDate = invoice.due_date
    ? new Date((invoice.due_date as number) * 1000).toISOString()
    : null
  const paidAt = invoice.status === 'paid' ? new Date().toISOString() : null

  // Busca tenant
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (tenantError || !tenant) {
    console.error('Tenant não encontrado para customer:', customerId)
    return { success: false, error: 'Tenant não encontrado' }
  }

  // Busca assinatura
  let assinaturaId: string | null = null
  if (subscriptionId) {
    const { data: assinatura } = await supabase
      .from('assinaturas')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .single()
    assinaturaId = assinatura?.id ?? null

    // Atualiza assinatura com último pagamento
    await supabase
      .from('assinaturas')
      .update({
        status: 'active',
        status_pagamento: 'ativa',
        ultimo_pagamento_em: paidAt ?? new Date().toISOString(),
        tentativa_pagamento_count: 0,
        ultimo_erro_pagamento: null,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subscriptionId)

    await fnTenantAplicarPlano(supabase, tenant.id)
  }

  // Insere fatura
  await supabase.from('faturas').insert({
    tenant_id: tenant.id,
    assinatura_id: assinaturaId,
    stripe_invoice_id: invoiceId,
    status: 'paga',
    valor: amountPaid,
    valor_pago: amountDue,
    data_emissao: new Date(
      ((invoice.created as number) ?? Date.now() / 1000) * 1000
    ).toISOString(),
    data_vencimento: dueDate,
    data_pagamento: paidAt,
    url_nota_fiscal: invoice.invoice_pdf ?? null,
    link_pdf: invoice.invoice_pdf ?? null,
    payload_stripe: invoice,
  })

  return { success: true }
}

async function handleInvoicePaymentFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoice: Record<string, unknown>
) {
  const customerId = invoice.customer as string
  const invoiceId = invoice.id as string
  const subscriptionId = invoice.subscription as string
  const amountDue = (invoice.amount_due as number) / 100
  const dueDate = invoice.due_date
    ? new Date((invoice.due_date as number) * 1000).toISOString()
    : null
  const errorMessage = (
    invoice.last_finalization_error as { message?: string } | null
  )?.message ?? null

  // Busca tenant
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (tenantError || !tenant) {
    return { success: false, error: 'Tenant não encontrado' }
  }

  // Busca assinatura
  let assinaturaId: string | null = null
  if (subscriptionId) {
    const { data: assinatura } = await supabase
      .from('assinaturas')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .single()
    assinaturaId = assinatura?.id ?? null

    // Atualiza assinatura com erro
    await supabase.rpc('incrementar_tentativa_pagamento', {
      p_subscription_id: subscriptionId,
      p_erro: errorMessage,
    })
  }

  // Insere fatura em aberto
  await supabase.from('faturas').insert({
    tenant_id: tenant.id,
    assinatura_id: assinaturaId,
    stripe_invoice_id: invoiceId,
    status: 'vencida',
    valor: amountDue,
    data_emissao: new Date(
      ((invoice.created as number) ?? Date.now() / 1000) * 1000
    ).toISOString(),
    data_vencimento: dueDate,
    url_pagamento: (invoice.hosted_invoice_url as string) ?? null,
    payload_stripe: invoice,
  })

  return { success: true }
}

export async function POST(request: NextRequest) {
  // Only accept POST
  if (request.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
  }

  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature || !STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: 'Missing signature or webhook secret' },
        { status: 400 }
      )
    }

    // Validar webhook signature
    const stripe = await import('stripe')
    const stripeClient = new stripe.default(STRIPE_WEBHOOK_SECRET)

    let event: StripeEvent

    try {
      event = stripeClient.webhooks.constructEvent(
        body,
        signature,
        STRIPE_WEBHOOK_SECRET
      ) as unknown as StripeEvent
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    console.log('Evento recebido:', event.type, event.id)

    const supabase = await createClient()

    let result: { success: boolean; error?: string } = { success: true }

    switch (event.type) {
      case 'customer.subscription.created':
        result = await handleSubscriptionCreated(supabase, event.data.object)
        break

      case 'customer.subscription.updated':
        result = await handleSubscriptionUpdated(supabase, event.data.object)
        break

      case 'customer.subscription.deleted':
        result = await handleSubscriptionDeleted(supabase, event.data.object)
        break

      case 'invoice.paid':
        result = await handleInvoicePaid(supabase, event.data.object)
        break

      case 'invoice.payment_failed':
        result = await handleInvoicePaymentFailed(supabase, event.data.object)
        break

      case 'checkout.session.completed':
        console.log(
          'Checkout completo:',
          (event.data.object as { customer?: string; subscription?: string }).customer
        )
        break

      default:
        console.log('Evento não tratado:', event.type)
    }

    if (!result.success) {
      console.error('Erro ao processar evento:', result.error)
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Erro no webhook:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
