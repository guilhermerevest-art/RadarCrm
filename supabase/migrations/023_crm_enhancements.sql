-- =============================================================================
-- MIGRATION 023: Enhancements de CRM (tags, templates, import, motivo perda)
-- =============================================================================

-- 0) Garantir colunas em crm_deals (motivo_perda ja existe, adicionar observacao + data)
ALTER TABLE crm_deals
  ADD COLUMN IF NOT EXISTS observacao_perda TEXT,
  ADD COLUMN IF NOT EXISTS data_fechamento TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_deals_motivo_perda ON crm_deals (tenant_id, motivo_perda);

-- 1) Tags em crm_leads
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_crm_leads_tags ON crm_leads USING GIN (tags);

-- 2) Templates de mensagem (WhatsApp)
CREATE TABLE IF NOT EXISTS crm_templates_mensagem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 80),
  conteudo TEXT NOT NULL CHECK (char_length(conteudo) BETWEEN 1 AND 2000),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_crm_templates_tenant ON crm_templates_mensagem (tenant_id, ativo);

COMMENT ON TABLE crm_templates_mensagem IS
  'Templates de mensagem WhatsApp. Suporta variaveis: {nome}, {empresa}, {obra}, {telefone}, {cidade}.';

ALTER TABLE crm_templates_mensagem ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rtm_select ON crm_templates_mensagem;
CREATE POLICY rtm_select ON crm_templates_mensagem FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rtm_insert ON crm_templates_mensagem;
CREATE POLICY rtm_insert ON crm_templates_mensagem FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rtm_update ON crm_templates_mensagem;
CREATE POLICY rtm_update ON crm_templates_mensagem FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rtm_delete ON crm_templates_mensagem;
CREATE POLICY rtm_delete ON crm_templates_mensagem FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rtm_service_all ON crm_templates_mensagem;
CREATE POLICY rtm_service_all ON crm_templates_mensagem FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3) Log de importacoes
CREATE TABLE IF NOT EXISTS crm_importacoes_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  total_linhas INTEGER NOT NULL,
  sucessos INTEGER NOT NULL DEFAULT 0,
  duplicados INTEGER NOT NULL DEFAULT 0,
  erros INTEGER NOT NULL DEFAULT 0,
  erros_detalhe JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_crm_importacoes_tenant ON crm_importacoes_log (tenant_id, created_at DESC);

ALTER TABLE crm_importacoes_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ril_select ON crm_importacoes_log;
CREATE POLICY ril_select ON crm_importacoes_log FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS ril_insert ON crm_importacoes_log;
CREATE POLICY ril_insert ON crm_importacoes_log FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS ril_service_all ON crm_importacoes_log;
CREATE POLICY ril_service_all ON crm_importacoes_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);
