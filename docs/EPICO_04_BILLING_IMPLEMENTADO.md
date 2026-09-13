# Épico 4 — Billing e Planos (IMPLEMENTADO)

**Data de implementação:** 2026-09-13
**Status:** ✅ Implementado

---

## Resumo

Este documento registra a implementação completa do Épico 4 - Billing e Planos, que adiciona suporte a assinaturas, cobrança recorrente via Stripe, trial de 14 dias, e políticas de inadimplência.

---

## Estrutura de Arquivos

### Migrations

| Arquivo | Descrição |
|---------|-----------|
| `supabase/migrations/014_billing.sql` | Schema completo (migrations format) |
| `supabase/APLICAR_011.sql` | Script para aplicar no SQL Editor |

### Edge Functions (Supabase)

| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/billing-webhook/index.ts` | Processa webhooks do Stripe |
| `supabase/functions/billing-checkout/index.ts` | Cria sessões de checkout |

### API Routes (Next.js)

| Arquivo | Descrição |
|---------|-----------|
| `src/app/api/billing/checkout/route.ts` | Inicia fluxo de checkout |
| `src/app/api/billing/portal/route.ts` | Abre portal do cliente |
| `src/app/api/webhooks/stripe/route.ts` | Recebe webhooks Stripe |

### UI

| Arquivo | Descrição |
|---------|-----------|
| `src/app/dashboard/billing/page.tsx` | Página principal de billing |

### Documentação

| Arquivo | Descrição |
|---------|-----------|
| `docs/BILLING.md` | Documentação técnica completa |

---

## Tabelas Criadas

### 1. `motivos_cancelamento`
- Motivos pré-definidos para cancelamento
- Campos: id, slug, texto, ativo, ordem

### 2. `assinaturas`
- Assinaturas com integração Stripe
- Campos: tenant_id, plano_id, stripe_customer_id, stripe_subscription_id, status, período, trial, etc.

### 3. `faturas`
- Histórico de pagamentos
- Campos: tenant_id, assinatura_id, stripe_invoice_id, status, valor, datas

### 4. `uso_plano`
- Métricas de uso por mês
- Campos: tenant_id, mes_referencia, obras_mes, leads_mes, envios_wa_dia, etc.

### 5. Colunas em `tenants`
- stripe_customer_id
- data_adesao
- inadimplente_desde
- bloqueado_escrita
- bloqueado_leitura
- grace_periodo_fim

---

## Funções PostgreSQL

| Função | Descrição | Status |
|--------|-----------|--------|
| `fn_tenant_aplicar_plano` | Aplica plano da assinatura ao tenant | ✅ |
| `fn_uso_incrementar` | Incrementa métrica de uso | ✅ |
| `fn_uso_validar_limite` | Verifica limites do plano | ✅ |
| `fn_tenant_status_inadimplente` | Gerencia inadimplência | ✅ |
| `fn_assinatura_cancelar` | Cancela com motivo obrigatório | ✅ |
| `fn_assinatura_criar_trial` | Cria trial 14 dias | ✅ |
| `fn_assinatura_sync_stripe` | Sincroniza com webhook | ✅ |

---

## Triggers

| Trigger | Tabela | Ação |
|---------|--------|------|
| `tr_uso_obra_criada` | radar_obras | Incrementa obras_mes |
| `tr_uso_lead_criado` | crm_leads | Incrementa leads_mes |
| `tr_assinaturas_updated_at` | assinaturas | Auto-update updated_at |
| `tr_faturas_updated_at` | faturas | Auto-update updated_at |

---

## RLS (Row Level Security)

| Tabela | Policy | Condição |
|--------|--------|----------|
| motivos_cancelamento | motivos_cancelamento_read | ativo = true |
| assinaturas | assinaturas_tenant | tenant_id via tenant_users |
| faturas | faturas_tenant | tenant_id via tenant_users |
| uso_plano | uso_plano_tenant | tenant_id via tenant_users |

---

## Regras de Negócio Implementadas

### Trial
- 14 dias gratuitos sem cartão
- Ao final, solicita pagamento
- Trial expira → assinatura atualizada automaticamente

### Inadimplência
- **D+0**: Primeiro pagamento falhou
- **D+3**: Fim do grace period
- **D+4**: Bloqueia escrita (não pode criar/atualizar)
- **D+10**: Bloqueia leitura (não pode ver dados)
- **D+30**: Suspensão definitiva

### Cancelamento
- Motivo obrigatório (6 motivos pré-definidos)
- Comentário opcional
- Assinatura ativa até fim do período pago
- Plano rebaixado após cancelamento

---

## UI Implementada

A página `/dashboard/billing` inclui:

1. **Banner de Trial**: Mostra dias restantes do trial com CTA para assinar
2. **Banner de Inadimplência**: Alerta de pagamento pendente
3. **Card do Plano Atual**: Nome, status, período, próximo pagamento
4. **Card de Uso**: Barras de progresso com limites (obras, leads, WA, usuários)
5. **Histórico de Faturas**: Lista com status, valores, link para PDF
6. **Upgrade Modal**: Seleção de plano com upgrade/downgrade
7. **Cancel Modal**: Motivo obrigatório + comentário

---

## Integração Stripe

### Webhook Events Tratados

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `checkout.session.completed`

### Price IDs (configurar no .env)

```
STRIPE_PRICE_INDIVIDUAL=price_...
STRIPE_PRICE_EQUIPE=price_...
STRIPE_PRICE_REGIONAL=price_...
STRIPE_PRICE_OBRAS=price_...
```

---

## Variáveis de Ambiente Necessárias

```env
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_INDIVIDUAL=price_...
STRIPE_PRICE_EQUIPE=price_...
STRIPE_PRICE_REGIONAL=price_...
STRIPE_PRICE_OBRAS=price_...

