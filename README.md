# Radar Canteiro

CRM SaaS para construção civil — Radar de Obras + CRM + WhatsApp.

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (Postgres + Auth + Edge Functions)
- **Auth:** Magic Link (e-mail) + Google OAuth
- **Deploy:** Vercel

## Setup Local

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.local.example .env.local
```

Preencha com suas credenciais do Supabase:
- `NEXT_PUBLIC_SUPABASE_URL` — URL do projeto (Settings > API)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Chave anônima (Settings > API)
- `SUPABASE_SERVICE_ROLE_KEY` — Chave de serviço (NÃO usar no frontend)

### 3. Rodar migrations no Supabase

1. Abra o [Supabase Dashboard](https://supabase.com/dashboard)
2. Vá em **SQL Editor** do seu projeto
3. Cole e execute o conteúdo de `supabase/migrations/001_initial_schema.sql`

### 4. Rodar localmente

```bash
npm run dev
```

O app vai abrir em http://localhost:3000

## Deploy no Vercel

### 1. Conectar repo ao Vercel

```bash
npm i -g vercel
vercel login
vercel
```

### 2. Configurar variáveis de ambiente

No Vercel Dashboard → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anonima
NEXT_PUBLIC_APP_URL=https://seu-dominio.vercel.app
```

### 3. Deploy

```bash
vercel --prod
```

## Estrutura do Projeto

```
src/
  app/
    page.tsx                    # Landing page
    login/page.tsx              # Login com magic link
    signup/page.tsx             # Cadastro em 3 passos
    auth/callback/route.ts      # Callback OAuth
    dashboard/
      layout.tsx                # Layout com sidebar
      visão-geral/page.tsx      # Dashboard overview
      radar/page.tsx            # Radar de obras
      crm/
        page.tsx                # Lista de leads
        novo/page.tsx           # Novo lead
      deals/page.tsx            # Pipeline kanban
      configuracao/page.tsx     # Configurações
  components/
    ui/                        # Componentes shadcn/ui
  lib/
    supabase/
      client.ts                 # Cliente browser
      server.ts                 # Cliente server
      types.ts                  # Tipos do banco
    utils.ts                    # Utilitários
supabase/
  migrations/
    001_initial_schema.sql      # Schema completo
```

## Autenticação

- **Magic Link:** usuário digita e-mail → recebe link → acessa
- **Google OAuth:** login com conta Google
- Middleware protege rotas `/dashboard/*`

## Banco de Dados

Schema completo em `supabase/migrations/001_initial_schema.sql`:
- `tenants` — empresas/clientes
- `tenant_users` — vínculo usuário↔empresa com roles
- `radar_obras` — obras detectadas (com PostGIS)
- `crm_leads` — leads
- `crm_deals` — oportunidades/pipeline
- `crm_atividades` — tarefas e atividades
- `crm_pipeline_estagios` — estágios customizáveis
- `audit_log` — log de auditoria
- RLS (Row Level Security) por tenant

## Roadmap MVP

- [x] Landing page
- [x] Login (magic link + Google)
- [x] Cadastro com onboarding
- [x] Dashboard visão geral
- [x] CRM (leads)
- [x] Pipeline deals (kanban)
- [x] Radar de obras
- [x] Configurações
- [ ] Webhook do WhatsApp (EvolutionAPI)
- [ ] Importação de leads via planilha
- [ ] Geração de propostas em PDF
- [ ] Mapbox com filtros por segmento
