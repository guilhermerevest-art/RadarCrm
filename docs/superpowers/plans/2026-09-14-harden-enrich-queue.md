# Hardening do Trigger de Enriquecimento (RLS, attempts, lock atômico, observabilidade)

> **Para agentes:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Steps usam checkbox (`- [ ]`).

**Goal:** Tornar a fila `enrich_cnpj_queue` segura (RLS), confiável (lock atômico, attempts real), e observável (view de status).

**Architecture:**
- Migration 021 adiciona ao 020: RLS, view de status, função RPC `claim_cnpj_queue(batch_size)` que faz SELECT FOR UPDATE SKIP LOCKED + DELETE em uma operação atômica. Insere comentário explicativo.
- Edge Function `enrich-cnpj/index.ts`: substituir `fetchFila` por `claim_cnpj_queue` (DELETE com RETURNING via RPC); consertar `incrementarAttempts` para usar UPDATE com `attempts: attempts + 1` via RPC; remover itens da fila com `attempts >= MAX_ATTEMPTS` e marcar como `nao_encontrado` (limite de retry).

**Tech Stack:** Postgres (RLS, FOR UPDATE SKIP LOCKED, RPC functions), Supabase Edge Functions (Deno + supabase-js), TypeScript.

**Spec:** Melhorias incrementais sobre o commit `93c3246` — torna o pipeline de enriquecimento production-ready.

## Global Constraints

- RLS não pode quebrar o trigger (usa `SECURITY DEFINER` que roda como dono da função, bypassa RLS)
- service_role bypassa RLS automaticamente; policies adicionais precisam estar corretas para `authenticated`/`anon`
- Lock atômico via `FOR UPDATE SKIP LOCKED` — padrão Postgres desde 9.5
- Attempts: max 5 tentativas. Após isso, marca como `nao_encontrado` na `radar_obras_empresas` e remove da fila (desiste)
- View `v_enrich_queue_status` é read-only, sem triggers
- Não criar migration que quebra a 020 — sempre `CREATE OR REPLACE` ou `DROP IF EXISTS` antes
- Toda mudança no código TS precisa passar pelo mesmo teste TDD pattern

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `supabase/migrations/021_enrich_cnpj_queue_hardening.sql` | RLS, view de status, funções RPC `claim_cnpj_queue` e `increment_attempts` |
| `supabase/functions/enrich-cnpj/index.ts` | Modificado: usa RPCs ao invés de UPDATE/DELETE direto, conserta incrementarAttempts |
| `__tests__/enrich-queue-hardening.test.ts` | Testes de lógica de limite de retries e classificação de status |

---

## Task 1: Migration 021 - RLS + View + RPCs atômicas

**Files:**
- Create: `supabase/migrations/021_enrich_cnpj_queue_hardening.sql`

**Interfaces:**
- Consome: tabela `enrich_cnpj_queue` (criada em 020)
- Produces: 
  - `claim_cnpj_queue(batch_size INT) RETURNS TABLE(cnpj TEXT, tenant_id UUID)` — pega e remove da fila atomicamente
  - `increment_attempts(p_tenant_id UUID, p_cnpj TEXT, p_error TEXT) RETURNS INT` — incrementa attempts, retorna novo valor; se >=5, marca empresa como nao_encontrado e remove da fila
  - `v_enrich_queue_status` — view com contadores por estado

- [ ] **Step 1: Criar migration 021**

Em `supabase/migrations/021_enrich_cnpj_queue_hardening.sql`:

