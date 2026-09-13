-- =============================================================================
-- MIGRATION 009: Cadastros comerciais (empresas do radar)
-- Empresas identificadas no radar que podem se tornar clientes
-- =============================================================================

-- 0. Limpar policies/triggers anteriores para tornar idempotente
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN (
      'cadastros_comerciais'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS tr_cadastros_comerciais_updated_at ON cadastros_comerciais;
DROP FUNCTION IF EXISTS cadastros_comerciais_atualizar_etapa(UUID, TEXT, TEXT);

-- 0.1 Garantir que radar_obras tem a coluna geo (caso migration 001 nao tenha sido aplicada)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'radar_obras' AND column_name = 'geo'
  ) THEN
    -- Adicionar lat/lng se nao existirem
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'radar_obras' AND column_name = 'lat') THEN
      ALTER TABLE radar_obras ADD COLUMN lat NUMERIC(10,7);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'radar_obras' AND column_name = 'lng') THEN
      ALTER TABLE radar_obras ADD COLUMN lng NUMERIC(10,7);
    END IF;
    ALTER TABLE radar_obras ADD COLUMN geo GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
      CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
      ELSE NULL END
    ) STORED;
    CREATE INDEX IF NOT EXISTS idx_obras_geo ON radar_obras USING GIST(geo);
  END IF;
END $$;

-- 0.2 Garantir que cadastros_comerciais tem colunas lat/lng/geo (reparo de execucao parcial anterior)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cadastros_comerciais'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cadastros_comerciais' AND column_name = 'lat') THEN
      ALTER TABLE cadastros_comerciais ADD COLUMN lat NUMERIC(10,7);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cadastros_comerciais' AND column_name = 'lng') THEN
      ALTER TABLE cadastros_comerciais ADD COLUMN lng NUMERIC(10,7);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cadastros_comerciais' AND column_name = 'geo') THEN
      ALTER TABLE cadastros_comerciais ADD COLUMN geo GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
        CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
        ELSE NULL END
      ) STORED;
    END IF;
  END IF;
END $$;

-- Tabela de cadastros comerciais
CREATE TABLE IF NOT EXISTS cadastros_comerciais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cnpj CHAR(18),
  telefone TEXT,
  email TEXT,
  segmento TEXT,
  porte TEXT CHECK (porte IN ('micro','pequeno','medio','grande','desconhecido')),
  endereco_logradouro TEXT,
  endereco_numero TEXT,
  endereco_bairro TEXT,
  endereco_cidade TEXT NOT NULL,
  endereco_uf CHAR(2) NOT NULL DEFAULT 'MG',
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  geo GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
    THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ELSE NULL END
  ) STORED,
  obra_id UUID REFERENCES radar_obras(id) ON DELETE SET NULL,
  obra_global_id UUID REFERENCES radar_obras_globais(id) ON DELETE SET NULL,
  contato_principal TEXT,
  telefone_contato TEXT,
  email_contato TEXT,
  etapa TEXT NOT NULL DEFAULT 'novo'
    CHECK (etapa IN ('novo','contato_inicial','qualificacao','proposta','negociacao','fechado_ganho','fechado_perdido','inativo')),
  origem TEXT NOT NULL DEFAULT 'radar'
    CHECK (origem IN ('radar','indicacao','formulario','manual','importacao')),
  responsavel_id UUID REFERENCES tenant_users(id),
  valor_estimado NUMERIC(14,2),
  probabilidade INTEGER DEFAULT 10 CHECK (probabilidade BETWEEN 0 AND 100),
  notas TEXT,
  ultimo_contato TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comerciais_tenant ON cadastros_comerciais(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comerciais_etapa ON cadastros_comerciais(tenant_id, etapa);
CREATE INDEX IF NOT EXISTS idx_comerciais_cnpj ON cadastros_comerciais(tenant_id, cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comerciais_responsavel ON cadastros_comerciais(tenant_id, responsavel_id);
CREATE INDEX IF NOT EXISTS idx_comerciais_geo ON cadastros_comerciais USING GIST(geo);

-- RLS
ALTER TABLE cadastros_comerciais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comerciais_tenant_select" ON cadastros_comerciais
  FOR SELECT USING (
    tenant_id = (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "comerciais_tenant_insert" ON cadastros_comerciais
  FOR INSERT WITH CHECK (
    tenant_id = (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "comerciais_tenant_update" ON cadastros_comerciais
  FOR UPDATE USING (
    tenant_id = (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "comerciais_tenant_delete" ON cadastros_comerciais
  FOR DELETE USING (
    tenant_id = (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- Funcoes utilities
CREATE OR REPLACE FUNCTION cadastros_comerciais_atualizar_etapa(
  p_id UUID,
  p_etapa TEXT,
  p_notas TEXT DEFAULT NULL
)
RETURNS cadastros_comerciais
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result cadastros_comerciais%ROWTYPE;
BEGIN
  UPDATE cadastros_comerciais SET
    etapa = p_etapa,
    ultimo_contato = NOW(),
    notas = COALESCE(p_notas, notas),
    updated_at = NOW()
  WHERE id = p_id
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE TRIGGER tr_cadastros_comerciais_updated_at
  BEFORE UPDATE ON cadastros_comerciais
  FOR EACH ROW EXECUTE FUNCTION updated_at();

COMMENT ON TABLE cadastros_comerciais IS
  'Empresas identificadas no radar de obras que estao em fase de abordagem comercial.';
