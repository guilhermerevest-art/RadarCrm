-- Helper: trigger de updated_at (idempotente, nao conflita com funcoes similares)
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- MIGRATION 022: Listas de prospecção salvas (filtros persistentes do Radar)
-- Permite ao fornecedor salvar combinação de filtros (cidade + fase + score +
-- raio) como "lista" reutilizável. Diferencial vs. radar genérico.
-- =============================================================================

CREATE TABLE IF NOT EXISTS radar_listas_prospeccao (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 80),
  filtros     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_radar_listas_prospeccao_tenant
  ON radar_listas_prospeccao (tenant_id, updated_at DESC);

COMMENT ON TABLE radar_listas_prospeccao IS
  'Filtros salvos do Radar. filtros JSONB guarda { cidade, fase, score_min, raio_km, busca }.';

-- RLS
ALTER TABLE radar_listas_prospeccao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rlp_select ON radar_listas_prospeccao;
CREATE POLICY rlp_select ON radar_listas_prospeccao
  FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rlp_insert ON radar_listas_prospeccao;
CREATE POLICY rlp_insert ON radar_listas_prospeccao
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rlp_update ON radar_listas_prospeccao;
CREATE POLICY rlp_update ON radar_listas_prospeccao
  FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rlp_delete ON radar_listas_prospeccao;
CREATE POLICY rlp_delete ON radar_listas_prospeccao
  FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- service_role bypassa RLS automaticamente
DROP POLICY IF EXISTS rlp_service_all ON radar_listas_prospeccao;
CREATE POLICY rlp_service_all ON radar_listas_prospeccao
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Trigger updated_at
DROP TRIGGER IF EXISTS tr_updated_at_rlp ON radar_listas_prospeccao;
CREATE TRIGGER tr_updated_at_rlp BEFORE UPDATE ON radar_listas_prospeccao
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