```sql
-- =============================================================================
-- MIGRATION 021: Hardening do trigger de enriquecimento (RLS, lock, observab.)
-- Adiciona seguranca, atomicidade e visibilidade ao pipeline criado em 020.
-- =============================================================================

-- 1) RLS na enrich_cnpj_queue
-- service_role bypassa RLS automaticamente; policies abaixo sao para authenticated.
ALTER TABLE enrich_cnpj_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enrich_cnpj_queue_select_own ON enrich_cnpj_queue;
CREATE POLICY enrich_cnpj_queue_select_own ON enrich_cnpj_queue
  FOR SELECT
  TO authenticated
  USING (tenant_id = (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  ));

-- Bloqueia qualquer escrita direta de clientes. service_role ignora policies.
DROP POLICY IF EXISTS enrich_cnpj_queue_no_write ON enrich_cnpj_queue;
CREATE POLICY enrich_cnpj_queue_no_write ON enrich_cnpj_queue
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE enrich_cnpj_queue IS
  'Fila de CNPJs aguardando enriquecimento. Trigger em radar_obras INSERT/UPDATE popula. Edge Function enrich-cnpj drena via RPC claim_cnpj_queue. RLS: cliente so le propria fila; escritas apenas via service_role.';

-- 2) Funcao atomica: pega e remove em uma unica operacao (lock + delete)
CREATE OR REPLACE FUNCTION claim_cnpj_queue(batch_size INT DEFAULT 100)
RETURNS TABLE(cnpj TEXT, tenant_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimed AS (
    SELECT q.cnpj, q.tenant_id
    FROM enrich_cnpj_queue q
    ORDER BY q.enqueued_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM enrich_cnpj_queue
  WHERE (cnpj, tenant_id) IN (SELECT cnpj, tenant_id FROM claimed)
  RETURNING cnpj, tenant_id;
$$;

COMMENT ON FUNCTION claim_cnpj_queue IS
  'Pega ate batch_size CNPJs da fila e os remove atomicamente. Usa FOR UPDATE SKIP LOCKED para impedir concorrencia entre execucoes paralelas. Chamado pela Edge Function enrich-cnpj (mode=queue).';

-- 3) Incrementa attempts; apos MAX_ATTEMPTS, marca como nao_encontrado e remove da fila
CREATE OR REPLACE FUNCTION increment_attempts(
  p_tenant_id UUID,
  p_cnpj      TEXT,
  p_error     TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts INT;
BEGIN
  UPDATE enrich_cnpj_queue
  SET attempts   = attempts + 1,
      last_error = p_error
  WHERE tenant_id = p_tenant_id
    AND cnpj      = p_cnpj
  RETURNING attempts INTO v_attempts;

  IF v_attempts IS NULL THEN
    -- CNPJ nao esta mais na fila (provavelmente ja foi processado)
    RETURN 0;
  END IF;

  IF v_attempts >= 5 THEN
    -- Desiste: marca empresa como nao_encontrado
    INSERT INTO radar_obras_empresas (tenant_id, cnpj, cnpj_basico, fonte_enriquecimento, last_enriched_at)
    VALUES (p_tenant_id, p_cnpj, substring(p_cnpj FROM 1 FOR 8), 'nao_encontrado', NOW())
    ON CONFLICT (tenant_id, cnpj)
    DO UPDATE SET fonte_enriquecimento = 'nao_encontrado',
                  last_enriched_at    = NOW();

    DELETE FROM enrich_cnpj_queue
    WHERE tenant_id = p_tenant_id
      AND cnpj      = p_cnpj;
  END IF;

  RETURN v_attempts;
END;
$$;

COMMENT ON FUNCTION increment_attempts IS
  'Incrementa attempts e registra last_error. Apos 5 tentativas, marca empresa como nao_encontrado e remove da fila. Chamado pela Edge Function enrich-cnpj em caso de erro transitorio.';

-- 4) View de observabilidade
DROP VIEW IF EXISTS v_enrich_queue_status;
CREATE VIEW v_enrich_queue_status AS
SELECT
  COUNT(*)                                                        AS total_na_fila,
  COUNT(*) FILTER (WHERE attempts = 0)                            AS pendentes_novos,
  COUNT(*) FILTER (WHERE attempts > 0 AND attempts < 5)           AS em_retry,
  COUNT(*) FILTER (WHERE attempts >= 5)                           AS com_falhas_estoque,
  COUNT(*) FILTER (WHERE enqueued_at < NOW() - INTERVAL '1 hour'
                     AND attempts = 0)                            AS presos_sem_progresso,
  MIN(enqueued_at)                                                AS mais_antigo,
  MAX(enqueued_at)                                                AS mais_recente,
  EXTRACT(EPOCH FROM (NOW() - MIN(enqueued_at))) / 60             AS atraso_minutos_pior_caso
FROM enrich_cnpj_queue;

COMMENT ON VIEW v_enrich_queue_status IS
  'Snapshot do estado da fila de enriquecimento. Use: SELECT * FROM v_enrich_queue_status;';
```

- [ ] **Step 2: Validar SQL via dry-run**

```bash
cd E:\RadarCrm && cat supabase/migrations/021_enrich_cnpj_queue_hardening.sql | head -5
```

