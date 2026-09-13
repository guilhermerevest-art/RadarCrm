-- =============================================================================
-- Migration: 018_enriquecimento_leads
-- Adiciona campos de enriquecimento para qualification de leads
-- =============================================================================

-- =============================================================================
-- NOVOS CAMPOS NA TABELA LEADS
-- =============================================================================

-- Score de risco baseado em processos judiciais (TJMG)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS score_risco INTEGER DEFAULT 0
  CHECK (score_risco >= 0 AND score_risco <= 100);

COMMENT ON COLUMN leads.score_risco IS 'Score 0-100 baseado em processos judiciais (TJMG)';

-- Score de regularidade fiscal (INSS/PGFN)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS score_regularidade INTEGER DEFAULT 100
  CHECK (score_regularidade >= 0 AND score_regularidade <= 100);

COMMENT ON COLUMN leads.score_regularidade IS 'Score 0-100 de regularidade fiscal';

-- Nível de risco fiscal
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS nivel_risco_fiscal VARCHAR(20) DEFAULT 'baixo'
  CHECK (nivel_risco_fiscal IN ('baixo', 'medio', 'alto'));

COMMENT ON COLUMN leads.nivel_risco_fiscal IS 'Nivel de risco fiscal baseado em certidoes';

-- =============================================================================
-- NOVA TABELA: empresas (dados enriquecidos)
-- =============================================================================

CREATE TABLE IF NOT EXISTS empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj VARCHAR(14) UNIQUE NOT NULL,
  razao_social VARCHAR(255),
  nome_fantasia VARCHAR(255),
  situacao VARCHAR(50),
  data_inicio DATE,
  natureza_juridica VARCHAR(100),
  porte VARCHAR(20),
  municipio VARCHAR(100),
  uf CHAR(2),
  cep VARCHAR(10),
  logradouro VARCHAR(255),
  atividade_principal TEXT,
  segmentos TEXT[], -- array de segmentos
  capital_social NUMERIC(15,2),
  socios INTEGER DEFAULT 0,
  telefone VARCHAR(20),
  email VARCHAR(255),
  score_risco INTEGER DEFAULT 0,
  score_regularidade INTEGER DEFAULT 100,
  nivel_risco_fiscal VARCHAR(20) DEFAULT 'baixo',
  regularidade_fiscal JSONB, -- certidoes INSS/PGFN
  dados_tjmg JSONB, -- processos judiciais
  dados_receita JSONB, -- dados da receita
  fonte VARCHAR(50), -- ultima fonte que atualizou
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS para empresas
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view empresas of their tenant"
  ON empresas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users
      WHERE tenant_users.user_id = auth.uid()
      AND tenant_users.tenant_id = empresas.tenant_id
    )
  );

-- Index para busca por CNPJ
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON empresas(cnpj);
CREATE INDEX IF NOT EXISTS idx_empresas_uf ON empresas(uf);
CREATE INDEX IF NOT EXISTS idx_empresas_score_risco ON empresas(score_risco);
CREATE INDEX IF NOT EXISTS idx_empresas_score_regularidade ON empresas(score_regularidade);

-- =============================================================================
-- VIEW: leads_qualificados
-- =============================================================================

CREATE OR REPLACE VIEW vw_leads_qualificados AS
SELECT
  l.id,
  l.tenant_id,
  l.nome,
  l.empresa,
  l.email,
  l.telefone,
  l.origem,
  l.status,
  l.score_risco,
  l.score_regularidade,
  l.nivel_risco_fiscal,
  -- Score combinado de qualification (maior = melhor lead)
  CASE
    WHEN l.score_risco IS NULL AND l.score_regularidade IS NULL THEN 50
    WHEN l.score_risco IS NULL THEN l.score_regularidade
    WHEN l.score_regularidade IS NULL THEN 100 - COALESCE(l.score_risco, 0)
    ELSE GREATEST(0, 100 - COALESCE(l.score_risco, 0)) + (COALESCE(l.score_regularidade, 100) / 2) - 50
  END AS score_qualification,
  -- Tags de alerta
  CASE WHEN l.score_risco > 50 THEN 'ALTO_RISCO_JUDICIAL' ELSE NULL END AS alerta_risco,
  CASE WHEN l.nivel_risco_fiscal = 'alto' THEN 'IRREGULAR_FISCAL' ELSE NULL END AS alerta_fiscal,
  l.dados_adicionais,
  l.created_at,
  l.updated_at
FROM leads l
WHERE l.tenant_id IS NOT NULL;

-- =============================================================================
-- FUNÇÃO: atualizar_score_lead
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_atualizar_score_lead(
  p_lead_id UUID,
  p_score_risco INTEGER DEFAULT NULL,
  p_score_regularidade INTEGER DEFAULT NULL,
  p_nivel_risco VARCHAR(20) DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE leads SET
    score_risco = COALESCE(p_score_risco, score_risco),
    score_regularidade = COALESCE(p_score_regularidade, score_regularidade),
    nivel_risco_fiscal = COALESCE(p_nivel_risco, nivel_risco_fiscal),
    updated_at = NOW()
  WHERE id = p_lead_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- SEED: Configuração de fontes de enriquecimento
-- =============================================================================

INSERT INTO radar_fontes_config (nome, url_base, headers, tipo, habilitada, created_at)
VALUES
  ('tjmg', 'https://www.tjmg.jus.br/api/v1', '{}', 'enriquecimento', true, NOW()),
  ('receita_federal', 'https://receitaws.com.br/v1', '{"User-Agent": "RadarCRM"}', 'enriquecimento', true, NOW()),
  ('inss', 'https://api.conomicas.ap.gov.br', '{}', 'enriquecimento', true, NOW()),
  ('pgfpn', 'https://api.conomicas.ap.gov.br/pgfn', '{}', 'enriquecimento', true, NOW())
ON CONFLICT (nome) DO NOTHING;

-- =============================================================================
-- LOGGER
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 018_enriquecimento_leads aplicada com sucesso';
  RAISE NOTICE 'Novos campos: score_risco, score_regularidade, nivel_risco_fiscal';
  RAISE NOTICE 'Nova tabela: empresas';
  RAISE NOTICE 'Nova view: vw_leads_qualificados';
END $$;
