-- =============================================================================
-- APLICAR_009: Cadastros Comerciais
-- Execute este arquivo no SQL Editor do Supabase (Dashboard > SQL Editor > New Query)
-- =============================================================================

-- Tabela de cadastros comerciais (empresas identificadas no radar)
CREATE TABLE IF NOT EXISTS cadastros_comerciais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cnpj TEXT,
  telefone TEXT,
  email TEXT,
  segmento TEXT,
  porte TEXT DEFAULT 'desconhecido'
    CHECK (porte IN ('micro','pequeno','medio','grande','desconhecido')),
  -- geo
  endereco_logradouro TEXT,
  endereco_numero TEXT,
  endereco_bairro TEXT,
  endereco_cidade TEXT,
  endereco_uf CHAR(2),
  endereco_cep TEXT,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  -- ligacoes com radar
  obra_id UUID REFERENCES radar_obras(id) ON DELETE SET NULL,
  obra_global_id UUID,  -- referencia à obra global
  -- dados comerciais
  etapa TEXT NOT NULL DEFAULT 'novo'
    CHECK (etapa IN ('novo','contato_inicial','qualificacao','proposta','negociacao','fechado_ganho','fechado_perdido','inativo')),
  origem TEXT DEFAULT 'manual'
    CHECK (origem IN ('radar','indicacao','formulario','manual','importacao')),
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  valor_estimado NUMERIC(12,2),
  probabilidade INTEGER DEFAULT 0 CHECK (probabilidade >= 0 AND probabilidade <= 100),
  notas TEXT,
  ultimo_contato TIMESTAMPTZ,
  -- auditoria
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cadastros_tenant ON cadastros_comerciais(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cadastros_etapa ON cadastros_comerciais(tenant_id, etapa);
CREATE INDEX IF NOT EXISTS idx_cadastros_cnpj ON cadastros_comerciais(tenant_id, cnpj) WHERE cnpj IS NOT NULL;

-- RLS: tenant scoped
ALTER TABLE cadastros_comerciais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cadastros_tenant_select" ON cadastros_comerciais
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "cadastros_tenant_insert" ON cadastros_comerciais
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND papel IN ('admin','gerente','vendedor')
    )
  );

CREATE POLICY "cadastros_tenant_update" ON cadastros_comerciais
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND papel IN ('admin','gerente','vendedor')
    )
  );

CREATE POLICY "cadastros_tenant_delete" ON cadastros_comerciais
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND papel IN ('admin')
    )
  );

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_cadastros_updated_at
  BEFORE UPDATE ON cadastros_comerciais
  FOR EACH ROW EXECUTE FUNCTION updated_at();

-- Funcao helper para atualizar etapa
CREATE OR REPLACE FUNCTION cadastros_comerciais_atualizar_etapa(
  p_id UUID,
  p_etapa TEXT,
  p_notas TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM cadastros_comerciais
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cadastro comercial nao encontrado';
  END IF;

  IF v_tenant != get_my_tenant_id_safe() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE cadastros_comerciais SET
    etapa = p_etapa,
    notas = COALESCE(p_notas, notas),
    ultimo_contato = CASE WHEN p_etapa != 'novo' THEN NOW() ELSE ultimo_contato END,
    updated_at = NOW()
  WHERE id = p_id;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION cadastros_comerciais_atualizar_etapa IS
  'Atualiza etapa de um cadastro comercial. Auditoria via trigger.';

-- Seed: etapa labels (referencia visual)
-- Nao e necessario seed para esta tabela, ela comea vazia
