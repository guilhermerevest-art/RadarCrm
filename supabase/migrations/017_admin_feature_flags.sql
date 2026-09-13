-- =============================================================================
-- MIGRATION 015: Admin Actions Log + Feature Flags
-- Implements Épico 11 - Suporte e Admin Panel
-- =============================================================================

-- 1. Tabela de ações administrativas (audit log de admins)
CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_afetado_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  recurso TEXT NOT NULL,
  registro_id UUID,
  detalhes JSONB DEFAULT '{}',
  ip_endereco TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_tenant ON admin_actions(tenant_afetado_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_acao ON admin_actions(acao);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at DESC);

-- RLS: apenas admins globais (tabela tenant_users com papel admin E tenant é NULL = admin da plataforma)
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_actions_admin_read" ON admin_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_users
      WHERE user_id = auth.uid()
      AND papel = 'admin'
      AND tenant_id IS NULL
    )
  );
CREATE POLICY "admin_actions_insert" ON admin_actions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_users
      WHERE user_id = auth.uid()
      AND papel = 'admin'
      AND tenant_id IS NULL
    )
  );

-- 2. Tabela de Feature Flags
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  descricao TEXT,
  valor_default JSONB NOT NULL DEFAULT 'false',
  tipo TEXT NOT NULL DEFAULT 'boolean' CHECK (tipo IN ('boolean', 'number', 'string', 'json')),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  valor_tenant JSONB,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(key, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant ON feature_flags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_ativo ON feature_flags(ativo) WHERE ativo = true;

-- RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
-- Leitura: qualquer usuário autenticado (flags afetam UI)
CREATE POLICY "feature_flags_read_all" ON feature_flags
  FOR SELECT USING (ativo = true);
-- Escrita: apenas admins globais
CREATE POLICY "feature_flags_admin_write" ON feature_flags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tenant_users
      WHERE user_id = auth.uid()
      AND papel = 'admin'
      AND tenant_id IS NULL
    )
  );

-- 3. Seed dos Feature Flags iniciais
INSERT INTO feature_flags (key, descricao, valor_default, tipo) VALUES
  -- WhatsApp
  ('whatsapp_enabled', 'Habilita integração WhatsApp para o tenant', 'false', 'boolean'),
  -- API
  ('api_enabled', 'Habilita acesso à API REST para o tenant', 'false', 'boolean'),
  -- Limites de usuários por plano
  ('max_usuarios_1', 'Máximo de usuários no plano Individual', '1', 'number'),
  ('max_usuarios_5', 'Máximo de usuários no plano Equipe', '5', 'number'),
  ('max_usuarios_20', 'Máximo de usuários no plano Regional', '20', 'number'),
  ('max_usuarios_ilimitado', 'Máximo de usuários no plano Obras', '999', 'number'),
  -- Limites de obras
  ('max_obras_mes_500', 'Máximo de obras/mes no plano Individual', '500', 'number'),
  ('max_obras_mes_2500', 'Máximo de obras/mes no plano Equipe', '2500', 'number'),
  ('max_obras_mes_10000', 'Máximo de obras/mes no plano Regional', '10000', 'number'),
  ('max_obras_mes_ilimitado', 'Máximo de obras/mes no plano Obras', '999999', 'number'),
  -- Limites de leads
  ('max_leads_200', 'Máximo de leads no plano Individual', '200', 'number'),
  ('max_leads_1000', 'Máximo de leads no plano Equipe', '1000', 'number'),
  ('max_leads_5000', 'Máximo de leads no plano Regional', '5000', 'number'),
  ('max_leads_ilimitado', 'Máximo de leads no plano Obras', '999999', 'number'),
  -- Limites de envios WhatsApp
  ('max_wa_envios_dia_100', 'Máximo envios WA/dia no plano Individual', '100', 'number'),
  ('max_wa_envios_dia_500', 'Máximo envios WA/dia no plano Equipe', '500', 'number'),
  ('max_wa_envios_dia_2000', 'Máximo envios WA/dia no plano Regional', '2000', 'number'),
  ('max_wa_envios_dia_ilimitado', 'Máximo envios WA/dia no plano Obras', '999999', 'number'),
  -- Feature flags booleanas
  ('multi_cidade', 'Habilita seleção de múltiplas cidades', 'false', 'boolean'),
  ('pipeline_kanban', 'Habilita pipeline kanban do CRM', 'false', 'boolean'),
  ('automacoes', 'Habilita automações de CRM', 'false', 'boolean'),
  ('propostas', 'Habilita módulo de propostas', 'false', 'boolean'),
  ('relatorios', 'Habilita módulo de relatórios avançados', 'false', 'boolean'),
  ('white_label', 'Habilita customização white-label (logo, cores)', 'false', 'boolean'),
  ('sla_dedicado', 'Habilita SLA dedicado (Suporte priority)', 'false', 'boolean'),
  -- Plano Equipe+
  ('equipe_plus', 'Habilita recursos do plano Equipe+', 'false', 'boolean'),
  -- Analytics avançado
  ('analytics_avancado', 'Habilita analytics e dashboards avançados', 'false', 'boolean'),
  -- Help Center
  ('help_center', 'Habilita acesso ao Help Center', 'true', 'boolean'),
  -- Crisp chat
  ('crisp_chat', 'Habilita widget de chat Crisp', 'false', 'boolean')
