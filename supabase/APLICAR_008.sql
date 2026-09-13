-- =============================================================================
-- MIGRATION 008: ETL fontes, jobs, geocoding cache
-- Cole no SQL Editor e rode 1x
-- =============================================================================

-- 1. Tabela radar_fontes_config
CREATE TABLE IF NOT EXISTS radar_fontes_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte TEXT NOT NULL UNIQUE CHECK (fonte IN ('cno','alvara_prefeitura','pncp','semad_mg')),
  nome_exibicao TEXT NOT NULL,
  descricao TEXT,
  enabled BOOLEAN DEFAULT false,
  frequencia_cron TEXT DEFAULT '0 2 * * *',
  ultima_execucao TIMESTAMPTZ,
  total_registros_importados INTEGER DEFAULT 0,
  ultima_execucao_erro TEXT,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE radar_fontes_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fontes_admin_read" ON radar_fontes_config
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND papel = 'admin')
  );

CREATE POLICY "fontes_admin_write" ON radar_fontes_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND papel = 'admin')
  );

-- 2. Tabela radar_ingestao_jobs
CREATE TABLE IF NOT EXISTS radar_ingestao_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rodando' CHECK (status IN ('rodando','sucesso','erro','cancelado')),
  registros_lidos INTEGER DEFAULT 0,
  registros_inseridos INTEGER DEFAULT 0,
  registros_atualizados INTEGER DEFAULT 0,
  registros_duplicados INTEGER DEFAULT 0,
  registros_erro INTEGER DEFAULT 0,
  erro_detalhe TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE radar_ingestao_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_admin_read" ON radar_ingestao_jobs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND papel = 'admin')
  );

CREATE POLICY "jobs_admin_insert" ON radar_ingestao_jobs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Tabela geocoding_cache
CREATE TABLE IF NOT EXISTS geocoding_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endereco_hash TEXT NOT NULL UNIQUE,
  endereco_original TEXT NOT NULL,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  precisao TEXT CHECK (precisao IN ('rooftop','intersection','street','county','unknown')),
  provider TEXT NOT NULL CHECK (provider IN ('mapbox','google','nominatim','cache')),
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days')
);

CREATE INDEX IF NOT EXISTS idx_geocoding_hash ON geocoding_cache(endereco_hash);
CREATE INDEX IF NOT EXISTS idx_geocoding_expires ON geocoding_cache(expires_at);

ALTER TABLE geocoding_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "geocoding_read_all" ON geocoding_cache
  FOR SELECT USING (true);

