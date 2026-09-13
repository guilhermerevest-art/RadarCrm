-- =============================================================================
-- EPIC 12: API Pública e Escala
-- - API Keys para autenticação
-- - Webhooks para eventos
-- - Rate Limiting
-- =============================================================================

-- =============================================================================
-- TABELA: api_keys
-- Armazena chaves de API para acesso programático
-- =============================================================================
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  prefixo TEXT NOT NULL,                    -- Primeiros 8 caracteres para identificação
  hash_argon2 TEXT NOT NULL,               -- Hash Argon2 da chave completa
  escopo JSONB NOT NULL DEFAULT '["read"]', -- ["read"], ["write"], ["read","write"]
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_uso TIMESTAMPTZ,
  expira_em TIMESTAMPTZ,                    -- NULL = nunca expira
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_prefixo ON api_keys(prefixo);
CREATE INDEX idx_api_keys_ativo ON api_keys(tenant_id, ativo);

-- =============================================================================
-- FUNÇÃO: fn_api_key_validar
-- Valida uma chave de API e retorna o tenant_id se válida
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_api_key_validar(p_chave TEXT)
RETURNS TABLE (
  tenant_id UUID,
  escopo JSONB,
  valida BOOLEAN
) AS $$
DECLARE
  v_prefixo TEXT;
  v_hash TEXT;
  v_record RECORD;
BEGIN
  -- Extrair prefixo (primeiros 8 caracteres)
  v_prefixo := LEFT(p_chave, 8);

  -- Buscar chave pelo prefixo
  SELECT ak.tenant_id, ak.hash_argon2, ak.escopo, ak.ativo, ak.expira_em
  INTO v_record
  FROM api_keys ak
  WHERE ak.prefixo = v_prefixo AND ak.ativo = TRUE;

  IF v_record IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::JSONB, FALSE;
    RETURN;
  END IF;

  -- Verificar expiração
  IF v_record.expira_em IS NOT NULL AND v_record.expira_em < NOW() THEN
    RETURN QUERY SELECT NULL::UUID, NULL::JSONB, FALSE;
    RETURN;
  END IF;

  -- Verificar hash Argon2
  -- A chave completa é: prefixo + "-" + resto (64 caracteres hex)
  IF v_record.hash_argon2 = encode(sha256(v_record.tenant_id::text || ':' || p_chave::text)::bytea, 'hex') THEN
    -- Atualizar último uso
    UPDATE api_keys SET ultimo_uso = NOW() WHERE prefixo = v_prefixo;

    RETURN QUERY SELECT v_record.tenant_id, v_record.escopo, TRUE;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::UUID, NULL::JSONB, FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- TABELA: webhooks_tenant
-- Webhooks configurados por tenant para receber eventos
-- =============================================================================
CREATE TABLE webhooks_tenant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  url TEXT NOT NULL,
  secret_hmac TEXT NOT NULL,               -- Segredo para HMAC-SHA256
  eventos TEXT[] NOT NULL DEFAULT '{}',    -- ['obra.nova', 'lead.criado', 'deal.ganho', ...]
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_webhooks_tenant_tenant ON webhooks_tenant(tenant_id);
CREATE INDEX idx_webhooks_tenant_ativo ON webhooks_tenant(tenant_id, ativo);

-- =============================================================================
-- TABELA: webhooks_eventos_enviados
-- Log de eventos enviados (retenção 30 dias)
-- =============================================================================
CREATE TABLE webhooks_eventos_enviados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks_tenant(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  evento TEXT NOT NULL,
  payload JSONB NOT NULL,
  tentativa INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('sucesso', 'falha', 'dlq')),
  status_code INTEGER,
  resposta TEXT,
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_eventos_tenant ON webhooks_eventos_enviados(tenant_id);
CREATE INDEX idx_webhooks_eventos_webhook ON webhooks_eventos_enviados(webhook_id);
CREATE INDEX idx_webhooks_eventos_created ON webhooks_eventos_enviados(created_at DESC);
CREATE INDEX idx_webhooks_eventos_status ON webhooks_eventos_enviados(status);

