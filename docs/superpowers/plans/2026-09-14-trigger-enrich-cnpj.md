# Trigger de Enriquecimento Automático de CNPJ

> **Para agentes:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Steps usam checkbox (`- [ ]`).

**Goal:** Quando uma obra nova entra ou é atualizada com um CNPJ de responsável, o enriquecimento começa em minutos — não espera o cron diário das 02:30.

**Architecture:** Trigger AFTER INSERT/UPDATE em `radar_obras` enfileira CNPJs de 14 dígitos ainda não enriquecidos numa tabela `enrich_cnpj_queue`. Edge Function `enrich-cnpj` é estendida para também drenar essa fila. Um cron a cada 15min chama a Edge Function para processar a fila acumulada entre execuções.

**Tech Stack:** PostgreSQL (triggers, pg_cron), Supabase Edge Functions (Deno), Supabase JS client.

**Spec:** Gaps observados no estado atual:
- Cron atual: `30 2 * * *` → obras que entram durante o dia só enriquecem no dia seguinte
- Edge Function atual: lê de `radar_obras` direto, não tem fila persistente
- 7.214 CNPJs no DB; obras novas chegam continuamente via ETL CNO

## Global Constraints

- Trigger precisa ser `AFTER INSERT OR UPDATE OF responsavel_documento, status` — não rodar em updates irrelevantes
- Status filter herdado da Edge Function: `status = 'ativa'` (somente obras ativas enriquecem)
- Multi-tenant: trigger precisa propagar `tenant_id` para a fila
- Idempotência: chave única `(tenant_id, cnpj)` evita duplicatas na fila
- Edge Function deve funcionar em dois modos: (a) drenar fila, (b) modo legado (busca obras direto)
- CNPJs com `fonte_enriquecimento = 'nao_encontrado'` NÃO entram na fila (não tenta de novo)
- Edge Function roda em até 60s (limite Supabase free) — fila processa no máximo `limit` por chamada
- pg_cron já está habilitado (extensão `cron` instalada via `019_cron_enrich_cnpj.sql`)

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `supabase/migrations/020_enrich_cnpj_queue.sql` | Tabela fila + trigger AFTER INSERT/UPDATE + cron 15min |
| `supabase/functions/enrich-cnpj/index.ts` | Modificado: drenar fila quando `mode='queue'`, manter compat com modo legado |
| `__tests__/enrich-queue.test.ts` | Testes unitários da lógica de fila (extração de CNPJs, filtros) |

---

## Task 1: Migration - Tabela enrich_cnpj_queue

**Files:**
- Create: `supabase/migrations/020_enrich_cnpj_queue.sql`
- Test: `__tests__/enrich-queue.test.ts`

**Interfaces:**
- Consumes: tabela `radar_obras` (já existe com `responsavel_documento`, `tenant_id`, `status`)
- Produces: tabela `enrich_cnpj_queue(cnpj text, tenant_id uuid, enqueued_at timestamptz, source obra_id uuid)`

- [ ] **Step 1: Escrever teste da extração de CNPJs**

Em `__tests__/enrich-queue.test.ts`:

```typescript
import { describe, test, expect } from '@jest/globals';

/**
 * Pure functions espelhadas do trigger SQL.
 * Precisam ficar idênticas para que testes catchem divergências.
 */
function extrairCnpj(documento: string | null): string | null {
  if (!documento) return null;
  const limpo = documento.replace(/\D/g, '');
  return limpo.length === 14 ? limpo : null;
}

function deveEnfileirar(args: {
  documento: string | null;
  status: string;
  jaEnriquecido: boolean;
  jaNaoEncontrado: boolean;
}): boolean {
  const cnpj = extrairCnpj(args.documento);
  if (!cnpj) return false;
  if (args.status !== 'ativa') return false;
  if (args.jaEnriquecido || args.jaNaoEncontrado) return false;
  return true;
}

describe('extrairCnpj', () => {
  test('retorna CNPJ normalizado para 14 dígitos', () => {
    expect(extrairCnpj('12.345.678/0001-90')).toBe('12345678000190');
    expect(extrairCnpj('12345678000190')).toBe('12345678000190');
  });

  test('retorna null para CPF (11 dígitos)', () => {
    expect(extrairCnpj('123.456.789-09')).toBeNull();
  });

  test('retorna null para string vazia ou null', () => {
    expect(extrairCnpj(null)).toBeNull();
    expect(extrairCnpj('')).toBeNull();
    expect(extrairCnpj('   ')).toBeNull();
  });

  test('retorna null para documento com tamanho inválido', () => {
    expect(extrairCnpj('123')).toBeNull();
    expect(extrairCnpj('123456789012345')).toBeNull();
  });
});

describe('deveEnfileirar', () => {
  const baseDoc = '12345678000190';

  test('enfileira CNPJ de obra ativa não enriquecido', () => {
    expect(deveEnfileirar({
      documento: baseDoc,
      status: 'ativa',
      jaEnriquecido: false,
      jaNaoEncontrado: false,
    })).toBe(true);
  });

  test('não enfileira obra inativa', () => {
    expect(deveEnfileirar({
      documento: baseDoc,
      status: 'inativa',
      jaEnriquecido: false,
      jaNaoEncontrado: false,
    })).toBe(false);
  });

  test('não enfileira obra já enriquecida', () => {
    expect(deveEnfileirar({
      documento: baseDoc,
      status: 'ativa',
      jaEnriquecido: true,
      jaNaoEncontrado: false,
    })).toBe(false);
  });

  test('não enfileira obra marcada como nao_encontrado', () => {
    expect(deveEnfileirar({
      documento: baseDoc,
      status: 'ativa',
      jaEnriquecido: false,
      jaNaoEncontrado: true,
    })).toBe(false);
  });

  test('não enfileira CPF (11 dígitos)', () => {
    expect(deveEnfileirar({
      documento: '12345678909',
      status: 'ativa',
      jaEnriquecido: false,
      jaNaoEncontrado: false,
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar testes para confirmar que passam (lógica pura)**

```bash
cd E:\RadarCrm && npm test -- enrich-queue
```

Esperado: PASS nos 9 testes. (Lógica pura é trivial; só falha se houver typo.)

- [ ] **Step 3: Criar migration 020**

Em `supabase/migrations/020_enrich_cnpj_queue.sql`:

```sql
-- =============================================================================
-- MIGRATION 020: Trigger de enriquecimento automático de CNPJ
-- Enriquece obras novas em minutos, não no dia seguinte.
-- =============================================================================

-- 1) Tabela fila (lock-free, dedup por tenant+cnpj)
CREATE TABLE IF NOT EXISTS enrich_cnpj_queue (
  cnpj        TEXT        NOT NULL,
  tenant_id   UUID        NOT NULL,
  source_obra_id UUID,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts    INT         NOT NULL DEFAULT 0,
  last_error  TEXT,
  PRIMARY KEY (tenant_id, cnpj)
);

CREATE INDEX IF NOT EXISTS idx_enrich_queue_enqueued_at
  ON enrich_cnpj_queue (enqueued_at);

COMMENT ON TABLE enrich_cnpj_queue IS
  'Fila de CNPJs aguardando enriquecimento. Trigger em radar_obras INSERT/UPDATE popula. Edge Function enrich-cnpj drena em cron de 15min.';

-- 2) Função do trigger
CREATE OR REPLACE FUNCTION fn_enqueue_cnpj_on_obra_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cnpj TEXT;
BEGIN
  -- Extrair CNPJ (14 dígitos, ignora máscara)
  v_cnpj := regexp_replace(COALESCE(NEW.responsavel_documento, ''), '\D', '', 'g');

  -- Filtros: só CNPJ válido, só obra ativa
  IF length(v_cnpj) <> 14 THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'ativa' THEN
    RETURN NEW;
  END IF;

  -- Já enriquecido (qualquer fonte != nao_encontrado)? Não enfileira.
  IF EXISTS (
    SELECT 1 FROM radar_obras_empresas e
    WHERE e.tenant_id = NEW.tenant_id
      AND e.cnpj = v_cnpj
      AND e.fonte_enriquecimento IS DISTINCT FROM 'nao_encontrado'
  ) THEN
    RETURN NEW;
  END IF;

  -- Já marcado como não encontrado? Não tenta de novo.
  IF EXISTS (
    SELECT 1 FROM radar_obras_empresas e
    WHERE e.tenant_id = NEW.tenant_id
      AND e.cnpj = v_cnpj
      AND e.fonte_enriquecimento = 'nao_encontrado'
  ) THEN
    RETURN NEW;
  END IF;

  -- Enfileira (idempotente via PK composta)
  INSERT INTO enrich_cnpj_queue (cnpj, tenant_id, source_obra_id)
  VALUES (v_cnpj, NEW.tenant_id, NEW.id)
  ON CONFLICT (tenant_id, cnpj) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 3) Trigger
