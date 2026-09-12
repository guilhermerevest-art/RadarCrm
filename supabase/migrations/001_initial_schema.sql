-- =============================================================================
-- SUPABASE MIGRATION: Radar Canteiro v1.0
-- Multi-tenant CRM SaaS para construção civil
-- Dependências: postgis, pg_trgm
-- =============================================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Function gen_random_uuid é fornecida pela extensão pgcrypto (inclusa no Supabase)
-- Se uuid_generate_v4 não existir, usamos gen_random_uuid()
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uuid_generate_v4') THEN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  END IF;
END
$$;

-- =============================================================================
-- PLANOS
-- =============================================================================
CREATE TABLE planos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  preco NUMERIC(10,2) NOT NULL,
  usuarios INTEGER NOT NULL,
  limite_obras_mes INTEGER NOT NULL,
  limite_leads INTEGER NOT NULL,
  limite_mensagens_dia INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO planos (id, nome, preco, usuarios, limite_obras_mes, limite_leads, limite_mensagens_dia) VALUES
  ('individual', 'Individual', 197.00, 1, 500, 200, 100),
  ('equipe', 'Equipe', 397.00, 5, 2500, 1000, 500),
  ('regional', 'Regional', 797.00, 20, 10000, 5000, 2000),
  ('obras', 'Obras', 0.00, 999, 999999, 999999, 999999);

-- =============================================================================
-- TENANTS (empresas/clientes)
-- =============================================================================
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plano TEXT NOT NULL DEFAULT 'individual' REFERENCES planos(id),
  cnpj CHAR(14),
  logo_url TEXT,
  cor_primaria TEXT DEFAULT '#D9541F',
  cor_secundaria TEXT DEFAULT '#2E6F8E',
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','ativo','inadimplente','pausado','cancelado')),
  trial_expira_em TIMESTAMPTZ,
  onboard_completo BOOLEAN DEFAULT FALSE,
  segmento_principal TEXT[],
  raio_km INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);

-- =============================================================================
-- USUÁRIOS DO TENANT (vínculo auth.users <-> tenant)
-- =============================================================================
CREATE TABLE tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel TEXT NOT NULL DEFAULT 'vendedor' CHECK (papel IN ('admin','gerente','vendedor','leitor')),
  nome TEXT,
  avatar_url TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_user ON tenant_users(user_id);

-- =============================================================================
-- CONVITES DE USUÁRIO
-- =============================================================================
CREATE TABLE tenant_convites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'vendedor' CHECK (papel IN ('admin','gerente','vendedor','leitor')),
  token TEXT NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  aceito_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_convites_token ON tenant_convites(token);
CREATE INDEX idx_convites_email ON tenant_convites(email);

-- =============================================================================
-- RADAR DE OBRAS
-- =============================================================================
CREATE TABLE radar_obras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fonte TEXT NOT NULL CHECK (fonte IN ('cno','alvara_prefeitura','pncp','semad_mg')),
  fonte_id TEXT,
  endereco_logradouro TEXT NOT NULL,
  endereco_numero TEXT,
  endereco_bairro TEXT,
  endereco_cidade TEXT NOT NULL,
  endereco_uf CHAR(2) NOT NULL DEFAULT 'MG',
  endereco_cep TEXT,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  geo GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
    THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ELSE NULL END
  ) STORED,
  fase_atual TEXT NOT NULL DEFAULT 'alvara' CHECK (fase_atual IN ('alvara','fundacao','estrutura','acabamento','concluida')),
  data_inicio DATE,
  data_previsao_termino DATE,
  valor_estimado NUMERIC(14,2),
  porte TEXT NOT NULL DEFAULT 'medio' CHECK (porte IN ('pequeno','medio','grande')),
  segmento_alvo TEXT[],
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','pausada','concluida','cancelada')),
  qualidade_score INTEGER DEFAULT 50 CHECK (qualidade_score BETWEEN 0 AND 100),
  hash_deduplicacao TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, hash_deduplicacao)
);

