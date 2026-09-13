-- =============================================================================
-- MIGRATION 014: CRM Automations (crm_automacoes)
-- Automations table for CRM triggers and actions
-- =============================================================================

-- Tabela de automacoes CRM
CREATE TABLE IF NOT EXISTS crm_automacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  gatilho_tipo TEXT NOT NULL
    CHECK (gatilho_tipo IN (
      'deal_entrou_estagio',
      'deal_saiu_estagio',
      'lead_novo',
      'lead_status_trocou',
      'atividade_vencida',
      'deal_sem_atividade_7dias'
    )),
  gatilho_config JSONB DEFAULT '{}',
  acao_tipo TEXT NOT NULL
    CHECK (acao_tipo IN (
      'enviar_whatsapp',
      'criar_atividade',
      'notificar_responsavel',
      'mover_deal_estagio',
      'atualizar_probabilidade'
    )),
  acao_config JSONB DEFAULT '{}',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  condicao_adicional JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES tenant_users(id)
);

CREATE INDEX IF NOT EXISTS idx_automacoes_tenant ON crm_automacoes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_automacoes_ativo ON crm_automacoes(tenant_id, ativo);
CREATE INDEX IF NOT EXISTS idx_automacoes_gatilho ON crm_automacoes(tenant_id, gatilho_tipo);

-- RLS para automacoes
ALTER TABLE crm_automacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Automacoes do tenant" ON crm_automacoes
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

-- Trigger updated_at
CREATE TRIGGER tr_updated_at_automacoes
  BEFORE UPDATE ON crm_automacoes
  FOR EACH ROW EXECUTE FUNCTION updated_at();

-- Funcao para executar automacao
CREATE OR REPLACE FUNCTION fn_crm_executar_automacao(
  p_automacao_id UUID,
  p_contexto JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
DECLARE
  v_automacao crm_automacoes%ROWTYPE;
  v_result JSONB;
BEGIN
  -- Busca automacao
  SELECT * INTO v_automacao FROM crm_automacoes WHERE id = p_automacao_id AND ativo = TRUE;

  IF v_automacao IS NULL THEN
    RETURN;
  END IF;

  -- Executa acao baseada no tipo
  CASE v_automacao.acao_tipo
    WHEN 'criar_atividade' THEN
      -- Cria atividade no banco
      INSERT INTO crm_atividades (
        tenant_id,
        lead_id,
        deal_id,
        tipo,
        descricao,
        data_vencimento,
        responsavel_id,
        status
      ) VALUES (
        v_automacao.tenant_id,
        (p_contexto->>'lead_id')::UUID,
        (p_contexto->>'deal_id')::UUID,
        COALESCE(v_automacao.acao_config->>'tipo', 'tarefa'),
        COALESCE(v_automacao.acao_config->>'descricao', 'Atividade criada por automacao'),
        NOW() + (COALESCE(v_automacao.acao_config->>'dias_prazo', '1')::INT || ' days')::INTERVAL,
        (p_contexto->>'responsavel_id')::UUID,
        'pendente'
      );

    WHEN 'notificar_responsavel' THEN
      -- Log para implementacao futura de notificacoes
      RAISE NOTICE 'Automacao %: notificar_responsavel para deal %',
        v_automacao.id, p_contexto->>'deal_id';

    WHEN 'atualizar_probabilidade' THEN
      -- Atualiza probabilidade do deal
      IF p_contexto->>'deal_id' IS NOT NULL THEN
        UPDATE crm_deals SET
          probabilidade = COALESCE(
            (v_automacao.acao_config->>'probabilidade')::INT,
            probabilidade
          ),
          updated_at = NOW()
        WHERE id = (p_contexto->>'deal_id')::UUID;
      END IF;

    WHEN 'mover_deal_estagio' THEN
      -- Move deal para estagio especificado
      IF p_contexto->>'deal_id' IS NOT NULL THEN
        UPDATE crm_deals SET
          estagio = COALESCE(v_automacao.acao_config->>'estagio', estagio),
          updated_at = NOW()
        WHERE id = (p_contexto->>'deal_id')::UUID;
      END IF;

    ELSE
      RAISE NOTICE 'Tipo de acao % nao implementado', v_automacao.acao_tipo;
  END CASE;

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Erro ao executar automacao %: %', p_automacao_id, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para executar automacoes quando deal muda de estagio
CREATE OR REPLACE FUNCTION tr_crm_deal_estagio_changed()
RETURNS TRIGGER AS $$
DECLARE
  v_estagio RECORD;
BEGIN
  -- Se estagio mudou
  IF OLD.estagio IS DISTINCT FROM NEW.estagio THEN
    -- Busca automacoes para este gatilho
    FOR v_estagio IN
      SELECT * FROM crm_automacoes
      WHERE tenant_id = NEW.tenant_id
        AND ativo = TRUE
        AND gatilho_tipo = 'deal_entrou_estagio'
        AND (gatilho_config->>'estagio' IS NULL OR gatilho_config->>'estagio' = NEW.estagio)
    LOOP
      PERFORM fn_crm_executar_automacao(
        v_estagio.id,
        jsonb_build_object(
          'deal_id', NEW.id,
          'lead_id', NEW.lead_id,
          'estagio_anterior', OLD.estagio,
          'estagio_novo', NEW.estagio,
          'responsavel_id', NEW.responsavel_id,
          'tenant_id', NEW.tenant_id
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_crm_deal_estagio_changed ON crm_deals;
CREATE TRIGGER tr_crm_deal_estagio_changed
  AFTER UPDATE OF estagio ON crm_deals
  FOR EACH ROW EXECUTE FUNCTION tr_crm_deal_estagio_changed();

COMMENT ON TABLE crm_automacoes IS
  'Automacoes de CRM: gatilhos e acoes para deals, leads e atividades.';