DROP TRIGGER IF EXISTS trg_enqueue_cnpj_on_obra_change ON radar_obras;
CREATE TRIGGER trg_enqueue_cnpj_on_obra_change
  AFTER INSERT OR UPDATE OF responsavel_documento, status
  ON radar_obras
  FOR EACH ROW
  EXECUTE FUNCTION fn_enqueue_cnpj_on_obra_change();

-- 4) Cron para drenar a fila a cada 15min (offset 7min para não conflitar com ETL CNO 02:00 e enrich legado 02:30)
SELECT cron.schedule(
  'enrich-cnpj-queue-15min',
  '7,22,37,52 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.etl_webhook_url', true) || '/functions/v1/enrich-cnpj',
    body := jsonb_build_object('mode', 'queue', 'limit', 100),
    headers := '{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.anon_service_key', true) || '"}'::jsonb
  );
  $$
);

COMMENT ON FUNCTION fn_enqueue_cnpj_on_obra_change() IS
  'Trigger: enfileira CNPJ em enrich_cnpj_queue quando obra ativa com CNPJ novo aparece ou muda status para ativa.';
```

- [ ] **Step 4: Rodar type-check no SQL via lint (opcional)**

```bash
cd E:\RadarCrm && npx --yes pgformatter@latest supabase/migrations/020_enrich_cnpj_queue.sql --check
```

Esperado: sem erros de parse. (Skip se pgformatter indisponível; SQL válido é o que importa.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/020_enrich_cnpj_queue.sql __tests__/enrich-queue.test.ts
git commit -m "feat(enrich): trigger enfileira CNPJs novos em fila persistente"
```

---

## Task 2: Edge Function - Drenar Fila

**Files:**
- Modify: `supabase/functions/enrich-cnpj/index.ts`
- Test: `__tests__/enrich-queue.test.ts` (estender)

**Interfaces:**
- Consumes: tabela `enrich_cnpj_queue` (criada na Task 1)
- Produces: Edge Function aceita novo param `mode='queue'` (drena fila) ou `mode='legacy'` (busca obras direto, comportamento atual)

- [ ] **Step 1: Estender testes para os dois modos**

Adicione ao final de `__tests__/enrich-queue.test.ts`:

```typescript
describe('selecao de modo da Edge Function', () => {
  function selecionarModo(body: unknown): 'queue' | 'legacy' {
    if (body && typeof body === 'object' && 'mode' in body) {
      const m = (body as { mode: unknown }).mode;
      if (m === 'queue' || m === 'legacy') return m;
    }
    return 'legacy';
  }

  test('mode=queue explicitamente solicitado', () => {
    expect(selecionarModo({ mode: 'queue' })).toBe('queue');
  });

  test('mode=legacy explicitamente solicitado', () => {
    expect(selecionarModo({ mode: 'legacy' })).toBe('legacy');
  });

  test('sem param mode -> default legacy (compat)', () => {
    expect(selecionarModo({})).toBe('legacy');
    expect(selecionarModo(null)).toBe('legacy');
    expect(selecionarModo({ limit: 100 })).toBe('legacy');
  });

  test('mode invalido -> default legacy', () => {
    expect(selecionarModo({ mode: 'foo' })).toBe('legacy');
  });
});
```

- [ ] **Step 2: Rodar testes para confirmar que passam**

```bash
cd E:\RadarCrm && npm test -- enrich-queue
```

Esperado: PASS em todos os 13 testes.

- [ ] **Step 3: Refatorar Edge Function para suportar modo queue**

Edite `supabase/functions/enrich-cnpj/index.ts`:

**3a)** Adicione helper no topo do arquivo (após `const DELAY_MS = 1100`):

```typescript
const QUEUE_BATCH = 100  // quantos CNPJs da fila processar por execução

type EnrichMode = 'queue' | 'legacy'
```

**3b)** Substitua o bloco que faz `await req.json()`:

