-- =============================================================================
-- SISTEMA DE MARCAÇÕES DE FASE (estilo Waze)
-- Cada usuário marca a fase de uma obra, outros confirmam, ganha pontos
-- A obra "global" é compartilhada entre todos os tenants da plataforma
-- =============================================================================

-- 1. Catálogo de badges
CREATE TABLE IF NOT EXISTS radar_badges (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL,
  icone TEXT NOT NULL,
  criterio_pontos INTEGER NOT NULL,
  criterio_confirmacoes INTEGER NOT NULL DEFAULT 0
);

INSERT INTO radar_badges (id, nome, descricao, icone, criterio_pontos, criterio_confirmacoes) VALUES
  ('primeira_marcacao', 'Primeira Marcação', 'Você fez sua primeira marcação de fase', '🎯', 0, 0),
  ('colaborador', 'Colaborador', '10 pontos conquistados', '🟢', 10, 0),
  ('observador_ativo', 'Observador Ativo', '50 confirmações feitas por você', '👁️', 0, 50),
  ('especialista', 'Especialista', '50 pontos conquistados', '🏆', 50, 0),
  ('validador_100', 'Validador', '100 confirmações recebidas nas suas marcações', '⭐', 0, 100),
  ('lenda', 'Lenda do Radar', '200 pontos conquistados', '👑', 200, 0)
ON CONFLICT (id) DO NOTHING;