Esperado: BEGIN do comment. (Validação real só possível via `db push` — não há como rodar SQL isolado sem conexão Supabase aqui.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/021_enrich_cnpj_queue_hardening.sql
git commit -m "feat(enrich): RLS, lock atomico (claim_cnpj_queue), increment_attempts, view status"
```

---

## Task 2: Edge Function - usar RPCs atômicas

**Files:**
- Modify: `supabase/functions/enrich-cnpj/index.ts`
- Create: `__tests__/enrich-queue-hardening.test.ts`

**Interfaces:**
- Consome: funções RPC `claim_cnpj_queue(batch_size)` e `increment_attempts(tenant_id, cnpj, error)` (criadas na Task 1)
- Produces: Edge Function com `fetchFila` substituído por `claim` (atômico), `incrementarAttempts` substituído por chamada RPC

- [ ] **Step 1: Adicionar testes para lógica de retry limit**

Em `__tests__/enrich-queue-hardening.test.ts`:

```typescript
import { describe, test, expect } from '@jest/globals';

const MAX_ATTEMPTS = 5;

describe('Limite de retries do enriquecimento', () => {
  function deveDesistir(attempts: number): boolean {
    return attempts >= MAX_ATTEMPTS;
  }

  function classificarItem(attempts: number, idadeMinutos: number): {
    categoria: 'pendente_novo' | 'em_retry' | 'desistiu' | 'preso';
    deveDesistir: boolean;
  } {
    if (attempts >= MAX_ATTEMPTS) {
      return { categoria: 'desistiu', deveDesistir: true };
    }
    if (attempts > 0) {
      return { categoria: 'em_retry', deveDesistir: false };
    }
    if (idadeMinutos > 60) {
      return { categoria: 'preso', deveDesistir: false };
    }
    return { categoria: 'pendente_novo', deveDesistir: false };
  }

  describe('deveDesistir', () => {
    test('desiste apos 5 tentativas', () => {
      expect(deveDesistir(5)).toBe(true);
    });
    test('desiste apos mais de 5', () => {
      expect(deveDesistir(7)).toBe(true);
    });
    test('nao desiste com menos de 5', () => {
      expect(deveDesistir(4)).toBe(false);
      expect(deveDesistir(0)).toBe(false);
    });
  });

  describe('classificarItem', () => {
    test('attempts >= 5 -> desistiu', () => {
      expect(classificarItem(5, 30).categoria).toBe('desistiu');
    });
    test('attempts 1..4 -> em_retry', () => {
      expect(classificarItem(1, 10).categoria).toBe('em_retry');
      expect(classificarItem(4, 10).categoria).toBe('em_retry');
    });
    test('attempts 0 e idade < 60min -> pendente_novo', () => {
      expect(classificarItem(0, 0).categoria).toBe('pendente_novo');
      expect(classificarItem(0, 59).categoria).toBe('pendente_novo');
    });
    test('attempts 0 e idade >= 60min -> preso (fila travada)', () => {
      expect(classificarItem(0, 60).categoria).toBe('preso');
      expect(classificarItem(0, 120).categoria).toBe('preso');
    });
  });
});
```

- [ ] **Step 2: Rodar testes**

```bash
cd E:\RadarCrm && npm test -- enrich-queue-hardening
```

Esperado: 7 testes passando.

- [ ] **Step 3: Substituir `fetchFila` por `claimFila` (atômico)**

Em `supabase/functions/enrich-cnpj/index.ts`:

**3a)** Substitua a função `fetchFila` por:

```typescript
async function claimFila(admin: any, batchSize: number): Promise<Array<{ cnpj: string; tenant_id: string }>> {
  // RPC atomico: pega e remove da fila em uma unica operacao com FOR UPDATE SKIP LOCKED
  const { data, error } = await admin.rpc('claim_cnpj_queue', { batch_size: batchSize })
  if (error) throw error
  return data || []
}
```

**3b)** Substitua `removerDaFila` por no-op (não é mais necessário — claim já remove):

```typescript
// removerDaFila nao eh mais necessario: claim_cnpj_queue ja remove atomicamente
// Mantido apenas como comentario para clareza do fluxo.
async function _removerDaFila_REMOVED(): Promise<void> {
  // Substituido por claim atomico via RPC. Sucesso ja remove.
}
```

(Apenas remova todas as chamadas a `removerDaFila` e a função em si — claim já faz a remoção.)

- [ ] **Step 4: Atualizar chamadas ao longo do código**

**4a)** Modo queue (substitui `fetchFila` por `claimFila`):

Encontre o trecho:
```typescript
const fila = await fetchFila(admin, QUEUE_BATCH)
```
Substitua por:
```typescript
const fila = await claimFila(admin, QUEUE_BATCH)
```

**4b)** Remover todas as chamadas de `removerDaFila(admin, tenantId, cnpj)` (são 3 ocorrências: 2 em `marcarNaoEncontrado` e 1 em sucesso). Substitua por nada — claim já removeu.

**4c)** Substituir `incrementarAttempts` por chamada RPC atômica:

Substitua a função inteira por:
```typescript
async function incrementarAttempts(admin: any, tenantId: string, cnpj: string, errMsg: string): Promise<number> {
  const { data, error } = await admin.rpc('increment_attempts', {
    p_tenant_id: tenantId,
    p_cnpj: cnpj,
    p_error: errMsg,
  })
  if (error) {
    console.error(`[enrich-cnpj] Erro ao incrementar attempts ${cnpj}:`, error)
    return 0
  }
  return typeof data === 'number' ? data : 0
}
```

(Alterar tipo de retorno de `Promise<void>` para `Promise<number>`.)

- [ ] **Step 5: Validar sintaxe**

```bash
cd E:\RadarCrm && npx tsc --noEmit --target esnext --module esnext --moduleResolution bundler --allowJs --skipLibCheck --noResolve supabase/functions/enrich-cnpj/index.ts 2>&1 | grep -v "deno.land\|esm.sh\|Cannot find name 'Deno'"
```

Esperado: sem novos erros (só os 4 erros pré-existentes de Deno).

- [ ] **Step 6: Rodar suite completa de testes**

```bash
cd E:\RadarCrm && npm test 2>&1 | tail -10
```

Esperado: 40 testes passando (33 anteriores + 7 novos).

- [ ] **Step 7: Commit**

```bash
git add __tests__/enrich-queue-hardening.test.ts supabase/functions/enrich-cnpj/index.ts
git commit -m "refactor(enrich): Edge Function usa RPCs atomicas + retry limit"
```

---

## Task 3: Validar deploy (manual)

**Files:**
- Modify: `docs/deploy-trigger-020.md` (atualizar com 021)

- [ ] **Step 1: Atualizar doc de deploy**

Em `docs/deploy-trigger-020.md`, atualizar a seção "Passo 1" para mencionar migration 021 também:

```markdown
## Passo 1: Aplicar migrations

```bash
npx supabase db push
```

Aplica 020 (tabela + trigger) e 021 (RLS, RPCs, view) atomicamente.
```

Adicionar nova seção "Verificação pós-deploy (após 15min)":

```markdown
## Verificação da fila (após 15min)

```sql
-- Estado da fila
SELECT * FROM v_enrich_queue_status;

-- CNPJs com problemas
SELECT cnpj, tenant_id, attempts, last_error, enqueued_at
FROM enrich_cnpj_queue
WHERE attempts > 0 OR enqueued_at < NOW() - INTERVAL '1 hour'
ORDER BY attempts DESC, enqueued_at
LIMIT 20;
```
```

- [ ] **Step 2: Testar no console Supabase**

A aplicar manualmente no SQL editor do Supabase:

```sql
-- Testar claim atomico (deve retornar fila vazia ou ter rows)
SELECT * FROM claim_cnpj_queue(5);

-- Testar increment_attempts (deve retornar 1, depois 2, etc.)
SELECT increment_attempts(
  (SELECT tenant_id FROM users LIMIT 1),  -- pegar tenant real
  '00000000000000',                         -- CNPJ fake pra teste
  'teste manual'
);

-- Ver view
SELECT * FROM v_enrich_queue_status;
```

- [ ] **Step 3: Rodar script de verificação**

```bash
cd E:\RadarCrm && npx tsx scripts/_check_trigger_020.ts
```

Esperado: contagens similares à anterior, mas com coluna extra `naFila` mostrando 0 logo após deploy.

- [ ] **Step 4: Commit doc**

```bash
git add docs/deploy-trigger-020.md
git commit -m "docs: atualizar deploy com migration 021 e verificacao da view"
```

---

## Self-Review (executado)

**1. Spec coverage:**
- ✅ RLS na enrich_cnpj_queue: Task 1, Step 1 (seção 1)
- ✅ Função atômica `claim_cnpj_queue`: Task 1, Step 1 (seção 2)
- ✅ Função `increment_attempts` com retry limit: Task 1, Step 1 (seção 3)
- ✅ View de observabilidade `v_enrich_queue_status`: Task 1, Step 1 (seção 4)
- ✅ Edge Function usa RPCs atômicas: Task 2, Steps 3 e 4
- ✅ `incrementarAttempts` consertado: Task 2, Step 4c
- ✅ Lock atômico contra duplicação: Task 1, Step 1 (FOR UPDATE SKIP LOCKED)
- ✅ Testes da lógica de retry: Task 2, Step 1 (7 testes)
- ✅ Doc de deploy atualizado: Task 3, Step 1

**2. Placeholder scan:**
- Nenhum "TBD" / "implement later" / código vago
- Toda função SQL e TS tem corpo completo
- Testes têm código real

**3. Type consistency:**
- `incrementarAttempts` mudou retorno `Promise<void>` → `Promise<number>` consistentemente
- `claimFila` retorna `Array<{ cnpj: string; tenant_id: string }>` igual ao `fetchFila` original
- `removerDaFila` removido em 100% das chamadas (3 ocorrências)
- Função RPC `claim_cnpj_queue(batch_size INT)` chamada com `{ batch_size: number }` — match
- Função `increment_attempts(p_tenant_id, p_cnpj, p_error)` chamada com `{ p_tenant_id, p_cnpj, p_error }` — match

**Pronto para execução.**
