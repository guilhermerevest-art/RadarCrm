# Deploy manual do trigger de enriquecimento automatico

## Pre-requisitos

CLI Supabase logada e projeto linkado:

```bash
npx supabase login
npx supabase link --project-ref <SEU_PROJECT_REF>
```

(Ref visivel em https://supabase.com/dashboard → Settings → General → Reference ID.)

## Passo 1: Aplicar migration 020

Opcao A - via CLI (recomendado):

```bash
npx supabase db push
```

Opcao B - via SQL editor:
1. Abra https://supabase.com/dashboard/project/<REF>/sql
2. Copie o conteudo de `supabase/migrations/020_enrich_cnpj_queue.sql`
3. Cole e execute (Run).

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
-- Rodar no SQL editor do Supabase
SELECT * FROM get_enrich_cnpj_stats();
-- Esperado: enriquecidos_publica/enriquecidos_brasilapi crescendo
```

```sql
-- Fila deve estar vazia ou crescendo devagar (so CNPJs novos)
SELECT COUNT(*) AS na_fila FROM enrich_cnpj_queue;
```

```sql
-- Cron jobs ativos
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
-- Esperado: enrich-cnpj-diario (30 2 * * *) E enrich-cnpj-queue-15min (7,22,37,52 * * * *)
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
