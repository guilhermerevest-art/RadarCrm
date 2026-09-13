-- =============================================================================
-- MIGRATION 019: Cron job para enriquecimento de CNPJ
-- Executa Edge Function enrich-cnpj as 02:30 todos os dias (apos ETL CNO das 02:00)
-- =============================================================================

SELECT cron.schedule(
  'enrich-cnpj-diario',
  '30 2 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.etl_webhook_url', true) || '/functions/v1/enrich-cnpj',
    body := jsonb_build_object('limit', 200),
    headers := '{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.anon_service_key', true) || '"}'::jsonb
  );
  $$
);

-- Funcao helper para monitorar enriquecimento
DROP FUNCTION IF EXISTS get_enrich_cnpj_stats();
CREATE OR REPLACE FUNCTION get_enrich_cnpj_stats()
RETURNS TABLE(
  total_empresas BIGINT,
  enriquecidos_brasilapi BIGINT,
  enriquecidos_publica BIGINT,
  nao_encontrados BIGINT,
  pendentes_estimado BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH obras_cnpj AS (
    SELECT COUNT(*)::BIGINT AS total
    FROM radar_obras
    WHERE responsavel_documento IS NOT NULL
      AND char_length(regexp_replace(responsavel_documento, '\D', '', 'g')) = 14
      AND status = 'ativa'
  ),
  enriquecido AS (
    SELECT
      COUNT(*)::BIGINT AS total,
      COUNT(*) FILTER (WHERE fonte_enriquecimento = 'brasilapi')::BIGINT AS fb,
      COUNT(*) FILTER (WHERE fonte_enriquecimento = 'publica.cnpj.ws')::BIGINT AS fp,
      COUNT(*) FILTER (WHERE fonte_enriquecimento = 'nao_encontrado')::BIGINT AS ne
    FROM radar_obras_empresas
  )
  SELECT
    (SELECT total FROM enriquecido),
    (SELECT fb FROM enriquecido),
    (SELECT fp FROM enriquecido),
    (SELECT ne FROM enriquecido),
    GREATEST((SELECT total FROM obras_cnpj) - (SELECT total FROM enriquecido), 0)
  ;
$$;

COMMENT ON FUNCTION get_enrich_cnpj_stats IS
  'Estatisticas do enriquecimento de CNPJ. Use para monitorar pendentes vs enriquecidos.';
