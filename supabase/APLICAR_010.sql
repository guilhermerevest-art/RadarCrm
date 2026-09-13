-- =============================================================================
-- APLICAR_010: WhatsApp Integration via Evolution API
-- Execute este arquivo no SQL Editor do Supabase (Dashboard > SQL Editor > New Query)
-- =============================================================================

-- 1. Tabela de instancias WhatsApp por tenant
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL DEFAULT 'default',
  instance_id_external TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected','connecting','connected','failed')),
  phone_number TEXT,
  qr_code TEXT,
  qr_expires_at TIMESTAMPTZ,
  evolution_api_url TEXT NOT NULL,
  evolution_api_key TEXT NOT NULL,
  is_default BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, instance_name)
);

CREATE INDEX IF NOT EXISTS idx_wa_instances_tenant ON whatsapp_instances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wa_instances_status ON whatsapp_instances(status);

-- RLS: admin only
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_instances_admin" ON whatsapp_instances
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND papel = 'admin'
    )
  );

-- 2. Tabela de contatos WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
  nome TEXT,
  telefone TEXT NOT NULL,
  whatsapp_id TEXT,
  avatar_url TEXT,
  about TEXT,
  is_group BOOLEAN DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, telefone)
);

CREATE INDEX IF NOT EXISTS idx_wa_contatos_tenant ON whatsapp_contatos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wa_contatos_telefone ON whatsapp_contatos(tenant_id, telefone);

