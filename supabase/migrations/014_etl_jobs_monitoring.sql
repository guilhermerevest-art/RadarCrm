-- =============================================================================
-- MIGRATION 014: Monitoramento de Jobs ETL e alertas
-- =============================================================================

-- Tabela para logs de última execução de cada fonte
CREATE TABLE IF NOT EXISTS etl_jobs_last_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte TEXT NOT NULL UNIQUE CHECK (fonte IN ('cno','alvara_prefeitura','pncp','semad_mg')),
  ultima_execucao TIMESTAMPTZ NOT NULL,
  proxima_execucao TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'desconhecido' CHECK (status IN ('sucesso','erro','nunca_rodou','em_andamento','desconhecido')),
  registros_importados INTEGER DEFAULT 0,
  duracao_segundos INTEGER,
  erro_mensagem TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_etl_jobs_last_run_fonte ON etl_jobs_last_run(fonte);
CREATE INDEX IF NOT EXISTS idx_etl_jobs_last_run_status ON etl_jobs_last_run(status);
CREATE INDEX IF NOT EXISTS idx_etl_jobs_last_run_proxima ON etl_jobs_last_run(proxima_execucao);

-- RLS
ALTER TABLE etl_jobs_last_run ENABLE ROW LEVEL SECURITY;

CREATE POLICY "etl_jobs_read_all" ON etl_jobs_last_run
  FOR SELECT USING (true);

CREATE POLICY "etl_jobs_update_service" ON etl_jobs_last_run
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Função para atualizar status do job
CREATE OR REPLACE FUNCTION fn_etl_job_update_status(
  p_fonte TEXT,
  p_status TEXT,
  p_registros INTEGER DEFAULT 0,
  p_duracao INTEGER DEFAULT NULL,
  p_erro TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE etl_jobs_last_run SET
    ultima_execucao = NOW(),
    status = p_status,
    registros_importados = p_registros,
    duracao_segundos = p_duracao,
    erro_mensagem = p_erro,
    updated_at = NOW()
  WHERE fonte = p_fonte;

  IF NOT FOUND THEN
    INSERT INTO etl_jobs_last_run (
      fonte, ultima_execucao, status, registros_importados, duracao_segundos, erro_mensagem
    ) VALUES (
      p_fonte, NOW(), p_status, p_registros, p_duracao, p_erro
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION fn_etl_job_update_status IS
  'Atualiza status do job ETL. Chamado pelos scripts ETL após cada execução.';

-- Função para verificar jobs atrasados (> 24h)
CREATE OR REPLACE FUNCTION fn_etl_jobs_atrasados()
RETURNS TABLE(
  fonte TEXT,
  ultima_execucao TIMESTAMPTZ,
  horas_atraso INTEGER,
  status TEXT,
  erro_mensagem TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.fonte,
    j.ultima_execucao,
    EXTRACT(EPOCH FROM (NOW() - j.ultima_execucao)) / 3600 AS horas_atraso,
    j.status,
    j.erro_mensagem
  FROM etl_jobs_last_run j
  WHERE
    j.status != 'em_andamento'
    AND (
      j.ultima_execucao < NOW() - INTERVAL '24 hours'
      OR j.ultima_execucao IS NULL
    );
END;
$$;

COMMENT ON FUNCTION fn_etl_jobs_atrasados IS
  'Retorna jobs ETL atrasados há mais de 24 horas ou nunca executados.';

-- View para dashboard de monitoramento
CREATE OR REPLACE VIEW vw_etl_jobs_status AS
SELECT
  j.fonte,
  f.nome_exibicao,
  f.enabled,
  j.status,
  j.ultima_execucao,
  j.registros_importados,
  j.duracao_segundos,
  j.erro_mensagem,
  CASE
    WHEN j.status = 'em_andamento' THEN 'Em andamento'
    WHEN j.ultima_execucao IS NULL THEN 'Nunca executou'
    WHEN j.status = 'erro' THEN 'Erro na última execução'
    WHEN j.ultima_execucao < NOW() - INTERVAL '24 hours' THEN 'Atrasado (> 24h)'
    WHEN j.ultima_execucao < NOW() - INTERVAL '1 hour' THEN 'Atrasado (> 1h)'
    ELSE 'OK'
  END AS alerta_status,
  CASE
    WHEN j.ultima_execucao IS NULL THEN 999
    ELSE EXTRACT(EPOCH FROM (NOW() - j.ultima_execucao)) / 3600
  END AS horas_desde_ultima_execucao
FROM etl_jobs_last_run j
JOIN radar_fontes_config f ON f.fonte = j.fonte;

COMMENT ON VIEW vw_etl_jobs_status IS
  'View para monitoramento de status dos jobs ETL.';

-- Seed dos jobs iniciais
INSERT INTO etl_jobs_last_run (fonte, status, ultima_execucao) VALUES
  ('cno', 'nunca_rodou', NULL),
  ('alvara_prefeitura', 'nunca_rodou', NULL),
  ('pncp', 'nunca_rodou', NULL),
  ('semad_mg', 'nunca_rodou', NULL)
ON CONFLICT (fonte) DO NOTHING;

-- =============================================================================
-- FIM DA MIGRATION 014
-- =============================================================================
