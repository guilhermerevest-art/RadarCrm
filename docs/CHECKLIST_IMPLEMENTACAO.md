# Checklist de Verificação — Implementação Completa

## ✅ Verificações Automáticas

| Verificação | Status | Observação |
|------------|--------|------------|
| TypeScript compilation | ✅ PASS | `npx tsc --noEmit` exit 0 |
| Build Next.js | 🔄 Rodando | - |
| SQL Migrations | ✅ 10/10 | Todas com CREATE TABLE |
| Edge Functions | ✅ 9/9 | Todas com index.ts |
| API Routes | ✅ 22 | Todas com route.ts |
| Componentes UI | ✅ 36 | - |

## 📋 Para Aplicar no Supabase

### 1. Migrations SQL (execute no SQL Editor)

```bash
# Opção A: Push direto
npx supabase db push

# Opção B: Execute manualmente no SQL Editor
# Arquivos em supabase/migrations/ (execute em ordem):
011_wa_bot_alerta_saude.sql  # WhatsApp
012_audit_log.sql            # Audit
013_radar_jobs_config.sql    # Jobs
014_billing.sql              # Billing
014_crm_automacoes.sql       # CRM
014_score_e_rotas.sql        # Score + Rota
014_api_publica_escala.sql   # API + Webhooks
014_etl_jobs_monitoring.sql  # ETL
015_fn_radar_obras_no_raio.sql # PostGIS
016_legais_lgpd.sql         # LGPD
017_admin_feature_flags.sql  # Admin + Flags

# Ou use os arquivos consolidados:
supabase/APLICAR_011.sql
supabase/APLICAR_014.sql
```

### 2. Deploy Edge Functions

```bash
supabase functions deploy billing-webhook
supabase functions deploy billing-checkout
supabase functions deploy wa-bot-process
supabase functions deploy wa-alerta-obras
supabase functions deploy wa-health-monitor
supabase functions deploy wa-templates-sync
supabase functions deploy feature-flag-resolver
```

## 🔧 Configurações Necessárias

### Stripe Dashboard

1. Criar produtos e preços em https://dashboard.stripe.com
2. Configurar webhook URL: `https://seudominio.com/api/webhooks/stripe`
3. Eventos: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`

### Upstash Redis

1. Criar banco em https://console.upstash.com
2. Copiar REST_URL e REST_TOKEN para .env.local

### Evolution API

1. Configurar webhook para receber mensagens
2. URL: `https://seudominio.com/api/webhooks/whatsapp`

## 📱 Páginas para Testar Manualmente

| Página | URL | O que testar |
|--------|-----|--------------|
| Billing | `/dashboard/billing` | Trial banner, upgrade modal |
| Admin | `/dashboard/admin` | Lista tenants, impersonate |
| CRM Kanban | `/dashboard/crm/quadro` | Drag-drop, criar deal |
| CRM Analytics | `/dashboard/crm/analytics` | KPIs carregando |
| WhatsApp | `/dashboard/whatsapp` | Hub principal |
| WhatsApp Alertas | `/dashboard/whatsapp/alertas` | Criar filtro |
| Radar Rota | `/dashboard/radar/rota` | Montar rota |
| API Keys | `/dashboard/configuracao/api` | Criar/revogar key |
| Termos | `/termos` | Renderização |
| Privacidade | `/privacidade` | Renderização |
| Help | `/help` | Artigos |

## 🧪 Testar API REST

```bash
# Listar obras (precisa API key)
curl -H "X-API-Key: sua-key-aqui" \
  https://seudominio.com/api/v1/obras?limit=10

# Criar lead
curl -X POST -H "X-API-Key: sua-key-aqui" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Teste","telefone":"34999999999"}' \
  https://seudominio.com/api/v1/leads
```

## ⚠️ Issues Conhecidas

1. **Rate limiting**: Precisa configurar Upstash Redis
2. **WhatsApp bot**: Precisa webhooks da Evolution API
3. **ETL jobs**: Cron jobs precisam ser configurados no Supabase

## 📞 Suporte

Para dúvidas, verificar:
- `docs/BILLING.md`
- `docs/EPICO_04_BILLING_IMPLEMENTADO.md`
- `docs/EPICO_08_IMPLEMENTADO.md`
- `scripts/etl/README.md`
