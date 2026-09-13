// =============================================================================
// Edge Function: billing-checkout
// Cria sessão de checkout do Stripe para assinatura
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2" from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mapeamento de planos para Stripe Price IDs
// Em produção, estos IDs devem vir de variáveis de ambiente
const PRICE_IDS: Record<string, string> = {
  individual: Deno.env.get("STRIPE_PRICE_INDIVIDUAL") ?? "price_individual",
  equipe: Deno.env.get("STRIPE_PRICE_EQUIPE") ?? "price_equipe",
  regional: Deno.env.get("STRIPE_PRICE_REGIONAL") ?? "price_regional",
  obras: Deno.env.get("STRIPE_PRICE_OBRAS") ?? "price_obras",
};

// Informações dos planos para exibição
const PLANOS = {
  individual: {
    nome: "Individual",
    preco: 197,
    recursos: [
      "1 usuário",
      "500 obras/mes",
      "200 leads",
      "100 envios WhatsApp/dia",
      "CRM básico",
      "Radar de obras",
    ],
  },
  equipe: {
    nome: "Equipe",
    preco: 397,
    recursos: [
      "5 usuários",
      "2.500 obras/mes",
      "1.000 leads",
      "500 envios WhatsApp/dia",
      "Pipeline completo",
      "Automação",
      "Team analytics",
    ],
  },
  regional: {
    nome: "Regional",
    preco: 797,
    recursos: [
      "20 usuários",
      "10.000 obras/mes",
      "5.000 leads",
      "2.000 envios WhatsApp/dia",
      "Multi-cidade",
      "API access",
      "Suporte prioritário",
    ],
  },
  obras: {
    nome: "Obras",
    preco: 0,
    recursos: [
      "Usuários ilimitados",
      "Obras ilimitadas",
      "Leads ilimitados",
      "WhatsApp ilimitado",
      "Marca branca",
      "SLA dedicado",
      "Suporte 24/7",
    ],
  },
};

async function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function getStripeCustomerId(
  supabase: ReturnType<typeof createClient>,
  tenantId: string
): Promise<string | null> {
  const { data: tenant } = await supabase
    .from("tenants")
    .select("stripe_customer_id")
    .eq("id", tenantId)
    .single();

  return tenant?.stripe_customer_id ?? null;
}

async function createOrGetStripeCustomer(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  email: string,
  name: string
): Promise<string> {
  // Verifica se já tem customer_id
  const existingCustomerId = await getStripeCustomerId(supabase, tenantId);
  if (existingCustomerId) {
    return existingCustomerId;
  }

  // Em produção, usar Stripe SDK:
  // const stripe = new Stripe(STRIPE_SECRET_KEY);
  // const customer = await stripe.customers.create({ email, name });
  // Por ora, retornamos um placeholder
  const customerId = `cus_${tenantId.replace(/-/g, "")}`;

  // Salva customer_id no tenant
  await supabase
    .from("tenants")
    .update({ stripe_customer_id: customerId })
    .eq("id", tenantId);

  return customerId;
}

async function createCheckoutSession(
  customerId: string,
  priceId: string,
  trialDays: number = 14,
  metadata: Record<string, string> = {}
) {
  // Em produção, usar Stripe SDK:
  // const stripe = new Stripe(STRIPE_SECRET_KEY);
  // const session = await stripe.checkout.sessions.create({
  //   customer: customerId,
  //   payment_method_types: ['card'],
  //   line_items: [{ price: priceId, quantity: 1 }],
  //   mode: 'subscription',
  //   subscription_data: { trial_period_days: trialDays },
  //   success_url: `${APP_URL}/dashboard/billing?success=true`,
  //   cancel_url: `${APP_URL}/dashboard/billing?canceled=true`,
  //   metadata,
  // });
  // return session.url;

  // Retorna URL simulada para desenvolvimento
  return {
    id: `cs_test_${Date.now()}`,
    url: `${APP_URL}/dashboard/billing/checkout?customer=${customerId}&price=${priceId}&trial=${trialDays}`,
    customer: customerId,
    price_id: priceId,
    mock: true,
  };
}