-- 4. Funcao fn_geocoding_resolver
CREATE OR REPLACE FUNCTION fn_geocoding_resolver(endereco TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_hash TEXT;
  v_mapbox_key TEXT;
  v_response JSONB;
BEGIN
  v_hash := encode(sha256(endereco::bytea), 'hex');

  SELECT jsonb_build_object(
    'lat', lat, 'lng', lng, 'precisao', precisao, 'provider', 'cache'
  ) INTO v_result
  FROM geocoding_cache
  WHERE endereco_hash = v_hash AND expires_at > NOW();

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  BEGIN
    v_mapbox_key := current_setting('app.mapbox_key', true);
    IF v_mapbox_key IS NOT NULL AND v_mapbox_key != '' THEN
      SELECT content::jsonb INTO v_response
      FROM http_get(
        'https://api.mapbox.com/geocoding/v5/mapbox.places/' ||
        urlencode(endereco) || '.json?access_token=' || v_mapbox_key || '&country=br&limit=1'
      ) AS req
      WHERE req.status = 200;

      IF v_response->'features'->0->'center' IS NOT NULL THEN
        SELECT jsonb_build_object(
          'lat', (v_response->'features'->0->'center'->>1)::numeric,
          'lng', (v_response->'features'->0->'center'->>0)::numeric,
          'precisao', 'street',
          'provider', 'mapbox'
        ) INTO v_result;

        INSERT INTO geocoding_cache (endereco_hash, endereco_original, lat, lng, precisao, provider)
        VALUES (v_hash, endereco, v_result->>'lat', v_result->>'lng', v_result->>'precisao', 'mapbox')
        ON CONFLICT (endereco_hash) DO NOTHING;

        RETURN v_result;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Mapbox failed: %', SQLERRM;
  END;

  BEGIN
    SELECT content::jsonb INTO v_response
    FROM http_get(
      'https://nominatim.openstreetmap.org/search?q=' ||
      urlencode(endereco) || '&format=json&countrycodes=br&limit=1&addressdetails=1'
    ) AS req
    WHERE req.status = 200;

    IF v_response->0->>'lat' IS NOT NULL THEN
      SELECT jsonb_build_object(
        'lat', (v_response->0->>'lat')::numeric,
        'lng', (v_response->0->>'lon')::numeric,
        'precisao', COALESCE(v_response->0->>'type', 'unknown'),
        'provider', 'nominatim'
      ) INTO v_result;

      INSERT INTO geocoding_cache (endereco_hash, endereco_original, lat, lng, precisao, provider)
      VALUES (v_hash, endereco, v_result->>'lat', v_result->>'lng', v_result->>'precisao', 'nominatim')
      ON CONFLICT (endereco_hash) DO NOTHING;

      RETURN v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Nominatim failed: %', SQLERRM;
  END;

  RETURN jsonb_build_object('error', 'geocoding_failed', 'endereco', endereco);
END;
$$;

COMMENT ON FUNCTION fn_geocoding_resolver IS
  'Resolve endereco para lat/lng. Cache > Mapbox > Nominatim. Pre-req: http extension.';

-- 5. Funcao fn_radar_obras_no_raio
CREATE OR REPLACE FUNCTION fn_radar_obras_no_raio(
  p_lat NUMERIC,
  p_lng NUMERIC,
  p_raio_km INTEGER DEFAULT 50,
  p_fase TEXT DEFAULT NULL,
  p_porte TEXT DEFAULT NULL,
  p_cidade TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 500,
  p_tenant UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  endereco_logradouro TEXT,
  endereco_numero TEXT,
  endereco_bairro TEXT,
  endereco_cidade TEXT,
  endereco_uf CHAR(2),
  lat NUMERIC,
  lng NUMERIC,
  fase_atual TEXT,
  porte TEXT,
  valor_estimado NUMERIC,
  distancia_km NUMERIC,
  qualidade_score INTEGER,
  total_marcacoes INTEGER,
  fase_consolidada TEXT,
  fonte TEXT,
  obra_global_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.endereco_logradouro,
    o.endereco_numero,
    o.endereco_bairro,
    o.endereco_cidade,
    o.endereco_uf,
    o.lat,
    o.lng,
    COALESCE(g.fase_consolidada, o.fase_atual) AS fase_atual,
    o.porte,
    o.valor_estimado,
    ROUND(
      (6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(p_lat)) * cos(radians(o.lat)) *
          cos(radians(o.lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(o.lat))
        ))
      ))::numeric, 2
    )::numeric AS distancia_km,
    o.qualidade_score,
    COALESCE(g.total_marcacoes, 0)::INTEGER AS total_marcacoes,
    g.fase_consolidada,
    o.fonte,
    o.obra_global_id
  FROM radar_obras o
  LEFT JOIN radar_obras_globais g ON g.id = o.obra_global_id
  WHERE o.geo IS NOT NULL
    AND ST_DWithin(
      o.geo,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_raio_km * 1000
    )
    AND (p_tenant IS NULL OR o.tenant_id = p_tenant)
    AND (p_fase IS NULL OR COALESCE(g.fase_consolidada, o.fase_atual) = p_fase)
    AND (p_porte IS NULL OR o.porte = p_porte)
    AND (p_cidade IS NULL OR o.endereco_cidade ILIKE '%' || p_cidade || '%')
  ORDER BY distancia_km ASC
  LIMIT p_limit;
END;
$$;

