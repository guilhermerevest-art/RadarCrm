# Deploy manual do trigger de enriquecimento automatico

## Pre-requisitos

CLI Supabase logada e projeto linkado:

```bash
npx supabase login
npx supabase link --project-ref <SEU_PROJECT_REF>
```

(Ref visivel em https://supabase.com/dashboard → Settings → General → Reference ID.)

## Passo 1: Aplicar migrations 020 e 021

Opcao A - via CLI (recomendado):

```bash
npx supabase db push
```

Aplica 020 (tabela + trigger) e 021 (RLS, RPCs atomicas, view) atomicamente.

Opcao B - via SQL editor:
1. Abra https://supabase.com/dashboard/project/<REF>/sql
2. Copie o conteudo de `supabase/migrations/020_enrich_cnpj_queue.sql` e execute
3. Em nova query, copie `supabase/migrations/021_enrich_cnpj_queue_hardening.sql` e execute

## Passo 2: Deploy da Edge Function atualizada

```bash
npx supabase functions deploy enrich-cnpj --no-verify-jwt
```

## Passo 3: Validacao

```bash
npx tsx scripts/_check_trigger_020.ts
```

Esperado: contagens de obras ativas, ja enriquecidos, nao encontrados, e `naFila: 0`
na primeira execucao (todas obras com CNPJ ja estao enriquecidas ou marcadas).

Para forcar um enriquecimento imediato (modo queue):

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js'
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const r = await s.functions.invoke('enrich-cnpj', { body: { mode: 'queue', limit: 50 } })
console.log(r.data ?? r.error)
"
```

## Verificacao pos-deploy (apos 1h)

```sql
-- Snapshot do estado da fila (visao nova da migration 021)
SELECT * FROM v_enrich_queue_status;
-- Esperado: pendentes_novos >= 0, em_retry 0, com_falhas_estoque 0, presos_sem_progresso 0
```

```sql
-- Estado global do enriquecimento
SELECT * FROM get_enrich_cnpj_stats();
-- Esperado: enriquecidos_publica/enriquecidos_brasilapi crescendo
```

```sql
-- Cron jobs ativos
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
-- Esperado: enrich-cnpj-diario (30 2 * * *) E enrich-cnpj-queue-15min (7,22,37,52 * * * *)
```

## Teste das RPCs (opcional, apos deploy)

```sql
-- Testar claim atomico: deve retornar fila vazia ou rows
SELECT * FROM claim_cnpj_queue(5);

-- Testar increment_attempts: substitua por um tenant_id e cnpj reais da sua base
SELECT increment_attempts(
  '<TENANT_ID_REAL>'::uuid,
  '00000000000000',
  'teste manual'
);
-- Esperado: retorna 1 (apos 1a tentativa), 2 (apos 2a), ..., 5 (apos 5a - marca nao_encontrado)

-- Ver fila apos
SELECT * FROM v_enrich_queue_status;
```

## Rollback

Se algo der errado:

```sql
-- 1) Desabilita trigger
ALTER TABLE radar_obras DISABLE TRIGGER trg_enqueue_cnpj_on_obra_change;

-- 2) Remove cron (opcional)
SELECT cron.unschedule('enrich-cnpj-queue-15min');

-- 3) Dropa tabela fila
DROP TABLE IF EXISTS enrich_cnpj_queue;

-- 4) Dropa funcao do trigger
DROP FUNCTION IF EXISTS fn_enqueue_cnpj_on_obra_change();
```

E re-deployar a Edge Function antiga via git:

```bash
git revert <commit-da-edge-function>
npx supabase functions deploy enrich-cnpj --no-verify-jwt
```
