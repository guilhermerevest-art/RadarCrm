# Billing e Planos - Épico 4

Este módulo implementa o sistema de cobrança e gerenciamento de planos do Radar Canteiro CRM.

## Funcionalidades

- **Planos**: Individual, Equipe, Regional, Obras
- **Assinaturas**: Integração com Stripe para cobrança recorrente
- **Trial**: 14 dias gratuitos sem cartão de crédito
- **Faturas**: Histórico completo de pagamentos
- **Uso**: Monitoramento de métricas (obras, leads, envios WhatsApp)
- **Inadimplência**: Grace period de 3 dias, bloqueia escrita D+4, leitura D+10
- **Cancelamento**: Com motivo obrigatório para feedback

## Tabelas

| Tabela | Descrição |
|--------|-----------|
| `assinaturas` | Assinaturas ativas com integração Stripe |
| `faturas` | Histórico de pagamentos |
| `uso_plano` | Métricas de uso por mês |
| `motivos_cancelamento` | Motivos para cancelamento |

## Funções PostgreSQL

| Função | Descrição |
|--------|-----------|
| `fn_tenant_aplicar_plano` | Aplica plano da assinatura ao tenant |
| `fn_uso_incrementar` | Incrementa métrica de uso |
| `fn_uso_validar_limite` | Verifica se excedeu limite |
| `fn_tenant_status_inadimplente` | Gerencia inadimplência |
| `fn_assinatura_cancelar` | Cancela com motivo |
| `fn_assinatura_criar_trial` | Cria trial 14 dias |

## Variáveis de Ambiente

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

## Endpoints da API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/billing/checkout` | Inicia checkout Stripe |
| POST | `/api/billing/portal` | Abre portal do cliente |
| POST | `/api/webhooks/stripe` | Webhook do Stripe |

## Aplicar Migration

Execute o SQL em `supabase/APLICAR_011.sql` no SQL Editor do Supabase:

```sql
-- Cole todo o conteúdo de APLICAR_011.sql
```

## Edge Functions (Supabase)

Para deploy no Supabase:

```bash
supabase functions deploy billing-webhook
supabase functions deploy billing-checkout
```

Configure as variáveis de ambiente:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRICE_INDIVIDUAL=price_...
```

## Webhook URL

Configure no Dashboard do Stripe:

```
https://seudominio.com/api/webhooks/stripe
```

Eventos necessários:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `checkout.session.completed`

## Regras de Negócio

### Trial
- 14 dias gratuitos sem cartão
- Ao final, solicita pagamento
- Trial expira → status muda para inadimplente

### Inadimplência
- **D+0**: Primeiro pagamento falhou
- **D+3**: Fim do grace period
- **D+4**: Bloqueia escrita (criar/atualizar obras, leads, etc.)
- **D+10**: Bloqueia leitura (não consegue ver dados)
- **D+30**: Suspensão definitiva

### Cancelamento
- Motivo obrigatório
- Assinatura ativa até fim do período pago
- Plano rebaixado após cancelamento

## UI

Acesse `/dashboard/billing` para:

- Ver plano atual e status da assinatura
- Visualizar uso vs limites
- Ver histórico de faturas
- Fazer upgrade/downgrade
- Abrir portal do Stripe
- Cancelar assinatura