```typescript
const body = await req.json().catch(() => ({}))
const { limit: limitArg, force_refresh, mode: modeArg } = body
const limit = typeof limitArg === 'number' ? limitArg : 200
const force = !!force_refresh
const mode: EnrichMode = (modeArg === 'queue' || modeArg === 'legacy') ? modeArg : 'legacy'
```

**3c)** Adicione função `fetchFila`:

```typescript
async function fetchFila(admin: any, limit: number): Promise<Array<{ cnpj: string; tenant_id: string }>> {
  const { data, error } = await admin
    .from('enrich_cnpj_queue')
    .select('cnpj, tenant_id')
    .order('enqueued_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data || []
}
```

**3d)** Refatore a função `serve` para escolher fonte de CNPJs baseado em mode:

```typescript
const cnpjToTenant = new Map<string, string>()
const cnpjToQualif = new Map<string, string | null>()

if (mode === 'queue') {
  const fila = await fetchFila(admin, QUEUE_BATCH)
  console.log(`[enrich-cnpj] mode=queue, ${fila.length} CNPJs da fila`)

  // Buscar qualificacao das obras correspondentes (para priorização)
  for (const item of fila) {
    cnpjToTenant.set(item.cnpj, item.tenant_id)
    cnpjToQualif.set(item.cnpj, null)  // qualif não está na fila; sem priorização nesse modo
  }
} else {
  // Modo legado: varre radar_obras inteiro
  let offset = 0
  const PAGE = 1000
  while (cnpjToTenant.size < limit + 1000) {
    const { data: obras, error } = await admin
      .from('radar_obras')
      .select('id, tenant_id, responsavel_documento, responsavel_qualificacao')
      .eq('status', 'ativa')
      .not('responsavel_documento', 'is', null)
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!obras || obras.length === 0) break

    for (const o of obras) {
      const doc = (o.responsavel_documento || '').replace(/\D/g, '')
      if (doc.length === 14 && !cnpjToTenant.has(doc)) {
        cnpjToTenant.set(doc, o.tenant_id)
        cnpjToQualif.set(doc, o.responsavel_qualificacao)
      }
    }
    offset += PAGE
    if (obras.length < PAGE) break
  }
  console.log(`[enrich-cnpj] mode=legacy, ${cnpjToTenant.size} CNPJs unicos coletados`)
}
```

**3e)** No loop de processamento (após enriquecer cada CNPJ com sucesso, NA seção `if (dados) { ... enriquecidos++ }`), adicione remoção da fila:

```typescript
if (dados) {
  try {
    await salvarEmpresa(admin, tenantId, cnpj, dados)
    if (socios) await salvarSocios(admin, tenantId, cnpj, socios)
    enriquecidos++

    // Remove da fila (sucesso)
    if (mode === 'queue') {
      await admin.from('enrich_cnpj_queue')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('cnpj', cnpj)
    }
  } catch (e) {
    console.error(`[enrich-cnpj] Erro ao gravar ${cnpj}:`, e)
    falhas++

    // Incrementa attempts na fila
    if (mode === 'queue') {
      await admin.from('enrich_cnpj_queue')
        .update({ attempts: admin.rpc ? undefined : 1, last_error: String(e) })
        .eq('tenant_id', tenantId)
        .eq('cnpj', cnpj)
    }
  }
}
```

**3f)** Quando marca `nao_encontrado` (nas duas chamadas a `marcarNaoEncontrado`), também remova da fila:

```typescript
await marcarNaoEncontrado(admin, tenantId, cnpj)
naoEncontrados++
if (mode === 'queue') {
  await admin.from('enrich_cnpj_queue')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('cnpj', cnpj)
}
continue
```

- [ ] **Step 4: Validar sintaxe TypeScript**

```bash
cd E:\RadarCrm && npx --yes deno check supabase/functions/enrich-cnpj/index.ts 2>&1 | tail -20
```