CREATE INDEX idx_obras_tenant ON radar_obras(tenant_id);
CREATE INDEX idx_obras_cidade ON radar_obras(endereco_cidade, status);
CREATE INDEX idx_obras_fase ON radar_obras(tenant_id, fase_atual);
CREATE INDEX idx_obras_geo ON radar_obras USING GIST(geo);

-- =============================================================================
-- CRM LEADS
-- =============================================================================
CREATE TABLE crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  empresa TEXT,
  empresa_id UUID,
  email TEXT,
  telefone TEXT,
  origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('whatsapp','formulario_site','indicacao','manual','radar')),
  utm_source TEXT,
  utm_campaign TEXT,
  utm_medium TEXT,
  utm_content TEXT,
  endereco_cidade TEXT,
  score_engajamento INTEGER DEFAULT 50 CHECK (score_engajamento BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','qualificado','descarte','convertido')),
  responsavel_id UUID REFERENCES tenant_users(id),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_tenant ON crm_leads(tenant_id);
CREATE INDEX idx_leads_status ON crm_leads(tenant_id, status);
CREATE INDEX idx_leads_responsavel ON crm_leads(tenant_id, responsavel_id);

-- =============================================================================
-- CRM DEALS (oportunidades)
-- =============================================================================
CREATE TABLE crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE RESTRICT,
  obra_id UUID REFERENCES radar_obras(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  estagio TEXT NOT NULL DEFAULT 'novo' CHECK (estagio IN ('novo','contato','proposta','negociacao','fechamento','ganho','perdido')),
  valor_estimado NUMERIC(14,2),
  valor_final NUMERIC(14,2),
  probabilidade INTEGER DEFAULT 10 CHECK (probabilidade BETWEEN 0 AND 100),
  data_fechamento_prevista DATE,
  data_fechamento_real DATE,
  motivo_perda TEXT,
  responsavel_id UUID REFERENCES tenant_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deals_tenant ON crm_deals(tenant_id);
CREATE INDEX idx_deals_estagio ON crm_deals(tenant_id, estagio);
CREATE INDEX idx_deals_responsavel ON crm_deals(tenant_id, responsavel_id);

-- =============================================================================
-- CRM ATIVIDADES
-- =============================================================================
CREATE TABLE crm_atividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL DEFAULT 'tarefa' CHECK (tipo IN ('tarefa','ligacao','reuniao','email','whatsapp')),
  descricao TEXT NOT NULL,
  data_vencimento TIMESTAMPTZ,
  data_conclusao TIMESTAMPTZ,
  responsavel_id UUID REFERENCES tenant_users(id),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','concluida','cancelada')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_atividades_tenant ON crm_atividades(tenant_id);
CREATE INDEX idx_atividades_vencimento ON crm_atividades(tenant_id, data_vencimento) WHERE status = 'pendente';

-- =============================================================================
-- CRM PIPELINE (estágios customizáveis)
-- =============================================================================
CREATE TABLE crm_pipeline_estagios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  cor TEXT NOT NULL DEFAULT '#D9541F',
  probabilidade_padrao INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, ordem)
);

-- Seed de estágios padrão (só executa se existir pelo menos um tenant)
INSERT INTO crm_pipeline_estagios (tenant_id, nome, ordem, cor, probabilidade_padrao)
SELECT tenant_id, nome, ordem, cor, prob
FROM (
  VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid, 'Novo', 1, '#A9B4BA', 10),
    ('00000000-0000-0000-0000-000000000000'::uuid, 'Contato', 2, '#2E6F8E', 25),
    ('00000000-0000-0000-0000-000000000000'::uuid, 'Proposta', 3, '#D97706', 50),
    ('00000000-0000-0000-0000-000000000000'::uuid, 'Negociação', 4, '#7C3AED', 75),
    ('00000000-0000-0000-0000-000000000000'::uuid, 'Fechamento', 5, '#059669', 90),
    ('00000000-0000-0000-0000-000000000000'::uuid, 'Ganho', 6, '#16A34A', 100),
    ('00000000-0000-0000-0000-000000000000'::uuid, 'Perdido', 7, '#DC2626', 0)
) AS t(tenant_id, nome, ordem, cor, prob)
WHERE EXISTS (SELECT 1 FROM tenants LIMIT 1);