async function createCustomerPortalSession(customerId: string) {
  // Em produção, usar Stripe SDK:
  // const stripe = new Stripe(STRIPE_SECRET_KEY);
  // const session = await stripe.billingPortal.sessions.create({
  //   customer: customerId,
  //   return_url: `${APP_URL}/dashboard/billing`,
  // });
  // return session.url;

  // Retorna URL simulada para desenvolvimento
  return {
    url: `${APP_URL}/dashboard/billing/portal?customer=${customerId}`,
    mock: true,
  };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Extrair tenant_id do header de autorização
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = await getSupabaseAdmin();

    // Validar token e pegar user_id
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar tenant do usuário
    const { data: tenantUser } = await supabaseAdmin
      .from("tenant_users")
      .select("tenant_id, papel")
      .eq("user_id", user.id)
      .single();

    if (!tenantUser) {
      return new Response(JSON.stringify({ error: "Tenant não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Apenas admin pode gerenciar billing
    if (tenantUser.papel !== "admin") {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem gerenciar billing" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();
    const { action, plano_id, assinatura_id } = body;

    // Parse do request
    interface RequestBody {
      action: string;
      plano_id?: string;
      assinatura_id?: string;
    }
    const { action: reqAction, plano_id: reqPlanoId, assinatura_id: reqAssinaturaId } = body as RequestBody;

    if (reqAction === "checkout") {
      // Criar sessão de checkout
      if (!reqPlanoId || !PRICE_IDS[reqPlanoId]) {
        return new Response(
          JSON.stringify({ error: "Plano inválido" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Obter ou criar Stripe customer
      const customerId = await createOrGetStripeCustomer(
        supabaseAdmin,
        tenantUser.tenant_id,
        user.email ?? "",
        user.user_metadata?.full_name ?? user.email ?? "Cliente"
      );

      // Verificar se já tem assinatura ativa
      const { data: existingSubscription } = await supabaseAdmin
        .from("assinaturas")
        .select("id, status")
        .eq("tenant_id", tenantUser.tenant_id)
        .in("status", ["active", "trialing"])
        .single();

      if (existingSubscription) {
        return new Response(
          JSON.stringify({
            error: "Já existe uma assinatura ativa",
            subscription_id: existingSubscription.id,
            status: existingSubscription.status,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Criar sessão de checkout
      const session = await createCheckoutSession(
        customerId,
        PRICE_IDS[reqPlanoId],
        14, // trial de 14 dias
        {
          tenant_id: tenantUser.tenant_id,
          plano: reqPlanoId,
        }
      );

      return new Response(JSON.stringify(session), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (reqAction === "portal") {
      // Criar sessão do Customer Portal
      const customerId = await getStripeCustomerId(
        supabaseAdmin,
        tenantUser.tenant_id
      );

      if (!customerId) {
        return new Response(
          JSON.stringify({ error: "Customer Stripe não encontrado" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const session = await createCustomerPortalSession(customerId);

      return new Response(JSON.stringify(session), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (reqAction === "change_plan") {
      // Upgrade/downgrade de plano
      if (!reqPlanoId || !PRICE_IDS[reqPlanoId]) {
        return new Response(
          JSON.stringify({ error: "Plano inválido" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Busca assinatura atual
      const { data: assinatura } = await supabaseAdmin
        .from("assinaturas")
        .select("stripe_subscription_id, status")
        .eq("tenant_id", tenantUser.tenant_id)
        .in("status", ["active", "trialing"])
        .single();

      if (!assinatura?.stripe_subscription_id) {
        return new Response(
          JSON.stringify({ error: "Nenhuma assinatura ativa para alterar" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Em produção, usar Stripe SDK para update da subscription:
      // const stripe = new Stripe(STRIPE_SECRET_KEY);
      // const updated = await stripe.subscriptions.update(assinatura.stripe_subscription_id, {
      //   items: [{ id: item.id, price: PRICE_IDS[plano_id] }],
      //   proration_behavior: 'create_prorations',
      // });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Plano atualizado com sucesso",
          plano_id: reqPlanoId,
          subscription_id: assinatura.stripe_subscription_id,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (reqAction === "cancel") {
      // Cancelamento via Customer Portal
      if (!reqAssinaturaId) {
        return new Response(
          JSON.stringify({ error: "ID da assinatura requerido" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Busca assinatura
      const { data: assinatura } = await supabaseAdmin
        .from("assinaturas")
        .select("stripe_subscription_id")
        .eq("id", reqAssinaturaId)
        .eq("tenant_id", tenantUser.tenant_id)
        .single();

      if (!assinatura?.stripe_subscription_id) {
        return new Response(
          JSON.stringify({ error: "Assinatura não encontrada" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Em produção, o cancelamento é feito via Customer Portal
      // Aqui apenas retornamos instruções

      return new Response(
        JSON.stringify({
          success: true,
          message: "Use o portal do cliente para cancelar",
          portal_url: `${APP_URL}/dashboard/billing/portal`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (reqAction === "get_plans") {
      // Retorna lista de planos disponíveis
      return new Response(
        JSON.stringify({
          planos: PLANOS,
          price_ids: PRICE_IDS,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: "Ação não reconhecida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro no billing-checkout:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