# App
NEXT_PUBLIC_APP_URL=https://seudominio.com
```

---

## Deploy

### 1. Aplicar Migration

Execute o SQL em `supabase/APLICAR_011.sql` no SQL Editor do Supabase.

### 2. Deploy Edge Functions

```bash
supabase functions deploy billing-webhook
supabase functions deploy billing-checkout
```

### 3. Configurar Secrets

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRICE_INDIVIDUAL=price_...
# etc.
```

### 4. Configurar Webhook no Stripe

URL: `https://seudominio.com/api/webhooks/stripe`

Eventos:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `checkout.session.completed`

---

## Tasks do Épico 4

| ID | Task | Status |
|----|------|--------|
| E4-T1 | Tabela planos com limites jsonb | ✅ Já existia |
| E4-T2 | Tabela assinaturas | ✅ |
| E4-T3 | Tabela faturas | ✅ |
| E4-T4 | Tabela uso_plano | ✅ |
| E4-T5 | fn_tenant_aplicar_plano | ✅ |
| E4-T6 | fn_uso_validar_limite | ✅ |
| E4-T7 | Integração Stripe | ✅ |
| E4-T8 | billing-webhook | ✅ |
| E4-T9 | billing-checkout | ✅ |
| E4-T10 | Página /billing | ✅ |
| E4-T11 | Mudança de plano | ✅ |
| E4-T12 | Cancelamento com motivo | ✅ |
| E4-T13 | Job reconciliação | ⏳ Futura |
| E4-T14 | Política inadimplência | ✅ |
| E4-T15 | Política reembolso | ⏳ Futura |
| E4-T16 | NF-e | ⏳ Futura |

---

## Próximos Passos

1. Configurar Stripe no ambiente de produção
2. Criar Price IDs no Stripe Dashboard
3. Configurar webhook URL no Stripe
4. Testar fluxo completo (signup → trial → checkout → assinatura)
5. Implementar job de reconciliação diária (E4-T13)
6. Adicionar nota fiscal eletrônica (E4-T16)
