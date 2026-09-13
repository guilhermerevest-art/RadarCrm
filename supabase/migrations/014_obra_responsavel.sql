-- Migration 014: Adiciona colunas do responsável/proprietário da obra
-- CNO já fornece Nome do responsável, NI do responsável (CPF/CNPJ) e Qualificação
-- Mantemos top-level para permitir filtros e joins no futuro (ex: "todas as obras do CPF X")
-- As cópias no raw_payload ficam para fins de auditoria e dados extras

ALTER TABLE radar_obras
  ADD COLUMN IF NOT EXISTS responsavel_nome TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_documento TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_qualificacao TEXT;

-- Índice para busca por CPF/CNPJ dentro do mesmo tenant
CREATE INDEX IF NOT EXISTS idx_radar_obras_responsavel_doc
  ON radar_obras(tenant_id, responsavel_documento)
  WHERE responsavel_documento IS NOT NULL;

-- Índice para busca por nome (trigram para LIKE sem precisar de extensão extra)
CREATE INDEX IF NOT EXISTS idx_radar_obras_responsavel_nome
  ON radar_obras USING GIN (responsavel_nome gin_trgm_ops)
  WHERE responsavel_nome IS NOT NULL;

COMMENT ON COLUMN radar_obras.responsavel_nome IS 'Nome do responsável/proprietário (vem da fonte CNO coluna Nome)';
COMMENT ON COLUMN radar_obras.responsavel_documento IS 'CPF ou CNPJ do responsável, apenas dígitos (vem da fonte CNO coluna NI do responsável)';
COMMENT ON COLUMN radar_obras.responsavel_qualificacao IS 'Tipo do responsável: Pessoa Física, Pessoa Jurídica, MEI etc. (vem da fonte CNO)';

-- =============================================================================
-- Adiciona coluna documento no CRM Leads para carregar o CPF/CNPJ do radar
-- =============================================================================
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS documento TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_documento
  ON crm_leads(tenant_id, documento)
  WHERE documento IS NOT NULL;

COMMENT ON COLUMN crm_leads.documento IS 'CPF ou CNPJ do lead, apenas dígitos';

