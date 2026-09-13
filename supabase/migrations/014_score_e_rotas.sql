-- =============================================================================
-- EPICO 7: Score de Oportunidade e Rota do Dia
-- =============================================================================
-- Tarefas:
-- E7-T1: Tabela radar_obras_score (PK composta obra_id + segmento)
-- E7-T2: Funcao fn_radar_obras_calcular_score(obra, segmento)
-- E7-T3: Trigger que recalcula score ao mudar fase/porte/localizacao
-- E7-T6: Tabela radar_rotas com obra_ids[], distancia, tempo
-- E7-T7: Funcao fn_radar_rota_montar(tenant, user, data, max)
-- =============================================================================

-- =============================================================================
-- 1. TABELA radar_obras_score
-- Armazena score calculado por obra + tenant + segmento
-- =============================================================================
CREATE TABLE IF NOT EXISTS radar_obras_score (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES radar_obras(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  segmento TEXT NOT NULL,  -- 'concreto', 'locacao', 'material', etc.
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  -- Detalhamento dos componentes do score
  score_fase INTEGER NOT NULL DEFAULT 0,          -- peso 40
  score_proximidade INTEGER NOT NULL DEFAULT 0,    -- peso 20
  score_porte INTEGER NOT NULL DEFAULT 0,           -- peso 15
  score_valor INTEGER NOT NULL DEFAULT 0,           -- peso 15
  score_segmento INTEGER NOT NULL DEFAULT 0,        -- peso 10
  -- Pesos usados no calculo (para auditoria)
  peso_fase INTEGER NOT NULL DEFAULT 40,
  peso_proximidade INTEGER NOT NULL DEFAULT 20,
  peso_porte INTEGER NOT NULL DEFAULT 15,
  peso_valor INTEGER NOT NULL DEFAULT 15,
  peso_segmento INTEGER NOT NULL DEFAULT 10,
  -- Metadata
  calculado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(obra_id, tenant_id, segmento)
);

-- Indices para busca rapida
CREATE INDEX IF NOT EXISTS idx_score_obra ON radar_obras_score(obra_id);
CREATE INDEX IF NOT EXISTS idx_score_tenant_segmento ON radar_obras_score(tenant_id, segmento);
CREATE INDEX IF NOT EXISTS idx_score_valor ON radar_obras_score(tenant_id, score DESC);

-- =============================================================================
-- 2. FUNCAO fn_radar_obras_calcular_score
-- Calcula score 0-100 combinando: fase, proximidade, porte, valor, segmento
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_radar_obras_calcular_score(
  p_obra_id UUID,
  p_segmento TEXT,
  p_tenant_centro_lat NUMERIC DEFAULT NULL,
  p_tenant_centro_lng NUMERIC DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_obra RECORD;
  v_score_fase INTEGER := 0;
  v_score_proximidade INTEGER := 0;
  v_score_porte INTEGER := 0;
  v_score_valor INTEGER := 0;
  v_score_segmento INTEGER := 0;
  v_score_total INTEGER := 0;
  v_distancia_km NUMERIC := NULL;
  v_valor_max_参考 NUMERIC := 10000000; -- 10M como referencia
  v_resultado JSONB;
BEGIN
  -- Buscar dados da obra
  SELECT * INTO v_obra
  FROM radar_obras
  WHERE id = p_obra_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'Obra não encontrada', 'obra_id', p_obra_id);
  END IF;

  -- 1. SCORE FASE (peso 40)
  -- Fase inicial = mais pontos
  CASE v_obra.fase_atual
    WHEN 'alvara' THEN v_score_fase := 40;
    WHEN 'fundacao' THEN v_score_fase := 30;
    WHEN 'estrutura' THEN v_score_fase := 20;
    WHEN 'acabamento' THEN v_score_fase := 10;
    WHEN 'concluida' THEN v_score_fase := 0;
    ELSE v_score_fase := 15; -- fase nao identificada
  END CASE;

  -- 2. SCORE PROXIMIDADE (peso 20)
  -- Baseado na distancia do centro do tenant
  IF p_tenant_centro_lat IS NOT NULL AND p_tenant_centro_lng IS NOT NULL
     AND v_obra.lat IS NOT NULL AND v_obra.lng IS NOT NULL THEN

    -- Calcular distancia em km usando Haversine
    v_distancia_km := fn_distancia_haversine(
      p_tenant_centro_lat, p_tenant_centro_lng,
      v_obra.lat, v_obra.lng
    );

    -- Score inversamente proporcional a distancia
    -- < 10km = 20pts, 10-25km = 15pts, 25-50km = 10pts, 50-100km = 5pts, >100km = 0pts
    IF v_distancia_km < 10 THEN
      v_score_proximidade := 20;
    ELSIF v_distancia_km < 25 THEN
      v_score_proximidade := 15;
    ELSIF v_distancia_km < 50 THEN
      v_score_proximidade := 10;
    ELSIF v_distancia_km < 100 THEN
      v_score_proximidade := 5;
    ELSE
      v_score_proximidade := 0;
    END IF;
  ELSE
    -- Se nao tem centro, score medio
    v_score_proximidade := 10;
  END IF;

  -- 3. SCORE PORTE (peso 15)
  CASE v_obra.porte
    WHEN 'grande' THEN v_score_porte := 15;
    WHEN 'medio' THEN v_score_porte := 10;
    WHEN 'pequeno' THEN v_score_porte := 5;
    ELSE v_score_porte := 5;
  END CASE;

  -- 4. SCORE VALOR ESTIMADO (peso 15)
  -- Normalizado 0-15 baseado em ranges
  IF v_obra.valor_estimado IS NOT NULL AND v_obra.valor_estimado > 0 THEN
    IF v_obra.valor_estimado >= 5000000 THEN
      v_score_valor := 15; -- > 5M
    ELSIF v_obra.valor_estimado >= 2000000 THEN
      v_score_valor := 12; -- 2M - 5M
    ELSIF v_obra.valor_estimado >= 1000000 THEN
      v_score_valor := 9;  -- 1M - 2M
    ELSIF v_obra.valor_estimado >= 500000 THEN
      v_score_valor := 6;  -- 500k - 1M
    ELSIF v_obra.valor_estimado >= 100000 THEN
      v_score_valor := 3;  -- 100k - 500k
    ELSE
      v_score_valor := 1;  -- < 100k
    END IF;
  ELSE
    v_score_valor := 5; -- valor nao informado = score medio
  END IF;

  -- 5. SCORE SEGMENTO COMPATIVEL (peso 10)
  -- Se segmento_alvo da obra intersecta com segmento solicitado
  IF v_obra.segmento_alvo IS NOT NULL
     AND array_length(v_obra.segmento_alvo, 1) > 0
     AND p_segmento = ANY(v_obra.segmento_alvo) THEN
    v_score_segmento := 10; -- 100% compativel
  ELSIF v_obra.segmento_alvo IS NULL
        OR array_length(v_obra.segmento_alvo, 1) = 0 THEN
    v_score_segmento := 5; -- sem info = 50%
  ELSE
    v_score_segmento := 0; -- nao compativel
  END IF;

  -- SCORE TOTAL
  v_score_total := v_score_fase + v_score_proximidade + v_score_porte + v_score_valor + v_score_segmento;

  -- Garantir que esta entre 0 e 100
  v_score_total := GREATEST(0, LEAST(100, v_score_total));

  -- Retornar resultado detalhado
  v_resultado := jsonb_build_object(
    'obra_id', p_obra_id,
    'segmento', p_segmento,
    'score_total', v_score_total,
    'score_fase', v_score_fase,
    'score_proximidade', v_score_proximidade,
    'score_porte', v_score_porte,
    'score_valor', v_score_valor,
    'score_segmento', v_score_segmento,
    'distancia_km', v_distancia_km,
    'peso_fase', 40,
    'peso_proximidade', 20,
    'peso_porte', 15,
    'peso_valor', 15,
    'peso_segmento', 10
  );

  RETURN v_resultado;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 3. FUNCAO AUXILIAR: distancia Haversine em km
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_distancia_haversine(
  lat1 NUMERIC,
  lng1 NUMERIC,
  lat2 NUMERIC,
  lng2 NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
  R NUMERIC := 6371; -- Raio da Terra em km
  dlat NUMERIC;
  dlng NUMERIC;
  a NUMERIC;
  c NUMERIC;
BEGIN
  dlat := RADIANS(lat2 - lat1);
  dlng := RADIANS(lng2 - lng1);
  a := SIN(dlat/2) * SIN(dlat/2) +
       COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
       SIN(dlng/2) * SIN(dlng/2);
  c := 2 * ATAN2(SQRT(a), SQRT(1-a));
  RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- 4. FUNCAO: calcular e salvar scores para todas obras de um tenant
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_radar_score_calcular_todas_por_segmento(
  p_tenant_id UUID,
  p_segmento TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_tenant RECORD;
  v_centro_lat NUMERIC;
  v_centro_lng NUMERIC;
  v_count INTEGER := 0;
  v_obra_id UUID;
  v_score_data JSONB;
BEGIN
  -- Buscar centro do tenant (primeira localizacao configurada)
  -- Por enquanto usa um ponto fixo; depois pode buscar de tenant_centros
  SELECT
    COALESCE(
      (raw_payload->>'centro_lat')::NUMERIC,
      -18.9186 -- Uberlandia default
    ) AS centro_lat,
    COALESCE(
      (raw_payload->>'centro_lng')::NUMERIC,
      -48.2772
    ) AS centro_lng
  INTO v_tenant
  FROM tenants
  WHERE id = p_tenant_id;

  v_centro_lat := v_tenant.centro_lat;
  v_centro_lng := v_tenant.centro_lng;

  -- Para cada obra ativa do tenant
  FOR v_obra_id IN
    SELECT id FROM radar_obras
    WHERE tenant_id = p_tenant_id
      AND status = 'ativa'
  LOOP
    -- Calcular score
    v_score_data := fn_radar_obras_calcular_score(
      v_obra_id,
      p_segmento,
      v_centro_lat,
      v_centro_lng
    );

    -- Inserir ou atualizar score
    INSERT INTO radar_obras_score (
      obra_id, tenant_id, segmento,
      score, score_fase, score_proximidade, score_porte, score_valor, score_segmento,
      peso_fase, peso_proximidade, peso_porte, peso_valor, peso_segmento,
      calculado_em
    ) VALUES (
      v_obra_id, p_tenant_id, p_segmento,
      v_score_data->>'score_total',
      (v_score_data->>'score_fase')::INTEGER,
      (v_score_data->>'score_proximidade')::INTEGER,
      (v_score_data->>'score_porte')::INTEGER,
      (v_score_data->>'score_valor')::INTEGER,
      (v_score_data->>'score_segmento')::INTEGER,
      40, 20, 15, 15, 10,
      NOW()
    )
    ON CONFLICT (obra_id, tenant_id, segmento) DO UPDATE SET
      score = EXCLUDED.score,
      score_fase = EXCLUDED.score_fase,
      score_proximidade = EXCLUDED.score_proximidade,
      score_porte = EXCLUDED.score_porte,
      score_valor = EXCLUDED.score_valor,
      score_segmento = EXCLUDED.score_segmento,
      calculado_em = NOW();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 5. TRIGGER: recalcular score ao mudar fase/porte/localizacao da obra
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_radar_score_recalcular_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_score_data JSONB;
  v_centro_lat NUMERIC;
  v_centro_lng NUMERIC;
BEGIN
  -- Verificar se algum campo relevante mudou
  IF TG_OP = 'UPDATE' AND (
    OLD.fase_atual IS NOT DISTINCT FROM NEW.fase_atual AND
    OLD.porte IS NOT DISTINCT FROM NEW.porte AND
    OLD.lat IS NOT DISTINCT FROM NEW.lat AND
    OLD.lng IS NOT DISTINCT FROM NEW.lng AND
    OLD.valor_estimado IS NOT DISTINCT FROM NEW.valor_estimado AND
    OLD.segmento_alvo IS NOT DISTINCT FROM NEW.segmento_alvo
  ) THEN
    -- Nenhuma mudanca relevante, apenas atualizar updated_at
    RETURN NEW;
  END IF;

  -- Buscar centro do tenant
  SELECT
    COALESCE((raw_payload->>'centro_lat')::NUMERIC, -18.9186),
    COALESCE((raw_payload->>'centro_lng')::NUMERIC, -48.2772)
  INTO v_centro_lat, v_centro_lng
  FROM tenants
  WHERE id = NEW.tenant_id;

  -- Para cada segmento configurado no tenant, recalcular
  -- Usa os segmentos mais comuns
  IF NEW.segmento_alvo IS NOT NULL AND array_length(NEW.segmento_alvo, 1) > 0 THEN
    FOREACH v_segmento IN ARRAY NEW.segmento_alvo
    LOOP
      v_score_data := fn_radar_obras_calcular_score(
        NEW.id,
        v_segmento,
        v_centro_lat,
        v_centro_lng
      );

      -- Atualizar score se existir, ou inserir
      IF EXISTS (SELECT 1 FROM radar_obras_score WHERE obra_id = NEW.id AND tenant_id = NEW.tenant_id AND segmento = v_segmento) THEN
        UPDATE radar_obras_score SET
          score = (v_score_data->>'score_total')::INTEGER,
          score_fase = (v_score_data->>'score_fase')::INTEGER,
          score_proximidade = (v_score_data->>'score_proximidade')::INTEGER,
          score_porte = (v_score_data->>'score_porte')::INTEGER,
          score_valor = (v_score_data->>'score_valor')::INTEGER,
          score_segmento = (v_score_data->>'score_segmento')::INTEGER,
          calculado_em = NOW()
        WHERE obra_id = NEW.id AND tenant_id = NEW.tenant_id AND segmento = v_segmento;
      ELSE
        INSERT INTO radar_obras_score (
          obra_id, tenant_id, segmento,
          score, score_fase, score_proximidade, score_porte, score_valor, score_segmento,
          peso_fase, peso_proximidade, peso_porte, peso_valor, peso_segmento
        ) VALUES (
          NEW.id, NEW.tenant_id, v_segmento,
          (v_score_data->>'score_total')::INTEGER,
          (v_score_data->>'score_fase')::INTEGER,
          (v_score_data->>'score_proximidade')::INTEGER,
          (v_score_data->>'score_porte')::INTEGER,
          (v_score_data->>'score_valor')::INTEGER,
          (v_score_data->>'score_segmento')::INTEGER,
          40, 20, 15, 15, 10
        );
      END IF;
    END LOOP;
  END IF;

  -- Se a obra nao tem segmento, calcula score generico
  IF NEW.segmento_alvo IS NULL OR array_length(NEW.segmento_alvo, 1) = 0 THEN
    v_score_data := fn_radar_obras_calcular_score(
      NEW.id,
      'geral',
      v_centro_lat,
      v_centro_lng
    );

    INSERT INTO radar_obras_score (
      obra_id, tenant_id, segmento,
      score, score_fase, score_proximidade, score_porte, score_valor, score_segmento,
      peso_fase, peso_proximidade, peso_porte, peso_valor, peso_segmento
    ) VALUES (
      NEW.id, NEW.tenant_id, 'geral',
      (v_score_data->>'score_total')::INTEGER,
      (v_score_data->>'score_fase')::INTEGER,
      (v_score_data->>'score_proximidade')::INTEGER,
      (v_score_data->>'score_porte')::INTEGER,
      (v_score_data->>'score_valor')::INTEGER,
      (v_score_data->>'score_segmento')::INTEGER,
      40, 20, 15, 15, 10
    )
    ON CONFLICT (obra_id, tenant_id, segmento) DO UPDATE SET
      score = EXCLUDED.score,
      score_fase = EXCLUDED.score_fase,
      score_proximidade = EXCLUDED.score_proximidade,
      score_porte = EXCLUDED.score_porte,
      score_valor = EXCLUDED.score_valor,
      score_segmento = EXCLUDED.score_segmento,
      calculado_em = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger na tabela radar_obras
DROP TRIGGER IF EXISTS trg_radar_score_recalcular ON radar_obras;
CREATE TRIGGER trg_radar_score_recalcular
  AFTER INSERT OR UPDATE OF fase_atual, porte, lat, lng, valor_estimado, segmento_alvo
  ON radar_obras
  FOR EACH ROW
  EXECUTE FUNCTION fn_radar_score_recalcular_trigger();

-- =============================================================================
-- 6. RPC: buscar obras ordenadas por score
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_radar_obras_por_score(
  p_tenant_id UUID,
  p_segmento TEXT DEFAULT 'geral',
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0,
  p_fase TEXT DEFAULT NULL,
  p_min_score INTEGER DEFAULT NULL
)
RETURNS TABLE(
  obra_id UUID,
  score INTEGER,
  score_fase INTEGER,
  score_proximidade INTEGER,
  score_porte INTEGER,
  score_valor INTEGER,
  score_segmento INTEGER,
  obra_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.obra_id,
    s.score,
    s.score_fase,
    s.score_proximidade,
    s.score_porte,
    s.score_valor,
    s.score_segmento,
    row_to_json(o)::JSONB as obra_data
  FROM radar_obras_score s
  INNER JOIN radar_obras o ON o.id = s.obra_id
  WHERE s.tenant_id = p_tenant_id
    AND s.segmento = p_segmento
    AND (p_fase IS NULL OR o.fase_atual = p_fase)
    AND (p_min_score IS NULL OR s.score >= p_min_score)
  ORDER BY s.score DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 7. TABELA radar_rotas
-- Armazena rotas otimizadas do dia
-- =============================================================================
CREATE TABLE IF NOT EXISTS radar_rotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  data DATE NOT NULL,
  nome TEXT, -- ex: "Rota Quarta-feira - 15/01"
  obra_ids UUID[] NOT NULL DEFAULT '{}',
  distancia_km NUMERIC(10,2),
  duracao_min INTEGER,
  -- Metadata
  centro_lat NUMERIC(10,7),
  centro_lng NUMERIC(10,7),
  -- Status
  status TEXT NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada', 'em_andamento', 'concluida', 'cancelada')),
  -- Dados da otimizacao
  obra_ordem INTEGER[], -- ordem otimizada das obras
  obra_distancias_km NUMERIC[], -- distancia entre cada par
  obra_tempos_min INTEGER[], -- tempo estimado entre cada par
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(tenant_id, user_id, data)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_rotas_tenant_data ON radar_rotas(tenant_id, data);
CREATE INDEX IF NOT EXISTS idx_rotas_user ON radar_rotas(user_id);

-- =============================================================================
-- 8. TABELA radar_rota_visitas
-- Registra visitas feitas durante uma rota
-- =============================================================================
CREATE TABLE IF NOT EXISTS radar_rota_visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id UUID NOT NULL REFERENCES radar_rotas(id) ON DELETE CASCADE,
  obra_id UUID NOT NULL REFERENCES radar_obras(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ordem INTEGER NOT NULL, -- posicao na rota
  -- Geolocalizacao do check-in
  checkin_lat NUMERIC(10,7),
  checkin_lng NUMERIC(10,7),
  checkin_distancia_m NUMERIC, -- distancia do local da obra em metros
  -- Timing
  chegada_hora TIMESTAMPTZ,
  saida_hora TIMESTAMPTZ,
  duracao_min INTEGER,
  -- Feedback
  observacao TEXT,
  nota_classica TEXT, -- nota 1-5 estrelas
  -- Status
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'visitado', 'pulado', 'nao_encontrado')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_rota_visitas_rota ON radar_rota_visitas(rota_id);
CREATE INDEX IF NOT EXISTS idx_rota_visitas_obra ON radar_rota_visitas(obra_id);
CREATE INDEX IF NOT EXISTS idx_rota_visitas_tenant ON radar_rota_visitas(tenant_id);

-- Trigger updated_at
CREATE TRIGGER tr_updated_at_rota_visitas
  BEFORE UPDATE ON radar_rota_visitas
  FOR EACH ROW EXECUTE FUNCTION updated_at();

-- =============================================================================
-- 9. FUNCAO: fn_radar_rota_montar
-- Monta rota otimizada usando nearest neighbor
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_radar_rota_montar(
  p_tenant_id UUID,
  p_user_id UUID,
  p_data DATE,
  p_max_obras INTEGER DEFAULT 8,
  p_segmento TEXT DEFAULT 'geral',
  p_centro_lat NUMERIC DEFAULT NULL,
  p_centro_lng NUMERIC DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_centro_lat NUMERIC;
  v_centro_lng NUMERIC;
  v_obra_lat NUMERIC;
  v_obra_lng NUMERIC;
  v_obras_Disponiveis JSONB[];
  v_rota_otimizada UUID[];
  v_obra_atual UUID;
  v_proxima_uuid UUID;
  v_distancia_total NUMERIC := 0;
  v_distancia_min NUMERIC;
  v_tempo_estimado_min INTEGER := 0;
  v_distancia_km NUMERIC;
  v_tempo_min INTEGER;
  v_count INTEGER := 0;
  v_resultado JSONB;
  v_nome_rota TEXT;
BEGIN
  -- Se nao passou centro, usar do tenant
  IF p_centro_lat IS NULL OR p_centro_lng IS NULL THEN
    SELECT
      COALESCE((raw_payload->>'centro_lat')::NUMERIC, -18.9186),
      COALESCE((raw_payload->>'centro_lng')::NUMERIC, -48.2772)
    INTO v_centro_lat, v_centro_lng
    FROM tenants
    WHERE id = p_tenant_id;
  ELSE
    v_centro_lat := p_centro_lat;
    v_centro_lng := p_centro_lng;
  END IF;

  -- Buscar obras candidatas (melhores scores ou mais proximas)
  -- Prioriza: score alto E dentro do raio do tenant
  v_obras_Disponiveis := ARRAY(
    SELECT jsonb_build_object(
      'id', o.id,
      'lat', o.lat,
      'lng', o.lng,
      'endereco', o.endereco_logradouro,
      'bairro', o.endereco_bairro,
      'fase', o.fase_atual,
      'score', COALESCE(s.score, 50),
      'distancia_km', fn_distancia_haversine(v_centro_lat, v_centro_lng, o.lat, o.lng)
    )::JSONB
    FROM radar_obras o
    LEFT JOIN radar_obras_score s ON s.obra_id = o.id AND s.segmento = p_segmento
    WHERE o.tenant_id = p_tenant_id
      AND o.status = 'ativa'
      AND o.lat IS NOT NULL
      AND o.lng IS NOT NULL
      AND o.endereco_cidade = (
        SELECT endereco_cidade FROM radar_obras
        WHERE tenant_id = p_tenant_id AND lat IS NOT NULL
        LIMIT 1
      )
    ORDER BY COALESCE(s.score, 50) DESC, fn_distancia_haversine(v_centro_lat, v_centro_lng, o.lat, o.lng) ASC
    LIMIT p_max_obras * 2 -- busca mais para filtrar depois
  );

  -- Algoritmo Nearest Neighbor para otimizar rota
  -- Comeca do centro, vai para a obra mais proxima, repete
  v_rota_otimizada := ARRAY[]::UUID[];
  v_distancia_total := 0;
  v_obra_atual := NULL;

  -- Selecionar primeira obra: a de maior score
  IF array_length(v_obras_Disponiveis, 1) > 0 THEN
    -- Pegar obra com maior score
    SELECT (obra->>'id')::UUID INTO v_obra_atual
    FROM unnest(v_obras_Disponiveis) AS obra
    ORDER BY (obra->>'score')::INTEGER DESC
    LIMIT 1;

    v_rota_otimizada := array_append(v_rota_otimizada, v_obra_atual);

    -- Remove obra selecionada
    v_obras_Disponiveis := ARRAY(
      SELECT x FROM unnest(v_obras_Disponiveis) AS x
      WHERE (x->>'id')::UUID != v_obra_atual
    );

    -- Nearest neighbor: adicionar obras mais proximas
    WHILE array_length(v_obras_Disponiveis, 1) > 0
          AND array_length(v_rota_otimizada, 1) < p_max_obras LOOP

      -- Buscar obra mais proxima da ultima adicionada
      SELECT
        (obra->>'id')::UUID,
        fn_distancia_haversine(
          (SELECT lat FROM radar_obras WHERE id = v_obra_atual),
          (SELECT lng FROM radar_obras WHERE id = v_obra_atual),
          (obra->>'lat')::NUMERIC,
          (obra->>'lng')::NUMERIC
        )
      INTO v_proxima_uuid, v_distancia_km
      FROM unnest(v_obras_Disponiveis) AS obra
      ORDER BY fn_distancia_haversine(
        (SELECT lat FROM radar_obras WHERE id = v_obra_atual),
        (SELECT lng FROM radar_obras WHERE id = v_obra_atual),
        (obra->>'lat')::NUMERIC,
        (obra->>'lng')::NUMERIC
      ) ASC
      LIMIT 1;

      v_rota_otimizada := array_append(v_rota_otimizada, v_proxima_uuid);
      v_distancia_total := v_distancia_total + COALESCE(v_distancia_km, 0);

      -- Tempo estimado: 15 min por obra + 2 min por km
      v_tempo_estimado_min := v_tempo_estimado_min + 15 + COALESCE((v_distancia_km * 2)::INTEGER, 0);

      -- Remove obra selecionada
      v_obras_Disponiveis := ARRAY(
        SELECT x FROM unnest(v_obras_Disponiveis) AS x
        WHERE (x->>'id')::UUID != v_proxima_uuid
      );

      v_obra_atual := v_proxima_uuid;
    END LOOP;
  END IF;

  -- Adicionar distancia do centro ate primeira obra e da ultima ate centro
  IF array_length(v_rota_otimizada, 1) > 0 THEN
    -- Distancia ate primeira obra
    SELECT fn_distancia_haversine(v_centro_lat, v_centro_lng, lat, lng)
    INTO v_distancia_km
    FROM radar_obras WHERE id = v_rota_otimizada[1];
    v_distancia_total := v_distancia_total + COALESCE(v_distancia_km, 0);
    v_tempo_estimado_min := v_tempo_estimado_min + 10 + COALESCE((v_distancia_km * 2)::INTEGER, 0);

    -- Distancia da ultima obra ate centro
    SELECT fn_distancia_haversine(lat, lng, v_centro_lat, v_centro_lng)
    INTO v_distancia_km
    FROM radar_obras WHERE id = v_rota_otimizada[array_length(v_rota_otimizada, 1)];
    v_distancia_total := v_distancia_total + COALESCE(v_distancia_km, 0);
    v_tempo_estimado_min := v_tempo_estimado_min + COALESCE((v_distancia_km * 2)::INTEGER, 0);
  END IF;

  -- Montar nome da rota
  v_nome_rota := 'Rota ' || to_char(p_data, 'Day') || ' - ' || to_char(p_data, 'DD/MM');

  -- Montar resultado
  v_resultado := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'user_id', p_user_id,
    'data', p_data,
    'nome', v_nome_rota,
    'obra_ids', v_rota_otimizada,
    'distancia_km', ROUND(v_distancia_total::NUMERIC, 2),
    'duracao_min', v_tempo_estimado_min,
    'centro_lat', v_centro_lat,
    'centro_lng', v_centro_lng,
    'total_obras', array_length(v_rota_otimizada, 1),
    'segmento', p_segmento
  );

  RETURN v_resultado;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 10. RPC: salvar rota otimizada
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_radar_rota_salvar(
  p_tenant_id UUID,
  p_user_id UUID,
  p_data DATE,
  p_obra_ids UUID[],
  p_distancia_km NUMERIC,
  p_duracao_min INTEGER,
  p_centro_lat NUMERIC,
  p_centro_lng NUMERIC,
  p_nome TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_rota_id UUID;
BEGIN
  INSERT INTO radar_rotas (
    tenant_id, user_id, data, nome,
    obra_ids, distancia_km, duracao_min,
    centro_lat, centro_lng,
    obra_ordem, status
  ) VALUES (
    p_tenant_id, p_user_id, p_data, p_nome,
    p_obra_ids, p_distancia_km, p_duracao_min,
    p_centro_lat, p_centro_lng,
    -- Ordem inicial = sequencial (depois pode otimizar)
    ARRAY(SELECT * FROM unnest(p_obra_ids) WITH ORDINALITY),
    'planejada'
  )
  ON CONFLICT (tenant_id, user_id, data) DO UPDATE SET
    obra_ids = EXCLUDED.obra_ids,
    distancia_km = EXCLUDED.distancia_km,
    duracao_min = EXCLUDED.duracao_min,
    nome = COALESCE(EXCLUDED.nome, radar_rotas.nome),
    centro_lat = EXCLUDED.centro_lat,
    centro_lng = EXCLUDED.centro_lng,
    obra_ordem = EXCLUDED.obra_ordem,
    updated_at = NOW()
  RETURNING id INTO v_rota_id;

  RETURN v_rota_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 11. RPC: buscar rota do dia
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_radar_rota_do_dia(
  p_tenant_id UUID,
  p_user_id UUID,
  p_data DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
  v_rota RECORD;
  v_obras JSONB[];
  v_resultado JSONB;
BEGIN
  SELECT * INTO v_rota
  FROM radar_rotas
  WHERE tenant_id = p_tenant_id
    AND user_id = p_user_id
    AND data = p_data;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('encontrou', false, 'data', p_data);
  END IF;

  -- Buscar dados das obras
  SELECT COALESCE(array_agg(
    jsonb_build_object(
      'id', o.id,
      'endereco', o.endereco_logradouro,
      'numero', o.endereco_numero,
      'bairro', o.endereco_bairro,
      'cidade', o.endereco_cidade,
      'uf', o.endereco_uf,
      'fase', o.fase_atual,
      'porte', o.porte,
      'lat', o.lat,
      'lng', o.lng,
      'valor_estimado', o.valor_estimado,
      'visita_status', v.status,
      'visita_chegada', v.chegada_hora
    )
  ), ARRAY[]::JSONB[])
  INTO v_obras
  FROM unnest(v_rota.obra_ids) WITH ORDINALITY AS uid(obra_id, ordem)
  LEFT JOIN radar_obras o ON o.id = uid.obra_id
  LEFT JOIN radar_rota_visitas v ON v.rota_id = v_rota.id AND v.obra_id = uid.obra_id
  ORDER BY uid.ordem;

  v_resultado := jsonb_build_object(
    'encontrou', true,
    'rota_id', v_rota.id,
    'data', v_rota.data,
    'nome', v_rota.nome,
    'distancia_km', v_rota.distancia_km,
    'duracao_min', v_rota.duracao_min,
    'status', v_rota.status,
    'started_at', v_rota.started_at,
    'obras', v_obras,
    'centro_lat', v_rota.centro_lat,
    'centro_lng', v_rota.centro_lng
  );

  RETURN v_resultado;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 12. RPC: iniciar rota (marca started_at)
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_radar_rota_iniciar(
  p_rota_id UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_rota RECORD;
BEGIN
  UPDATE radar_rotas
  SET status = 'em_andamento',
      started_at = COALESCE(started_at, NOW())
  WHERE id = p_rota_id
    AND user_id = p_user_id
  RETURNING * INTO v_rota;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'Rota não encontrada ou não pertence ao usuário');
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'rota_id', v_rota.id,
    'status', v_rota.status,
    'started_at', v_rota.started_at
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 13. RPC: registrar visita durante rota
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_radar_rota_visitar(
  p_rota_id UUID,
  p_obra_id UUID,
  p_user_id UUID,
  p_lat NUMERIC DEFAULT NULL,
  p_lng NUMERIC DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'visitado'
)
RETURNS JSONB AS $$
DECLARE
  v_tenant_id UUID;
  v_visita_id UUID;
  v_distancia_m NUMERIC := NULL;
  v_obra_lat NUMERIC;
  v_obra_lng NUMERIC;
BEGIN
  -- Buscar tenant da rota
  SELECT tenant_id INTO v_tenant_id
  FROM radar_rotas
  WHERE id = p_rota_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'Rota não encontrada');
  END IF;

  -- Buscar coordenadas da obra
  SELECT lat, lng INTO v_obra_lat, v_obra_lng
  FROM radar_obras
  WHERE id = p_obra_id;

  -- Calcular distancia se tiver coordenadas
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL AND v_obra_lat IS NOT NULL AND v_obra_lng IS NOT NULL THEN
    v_distancia_m := fn_distancia_haversine(p_lat, p_lng, v_obra_lat, v_obra_lng) * 1000;
  END IF;

  -- Inserir ou atualizar visita
  INSERT INTO radar_rota_visitas (
    rota_id, obra_id, tenant_id, user_id,
    checkin_lat, checkin_lng, checkin_distancia_m,
    chegada_hora, observacao, status
  ) VALUES (
    p_rota_id, p_obra_id, v_tenant_id, p_user_id,
    p_lat, p_lng, v_distancia_m,
    NOW(), p_observacao, p_status
  )
  ON CONFLICT (rota_id, obra_id) DO UPDATE SET
    status = EXCLUDED.status,
    chegada_hora = COALESCE(radar_rota_visitas.chegada_hora, NOW()),
    saida_hora = CASE WHEN EXCLUDED.status = 'visitado' THEN NOW() ELSE radar_rota_visitas.saida_hora END,
    observacao = COALESCE(EXCLUDED.observacao, radar_rota_visitas.observacao),
    checkin_lat = COALESCE(EXCLUDED.checkin_lat, radar_rota_visitas.checkin_lat),
    checkin_lng = COALESCE(EXCLUDED.checkin_lng, radar_rota_visitas.checkin_lng),
    checkin_distancia_m = COALESCE(EXCLUDED.checkin_distancia_m, radar_rota_visitas.checkin_distancia_m)
  RETURNING id INTO v_visita_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'visita_id', v_visita_id,
    'distancia_m', v_distancia_m
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 14. RPC: gerar URL do Google Maps com waypoints
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_radar_rota_google_maps_url(
  p_rota_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_rota RECORD;
  v_waypoints TEXT := '';
  v_obra RECORD;
  v_primeira_uuid UUID;
BEGIN
  SELECT * INTO v_rota
  FROM radar_rotas
  WHERE id = p_rota_id;

  IF NOT FOUND OR array_length(v_rota.obra_ids, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  -- Primeira obra = origem
  v_primeira_uuid := v_rota.obra_ids[1];

  -- Construir waypoints (da segunda ate a penultima)
  FOR v_obra IN
    SELECT lat, lng FROM radar_obras
    WHERE id = ANY(v_rota.obra_ids[2:array_length(v_rota.obra_ids, 1) - 1])
      AND lat IS NOT NULL AND lng IS NOT NULL
  LOOP
    IF v_waypoints != '' THEN
      v_waypoints := v_waypoints || '|';
    END IF;
    v_waypoints := v_waypoints || v_obra.lat::TEXT || ',' || v_obra.lng::TEXT;
  END LOOP;

  -- Se tem apenas uma obra, retorna URL simples
  IF array_length(v_rota.obra_ids, 1) = 1 THEN
    SELECT lat, lng INTO v_obra FROM radar_obras WHERE id = v_rota.obra_ids[1];
    IF v_obra.lat IS NOT NULL AND v_obra.lng IS NOT NULL THEN
      RETURN 'https://www.google.com/maps/dir/?api=1&destination=' || v_obra.lat || ',' || v_obra.lng;
    END IF;
  END IF;

  -- URL com waypoints
  RETURN 'https://www.google.com/maps/dir/?api=1' ||
         '&origin=' || v_primeira_uuid ||
         '&destination=' || v_rota.obra_ids[array_length(v_rota.obra_ids, 1)] ||
         CASE WHEN v_waypoints != '' THEN '&waypoints=' || v_waypoints ELSE '' END;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 15. RPC: gerar URL do Waze com waypoints
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_radar_rota_waze_url(
  p_rota_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_rota RECORD;
  v_waypoints TEXT := '';
  v_obra RECORD;
BEGIN
  SELECT * INTO v_rota
  FROM radar_rotas
  WHERE id = p_rota_id;

  IF NOT FOUND OR array_length(v_rota.obra_ids, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  -- Primeira obra
  SELECT lat, lng INTO v_obra FROM radar_obras WHERE id = v_rota.obra_ids[1];
  IF v_obra.lat IS NULL THEN
    RETURN NULL;
  END IF;

  -- Waze suporta apenas uma forma simples de waypoints via URL
  -- navigate?ll=lat,lng&q=name
  RETURN 'https://waze.com/ul?navigate=yes' ||
         '&ll=' || v_obra.lat || ',' || v_obra.lng ||
         '&q=' || encode(replace(v_obra.lat::TEXT || ',' || v_obra.lng::TEXT, ' ', '%20'), 'hex');
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 16. RLS para novas tabelas
-- =============================================================================
ALTER TABLE radar_obras_score ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_rotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_rota_visitas ENABLE ROW LEVEL SECURITY;

-- radar_obras_score: usuarios do tenant veem todos
CREATE POLICY "Score do tenant" ON radar_obras_score
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

-- radar_rotas: usuarios veem apenas suas rotas
CREATE POLICY "Rotas do usuario" ON radar_rotas
  FOR ALL USING (
    (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()))
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- radar_rota_visitas: usuarios do tenant veem
CREATE POLICY "Visitas do tenant" ON radar_rota_visitas
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

-- =============================================================================
-- 17. Trigger updated_at para radar_rotas
-- =============================================================================
CREATE TRIGGER tr_updated_at_rotas
  BEFORE UPDATE ON radar_rotas
  FOR EACH ROW EXECUTE FUNCTION updated_at();

-- =============================================================================
-- FIM: EPICO 7 MIGRATION
-- =============================================================================