ALTER TABLE whatsapp_contatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_contatos_tenant" ON whatsapp_contatos
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- 3. Tabela de mensagens WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  contato_id UUID REFERENCES whatsapp_contatos(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL DEFAULT 'text'
    CHECK (tipo IN ('text','image','video','document','audio','sticker','location','contact','template','buttons','reaction')),
  direcao TEXT NOT NULL DEFAULT 'sent'
    CHECK (direcao IN ('sent','received','bot')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','delivered','read','failed','error')),
  conteudo TEXT NOT NULL,
  midia_url TEXT,
  midia_mime_type TEXT,
  template_id TEXT,
  template_namespace TEXT,
  reaction TEXT,
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_msg_tenant ON whatsapp_mensagens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_contato ON whatsapp_mensagens(contato_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_lead ON whatsapp_mensagens(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_instance ON whatsapp_mensagens(instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_status ON whatsapp_mensagens(tenant_id, status);

ALTER TABLE whatsapp_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_msg_tenant" ON whatsapp_mensagens
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() LIMIT 1
    )
  );
CREATE POLICY "wa_msg_insert" ON whatsapp_mensagens
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Tabela de templates de mensagem
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'marketing'
    CHECK (categoria IN ('marketing','utilitario','autenticacao','educativo')),
  conteudo TEXT NOT NULL,
  variaveis TEXT[] DEFAULT '{}',
  midia_url TEXT,
  midia_mime_type TEXT,
  botoes JSONB DEFAULT '[]',
  namespace TEXT,
  tipo TEXT NOT NULL DEFAULT 'text'
    CHECK (tipo IN ('text','image','video','document','audio')),
  is_ativo BOOLEAN DEFAULT true,
  uso_count INTEGER DEFAULT 0,
  escopo TEXT NOT NULL DEFAULT 'tenant'
    CHECK (escopo IN ('tenant','global')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT whatsapp_templates_tenant_nome_unique UNIQUE NULLS NOT DISTINCT (tenant_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_wa_templates_tenant ON whatsapp_templates(tenant_id);

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_templates_select" ON whatsapp_templates
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
    OR escopo = 'global'
  );
-- Permite admin/gerente gerenciar templates do proprio tenant OU templates globais (tenant_id IS NULL)
CREATE POLICY "wa_templates_write" ON whatsapp_templates
  FOR ALL USING (
    (tenant_id IS NULL)
    OR
    (tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND papel IN ('admin','gerente')
    ))
  );

-- 5. Seed de templates globais (padrao da plataforma, compartilhados)
-- Garantir que tenant_id aceita NULL mesmo se a tabela ja existia
ALTER TABLE whatsapp_templates ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_tenant_nome_unique;
ALTER TABLE whatsapp_templates ADD CONSTRAINT whatsapp_templates_tenant_nome_unique UNIQUE NULLS NOT DISTINCT (tenant_id, nome);

INSERT INTO whatsapp_templates (tenant_id, escopo, nome, categoria, conteudo, variaveis, tipo) VALUES
  (NULL, 'global', 'primeiro_contato', 'marketing',
   'Ola {{nome}}! Vi que voce esta com obras em andamento em {{cidade}}. ' ||
   'Trabalhamos com concreto e materiais para construcao civil. ' ||
   'Posso te enviar nosso catalogo?', '{"nome","cidade"}', 'text'),
  (NULL, 'global', 'proposta_enviada', 'utilitario',
   'Boa tarde {{nome}}! Segue a proposta conforme conversamos. ' ||
   'Fico a disposicao para duvidas! Atens, {{usuario}}',
   '{"nome","usuario"}', 'text'),
  (NULL, 'global', 'retorno_lead', 'marketing',
   'Ola {{nome}}! Tudo bem? Voce teve a oportunidade de verificar ' ||
   'a proposta que enviamos? Estou a disposicao para qualquer duvida.',
   '{"nome"}', 'text'),
  (NULL, 'global', 'lembrete_visita', 'utilitario',
   'Ola {{nome}}! Lembrando que temos uma visita agendada para ' ||
   '{{data}} as {{hora}} na obra {{obra}}. Qualquer alteracao, me avise!',
   '{"nome","data","hora","obra"}', 'text')
ON CONFLICT DO NOTHING;

-- 6. Funcao helper: enviar mensagem via Evolution API
CREATE OR REPLACE FUNCTION fn_whatsapp_send_message(
  p_instance_id UUID,
  p_telefone TEXT,
  p_conteudo TEXT,
  p_tipo TEXT DEFAULT 'text',
  p_midia_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance RECORD;
  v_api_url TEXT;
  v_api_key TEXT;
  v_body JSONB;
  v_response JSONB;
  v_msg_id UUID;
  v_contato_id UUID;
BEGIN
  SELECT * INTO v_instance
  FROM whatsapp_instances
  WHERE id = p_instance_id AND status = 'connected';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Instance not connected');
  END IF;

  v_api_url := v_instance.evolution_api_url;
  v_api_key := v_instance.evolution_api_key;

  v_body := jsonb_build_object(
    'number', p_telefone,
    'text', p_conteudo
  );

  IF p_tipo != 'text' AND p_midia_url IS NOT NULL THEN
    v_body := v_body || jsonb_build_object(
      'mediatype', p_tipo,
      'media', p_midia_url,
      'caption', p_conteudo
    );
  END IF;

  BEGIN
    SELECT content::jsonb INTO v_response
    FROM http_post(
      v_api_url || '/message/sendText/' || v_instance.instance_name,
      v_body::text,
      'application/json',
      jsonb_build_object('apikey', v_api_key)::text
    ) AS req
    WHERE req.status BETWEEN 200 AND 299;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'HTTP request failed: ' || SQLERRM);
  END;

  IF v_response->'key'->>'id' IS NOT NULL THEN
    INSERT INTO whatsapp_mensagens (
      tenant_id, instance_id, contato_id, tipo, direcao, status,
      conteudo, midia_url
    ) VALUES (
      v_instance.tenant_id, p_instance_id,
      (SELECT id FROM whatsapp_contatos WHERE telefone = p_telefone LIMIT 1),
      p_tipo, 'sent', 'sent',
      p_conteudo, p_midia_url
    )
    RETURNING id INTO v_msg_id;

    RETURN jsonb_build_object(
      'success', true,
      'message_id', v_msg_id,
      'wa_message_id', v_response->'key'->>'id'
    );
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'No message ID returned', 'response', v_response);
  END IF;
END;
$$;

COMMENT ON FUNCTION fn_whatsapp_send_message IS
  'Envia mensagem WhatsApp via Evolution API. Retorna {success, message_id} ou {success:false, error}.';

-- 7. Trigger: atualizar updated_at
CREATE TRIGGER tr_whatsapp_instances_updated_at
  BEFORE UPDATE ON whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION updated_at();

CREATE TRIGGER tr_whatsapp_contatos_updated_at
  BEFORE UPDATE ON whatsapp_contatos
  FOR EACH ROW EXECUTE FUNCTION updated_at();

CREATE TRIGGER tr_whatsapp_mensagens_updated_at
  BEFORE UPDATE ON whatsapp_mensagens
  FOR EACH ROW EXECUTE FUNCTION updated_at();

CREATE TRIGGER tr_whatsapp_templates_updated_at
  BEFORE UPDATE ON whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION updated_at();
