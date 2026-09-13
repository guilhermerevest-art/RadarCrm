-- =============================================================================
-- MIGRATION 013: Radar Jobs Config + reschedule ETL cron jobs
-- Substitui o uso de current_setting('app.*') (que o Supabase bloqueia)
-- por uma tabela de configuracao consultada pelos jobs.
-- =============================================================================

-- 0. Limpar policies anteriores
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'radar_jobs_config'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 1. Tabela de configuracao consumida pelos cron jobs
CREATE TABLE IF NOT EXISTS radar_jobs_config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE radar_jobs_config ENABLE ROW LEVEL SECURITY;

-- Somente admins do tenant leem (e superusers via service_role)
CREATE POLICY "radar_jobs_config_admin_read" ON radar_jobs_config
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND papel = 'admin')
  );

-- INSERT/UPDATE/DELETE: somente service_role (sem policy = sem permissao via JWT)
-- O Dashboard do Supabase faz isso via service_role quando voce gerencia via UI;
-- tambem pode ser feito via SQL Editor (que roda como service_role).

-- 2. Seed com valores padrao (caso ainda nao exista)
INSERT INTO radar_jobs_config (chave, valor) VALUES
  ('etl_webhook_url',     'https://anfczaxpxjlucpwjfsfw.supabase.co'),
  ('anon_service_key',    '__TROQUE_PELA_SERVICE_ROLE_KEY__'),
  ('mapbox_key',          ''),
  ('geocode_provider',    'mapbox'),
  ('etl_batch_size',      '500'),
  ('etl_timeout_seconds', '300')
ON CONFLICT (chave) DO NOTHING;

-- Atualiza timestamp sempre que o valor muda
CREATE OR REPLACE FUNCTION fn_radar_jobs_config_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_radar_jobs_config_touch ON radar_jobs_config;
CREATE TRIGGER tr_radar_jobs_config_touch
  BEFORE UPDATE ON radar_jobs_config
  FOR EACH ROW EXECUTE FUNCTION fn_radar_jobs_config_touch();

-- 3. Funcao helper: pega valor de config (com fallback para current_setting)
--    Mantem retrocompatibilidade caso o usuario tenha setado via Dashboard.
CREATE OR REPLACE FUNCTION fn_radar_jobs_config(p_chave TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valor TEXT;
BEGIN
  -- 1) tenta ler da tabela
  SELECT valor INTO v_valor
  FROM radar_jobs_config
  WHERE chave = p_chave;

  IF v_valor IS NOT NULL AND v_valor != '' AND v_valor NOT LIKE '\\_\\_TROQUE%' THEN
    RETURN v_valor;
  END IF;

  -- 2) fallback: current_setting (caso o usuario tenha conseguido setar via Dashboard)
  BEGIN
    v_valor := current_setting('app.' || p_chave, true);
    IF v_valor IS NOT NULL AND v_valor != '' THEN
      RETURN v_valor;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION fn_radar_jobs_config IS
  'Le config dos cron jobs. Prioridade: tabela radar_jobs_config > current_setting(app.*).';

-- 4. Remover jobs ETL antigos (que usam current_setting)
SELECT cron.unschedule('etl-cno-diario')          WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'etl-cno-diario');
SELECT cron.unschedule('etl-alvara-diario')      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'etl-alvara-diario');
SELECT cron.unschedule('etl-pncp-diario')        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'etl-pncp-diario');
SELECT cron.unschedule('etl-semad-semanal')      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'etl-semad-semanal');
SELECT cron.unschedule('geocode-batch-a-cada-15min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'geocode-batch-a-cada-15min');

-- 5. Reagendar usando fn_radar_jobs_config (SQL seguro, sem string concat dinamica)
SELECT cron.schedule(
  'etl-cno-diario',
  '0 2 * * *',
  $job$
  SELECT net.http_post(
    url    := fn_radar_jobs_config('etl_webhook_url') || '/functions/v1/etl-job-run',
    body   := '{"fonte":"cno"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || fn_radar_jobs_config('anon_service_key')
    )::jsonb
  );
  $job$
);

SELECT cron.schedule(
  'etl-alvara-diario',
  '0 3 * * *',
  $job$
  SELECT net.http_post(
    url    := fn_radar_jobs_config('etl_webhook_url') || '/functions/v1/etl-job-run',
    body   := '{"fonte":"alvara_prefeitura"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || fn_radar_jobs_config('anon_service_key')
    )::jsonb
  );
  $job$
);

SELECT cron.schedule(
  'etl-pncp-diario',
  '0 4 * * *',
  $job$
  SELECT net.http_post(
    url    := fn_radar_jobs_config('etl_webhook_url') || '/functions/v1/etl-job-run',
    body   := '{"fonte":"pncp"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || fn_radar_jobs_config('anon_service_key')
    )::jsonb
  );
  $job$
);

SELECT cron.schedule(
  'etl-semad-semanal',
  '0 5 * * 1',
  $job$
  SELECT net.http_post(
    url    := fn_radar_jobs_config('etl_webhook_url') || '/functions/v1/etl-job-run',
    body   := '{"fonte":"semad_mg"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || fn_radar_jobs_config('anon_service_key')
    )::jsonb
  );
  $job$
);

SELECT cron.schedule(
  'geocode-batch-a-cada-15min',
  '*/15 * * * *',
  $job$
  SELECT net.http_post(
    url    := fn_radar_jobs_config('etl_webhook_url') || '/functions/v1/geocode-batch',
    body   := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || fn_radar_jobs_config('anon_service_key')
    )::jsonb
  );
  $job$
);

-- 6. Funcao utilitaria para listar config (via service_role)
CREATE OR REPLACE FUNCTION get_radar_jobs_config(omitir_sensiveis BOOLEAN DEFAULT true)
RETURNS TABLE(chave TEXT, valor TEXT, updated_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    chave,
    CASE WHEN omitir_sensiveis AND chave = 'anon_service_key'
         THEN '***' || RIGHT(valor, 6)
         ELSE valor END AS valor,
    updated_at
  FROM radar_jobs_config
  ORDER BY chave;
$$;

COMMENT ON FUNCTION get_radar_jobs_config IS
  'Lista config dos jobs. Por padrao mascara a service_role key (mostra so os 6 ultimos chars).';

-- =============================================================================
-- FIM DA MIGRATION 013
-- =============================================================================
