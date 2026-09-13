-- =============================================================================
-- MIGRATION 005: Fase padrão = NULL (não identificada)
-- A fase só existe quando o usuário marca/importa para o CRM dele
-- =============================================================================

-- 1. Tirar default 'alvara' de radar_obras.fase_atual
ALTER TABLE radar_obras
  ALTER COLUMN fase_atual DROP DEFAULT;

-- Permitir NULL em fase_atual
ALTER TABLE radar_obras
  ALTER COLUMN fase_atual DROP NOT NULL;

-- (CHECK constraint original já permite alvara/fundacao/estrutura/acabamento/concluida/nao_iniciou,
-- mas mantemos a opção de NULL para "não identificada")

-- 2. Coluna para saber se JÁ FOI IMPORTADA para o CRM do tenant atual
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

-- 3. Trigger para sincronizar fase da obra global -> obra do tenant
-- Quando fase_consolidada muda em radar_obras_globais, espelha em radar_obras
CREATE OR REPLACE FUNCTION sync_fase_consolidada_para_tenant()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE radar_obras
  SET
    fase_atual = NEW.fase_macro_consolidada,
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

-- 4. Limpar obras que foram importadas com 'alvara' automaticamente
-- (a importação anterior setava alvara hardcoded — resetar)
UPDATE radar_obras SET fase_atual = NULL WHERE fase_atual = 'alvara';
