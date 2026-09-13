# Epico 8 - Implementacoes Realizadas

## Visao Geral

Este documento registra as implementacoes concluidas do Épico 8 — Canal WhatsApp da Plataforma.

## Componentes Implementados

### 1. Migration SQL: `supabase/migrations/011_wa_bot_alerta_saude.sql`

#### Tabelas Criadas

| Tabela | Descricao | ID Task |
|---|---|---|
| `wa_session` | Maquina de estados do bot de welcome | E8-T17 |
| `wa_alerta_filtros` | Configuracao de alertas diarios | E8-T10 |
| `wa_optins` | Controle de consentimento LGPD | E8-T4 |

#### Funcoes SQL

| Funcao | Descricao | ID Task |
|---|---|---|
| `fn_wa_session_expirar()` | Expira sessoes vencidas | E8-T17 |
| `fn_wa_alerta_obras_montar(filtro_id, max_obras)` | Busca obras para alerta | E8-T11 |
| `fn_wa_bot_processar_resposta(user_id, resposta, telefone)` | Maquina de estados CIDADE->SEGMENTO->AMOSTRA | E8-T17 |
| `fn_whatsapp_check_health(instance_id)` | Verifica saude da instancia | E8-T25 |
| `fn_wa_optout(numero, via)` | Registra opt-out | E8-T19 |
| `fn_wa_check_optin(numero, escopo)` | Verifica opt-in ativo | E8-T4 |

### 2. Edge Functions

| Funcao | Cron | Descricao | ID Task |
|---|---|---|---|
| `wa-bot-process` | sob demanda | Processa resposta do bot de welcome | E8-T17 |
| `wa-alerta-obras` | 15 min + diario 8h | Envia alertas de obras novas | E8-T12 |
| `wa-health-monitor` | 6h | Verifica conexao e alerta Slack | E8-T25 |
| `wa-templates-sync` | 1h | Sincroniza status com Meta API | E9-T22 |

### 3. Componentes UI

| Componente | Arquivo | Descricao | ID Task |
|---|---|---|---|
| `WAAlertaFiltroForm` | `src/components/whatsapp/WAAlertaFiltroForm.tsx` | Formulario de filtro com mapa e raio | E8-T13 |
| `WAAlertaFiltrosList` | `src/components/whatsapp/WAAlertaFiltroForm.tsx` | Lista de filtros do tenant | E8-T13 |
| `WASaudeConta` | `src/components/whatsapp/WASaudeConta.tsx` | Quality rating, limites, projecao de custo | E9-T24 |

### 4. Paginas

| Pagina | Arquivo | Descricao |
|---|---|---|
| `/dashboard/whatsapp` | `src/app/dashboard/whatsapp/page.tsx` | Hub principal do WhatsApp |
| `/dashboard/whatsapp/alertas` | `src/app/dashboard/whatsapp/alertas/page.tsx` | Gerenciamento de filtros e saude |

## Maquina de Estados do Bot de Welcome

### Fluxo Implementado

```
INICIO
  |
  v
[CIDADE] <-- "Em que cidade voce trabalha?"
  |
  | cidade valida
  v
[SEGMENTO] <-- "Qual seu segmento principal?"
  |        (1-Concreteira, 2-Locadora, 3-Fornecedor, 4-Servico, 5-Outro)
  | segmento valido
  v
[AMOSTRA] <-- "Quer receber amostra gratuita das 3 obras?"
  |        (SIM -> busca 3 obras, envia, CONCLUIDO)
  |        (NAO -> CONCLUIDO direto)
  v
[CONCLUIDO] --> Registra opt-in, envia mensagem final
```

### Estados

| Estado | Descricao | Expiracao |
|---|---|---|
| `CIDADE` | Aguarda resposta de cidade | 30 min |
| `SEGMENTO` | Aguarda resposta de segmento | 30 min |
| `AMOSTRA` | Aguarda SIM/NAO para obras | 10 min |
| `CONCLUIDO` | Fluxo finalizado | - |
| `EXPIRADO` | Sessao expirada | - |

## Schema: wa_session

