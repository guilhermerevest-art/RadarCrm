-- =============================================================================
-- MIGRATION 018: Enriquecimento de CNPJ + S처cios + Vínculo obra->lead
-- Multi-tenant: todas as tabelas com tenant_id
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. crm_leads: adicionar obra_id (FK -> radar_obras.id)
--    Permite reusar crm_leads.status como "status do lead da obra"
--    ao inves de criar radar_obras_leads_status separado
-- ---------------------------------------------------------------------------
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS obra_id UUID REFERENCES radar_obras(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_obra_id ON crm_leads(obra_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_obra ON crm_leads(tenant_id, obra_id);

COMMENT ON COLUMN crm_leads.obra_id IS
  'Obra que originou este lead (quando origem=radar). ON DELETE SET NULL preserva historico.';

-- ---------------------------------------------------------------------------
-- 2. radar_obras_empresas
--    PK composta (tenant_id, cnpj) - cada tenant tem sua propria empresa enriquecida
--    fonte_enriquecimento = 'brasilapi' | 'publica.cnpj.ws' | 'nao_encontrado'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS radar_obras_empresas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cnpj                  TEXT NOT NULL,
  cnpj_basico           TEXT NOT NULL,
  razao_social          TEXT,
  nome_fantasia         TEXT,
  situacao_cadastral    TEXT,
  natureza_juridica     TEXT,
  cnae_principal        TEXT,
  porte                 TEXT,
  capital_social        NUMERIC(14,2),
  data_abertura         DATE,
  logradouro            TEXT,
  numero                TEXT,
  bairro                TEXT,
  municipio             TEXT,
  uf                    TEXT,
  cep                   TEXT,
  telefone              TEXT,
  email                 TEXT,
  fonte_enriquecimento  TEXT NOT NULL
                        CHECK (fonte_enriquecimento IN ('brasilapi','publica.cnpj.ws','nao_encontrado')),
  last_enriched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT radar_obras_empresas_cnpj_len CHECK (char_length(cnpj) = 14),
  CONSTRAINT radar_obras_empresas_tenant_cnpj_unique UNIQUE (tenant_id, cnpj)
);

CREATE INDEX IF NOT EXISTS idx_radar_obras_empresas_tenant ON radar_obras_empresas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_radar_obras_empresas_cnpj_basico ON radar_obras_empresas(cnpj_basico);
CREATE INDEX IF NOT EXISTS idx_radar_obras_empresas_situacao ON radar_obras_empresas(tenant_id, situacao_cadastral);

DROP TRIGGER IF EXISTS tr_updated_at_radar_obras_empresas ON radar_obras_empresas;
CREATE TRIGGER tr_updated_at_radar_obras_empresas BEFORE UPDATE ON radar_obras_empresas
  FOR EACH ROW EXECUTE FUNCTION updated_at();

-- ---------------------------------------------------------------------------
-- 3. radar_obras_socios  (QSA - Quadro de Socios e Administradores)
--    FK composta -> radar_obras_empresas(tenant_id, cnpj)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS radar_obras_socios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cnpj_empresa  TEXT NOT NULL,
  nome          TEXT NOT NULL,
  qualificacao  TEXT,
  data_entrada  DATE,
  faixa_etaria  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT radar_obras_socios_emp_fk
    FOREIGN KEY (tenant_id, cnpj_empresa)
    REFERENCES radar_obras_empresas(tenant_id, cnpj)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_radar_obras_socios_empresa ON radar_obras_socios(tenant_id, cnpj_empresa);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE radar_obras_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_obras_socios   ENABLE ROW LEVEL SECURITY;

-- radar_obras_empresas: SELECT autenticado (filtrado por tenant), ALL service_role
DROP POLICY IF EXISTS radar_obras_empresas_select ON radar_obras_empresas;
CREATE POLICY radar_obras_empresas_select ON radar_obras_empresas
  FOR SELECT TO authenticated USING (
    tenant_id = get_my_tenant_id()
  );

DROP POLICY IF EXISTS radar_obras_empresas_service_all ON radar_obras_empresas;
CREATE POLICY radar_obras_empresas_service_all ON radar_obras_empresas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- radar_obras_socios: SELECT autenticado (filtrado), ALL service_role
DROP POLICY IF EXISTS radar_obras_socios_select ON radar_obras_socios;
CREATE POLICY radar_obras_socios_select ON radar_obras_socios
  FOR SELECT TO authenticated USING (
    tenant_id = get_my_tenant_id()
  );

DROP POLICY IF EXISTS radar_obras_socios_service_all ON radar_obras_socios;
CREATE POLICY radar_obras_socios_service_all ON radar_obras_socios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Comentarios
-- ---------------------------------------------------------------------------
COMMENT ON TABLE radar_obras_empresas IS
  'Empresas enriquecidas via CNPJ (BrasilAPI/publica.cnpj.ws). PK composta (tenant_id, cnpj) para isolamento multi-tenant.';
COMMENT ON TABLE radar_obras_socios IS
  'Socios (QSA) das empresas enriquecidas. ON DELETE CASCADE remove quando empresa e deletada.';