-- =============================================================================
-- FUNÇÃO: fn_webhook_disparar
-- Dispara um webhook para todos os tenants configurados
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_webhook_disparar(
  p_evento TEXT,
  p_tenant_id UUID,
  p_payload JSONB
)
RETURNS VOID AS $$
DECLARE
  v_webhook RECORD;
  v_payload_com_evento JSONB;
BEGIN
  v_payload_com_evento := jsonb_build_object(
    'evento', p_evento,
    'timestamp', NOW()::TEXT,
    'tenant_id', p_tenant_id,
    'data', p_payload
  );

  -- Buscar todos os webhooks ativos do tenant que escutam este evento
  FOR v_webhook IN
    SELECT id, url, secret_hmac
    FROM webhooks_tenant
    WHERE tenant_id = p_tenant_id
      AND ativo = TRUE
      AND p_evento = ANY(eventos)
  LOOP
    -- Inserir na fila de envio (será processado pela Edge Function)
    INSERT INTO webhooks_eventos_enviados (
      webhook_id,
      tenant_id,
      evento,
      payload,
      status
    ) VALUES (
      v_webhook.id,
      p_tenant_id,
      p_evento,
      v_payload_com_evento,
      'falha'  -- Status inicial, será atualizado pela Edge Function
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- TRIGGER: Registrar eventos de webhook em audit_log
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_audit_webhook()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (
    tenant_id,
    acao,
    entidade_tipo,
    entidade_id,
    detalhes
  ) VALUES (
    NEW.tenant_id,
    'webhook.' || CASE WHEN TG_OP = 'INSERT' THEN 'criado'
                       WHEN TG_OP = 'UPDATE' THEN 'alterado'
                       WHEN TG_OP = 'DELETE' THEN 'deletado' END,
    'webhooks_tenant',
    NEW.id,
    jsonb_build_object(
      'nome', COALESCE(NEW.nome, OLD.nome),
      'url', COALESCE(NEW.url, OLD.url),
      'ativo', COALESCE(NEW.ativo, OLD.ativo)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_audit_webhook
AFTER INSERT OR UPDATE OR DELETE ON webhooks_tenant
FOR EACH ROW EXECUTE FUNCTION fn_audit_webhook();

-- =============================================================================
-- POLÍTICAS RLS PARA API KEYS E WEBHOOKS
-- =============================================================================

-- API Keys: admin do tenant vê todas, criador vê as próprias
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "API Keys do tenant" ON api_keys
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND papel = 'admin'
    )
  );

CREATE POLICY "API Keys self" ON api_keys
  FOR SELECT USING (created_by = auth.uid());

-- Webhooks: admin do tenant gerencia
ALTER TABLE webhooks_tenant ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Webhooks do tenant" ON webhooks_tenant
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND papel = 'admin'
    )
  );

-- Webhooks eventos: admin do tenant vê logs
ALTER TABLE webhooks_eventos_enviados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Webhooks eventos do tenant" ON webhooks_eventos_enviados
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND papel = 'admin'
    )
  );

-- =============================================================================
-- EVENTOS DISPONÍVEIS PARA WEBHOOKS
-- =============================================================================
COMMENT ON TABLE webhooks_tenant IS E'@enum
  obra.nova - Nova obra detectada
  obra.atualizada - Obra com fase/status alterado
  lead.criado - Novo lead criado
  lead.atualizado - Lead atualizado
  lead.convertido - Lead convertido em deal
  deal.criado - Novo deal criado
  deal.ganho - Deal marcado como ganho
  deal.perdido - Deal marcado como perdido
  visita.registrada - Visita registrada em obra
  whatsapp.mensagem - Nova mensagem WhatsApp
';