ON CONFLICT (key) DO NOTHING;

-- 4. Function para resolver feature flag para um tenant
CREATE OR REPLACE FUNCTION fn_get_feature_flag(
  p_key TEXT,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_valor_default JSONB;
  v_valor_tenant JSONB;
BEGIN
  -- Primeiro, tenta pegar o valor default (global)
  SELECT valor_default INTO v_valor_default
  FROM feature_flags
  WHERE key = p_key AND ativo = true;

  IF v_valor_default IS NULL THEN
    RETURN jsonb_build_object(
      'found', false,
      'key', p_key,
      'error', 'Flag não encontrada'
    );
  END IF;

  -- Se tem tenant_id, tenta sobrescrever
  IF p_tenant_id IS NOT NULL THEN
    SELECT valor_tenant INTO v_valor_tenant
    FROM feature_flags
    WHERE key = p_key AND tenant_id = p_tenant_id AND ativo = true;

    IF v_valor_tenant IS NOT NULL THEN
      RETURN jsonb_build_object(
        'found', true,
        'key', p_key,
        'value', v_valor_tenant,
        'source', 'tenant'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'key', p_key,
    'value', v_valor_default,
    'source', 'default'
  );
END;
$$;

COMMENT ON FUNCTION fn_get_feature_flag IS
  'Resolve valor de feature flag. Prioridade: valor_tenant > valor_default. Retorna JSON com found, key, value, source.';

-- 5. Function para resolver feature flags de um tenant (todas de uma vez)
CREATE OR REPLACE FUNCTION fn_get_tenant_feature_flags(p_tenant_id UUID)
RETURNS TABLE(key TEXT, value JSONB, source TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH defaults AS (
    SELECT key, valor_default FROM feature_flags WHERE ativo = true
  ),
  overrides AS (
    SELECT key, valor_tenant FROM feature_flags
    WHERE tenant_id = p_tenant_id AND ativo = true AND valor_tenant IS NOT NULL
  )
  SELECT
    d.key,
    COALESCE(o.valor_tenant, d.valor_default) AS value,
    CASE WHEN o.key IS NOT NULL THEN 'tenant' ELSE 'default' END AS source
  FROM defaults d
  LEFT JOIN overrides o ON d.key = o.key;
END;
$$;

COMMENT ON FUNCTION fn_get_tenant_feature_flags IS
  'Retorna todas as feature flags de um tenant com valores effective (tenant > default).';

-- 6. Function para admin registrar ação
CREATE OR REPLACE FUNCTION fn_admin_log_action(
  p_tenant_afetado_id UUID,
  p_acao TEXT,
  p_recurso TEXT,
  p_registro_id UUID,
  p_detalhes JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_user_id UUID;
  v_id UUID;
BEGIN
  -- Verificar se é admin global
  SELECT tu.user_id INTO v_admin_user_id
  FROM tenant_users tu
  WHERE tu.user_id = auth.uid()
    AND tu.papel = 'admin'
    AND tu.tenant_id IS NULL;

  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Apenas administradores globais podem executar esta ação';
  END IF;

  INSERT INTO admin_actions (
    admin_user_id, tenant_afetado_id, acao, recurso, registro_id, detalhes
  )
  VALUES (
    v_admin_user_id, p_tenant_afetado_id, p_acao, p_recurso, p_registro_id, p_detalhes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION fn_admin_log_action IS
  'Registra ação administrativa. Apenas admins globais podem usar.';

-- 7. Function para listar tenants (admin panel)
CREATE OR REPLACE FUNCTION fn_admin_list_tenants(
  p_status TEXT DEFAULT NULL,
  p_plano TEXT DEFAULT NULL,
  p_data_inicio TIMESTAMPTZ DEFAULT NULL,
  p_data_fim TIMESTAMPTZ DEFAULT NULL,
  p_busca TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  nome TEXT,
  slug TEXT,
  plano TEXT,
  status TEXT,
  ativo BOOLEAN,
  created_at TIMESTAMPTZ,
  users_count BIGINT,
  leads_count BIGINT,
  obras_count BIGINT,
  ultimo_login TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.nome,
    t.slug,
    t.plano,
    t.status,
    t.ativo,
    t.created_at,
    COUNT(DISTINCT tu.user_id)::BIGINT AS users_count,
    COALESCE(lc.lead_count, 0)::BIGINT AS leads_count,
    COALESCE(oc.obra_count, 0)::BIGINT AS obras_count,
    t.ultimo_login
  FROM tenants t
  LEFT JOIN tenant_users tu ON tu.tenant_id = t.id
  LEFT JOIN (
    SELECT tenant_id, COUNT(*) as lead_count FROM crm_leads GROUP BY tenant_id
  ) lc ON lc.tenant_id = t.id
  LEFT JOIN (
    SELECT tenant_id, COUNT(*) as obra_count FROM radar_obras GROUP BY tenant_id
  ) oc ON oc.tenant_id = t.id
  WHERE
    (p_status IS NULL OR t.status = p_status)
    AND (p_plano IS NULL OR t.plano = p_plano)
    AND (p_data_inicio IS NULL OR t.created_at >= p_data_inicio)
    AND (p_data_fim IS NULL OR t.created_at <= p_data_fim)
    AND (p_busca IS NULL OR t.nome ILIKE '%' || p_busca || '%' OR t.slug ILIKE '%' || p_busca || '%')
  GROUP BY t.id, t.nome, t.slug, t.plano, t.status, t.ativo, t.created_at, t.ultimo_login, lc.lead_count, oc.obra_count
  ORDER BY t.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION fn_admin_list_tenants IS
  'Lista tenants para admin panel com filtros e contadores.';

-- 8. Function para métricas globais (admin panel)
CREATE OR REPLACE FUNCTION fn_admin_global_metrics()
RETURNS TABLE(
  metric_name TEXT,
  metric_value NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 'total_tenants'::TEXT, COUNT(*)::NUMERIC FROM tenants
  UNION ALL
  SELECT 'tenants_ativos'::TEXT, COUNT(*)::NUMERIC FROM tenants WHERE ativo = true AND status != 'cancelado'
  UNION ALL
  SELECT 'tenants_trial'::TEXT, COUNT(*)::NUMERIC FROM tenants WHERE status = 'trial'
  UNION ALL
  SELECT 'tenants_pagos'::TEXT, COUNT(*)::NUMERIC FROM tenants WHERE status = 'ativo'
  UNION ALL
  SELECT 'tenants_cancelados'::TEXT, COUNT(*)::NUMERIC FROM tenants WHERE status = 'cancelado'
  UNION ALL
  SELECT 'total_usuarios'::TEXT, COUNT(DISTINCT user_id)::NUMERIC FROM tenant_users
  UNION ALL
  SELECT 'total_leads'::TEXT, COUNT(*)::NUMERIC FROM crm_leads
  UNION ALL
  SELECT 'total_obras'::TEXT, COUNT(*)::NUMERIC FROM radar_obras
  UNION ALL
  SELECT 'total_deals'::TEXT, COUNT(*)::NUMERIC FROM crm_deals
  UNION ALL
  SELECT 'deals_ganhos_mes'::TEXT,
    COUNT(*)::NUMERIC
  FROM crm_deals
  WHERE estagio = 'ganho'
    AND updated_at >= date_trunc('month', NOW());
END;
$$;

COMMENT ON FUNCTION fn_admin_global_metrics IS
  'Retorna métricas globais para admin panel: tenants, usuários, leads, etc.';

-- 9. Function para pausar/reativar tenant
CREATE OR REPLACE FUNCTION fn_admin_toggle_tenant_status(
  p_tenant_id UUID,
  p_ativo BOOLEAN,
  p_motivo TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_ativo BOOLEAN;
BEGIN
  -- Verificar se é admin global
  IF NOT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = auth.uid() AND papel = 'admin' AND tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Apenas administradores globais podem executar esta ação';
  END IF;

  -- Obter status atual
  SELECT ativo INTO v_current_ativo FROM tenants WHERE id = p_tenant_id;
  IF v_current_ativo IS NULL THEN
    RAISE EXCEPTION 'Tenant não encontrado';
  END IF;

  -- Atualizar status
  UPDATE tenants SET ativo = p_ativo WHERE id = p_tenant_id;

  -- Registrar ação
  PERFORM fn_admin_log_action(
    p_tenant_id,
    CASE WHEN p_ativo THEN 'TENANT_ATIVADO' ELSE 'TENANT_PAUSADO' END,
    'tenants',
    p_tenant_id,
    jsonb_build_object('motivo', p_motivo, 'ativo_anterior', v_current_ativo, 'ativo_novo', p_ativo)
  );

  RETURN true;
END;
$$;

COMMENT ON FUNCTION fn_admin_toggle_tenant_status IS
  'Pausa ou reativa um tenant. Requer admin global.';

-- 10. Function para impersonar tenant (gera token temporário)
CREATE OR REPLACE FUNCTION fn_admin_impersonate_tenant(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_user_id UUID;
  v_impersonation_token TEXT;
BEGIN
  -- Verificar se é admin global
  SELECT user_id INTO v_admin_user_id
  FROM tenant_users
  WHERE user_id = auth.uid() AND papel = 'admin' AND tenant_id IS NULL;

  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Apenas administradores globais podem impersonar tenants';
  END IF;

  -- Gerar token de impersonação
  v_impersonation_token := encode(gen_random_bytes(32), 'hex');

  -- Registrar ação
  PERFORM fn_admin_log_action(
    p_tenant_id,
    'IMPERSONATE',
    'tenants',
    p_tenant_id,
    jsonb_build_object('token_prefix', LEFT(v_impersonation_token, 8) || '...')
  );

  -- Retornar token (em produção, seria armazenado em tabela de tokens temporários)
  RETURN v_impersonation_token;
END;
$$;

COMMENT ON FUNCTION fn_admin_impersonate_tenant IS
  'Gera token de impersonação para admin acessar tenant. Token deve ser usado em até 15 minutos.';

-- =============================================================================
-- FIM DA MIGRATION 015
-- =============================================================================
