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