-- 6. Funcao fn_ingestao_cno_processar
CREATE OR REPLACE FUNCTION fn_ingestao_cno_processar(
  p_raw_data JSONB,
  p_job_id UUID DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_inserted INTEGER := 0;
  v_skipped INTEGER := 0;
  v_errors INTEGER := 0;
  v_global_id UUID;
  v_hash TEXT;
  v_endereco TEXT;
  v_item JSONB;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_raw_data)
  LOOP
    BEGIN
      v_processed := v_processed + 1;
      v_endereco := COALESCE(v_item->>'endereco', '') || ' ' ||
                    COALESCE(v_item->>'municipio', '') || ' ' ||
                    COALESCE(v_item->>'uf', 'MG');

      v_hash := encode(sha256(v_endereco::bytea), 'hex');

      INSERT INTO radar_obras_globais (
        hash_deduplicacao, endereco_logradouro, endereco_cidade, endereco_uf,
        lat, lng, fase_macro_consolidada, total_marcacoes
      ) VALUES (
        v_hash,
        COALESCE(v_item->>'endereco', 'S/N'),
        COALESCE(v_item->>'municipio', 'UBERLANDIA'),
        COALESCE(v_item->>'uf', 'MG'),
        CASE WHEN (v_item->>'latitude') IS NOT NULL THEN (v_item->>'latitude')::numeric ELSE NULL END,
        CASE WHEN (v_item->>'longitude') IS NOT NULL THEN (v_item->>'longitude')::numeric ELSE NULL END,
        'nao_iniciou',
        0
      )
      ON CONFLICT (hash_deduplicacao) DO UPDATE SET updated_at = NOW()
      RETURNING id INTO v_global_id;

      IF p_tenant_id IS NOT NULL THEN
        INSERT INTO radar_obras (
          tenant_id, obra_global_id, fonte, fonte_id,
          endereco_logradouro, endereco_cidade, endereco_uf,
          lat, lng, fase_atual, porte, status
        ) VALUES (
          p_tenant_id, v_global_id, 'cno', v_item->>'cno',
          COALESCE(v_item->>'endereco', 'S/N'),
          COALESCE(v_item->>'municipio', 'UBERLANDIA'),
          COALESCE(v_item->>'uf', 'MG'),
          (SELECT lat FROM radar_obras_globais WHERE id = v_global_id),
          (SELECT lng FROM radar_obras_globais WHERE id = v_global_id),
          'nao_iniciou',
          COALESCE(v_item->>'porte', 'medio'),
          'ativa'
        )
        ON CONFLICT (tenant_id, hash_deduplicacao) DO NOTHING;
      END IF;

      v_inserted := v_inserted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  IF p_job_id IS NOT NULL THEN
    UPDATE radar_ingestao_jobs SET
      registros_lidos = v_processed,
      registros_inseridos = v_inserted,
      registros_duplicados = v_skipped,
      registros_erro = v_errors,
      status = CASE WHEN v_errors > 0 AND v_errors >= v_processed THEN 'erro' ELSE 'sucesso' END,
      finished_at = NOW()
    WHERE id = p_job_id;

    UPDATE radar_fontes_config SET
      total_registros_importados = total_registros_importados + v_inserted,
      ultima_execucao = NOW()
    WHERE fonte = 'cno';
  END IF;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'errors', v_errors
  );
END;
$$;

-- 7. Seed das fontes config
INSERT INTO radar_fontes_config (fonte, nome_exibicao, descricao, enabled, frequencia_cron, config) VALUES
  ('cno', 'CNO - Cadastro Nacional de Obras', 'Receita Federal - cadastros mensais de obras em todo Brasil', false, '0 2 * * *',
   '{"url": "https://dados.gov.br/dataset/cno", "formato": "csv", "fonte_nome": "Receita Federal"}'),
  ('alvara_prefeitura', 'Alvaras de Construcao', 'Portais de transparencia das prefeituras', false, '0 3 * * *',
   '{"cidades": ["Uberlandia", "Uberaba"], "formato": "html_scraping"}'),
  ('pncp', 'PNCP - Contratacoes Publicas', 'Portal Nacional de Contratacoes Publicas', false, '0 4 * * *',
   '{"url": "https://pncp.gov.br/api/1/", "formato": "json"}'),
  ('semad_mg', 'SEMAD MG', 'Licenciamento ambiental Minas Gerais', false, '0 5 * * 1',
   '{"url": "https://meioambiente.mg.gov.br", "formato": "html_scraping"}')
ON CONFLICT (fonte) DO NOTHING;

-- =============================================================================
-- FIM DA MIGRATION 008
-- =============================================================================