```sql
CREATE TABLE wa_session (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  tenant_id UUID REFERENCES tenants(id),
  estado TEXT CHECK (estado IN ('CIDADE', 'SEGMENTO', 'AMOSTRA', 'CONCLUIDO', 'EXPIRADO')),
  contexto JSONB,  -- { cidade, segmento, obras_enviadas[], telefone }
  expira_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

## Schema: wa_alerta_filtros

```sql
CREATE TABLE wa_alerta_filtros (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  nome TEXT,
  raio_km INTEGER DEFAULT 25,
  centro_lat NUMERIC(10, 7),
  centro_lng NUMERIC(10, 7),
  centro_endereco TEXT,
  cidade TEXT,
  uf CHAR(2) DEFAULT 'MG',
  segmentos TEXT[],
  fases TEXT[],
  ativo BOOLEAN DEFAULT true,
  ultimo_envio_em TIMESTAMPTZ,
  obras_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

## Schema: wa_optins

```sql
CREATE TABLE wa_optins (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  tenant_id UUID REFERENCES tenants(id),
  numero TEXT UNIQUE,  -- formato: 5534999999999
  escopo TEXT[] CHECK (escopo <@ ARRAY['utilidade', 'marketing']),
  consented_at TIMESTAMPTZ,
  ip_consent TEXT,
  user_agent_consent TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_via TEXT CHECK (revoked_via IN ('palavra_chave', 'manual', 'email_link')),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

## API Endpoints (Edge Functions)

### wa-bot-process

```typescript
// POST /functions/v1/wa-bot-process
interface Request {
  numero: string;        // Telefone do usuario
  mensagem: string;       // Resposta do usuario
  user_id?: string;       // ID do usuario (opcional)
}

interface Response {
  sucesso: boolean;
  proxima_mensagem?: string;
  estado?: string;
  enviar_amostra?: boolean;
  segmento?: string;
  cidade?: string;
  obras?: Array<{
    id: string;
    endereco: string;
    fase: string;
    porte: string;
  }>;
  erro?: string;
}
```

### wa-alerta-obras

```typescript
// POST /functions/v1/wa-alerta-obras?force=true
interface Response {
  sucesso: boolean;
  filtros_processados: number;
  obras_enviadas: number;
  erros: string[];
}
```

### wa-health-monitor

```typescript
// POST /functions/v1/wa-health-monitor
interface Response {
  sucesso: boolean;
  summary: {
    total: number;
    connected: number;
    disconnected: number;
    failed: number;
    withAlerts: number;
  };
  detalhes: Array<{
    instance_id: string;
    instance_name: string;
    status: string;
    disconnected_at: string | null;
    health_check_success: boolean;
    should_alert: boolean;
  }>;
  alertas_enviados: number;
}
```

### wa-templates-sync

```typescript
// POST /functions/v1/wa-templates-sync
interface Response {
  sucesso: boolean;
  templates_sync: number;
  updated: number;
  created: number;
  errors: string[];
}
```

## Variaveis de Ambiente Necessarias

```env
# wa-health-monitor
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# wa-templates-sync
META_ACCESS_TOKEN=...
META_WABA_ID=...
```

## Proximos Passos (dependencias)

Para completar o Épico 8, as seguintes tarefas ainda precisam ser implementadas:

1. **E8-T18**: Trigger `trg_wa_mensagem_para_timeline` — Mensagem vira entrada em crm_timeline
2. **E8-T20**: Comando `VISITEI 4821` — Registrar visita via WhatsApp
3. **E8-T21**: Deploy da EvolutionAPI no VPS
4. **E8-T22**: Configurar webhook EvolutionAPI -> Supabase
5. **E8-T23**: WAConexaoWizard.tsx com QR Code em tempo real
6. **E8-T24**: wa-rate-limiter com Upstash Redis
7. **E8-T26**: wa_contas com colunas de provider
8. **E8-T28**: Rate limit configuravel por tenant no painel

## Status de Implementacao

| Tarefa | Status | Observacao |
|---|---|---|
| E8-T10: wa_alerta_filtros | ✅ Completo | Migration 011 |
| E8-T11: fn_wa_alerta_obras_montar | ✅ Completo | Migration 011 |
| E8-T12: wa-alerta-obras | ✅ Completo | Edge Function |
| E8-T13: WAAlertaFiltroForm.tsx | ✅ Completo | Componente UI |
| E8-T17: Maquina de estados bot | ✅ Completo | Migration 011 + wa-bot-process |
| E8-T19: fn_wa_optout | ✅ Completo | Migration 011 |
| E8-T25: wa-health-monitor | ✅ Completo | Edge Function |
| E9-T22: wa-templates-sync | ✅ Completo | Edge Function |
| E9-T24: WASaudeConta.tsx | ✅ Completo | Componente UI |

## Arquivos Criados/Modificados

### Novos Arquivos

1. `supabase/migrations/011_wa_bot_alerta_saude.sql`
2. `supabase/functions/wa-bot-process/index.ts`
3. `supabase/functions/wa-alerta-obras/index.ts`
4. `supabase/functions/wa-health-monitor/index.ts`
5. `supabase/functions/wa-templates-sync/index.ts`
6. `src/components/whatsapp/WAAlertaFiltroForm.tsx`
7. `src/components/whatsapp/WASaudeConta.tsx`
8. `src/app/dashboard/whatsapp/alertas/page.tsx`
9. `docs/EPICO_08_IMPLEMENTADO.md` (este arquivo)

### Arquivos Modificados

1. `src/app/dashboard/whatsapp/page.tsx` — Atualizado com cards de navegacao
2. `src/app/dashboard/layout.tsx` — Adicionado submenu WhatsApp

---

*Ultima atualizacao: 2024-09-13*