-- 2. Pontuação por usuário (gamificação)
CREATE TABLE IF NOT EXISTS radar_user_pontuacao (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pontos INTEGER NOT NULL DEFAULT 0,
  marcacoes_criadas INTEGER NOT NULL DEFAULT 0,
  confirmacoes_feitas INTEGER NOT NULL DEFAULT 0,
  marcacoes_confirmadas INTEGER NOT NULL DEFAULT 0,
  badges TEXT[] NOT NULL DEFAULT '{}',
  nivel TEXT NOT NULL DEFAULT 'observador' CHECK (nivel IN ('observador','colaborador','especialista','validador','lenda')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE radar_user_pontuacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pontuação própria" ON radar_user_pontuacao
  FOR SELECT USING (user_id = auth.uid());

-- 3. Obra canônica global (compartilhada entre tenants)
CREATE TABLE IF NOT EXISTS radar_obras_globais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hash_deduplicacao TEXT UNIQUE NOT NULL,
  endereco_logradouro TEXT NOT NULL,
  endereco_numero TEXT,
  endereco_bairro TEXT,
  endereco_cidade TEXT NOT NULL,
  endereco_uf CHAR(2) NOT NULL DEFAULT 'MG',
  endereco_cep TEXT,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  geo GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
    THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ELSE NULL END
  ) STORED,
  -- Fase consolidada pela comunidade (a mais confirmada vence)
  fase_consolidada TEXT,
  fase_macro_consolidada TEXT,
  total_marcacoes INTEGER NOT NULL DEFAULT 0,
  total_confirmacoes INTEGER NOT NULL DEFAULT 0,
  ultima_atividade_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obras_globais_geo ON radar_obras_globais USING GIST(geo);
CREATE INDEX IF NOT EXISTS idx_obras_globais_cidade ON radar_obras_globais(endereco_cidade);
CREATE INDEX IF NOT EXISTS idx_obras_globais_uf ON radar_obras_globais(endereco_uf);

ALTER TABLE radar_obras_globais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura global obras" ON radar_obras_globais
  FOR SELECT USING (true);

-- 4. Adicionar referência em radar_obras para vincular à obra global
ALTER TABLE radar_obras
  ADD COLUMN IF NOT EXISTS obra_global_id UUID REFERENCES radar_obras_globais(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_obras_global ON radar_obras(obra_global_id);

-- 5. Marcações (cada uma é uma "afirmação" de fase criada por um usuário)
CREATE TABLE IF NOT EXISTS radar_obra_marcacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_global_id UUID NOT NULL REFERENCES radar_obras_globais(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fase TEXT NOT NULL,
  fase_macro TEXT NOT NULL CHECK (fase_macro IN (
    'alvara','fundacao','estrutura','acabamento','concluida','paralisada','nao_iniciou'
  )),
  nota TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marcacoes_obra ON radar_obra_marcacoes(obra_global_id);
CREATE INDEX IF NOT EXISTS idx_marcacoes_user ON radar_obra_marcacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_marcacoes_tenant ON radar_obra_marcacoes(tenant_id);

ALTER TABLE radar_obra_marcacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Marcações visíveis para todos autenticados" ON radar_obra_marcacoes
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Usuário cria próprias marcações" ON radar_obra_marcacoes
  FOR INSERT WITH CHECK (user_id = auth.uid() AND tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  ));
CREATE POLICY "Usuário deleta próprias marcações" ON radar_obra_marcacoes
  FOR DELETE USING (user_id = auth.uid());

-- 6. Confirmações (cada usuário confirma 1x cada marcação - UNIQUE)
CREATE TABLE IF NOT EXISTS radar_obra_confirmacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marcacao_id UUID NOT NULL REFERENCES radar_obra_marcacoes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marcacao_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_confirmacoes_marcacao ON radar_obra_confirmacoes(marcacao_id);
CREATE INDEX IF NOT EXISTS idx_confirmacoes_user ON radar_obra_confirmacoes(user_id);

ALTER TABLE radar_obra_confirmacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Confirmações visíveis para todos" ON radar_obra_confirmacoes
  FOR SELECT USING (true);
CREATE POLICY "Usuário cria próprias confirmações" ON radar_obra_confirmacoes
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Usuário deleta próprias confirmações" ON radar_obra_confirmacoes
  FOR DELETE USING (user_id = auth.uid());

-- =============================================================================
-- FUNCTIONS E TRIGGERS
-- =============================================================================

-- Função: recalcular fase consolidada da obra global
-- A fase com mais confirmações vence. Desempate: mais recente.
CREATE OR REPLACE FUNCTION recalcular_fase_consolidada()
RETURNS TRIGGER AS $$
DECLARE
  v_obra_id UUID;
  v_fase TEXT;
  v_macro TEXT;
  v_total_marc INTEGER;
  v_total_conf INTEGER;
BEGIN
  v_obra_id := COALESCE(NEW.obra_global_id, OLD.obra_global_id);
  IF v_obra_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      SELECT obra_global_id INTO v_obra_id FROM radar_obra_marcacoes WHERE id = OLD.marcacao_id;
    ELSE
      RETURN NEW;
    END IF;
  END IF;
  IF v_obra_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Encontrar a fase com mais confirmações
  SELECT
    m.fase,
    m.fase_macro,
    COUNT(DISTINCT m.id) AS total_marc,
    COUNT(c.id) AS total_conf
  INTO v_fase, v_macro, v_total_marc, v_total_conf
  FROM radar_obra_marcacoes m
  LEFT JOIN radar_obra_confirmacoes c ON c.marcacao_id = m.id
  WHERE m.obra_global_id = v_obra_id
  GROUP BY m.fase, m.fase_macro
  ORDER BY COUNT(c.id) DESC, MAX(m.created_at) DESC
  LIMIT 1;

  UPDATE radar_obras_globais
  SET
    fase_consolidada = v_fase,
    fase_macro_consolidada = v_macro,
    total_marcacoes = COALESCE(v_total_marc, 0),
    total_confirmacoes = COALESCE(v_total_conf, 0),
    ultima_atividade_em = NOW(),
    updated_at = NOW()
  WHERE id = v_obra_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_recalcular_fase_marcacao ON radar_obra_marcacoes;
CREATE TRIGGER tr_recalcular_fase_marcacao
  AFTER INSERT ON radar_obra_marcacoes
  FOR EACH ROW EXECUTE FUNCTION recalcular_fase_consolidada();

DROP TRIGGER IF EXISTS tr_recalcular_fase_confirmacao ON radar_obra_confirmacoes;
CREATE TRIGGER tr_recalcular_fase_confirmacao
  AFTER INSERT OR DELETE ON radar_obra_confirmacoes
  FOR EACH ROW EXECUTE FUNCTION recalcular_fase_consolidada();

-- Função: criar/atualizar pontuação do usuário
CREATE OR REPLACE FUNCTION upsert_pontuacao(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_pontos INTEGER;
  v_marc_criadas INTEGER;
  v_conf_feitas INTEGER;
  v_conf_recebidas INTEGER;
  v_nivel TEXT;
  v_badges TEXT[] := '{}';
BEGIN
  -- Calcular pontos: +1 por cada confirmação recebida nas suas marcações
  SELECT COUNT(*) INTO v_conf_recebidas
  FROM radar_obra_confirmacoes c
  JOIN radar_obra_marcacoes m ON m.id = c.marcacao_id
  WHERE m.user_id = p_user_id;

  SELECT COUNT(*) INTO v_marc_criadas
  FROM radar_obra_marcacoes
  WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_conf_feitas
  FROM radar_obra_confirmacoes
  WHERE user_id = p_user_id;

  v_pontos := v_conf_recebidas; -- 1 ponto por confirmação recebida

  -- Definir nível
  IF v_pontos >= 200 THEN
    v_nivel := 'lenda';
  ELSIF v_pontos >= 50 THEN
    v_nivel := 'especialista';
  ELSIF v_pontos >= 10 THEN
    v_nivel := 'colaborador';
  ELSE
    v_nivel := 'observador';
  END IF;

  -- Calcular badges
  IF v_marc_criadas >= 1 THEN v_badges := array_append(v_badges, 'primeira_marcacao'); END IF;
  IF v_pontos >= 10 THEN v_badges := array_append(v_badges, 'colaborador'); END IF;
  IF v_pontos >= 50 THEN v_badges := array_append(v_badges, 'especialista'); END IF;
  IF v_pontos >= 200 THEN v_badges := array_append(v_badges, 'lenda'); END IF;
  IF v_conf_feitas >= 50 THEN v_badges := array_append(v_badges, 'observador_ativo'); END IF;
  IF v_conf_recebidas >= 100 THEN v_badges := array_append(v_badges, 'validador_100'); END IF;

  INSERT INTO radar_user_pontuacao (user_id, pontos, marcacoes_criadas, confirmacoes_feitas, marcacoes_confirmadas, badges, nivel, updated_at)
  VALUES (p_user_id, v_pontos, v_marc_criadas, v_conf_feitas, v_conf_recebidas, v_badges, v_nivel, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    pontos = EXCLUDED.pontos,
    marcacoes_criadas = EXCLUDED.marcacoes_criadas,
    confirmacoes_feitas = EXCLUDED.confirmacoes_feitas,
    marcacoes_confirmadas = EXCLUDED.marcacoes_confirmadas,
    badges = EXCLUDED.badges,
    nivel = EXCLUDED.nivel,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: após criar marcação, atualizar pontuação do criador
CREATE OR REPLACE FUNCTION tr_apos_criar_marcacao()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM upsert_pontuacao(NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_pontuacao_criacao ON radar_obra_marcacoes;
CREATE TRIGGER tr_pontuacao_criacao
  AFTER INSERT ON radar_obra_marcacoes
  FOR EACH ROW EXECUTE FUNCTION tr_apos_criar_marcacao();

-- Trigger: após criar/deletar confirmação, atualizar pontuação do criador da marcação E do confirmador
CREATE OR REPLACE FUNCTION tr_apos_confirmacao()
RETURNS TRIGGER AS $$
DECLARE
  v_criador_id UUID;
BEGIN
  -- Pegar criador da marcação
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_criador_id FROM radar_obra_marcacoes WHERE id = OLD.marcacao_id;
  ELSE
    SELECT user_id INTO v_criador_id FROM radar_obra_marcacoes WHERE id = NEW.marcacao_id;
  END IF;

  -- Atualizar pontuação de ambos
  PERFORM upsert_pontuacao(v_criador_id);
  IF TG_OP = 'INSERT' THEN
    PERFORM upsert_pontuacao(NEW.user_id);
  ELSE
    PERFORM upsert_pontuacao(OLD.user_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_pontuacao_confirmacao ON radar_obra_confirmacoes;
CREATE TRIGGER tr_pontuacao_confirmacao
  AFTER INSERT OR DELETE ON radar_obra_confirmacoes
  FOR EACH ROW EXECUTE FUNCTION tr_apos_confirmacao();

-- Função helper: buscar ou criar obra global
CREATE OR REPLACE FUNCTION get_or_create_obra_global(
  p_hash TEXT,
  p_logradouro TEXT,
  p_numero TEXT,
  p_bairro TEXT,
  p_cidade TEXT,
  p_uf TEXT,
  p_cep TEXT,
  p_lat NUMERIC,
  p_lng NUMERIC
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_hash IS NOT NULL THEN
    SELECT id INTO v_id FROM radar_obras_globais WHERE hash_deduplicacao = p_hash;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO radar_obras_globais (hash_deduplicacao, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep, lat, lng)
    VALUES (p_hash, p_logradouro, p_numero, p_bairro, p_cidade, p_uf, p_cep, p_lat, p_lng)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
