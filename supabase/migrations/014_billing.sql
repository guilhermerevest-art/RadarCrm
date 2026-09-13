-- =============================================================================
-- SUPABASE MIGRATION: Billing e Planos - Épico 4
-- Trial 14 dias, Stripe, inadimplência, cancelamento com motivo
-- =============================================================================

-- =============================================================================
-- 1. TABELA: motivos_cancelamento
-- =============================================================================
CREATE TABLE motivos_cancelamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  texto TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO motivos_cancelamento (slug, texto, ordem) VALUES
  ('muito_caro', 'O plano ficou muito caro', 1),
  ('nao_estava_usando', 'Não estava usando o produto', 2),
  ('migrando_ferramenta', 'Migrei para outra ferramenta', 3),
  ('faltando_recursos', 'Faltam recursos que preciso', 4),
  ('suporte_ruim', 'O suporte não atendeu minha expectativa', 5),
  ('outro', 'Outro motivo', 99);

-- =============================================================================
-- 2. TABELA: assinaturas
-- =============================================================================
CREATE TABLE assinaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plano_id TEXT NOT NULL REFERENCES planos(id),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  status_pagamento TEXT DEFAULT 'ativa'
    CHECK (status_pagamento IN ('ativa', 'inadimplente', 'cancelada')),
  periodo_inicio TIMESTAMPTZ,
  periodo_fim TIMESTAMPTZ,
  trial_expira_em TIMESTAMPTZ,
  data_cancelamento TIMESTAMPTZ,
  data_pausa TIMESTAMPTZ,
  cancelado_em TIMESTAMPTZ,
  ultimo_pagamento_em TIMESTAMPTZ,
  proximo_pagamento_em TIMESTAMPTZ,
  valor_mensal NUMERIC(10,2),
  metodo_pagamento TEXT,
  tentativa_pagamento_count INTEGER DEFAULT 0,
  ultimo_erro_pagamento TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assinaturas_tenant ON assinaturas(tenant_id);
CREATE INDEX idx_assinaturas_stripe_customer ON assinaturas(stripe_customer_id);
CREATE INDEX idx_assinaturas_stripe_sub ON assinaturas(stripe_subscription_id);
CREATE INDEX idx_assinaturas_status ON assinaturas(status);
CREATE UNIQUE INDEX idx_assinaturas_tenant_active ON assinaturas(tenant_id)
  WHERE status IN ('trialing', 'active', 'past_due');

-- =============================================================================
-- 3. TABELA: faturas
-- =============================================================================
CREATE TABLE faturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assinatura_id UUID REFERENCES assinaturas(id) ON DELETE SET NULL,
  stripe_invoice_id TEXT UNIQUE,
  numero TEXT,
  status TEXT NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'paga', 'vencida', 'cancelada', 'emandamento')),
  metodo_pagamento TEXT DEFAULT 'pix'
    CHECK (metodo_pagamento IN ('pix', 'cartao_credito', 'boleto', 'transferencia')),
  valor NUMERIC(10,2) NOT NULL,
  valor_pago NUMERIC(10,2),
  data_emissao TIMESTAMPTZ DEFAULT NOW(),
  data_vencimento TIMESTAMPTZ,
  data_pagamento TIMESTAMPTZ,
  data_cancelamento TIMESTAMPTZ,
  url_pagamento TEXT,
  url_nota_fiscal TEXT,
  link_pdf TEXT,
  codigo_pix TEXT,
  qr_code_pix TEXT,
  linha_digitavel TEXT,
  payload_stripe JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_faturas_tenant ON faturas(tenant_id);
CREATE INDEX idx_faturas_assinatura ON faturas(assinatura_id);
CREATE INDEX idx_faturas_stripe ON faturas(stripe_invoice_id);
CREATE INDEX idx_faturas_status ON faturas(status);
CREATE INDEX idx_faturas_vencimento ON faturas(tenant_id, data_vencimento);

-- =============================================================================
-- 4. TABELA: uso_plano (métricas incrementais por tenant)
-- =============================================================================
CREATE TABLE uso_plano (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mes_referencia DATE NOT NULL DEFAULT date_trunc('month', NOW())::date,
  obras_mes INTEGER DEFAULT 0,
  leads_mes INTEGER DEFAULT 0,
  envios_wa_dia INTEGER DEFAULT 0,
  envios_wa_mes INTEGER DEFAULT 0,
  propostas_mes INTEGER DEFAULT 0,
  usuarios INTEGER DEFAULT 1,
  produtos_ativos INTEGER DEFAULT 0,
  ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, mes_referencia)
);

