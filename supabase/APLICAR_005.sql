-- =============================================================================
-- APLICAR_005: Fase padrão = NULL (não identificada)
-- Execute este arquivo no SQL Editor do Supabase
-- A fase só existe quando o usuário marca/importa para o CRM dele
-- =============================================================================

-- 1. Permitir NULL em fase_atual (era NOT NULL com DEFAULT 'alvara')
ALTER TABLE radar_obras
  ALTER COLUMN fase_atual DROP DEFAULT;

ALTER TABLE radar_obras
  ALTER COLUMN fase_atual DROP NOT NULL;

-- 2. Coluna para rastrear se a obra JÁ FOI IMPORTADA para o CRM
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