-- =============================================================================
-- AUDIT LOG
-- =============================================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  entidade_tipo TEXT,
  entidade_id UUID,
  detalhes JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_log(tenant_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- =============================================================================
-- FUNÇÕES E TRIGGERS UTILITÁRIAS
-- =============================================================================

-- updated_at automático
CREATE OR REPLACE FUNCTION updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_updated_at_tenants
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION updated_at();

CREATE TRIGGER tr_updated_at_leads
  BEFORE UPDATE ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION updated_at();

CREATE TRIGGER tr_updated_at_deals
  BEFORE UPDATE ON crm_deals
  FOR EACH ROW EXECUTE FUNCTION updated_at();

CREATE TRIGGER tr_updated_at_obras
  BEFORE UPDATE ON radar_obras
  FOR EACH ROW EXECUTE FUNCTION updated_at();

-- =============================================================================
-- FUNÇÃO: criar tenant automaticamente no signup
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_tenant_criar(
  p_user_id UUID,
  p_nome TEXT,
  p_slug TEXT
)
RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
  v_estagio_ordem INTEGER;
BEGIN
  -- Cria o tenant
  INSERT INTO tenants (nome, slug, status, trial_expira_em)
  VALUES (p_nome, p_slug, 'trial', NOW() + INTERVAL '14 days')
  RETURNING id INTO v_tenant_id;

  -- Vincula o usuário como admin
  INSERT INTO tenant_users (tenant_id, user_id, papel, nome)
  VALUES (v_tenant_id, p_user_id, 'admin', p_nome);

  -- Seed estágios padrão do pipeline
  INSERT INTO crm_pipeline_estagios (tenant_id, nome, ordem, cor, probabilidade_padrao)
  VALUES
    (v_tenant_id, 'Novo', 1, '#A9B4BA', 10),
    (v_tenant_id, 'Contato', 2, '#2E6F8E', 25),
    (v_tenant_id, 'Proposta', 3, '#D97706', 50),
    (v_tenant_id, 'Negociação', 4, '#7C3AED', 75),
    (v_tenant_id, 'Fechamento', 5, '#059669', 90),
    (v_tenant_id, 'Ganho', 6, '#16A34A', 100),
    (v_tenant_id, 'Perdido', 7, '#DC2626', 0);

  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_pipeline_estagios ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Tenants: usuário vê o próprio
CREATE POLICY "Tenant próprio" ON tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

-- Tenant users: admin do tenant vê todos
CREATE POLICY "Tenant users admin" ON tenant_users
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND papel = 'admin')
  );

CREATE POLICY "Tenant users self" ON tenant_users
  FOR SELECT USING (user_id = auth.uid());

-- Radar obras: todos do tenant
CREATE POLICY "Obras do tenant" ON radar_obras
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

-- CRM leads: todos do tenant
CREATE POLICY "Leads do tenant" ON crm_leads
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

-- CRM deals: todos do tenant
CREATE POLICY "Deals do tenant" ON crm_deals
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

-- CRM atividades: todos do tenant
CREATE POLICY "Atividades do tenant" ON crm_atividades
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

-- Pipeline: todos do tenant
CREATE POLICY "Pipeline do tenant" ON crm_pipeline_estagios
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

-- Convites: público para o token (sem auth)
CREATE POLICY "Convite por token" ON tenant_convites
  FOR SELECT USING (true);

-- Audit log: admins veem
CREATE POLICY "Audit admin" ON audit_log
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND papel = 'admin')
  );
