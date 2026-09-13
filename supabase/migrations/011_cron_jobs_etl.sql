-- =============================================================================
-- MIGRATION 011: Cron Jobs para ETL (pg_cron)
-- Agendamento automatico das fontes de ingestcao
-- =============================================================================

-- Habilitar extensao pg_cron (Supabase ja inclui por padrao)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Habilitar conexao via SSL para webhooks externos
-- Agendar: todo dia as 02:00 - CNO (fonte principal, mais confiavel)
SELECT cron.schedule(
  'etl-cno-diario',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.etl_webhook_url', true) || '/functions/v1/etl-job-run',
    body := ('{"fonte":"cno"}')::jsonb,
    headers := '{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.anon_service_key', true) || '"}'::jsonb
  );
  $$
);

-- Agendar: todo dia as 03:00 - Alvará Prefeitura
SELECT cron.schedule(
  'etl-alvara-diario',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.etl_webhook_url', true) || '/functions/v1/etl-job-run',
    body := ('{"fonte":"alvara_prefeitura"}')::jsonb,
    headers := '{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.anon_service_key', true) || '"}'::jsonb
  );
  $$
);

-- Agendar: todo dia as 04:00 - PNCP
SELECT cron.schedule(
  'etl-pncp-diario',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.etl_webhook_url', true) || '/functions/v1/etl-job-run',
    body := ('{"fonte":"pncp"}')::jsonb,
    headers := '{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.anon_service_key', true) || '"}'::jsonb
  );
  $$
);

-- Agendar: toda segunda as 05:00 - SEMAD MG (licenciamento, menos frequente)
SELECT cron.schedule(
  'etl-semad-semanal',
  '0 5 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.etl_webhook_url', true) || '/functions/v1/etl-job-run',
    body := ('{"fonte":"semad_mg"}')::jsonb,
    headers := '{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.anon_service_key', true) || '"}'::jsonb
  );
  $$
);

-- Agendar: todo dia as 01:00 - Limpar cache de geocoding expirado
SELECT cron.schedule(
  'geocoding-cleanup-diario',
  '0 1 * * *',
  $$
  DELETE FROM geocoding_cache WHERE expires_at < NOW();
  $$
);

-- Agendar: a cada 15 min - geocode-batch para obras sem lat/lng
SELECT cron.schedule(
  'geocode-batch-a-cada-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.etl_webhook_url', true) || '/functions/v1/geocode-batch',
    body := ('{}')::jsonb,
    headers := '{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.anon_service_key', true) || '"}'::jsonb
  );
  $$
);

-- Function helper para mostrar jobs agendados
DROP FUNCTION IF EXISTS get_cron_jobs();
CREATE OR REPLACE FUNCTION get_cron_jobs()
RETURNS TABLE(
  jobname TEXT,
  schedule TEXT,
  command TEXT,
  active BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    j.jobname::text,
    j.schedule::text,
    j.command::text,
    j.active
  FROM cron.job j
  ORDER BY j.jobname;
$$;

COMMENT ON FUNCTION get_cron_jobs IS
  'Lista todos os jobs cron agendados. Requer extensao pg_cron ativa no Supabase.';

-- =============================================================================
-- FIM DA MIGRATION 011
-- =============================================================================