CREATE INDEX idx_uso_plano_tenant ON uso_plano(tenant_id);
CREATE INDEX idx_uso_plano_mes ON uso_plano(mes_referencia);

-- =============================================================================
-- 5. NOVAS COLUNAS EM tenants (stripe_customer_id, etc.)
-- =============================================================================
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS data_adesao TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS inadimplente_desde TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bloqueado_escrita BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bloqueado_leitura BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grace_periodo_fim TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenants_stripe ON tenants(stripe_customer_id);

-- =============================================================================
-- 6. FUNÇÃO: fn_tenant_aplicar_plano
-- Atualiza tenants.plano baseado na assinatura ativa
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_tenant_aplicar_plano(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assinatura RECORD;
  v_tenant RECORD;
  v_result JSONB;
BEGIN
  -- Busca assinatura ativa
  SELECT * INTO v_assinatura
  FROM assinaturas
  WHERE tenant_id = p_tenant_id
    AND status IN ('active', 'trialing')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhuma assinatura ativa encontrada');
  END IF;

  -- Busca tenant
  SELECT * INTO v_tenant FROM tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant não encontrado');
  END IF;

  -- Atualiza tenant com plano da assinatura
  UPDATE tenants
  SET
    plano = v_assinatura.plano_id,
    status = CASE
      WHEN v_assinatura.status = 'trialing' THEN 'trial'
      WHEN v_assinatura.status = 'active' THEN 'ativo'
      WHEN v_assinatura.status IN ('past_due', 'unpaid') THEN 'inadimplente'
      ELSE tenants.status
    END,
    data_adesao = CASE WHEN tenants.data_adesao IS NULL THEN NOW() ELSE tenants.data_adesao END,
    updated_at = NOW()
  WHERE id = p_tenant_id;

  v_result := jsonb_build_object(
    'success', true,
    'plano', v_assinatura.plano_id,
    'status', v_assinatura.status
  );

  -- Registra em audit_log
  INSERT INTO audit_log (tenant_id, acao, entidade_tipo, entidade_id, detalhes)
  VALUES (
    p_tenant_id,
    'tenant.plano_atualizado',
    'assinatura',
    v_assinatura.id,
    jsonb_build_object('plano', v_assinatura.plano_id, 'status', v_assinatura.status)
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION fn_tenant_aplicar_plano IS
'Lê assinatura ativa e atualiza o plano do tenant. Chamado pelo webhook do Stripe.';

-- =============================================================================
-- 7. FUNÇÃO: fn_uso_incrementar
-- Incrementa métrica de uso para o tenant no mês corrente
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_uso_incrementar(
  p_tenant_id UUID,
  p_metrica TEXT,
  p_incremento INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes DATE := date_trunc('month', NOW())::date;
  v_record RECORD;
BEGIN
  -- Upsert do registro de uso
  INSERT INTO uso_plano (tenant_id, mes_referencia, obras_mes)
  VALUES (p_tenant_id, v_mes, 0)
  ON CONFLICT (tenant_id, mes_referencia)
  DO UPDATE SET updated_at = NOW();

  -- Incrementa a métrica específica
  CASE p_metrica
    WHEN 'obras_mes' THEN
      UPDATE uso_plano
      SET obras_mes = obras_mes + p_incremento,
          ultima_atualizacao = NOW()
      WHERE tenant_id = p_tenant_id AND mes_referencia = v_mes;
    WHEN 'leads_mes' THEN
      UPDATE uso_plano
      SET leads_mes = leads_mes + p_incremento,
          ultima_atualizacao = NOW()
      WHERE tenant_id = p_tenant_id AND mes_referencia = v_mes;
    WHEN 'envios_wa_dia' THEN
      UPDATE uso_plano
      SET envios_wa_dia = envios_wa_dia + p_incremento,
          envios_wa_mes = envios_wa_mes + p_incremento,
          ultima_atualizacao = NOW()
      WHERE tenant_id = p_tenant_id AND mes_referencia = v_mes;
    WHEN 'envios_wa_mes' THEN
      UPDATE uso_plano
      SET envios_wa_mes = envios_wa_mes + p_incremento,
          ultima_atualizacao = NOW()
      WHERE tenant_id = p_tenant_id AND mes_referencia = v_mes;
    WHEN 'propostas_mes' THEN
      UPDATE uso_plano
      SET propostas_mes = propostas_mes + p_incremento,
          ultima_atualizacao = NOW()
      WHERE tenant_id = p_tenant_id AND mes_referencia = v_mes;
    WHEN 'usuarios' THEN
      UPDATE uso_plano
      SET usuarios = usuarios + p_incremento,
          ultima_atualizacao = NOW()
      WHERE tenant_id = p_tenant_id AND mes_referencia = v_mes;
    WHEN 'produtos_ativos' THEN
      UPDATE uso_plano
      SET produtos_ativos = produtos_ativos + p_incremento,
          ultima_atualizacao = NOW()
      WHERE tenant_id = p_tenant_id AND mes_referencia = v_mes;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Métrica desconhecida: ' || p_metrica);
  END CASE;

  RETURN jsonb_build_object('success', true, 'metrica', p_metrica, 'incremento', p_incremento);
END;
$$;

COMMENT ON FUNCTION fn_uso_incrementar IS
'Incrementa uma métrica de uso para o tenant no mês corrente. Usado em triggers.';

-- =============================================================================
-- 8. FUNÇÃO: fn_uso_validar_limite
-- Verifica se o tenant excedeu o limite de uma métrica
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_uso_validar_limite(
  p_tenant_id UUID,
  p_metrica TEXT,
  p_valor INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_plano RECORD;
  v_uso RECORD;
  v_mes DATE := date_trunc('month', NOW())::date;
  v_limite INTEGER;
  v_usado INTEGER;
  v_permitido BOOLEAN;
BEGIN
  -- Busca tenant com plano
  SELECT t.*, p.limite_obras_mes, p.limite_leads, p.limite_mensagens_dia
  INTO v_tenant
  FROM tenants t
  JOIN planos p ON p.id = t.plano
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant não encontrado');
  END IF;

  -- Busca ou cria registro de uso
  SELECT * INTO v_uso
  FROM uso_plano
  WHERE tenant_id = p_tenant_id AND mes_referencia = v_mes;

  IF NOT FOUND THEN
    -- Primeiro uso do mês, limite não excedido
    RETURN jsonb_build_object('success', true, 'permitido', true, 'usado', 0, 'limite', NULL);
  END IF;

  -- Determina limite e uso baseado na métrica
  CASE p_metrica
    WHEN 'obras_mes' THEN
      v_limite := v_tenant.limite_obras_mes;
      v_usado := v_uso.obras_mes;
    WHEN 'leads_mes' THEN
      v_limite := v_tenant.limite_leads;
      v_usado := v_uso.leads_mes;
    WHEN 'envios_wa_dia' THEN
      v_limite := v_tenant.limite_mensagens_dia;
      v_usado := v_uso.envios_wa_dia;
    WHEN 'usuarios' THEN
      v_limite := v_tenant.usuarios;
      v_usado := v_uso.usuarios;
    ELSE
      -- Métricas sem limite definido ou ilimitadas
      RETURN jsonb_build_object('success', true, 'permitido', true, 'usado', 0, 'limite', NULL);
  END CASE;

  -- Verifica se excedeu (limite NULL ou 999 = ilimitado)
  IF v_limite IS NULL OR v_limite >= 999 THEN
    v_permitido := true;
  ELSE
    v_permitido := (v_usado + COALESCE(p_valor, 1)) <= v_limite;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'permitido', v_permitido,
    'usado', v_usado,
    'limite', v_limite,
    'disponivel', GREATEST(0, v_limite - v_usado)
  );
END;
$$;

COMMENT ON FUNCTION fn_uso_validar_limite IS
'Retorna false se o tenant excedeu o limite da métrica. Usado em triggers antes de criar.';

-- =============================================================================
-- 9. FUNÇÃO: fn_tenant_status_inadimplente
-- Verifica e atualiza status de inadimplência (grace 3d, bloqueia escrita D+4, leitura D+10)
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_tenant_status_inadimplente(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_assinatura RECORD;
  v_dias_inadimplente INTEGER;
  v_status_anterior TEXT;
BEGIN
  -- Busca tenant
  SELECT * INTO v_tenant FROM tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant não encontrado');
  END IF;

  v_status_anterior := v_tenant.status;

  -- Busca assinatura
  SELECT * INTO v_assinatura
  FROM assinaturas
  WHERE tenant_id = p_tenant_id
    AND status IN ('past_due', 'unpaid')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Não está inadimplente, limpa flags se necessário
    IF v_tenant.status = 'inadimplente' THEN
      UPDATE tenants
      SET
        status = 'ativo',
        inadimplente_desde = NULL,
        bloqueado_escrita = false,
        bloqueado_leitura = false,
        grace_periodo_fim = NULL
      WHERE id = p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'ativo',
      'inadimplente', false
    );
  END IF;

  -- Calcula dias de inadimplência
  v_dias_inadimplente := COALESCE(
    EXTRACT(DAYS FROM NOW() - COALESCE(v_assinatura.ultimo_pagamento_em, v_assinatura.periodo_fim, NOW())),
    0
  )::INTEGER;

  -- Atualiza flags baseado nos dias
  UPDATE tenants
  SET
    inadimplente_desde = CASE
      WHEN inadimplente_desde IS NULL THEN NOW()
      ELSE inadimplente_desde
    END,
    -- D+4: bloqueia escrita
    bloqueado_escrita = v_dias_inadimplente >= 4,
    -- D+10: bloqueia leitura
    bloqueado_leitura = v_dias_inadimplente >= 10,
    -- D+3: fim do grace period
    grace_periodo_fim = CASE
      WHEN inadimplente_desde IS NULL THEN NOW() + INTERVAL '3 days'
      ELSE grace_periodo_fim
    END,
    -- Status
    status = CASE
      WHEN v_dias_inadimplente >= 10 THEN 'inadimplente'
      WHEN v_dias_inadimplente >= 4 THEN 'inadimplente'
      ELSE 'ativo'
    END
  WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', CASE WHEN v_dias_inadimplente >= 4 THEN 'inadimplente' ELSE 'ativo' END,
    'inadimplente', v_dias_inadimplente >= 4,
    'dias_inadimplente', v_dias_inadimplente,
    'bloqueado_escrita', v_dias_inadimplente >= 4,
    'bloqueado_leitura', v_dias_inadimplente >= 10,
    'grace_periodo_fim', v_tenant.grace_periodo_fim
  );
END;
$$;

COMMENT ON FUNCTION fn_tenant_status_inadimplente IS
'Verifica inadimplência: grace 3 dias, bloqueia escrita D+4, bloqueia leitura D+10.';

-- =============================================================================
-- 10. FUNÇÃO: fn_assinatura_cancelar
-- Cancelamento com motivo obrigatório
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_assinatura_cancelar(
  p_tenant_id UUID,
  p_motivo_id UUID,
  p_comentario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assinatura RECORD;
  v_motivo RECORD;
  v_tenant RECORD;
BEGIN
  -- Valida motivo
  SELECT * INTO v_motivo FROM motivos_cancelamento WHERE id = p_motivo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Motivo de cancelamento inválido');
  END IF;

  -- Busca assinatura ativa
  SELECT * INTO v_assinatura
  FROM assinaturas
  WHERE tenant_id = p_tenant_id
    AND status IN ('active', 'trialing', 'past_due')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhuma assinatura ativa para cancelar');
  END IF;

  -- Atualiza assinatura
  UPDATE assinaturas
  SET
    status = 'canceled',
    status_pagamento = 'cancelada',
    data_cancelamento = NOW(),
    cancelado_em = NOW(),
    updated_at = NOW()
  WHERE id = v_assinatura.id;

  -- Atualiza tenant
  UPDATE tenants
  SET
    status = 'cancelado',
    updated_at = NOW()
  WHERE id = p_tenant_id;

  -- Registra em audit_log
  INSERT INTO audit_log (tenant_id, acao, entidade_tipo, entidade_id, detalhes)
  VALUES (
    p_tenant_id,
    'assinatura.cancelada',
    'assinatura',
    v_assinatura.id,
    jsonb_build_object(
      'motivo_id', p_motivo_id,
      'motivo_slug', v_motivo.slug,
      'motivo_texto', v_motivo.texto,
      'comentario', p_comentario
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'assinatura_id', v_assinatura.id,
    'motivo', v_motivo.texto
  );
END;
$$;

COMMENT ON FUNCTION fn_assinatura_cancelar IS
'Cancela assinatura com motivo obrigatório. Registra em audit_log.';

-- =============================================================================
-- 11. FUNÇÃO: fn_assinatura_criar_trial
-- Cria assinatura trial de 14 dias (sem Stripe ainda)
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_assinatura_criar_trial(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assinatura_id UUID;
  v_trial_expira TIMESTAMPTZ := NOW() + INTERVAL '14 days';
BEGIN
  -- Verifica se já existe assinatura trial
  IF EXISTS (
    SELECT 1 FROM assinaturas
    WHERE tenant_id = p_tenant_id AND status = 'trialing'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Já existe assinatura trial');
  END IF;

  -- Cria assinatura trial
  INSERT INTO assinaturas (
    tenant_id,
    plano_id,
    status,
    status_pagamento,
    trial_expira_em,
    periodo_inicio,
    periodo_fim,
    valor_mensal
  ) VALUES (
    p_tenant_id,
    'individual',
    'trialing',
    'ativa',
    v_trial_expira,
    NOW(),
    v_trial_expira,
    197.00
  )
  RETURNING id INTO v_assinatura_id;

  -- Atualiza tenant
  UPDATE tenants
  SET
    plano = 'individual',
    status = 'trial',
    trial_expira_em = v_trial_expira
  WHERE id = p_tenant_id;

  -- Registra em audit_log
  INSERT INTO audit_log (tenant_id, acao, entidade_tipo, entidade_id, detalhes)
  VALUES (
    p_tenant_id,
    'assinatura.trial_criado',
    'assinatura',
    v_assinatura_id,
    jsonb_build_object('plano', 'individual', 'expira_em', v_trial_expira)
  );

  RETURN jsonb_build_object(
    'success', true,
    'assinatura_id', v_assinatura_id,
    'trial_expira_em', v_trial_expira,
    'dias_trial', 14
  );
END;
$$;

COMMENT ON FUNCTION fn_assinatura_criar_trial IS
'Cria assinatura trial de 14 dias. Chamado no signup.';

-- =============================================================================
-- 12. FUNÇÃO: fn_assinatura_sync_stripe
-- Sincroniza dados do Stripe com a assinatura local
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_assinatura_sync_stripe(
  p_stripe_subscription_id TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assinatura RECORD;
  v_tenant_id UUID;
  v_status TEXT;
  v_price_id TEXT;
  v_plano_id TEXT;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_customer_id TEXT;
BEGIN
  -- Extrai dados do payload do Stripe
  v_customer_id := p_payload->>'customer';
  v_status := p_payload->>'status';
  v_price_id := p_payload->'items'->'data'->0->'price'->>'id';
  v_period_start := to_timestamp((p_payload->'current_period_start')::numeric);
  v_period_end := to_timestamp((p_payload->'current_period_end')::numeric);

  -- Mapeia price_id para plano_id
  v_plano_id := CASE
    WHEN v_price_id LIKE '%individual%' THEN 'individual'
    WHEN v_price_id LIKE '%equipe%' THEN 'equipe'
    WHEN v_price_id LIKE '%regional%' THEN 'regional'
    WHEN v_price_id LIKE '%obras%' THEN 'obras'
    ELSE 'individual'
  END;

  -- Busca assinatura existente
  SELECT * INTO v_assinatura
  FROM assinaturas
  WHERE stripe_subscription_id = p_stripe_subscription_id;

  IF FOUND THEN
    -- Atualiza assinatura existente
    UPDATE assinaturas
    SET
      status = v_status,
      status_pagamento = CASE
        WHEN v_status = 'active' THEN 'ativa'
        WHEN v_status IN ('past_due', 'unpaid') THEN 'inadimplente'
        ELSE status_pagamento
      END,
      stripe_price_id = v_price_id,
      plano_id = v_plano_id,
      periodo_inicio = v_period_start,
      periodo_fim = v_period_end,
      ultimo_pagamento_em = CASE WHEN v_status = 'active' THEN NOW() ELSE ultimo_pagamento_em END,
      proximo_pagamento_em = v_period_end,
      payload_stripe = p_payload,
      updated_at = NOW()
    WHERE stripe_subscription_id = p_stripe_subscription_id;

    v_tenant_id := v_assinatura.tenant_id;
  ELSE
    -- Nova assinatura (vinda do checkout)
    -- Busca tenant pelo customer_id
    SELECT id INTO v_tenant_id FROM tenants WHERE stripe_customer_id = v_customer_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tenant não encontrado para customer: ' || v_customer_id);
    END IF;

    -- Cria nova assinatura
    INSERT INTO assinaturas (
      tenant_id,
      plano_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      status,
      status_pagamento,
      periodo_inicio,
      periodo_fim,
      valor_mensal,
      ultimo_pagamento_em,
      proximo_pagamento_em,
      payload_stripe
    ) VALUES (
      v_tenant_id,
      v_plano_id,
      v_customer_id,
      p_stripe_subscription_id,
      v_price_id,
      v_status,
      CASE WHEN v_status = 'active' THEN 'ativa' ELSE 'inadimplente' END,
      v_period_start,
      v_period_end,
      p_payload->'items'->'data'->0->'price'->'unit_amount'->>0,
      CASE WHEN v_status = 'active' THEN NOW() ELSE NULL END,
      v_period_end,
      p_payload
    );
  END IF;

  -- Aplica plano ao tenant
  PERFORM fn_tenant_aplicar_plano(v_tenant_id);

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'plano', v_plano_id,
    'status', v_status
  );
END;
$$;

COMMENT ON FUNCTION fn_assinatura_sync_stripe IS
'Sincroniza dados do webhook Stripe com a assinatura local.';

-- =============================================================================
-- 13. TRIGGER: atualizar uso ao criar obra
-- =============================================================================
CREATE OR REPLACE FUNCTION tr_uso_obra_criada()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM fn_uso_incrementar(NEW.tenant_id, 'obras_mes', 1);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_obra_criada_uso ON radar_obras;
CREATE TRIGGER trg_obra_criada_uso
  AFTER INSERT ON radar_obras
  FOR EACH ROW EXECUTE FUNCTION tr_uso_obra_criada();

-- =============================================================================
-- 14. TRIGGER: atualizar uso ao criar lead
-- =============================================================================
CREATE OR REPLACE FUNCTION tr_uso_lead_criado()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM fn_uso_incrementar(NEW.tenant_id, 'leads_mes', 1);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_criado_uso ON crm_leads;
CREATE TRIGGER trg_lead_criado_uso
  AFTER INSERT ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION tr_uso_lead_criado();

-- =============================================================================
-- 15. TRIGGER: atualizar updated_at em assinaturas e faturas
-- =============================================================================
DROP TRIGGER IF EXISTS tr_assinaturas_updated_at ON assinaturas;
CREATE TRIGGER tr_assinaturas_updated_at
  BEFORE UPDATE ON assinaturas
  FOR EACH ROW EXECUTE FUNCTION updated_at();

DROP TRIGGER IF EXISTS tr_faturas_updated_at ON faturas;
CREATE TRIGGER tr_faturas_updated_at
  BEFORE UPDATE ON faturas
  FOR EACH ROW EXECUTE FUNCTION updated_at();

-- =============================================================================
-- 16. RLS para novas tabelas
-- =============================================================================
ALTER TABLE motivos_cancelamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "motivos_cancelamento_read" ON motivos_cancelamento
  FOR SELECT USING (ativo = true);

ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assinaturas_tenant" ON assinaturas
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

ALTER TABLE faturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "faturas_tenant" ON faturas
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

ALTER TABLE uso_plano ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uso_plano_tenant" ON uso_plano
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

-- =============================================================================
-- 17. JOB CRON: verificar inadimplência diariamente
-- =============================================================================
-- Este job é configurado via pg_cron no Supabase
-- SELECT cron.schedule('check_inadimplencia', '0 6 * * *', $$
--   UPDATE tenants t
--   SET
--     inadimplente_desde = CASE WHEN a.status IN ('past_due', 'unpaid') AND t.inadimplente_desde IS NULL THEN NOW() ELSE t.inadimplente_desde END,
--     bloqueado_escrita = EXTRACT(DAYS FROM NOW() - COALESCE(a.ultimo_pagamento_em, a.periodo_fim, NOW())) >= 4,
--     bloqueado_leitura = EXTRACT(DAYS FROM NOW() - COALESCE(a.ultimo_pagamento_em, a.periodo_fim, NOW())) >= 10
--   FROM assinaturas a
--   WHERE a.tenant_id = t.id AND a.status IN ('past_due', 'unpaid');
-- $$);

-- =============================================================================
-- 18. JOB CRON: resetar contador de envios WA diário
-- =============================================================================
-- Roda todo dia à meia-noite
-- SELECT cron.schedule('reset_wa_dia', '0 0 * * *', $$
--   UPDATE uso_plano SET envios_wa_dia = 0 WHERE mes_referencia = date_trunc('month', NOW())::date;
-- $$);

-- =============================================================================
-- FIM DA MIGRATION
-- =============================================================================
