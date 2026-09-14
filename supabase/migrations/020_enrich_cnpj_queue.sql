-- =============================================================================
-- MIGRATION 020: Trigger de enriquecimento automatico de CNPJ
-- Enriquece obras novas em minutos, nao no dia seguinte.
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

-- 2) Funcao do trigger
CREATE OR REPLACE FUNCTION fn_enqueue_cnpj_on_obra_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cnpj TEXT;
BEGIN
  -- Extrair CNPJ (14 digitos, ignora mascara)
  v_cnpj := regexp_replace(COALESCE(NEW.responsavel_documento, ''), '\D', '', 'g');

  -- Filtros: so CNPJ valido, so obra ativa
  IF length(v_cnpj) <> 14 THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'ativa' THEN
    RETURN NEW;
  END IF;

  -- Ja enriquecido (qualquer fonte != nao_encontrado)? Nao enfileira.
  IF EXISTS (
    SELECT 1 FROM radar_obras_empresas e
    WHERE e.tenant_id = NEW.tenant_id
      AND e.cnpj = v_cnpj
      AND e.fonte_enriquecimento IS DISTINCT FROM 'nao_encontrado'
  ) THEN
    RETURN NEW;
  END IF;

  -- Ja marcado como nao encontrado? Nao tenta de novo.
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

-- 4) Cron para drenar a fila a cada 15min (offset 7min para nao conflitar com ETL CNO 02:00 e enrich legado 02:30)
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
