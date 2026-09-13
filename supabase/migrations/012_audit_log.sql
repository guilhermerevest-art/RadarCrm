-- =============================================================================
-- MIGRATION 012: Audit Log
-- Registra acoes sensiveis para compliance e rastreabilidade
-- =============================================================================

-- 0. Renomear coluna para 'recurso' caso a tabela ja exista (migration 001 usou
--    'entidade_tipo' ou 'tabela' em alguma versao - cobrimos todas)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'entidade_tipo'
  ) THEN
    ALTER TABLE audit_log RENAME COLUMN entidade_tipo TO recurso;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'tabela'
  ) THEN
    ALTER TABLE audit_log RENAME COLUMN tabela TO recurso;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  recurso TEXT NOT NULL,
  registro_id UUID,
  detalhes JSONB DEFAULT '{}',
  ip_endereco TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_recurso ON audit_log(recurso);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Leitura: admins do tenant ou superusuarios
CREATE POLICY "audit_admin_read" ON audit_log
  FOR SELECT USING (
    (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND papel = 'admin'))
    OR (tenant_id IS NULL AND EXISTS (SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND papel = 'admin'))
  );
-- Insert via trigger automatico apenas (apenas SECURITY DEFINER insere)
CREATE POLICY "audit_insert_only" ON audit_log
  FOR INSERT WITH CHECK (true);

-- Function: registrar audit log generico
-- Drop CASCADE para limpar qualquer versao anterior com assinatura diferente
DO $$
DECLARE v_sig TEXT;
BEGIN
  FOR v_sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_audit_log'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', v_sig);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION fn_audit_log(
  p_tenant_id UUID,
  p_user_id UUID,
  p_acao TEXT,
  p_recurso TEXT,
  p_registro_id UUID,
  p_detalhes JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO audit_log (tenant_id, user_id, acao, recurso, registro_id, detalhes)
  VALUES (p_tenant_id, p_user_id, p_acao, p_recurso, p_registro_id, p_detalhes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION fn_audit_log IS
  'Registra uma entrada no audit_log. Usar via triggers automaticos ou chamadas diretas SECURITY DEFINER.';

-- Trigger: tenant_users - monitorar mudanca de papel e remocoes
CREATE OR REPLACE FUNCTION tr_audit_tenant_users()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_audit_log(
      NEW.tenant_id, NEW.user_id, 'DELETE', 'tenant_users', NEW.user_id,
      jsonb_build_object('papel_removido', NEW.papel, 'nome', NEW.nome)
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.papel IS DISTINCT FROM NEW.papel OR OLD.ativo IS DISTINCT FROM NEW.ativo THEN
      PERFORM fn_audit_log(
        NEW.tenant_id, NEW.user_id, 'UPDATE_PAPEL', 'tenant_users', NEW.user_id,
        jsonb_build_object(
          'papel_anterior', OLD.papel, 'papel_novo', NEW.papel,
          'ativo_anterior', OLD.ativo, 'ativo_novo', NEW.ativo
        )
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_audit_tenant_users ON tenant_users;
CREATE TRIGGER tr_audit_tenant_users
  AFTER UPDATE OR DELETE ON tenant_users
  FOR EACH ROW EXECUTE FUNCTION tr_audit_tenant_users();

-- Trigger: tenants - monitorar mudanca de plano e desativacao
CREATE OR REPLACE FUNCTION tr_audit_tenants()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.plano IS DISTINCT FROM NEW.plano THEN
    PERFORM fn_audit_log(
      NEW.id, NULL, 'MUDANCA_PLANO', 'tenants', NEW.id,
      jsonb_build_object('plano_anterior', OLD.plano, 'plano_novo', NEW.plano)
    );
  END IF;
  IF OLD.ativo IS DISTINCT FROM NEW.ativo THEN
    PERFORM fn_audit_log(
      NEW.id, NULL, 'MUDANCA_ATIVO', 'tenants', NEW.id,
      jsonb_build_object('ativo_anterior', OLD.ativo, 'ativo_novo', NEW.ativo)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_audit_tenants ON tenants;
CREATE TRIGGER tr_audit_tenants
  AFTER UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION tr_audit_tenants();

-- Trigger: crm_leads - monitorar delete
CREATE OR REPLACE FUNCTION tr_audit_crm_leads()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM fn_audit_log(
    OLD.tenant_id, NULL, 'DELETE', 'crm_leads', OLD.id,
    jsonb_build_object('nome', OLD.nome, 'status', OLD.status)
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_audit_crm_leads ON crm_leads;
CREATE TRIGGER tr_audit_crm_leads
  BEFORE DELETE ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION tr_audit_crm_leads();

-- Trigger: crm_deals - monitorar delete e mudanca de fase
CREATE OR REPLACE FUNCTION tr_audit_crm_deals()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_audit_log(
      OLD.tenant_id, NULL, 'DELETE', 'crm_deals', OLD.id,
      jsonb_build_object('nome', OLD.nome, 'valor', OLD.valor)
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.fase IS DISTINCT FROM NEW.fase THEN
      PERFORM fn_audit_log(
        NEW.tenant_id, NULL, 'MUDANCA_FASE_DEAL', 'crm_deals', NEW.id,
        jsonb_build_object(
          'nome', NEW.nome,
          'fase_anterior', OLD.fase,
          'fase_nova', NEW.fase,
          'valor', NEW.valor
        )
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_audit_crm_deals ON crm_deals;
CREATE TRIGGER tr_audit_crm_deals
  AFTER UPDATE OR DELETE ON crm_deals
  FOR EACH ROW EXECUTE FUNCTION tr_audit_crm_deals();

-- Trigger: whatsapp_instances - monitorar conexao/desconexao
CREATE OR REPLACE FUNCTION tr_audit_whatsapp_instances()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM fn_audit_log(
      NEW.tenant_id, NULL,
      CASE
        WHEN NEW.status = 'connected' THEN 'WHATSAPP_CONECTADO'
        WHEN NEW.status = 'disconnected' THEN 'WHATSAPP_DESCONECTADO'
        ELSE 'WHATSAPP_STATUS_CHANGE'
      END,
      'whatsapp_instances', NEW.id,
      jsonb_build_object('status_anterior', OLD.status, 'status_novo', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_audit_whatsapp_instances ON whatsapp_instances;
CREATE TRIGGER tr_audit_whatsapp_instances
  AFTER UPDATE ON whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION tr_audit_whatsapp_instances();

-- Function: reter audit_log (deleta entradas com mais de 12 meses)
CREATE OR REPLACE FUNCTION fn_audit_retention_cleanup()
RETURNS INTEGER AS $$
DECLARE
  v_deletados INTEGER;
BEGIN
  DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '12 months';
  GET DIAGNOSTICS v_deletados = ROW_COUNT;
  RETURN v_deletados;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_audit_retention_cleanup IS
  'Remove entradas do audit_log com mais de 12 meses. Pode ser agendada via cron.';

-- Agendar retencao mensal (dia 1 de cada mes as 03:30)
SELECT cron.schedule(
  'audit-retention-mensal',
  '30 3 1 * *',
  'SELECT fn_audit_retention_cleanup()'
);

-- =============================================================================
-- FIM DA MIGRATION 012
-- =============================================================================
