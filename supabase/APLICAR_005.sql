-- =============================================================================
-- BLOCO ÚNICO: Aplica migration 005 + cria função exec_sql para futuras
-- Cole TUDO no SQL Editor do Supabase e clique RUN (uma vez)
-- =============================================================================

-- Helper para executar migrations via JS no futuro
CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- MIGRATION 005: Fase padrão = NULL (não identificada)
-- =============================================================================

-- 1. Tirar default 'alvara' de radar_obras.fase_atual
ALTER TABLE radar_obras
  ALTER COLUMN fase_atual DROP DEFAULT;

ALTER TABLE radar_obras
  ALTER COLUMN fase_atual DROP NOT NULL;

-- 2. Colunas novas: controle de importação para CRM
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'radar_obras'
      AND column_name = 'importada_crm_em'
  ) THEN
    ALTER TABLE radar_obras
      ADD COLUMN importada_crm_em TIMESTAMPTZ,
      ADD COLUMN importada_crm_por UUID REFERENCES auth.users(id),
      ADD COLUMN lead_id UUID REFERENCES crm_leads(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_obras_importada_crm
  ON radar_obras(tenant_id, importada_crm_em);

-- 3. Trigger: obra_global atualizada -> espelha fase_macro_consolidada em radar_obras
CREATE OR REPLACE FUNCTION sync_fase_consolidada_para_tenant()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE radar_obras
  SET fase_atual = NEW.fase_macro_consolidada,
      updated_at = NOW()
  WHERE obra_global_id = NEW.id
    AND fase_atual IS DISTINCT FROM NEW.fase_macro_consolidada;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_fase_tenant ON radar_obras_globais;
CREATE TRIGGER tr_sync_fase_tenant
  AFTER UPDATE OF fase_macro_consolidada ON radar_obras_globais
  FOR EACH ROW
  WHEN (OLD.fase_macro_consolidada IS DISTINCT FROM NEW.fase_macro_consolidada)
  EXECUTE FUNCTION sync_fase_consolidada_para_tenant();

-- 4. Reset: obras que vieram com 'alvara' viram NULL (fase só conta quando marcada)
UPDATE radar_obras SET fase_atual = NULL WHERE fase_atual = 'alvara';