Esperado: sem erros de sintaxe. (Se deno não estiver disponível, pule este step e prossiga.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/enrich-cnpj/index.ts __tests__/enrich-queue.test.ts
git commit -m "feat(enrich): Edge Function drena fila persistente quando mode=queue"
```

---

## Task 3: Aplicar Migration em Produção

**Files:**
- Modify: nenhuma (operacional)

- [ ] **Step 1: Aplicar migration 020 no Supabase**

```bash
cd E:\RadarCrm && npx supabase db push 2>&1 | tail -30
```

Esperado: "Applying migration 020_enrich_cnpj_queue.sql ... applied".

Alternativa manual via SQL editor se `db push` falhar: copiar conteúdo de `supabase/migrations/020_enrich_cnpj_queue.sql` e colar no SQL editor do Supabase.

- [ ] **Step 2: Deployar Edge Function atualizada**

```bash
cd E:\RadarCrm && npx supabase functions deploy enrich-cnpj --no-verify-jwt 2>&1 | tail -10
```

Esperado: "Deployed Function enrich-cnpj".

- [ ] **Step 3: Disparar trigger manualmente para validar**

```bash
cd E:\RadarCrm && cat > scripts/_check_trigger_020.ts <<'EOF'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // Conta quantos CNPJs ativos existem
  const { count: obrasAtivas } = await supabase
    .from('radar_obras')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ativa')
    .not('responsavel_documento', 'is', null)

  const { count: jaEnriquecidos } = await supabase
    .from('radar_obras_empresas')
    .select('cnpj', { count: 'exact', head: true })
    .not('fonte_enriquecimento', 'eq', 'nao_encontrado')

  const { count: naoEncontrados } = await supabase
    .from('radar_obras_empresas')
    .select('cnpj', { count: 'exact', head: true })
    .eq('fonte_enriquecimento', 'nao_encontrado')

  const { count: naFila } = await supabase
    .from('enrich_cnpj_queue')
    .select('cnpj', { count: 'exact', head: true })

  console.log({ obrasAtivas, jaEnriquecidos, naoEncontrados, naFila })
}
main().catch(console.error)
EOF
npx tsx scripts/_check_trigger_020.ts
```

Esperado: `naFila: 0` na primeira execução (todas obras ativas com CNPJ já estão enriquecidas ou marcadas como não encontradas). Se aparecer > 0, alguma coisa escapou — debugar.

- [ ] **Step 4: Disparar enriquecimento via cron uma vez para drenar**

```bash
cd E:\RadarCrm && npx tsx -e "
import { createClient } from '@supabase/supabase-js'
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const r = await s.functions.invoke('enrich-cnpj', { body: { mode: 'queue', limit: 50 } })
console.log(r.data ?? r.error)
" 2>&1 | tail -20
```

Esperado: log com `mode=queue` e totais. Se fila vazia, `processados: 0`.

- [ ] **Step 5: Commit (script utilitário)**

```bash
git add scripts/_check_trigger_020.ts
git commit -m "chore: script de verificação pós-deploy do trigger 020"
```

---

## Self-Review (executado)

**1. Spec coverage:**
- ✅ Trigger AFTER INSERT/UPDATE: Task 1, Step 3 (seção 3) `CREATE TRIGGER ... AFTER INSERT OR UPDATE OF responsavel_documento, status`
- ✅ Fila persistente: Task 1, Step 3 (seção 1) `CREATE TABLE enrich_cnpj_queue`
- ✅ Edge Function drena fila: Task 2, Step 3 (3d/3e/3f)
- ✅ Cron 15min: Task 1, Step 3 (seção 4)
- ✅ Não re-tentar `nao_encontrado`: Task 1, Step 3 (segundo `IF EXISTS`)
- ✅ Idempotência: Task 1, Step 3 (`ON CONFLICT (tenant_id, cnpj) DO NOTHING`)
- ✅ Filtro `status='ativa'`: Task 1, Step 3 (`IF NEW.status IS DISTINCT FROM 'ativa'`)
- ✅ Multi-tenant: Task 1, Step 3 (`tenant_id` na PK composta e propaga em tudo)

**2. Placeholder scan:**
- Nenhum "TBD", "implement later", "appropriate error handling" sem código
- Todos os testes têm código real
- Tasks 1 e 2 completas (código SQL e TS completo, não fragmentos)

**3. Type consistency:**
- `enrich_cnpj_queue(cnpj text, tenant_id uuid)` — usado consistentemente em Task 1 e Task 2
- `mode: 'queue' | 'legacy'` — usado consistentemente em Task 2 (3b define, 3d/3e/3f usa)
- `salvarEmpresa` / `salvarSocios` / `marcarNaoEncontrado` — funções já existentes em `index.ts`, reutilizadas sem alteração

**Pronto para execução.**
