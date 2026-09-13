-- =============================================================================
-- MIGRATION 011: WhatsApp Advanced Features (Bot de Welcome + Alertas)
-- E8: Bot de Welcome, Alerta Diario de Obras, Health Monitor, Templates Sync
-- =============================================================================

-- 0. Limpar policies existentes para tornar a migration idempotente
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN (
      'wa_session','wa_alerta_filtros','wa_optins'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS tr_wa_session_expira ON wa_session;
DROP TRIGGER IF EXISTS tr_wa_alerta_filtros_updated_at ON wa_alerta_filtros;

-- =============================================================================
-- 1. Tabela wa_session: maquina de estados do bot de welcome
-- =============================================================================
CREATE TABLE IF NOT EXISTS wa_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'CIDADE'
    CHECK (estado IN ('CIDADE', 'SEGMENTO', 'AMOSTRA', 'CONCLUIDO', 'EXPIRADO')),
  contexto JSONB DEFAULT '{}' NOT NULL,
  -- contexto esperado:
  -- { cidade: string, segmento: string, obras_enviadas: uuid[], criado_em: timestamp }
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_session_user ON wa_session(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_session_expira ON wa_session(expira_em);
CREATE INDEX IF NOT EXISTS idx_wa_session_estado ON wa_session(estado);

-- RLS: usuario ve/apaga apenas sua propria sessao
ALTER TABLE wa_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_session_user_select" ON wa_session
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "wa_session_user_all" ON wa_session
  FOR ALL USING (user_id = auth.uid());

-- Funcao para expirar sessoes
CREATE OR REPLACE FUNCTION fn_wa_session_expirar()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE wa_session
  SET estado = 'EXPIRADO',
      updated_at = NOW()
  WHERE estado NOT IN ('EXPIRADO', 'CONCLUIDO')
    AND expira_em < NOW();
END;
$$;

-- Trigger para expirar sessoes automaticamente
CREATE TRIGGER tr_wa_session_expira
  BEFORE INSERT OR UPDATE ON wa_session
  FOR EACH ROW
  WHEN (NEW.estado = 'CIDADE')
  EXECUTE FUNCTION fn_wa_session_expirar();

-- =============================================================================
-- 2. Tabela wa_alerta_filtros: configuracao de alertas diarios
-- =============================================================================
CREATE TABLE IF NOT EXISTS wa_alerta_filtros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT 'Meu Alerta',
  raio_km INTEGER NOT NULL DEFAULT 25,
  centro_lat NUMERIC(10, 7),
  centro_lng NUMERIC(10, 7),
  centro_endereco TEXT,
  cidade TEXT,
  uf CHAR(2) DEFAULT 'MG',
  segmentos TEXT[] DEFAULT '{}',
  -- segmentos aceitos: concreto, locacao, material, servico, outro
  fases TEXT[] DEFAULT ARRAY['alvara', 'fundacao']::TEXT[],
  ativo BOOLEAN DEFAULT true,
  ultimo_envio_em TIMESTAMPTZ,
  obras_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_wa_alerta_tenant ON wa_alerta_filtros(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wa_alerta_ativo ON wa_alerta_filtros(ativo);

-- RLS: equipe do tenant acessa
ALTER TABLE wa_alerta_filtros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_alerta_tenant_select" ON wa_alerta_filtros
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "wa_alerta_tenant_write" ON wa_alerta_filtros
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND papel IN ('admin', 'gerente')
    )
  );

-- Trigger updated_at
CREATE TRIGGER tr_wa_alerta_filtros_updated_at
  BEFORE UPDATE ON wa_alerta_filtros
  FOR EACH ROW EXECUTE FUNCTION updated_at();

-- =============================================================================
-- 3. Tabela wa_optins: controle de consentimento LGPD
-- =============================================================================
CREATE TABLE IF NOT EXISTS wa_optins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  -- formato: DDI + DDD + numero (ex: 5534999999999)
  escopo TEXT[] NOT NULL DEFAULT ARRAY['utilidade']::TEXT[]
    CHECK (escopo <@ ARRAY['utilidade', 'marketing']::TEXT[]),
  consented_at TIMESTAMPTZ DEFAULT NOW(),
  ip_consent TEXT,
  user_agent_consent TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_via TEXT CHECK (revoked_via IN ('palavra_chave', 'manual', 'email_link')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(numero)
);

CREATE INDEX IF NOT EXISTS idx_wa_optins_numero ON wa_optins(numero);
CREATE INDEX IF NOT EXISTS idx_wa_optins_user ON wa_optins(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_optins_ativo ON wa_optins(revoked_at) WHERE revoked_at IS NULL;

-- RLS: admin do tenant ou proprio usuario
ALTER TABLE wa_optins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_optins_select" ON wa_optins
  FOR SELECT USING (
    user_id = auth.uid()
    OR tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND papel IN ('admin', 'gerente')
    )
  );
CREATE POLICY "wa_optins_insert" ON wa_optins
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================================================
-- 4. Funcao: Buscar obras para alerta
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_wa_alerta_obras_montar(
  p_filtro_id UUID,
  p_max_obras INTEGER DEFAULT 5
)
RETURNS TABLE (
  obra_id UUID,
  endereco TEXT,
  cidade TEXT,
  fase TEXT,
  porte TEXT,
  distancia_km NUMERIC,
  score INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filtro RECORD;
  v_obras_lat_max NUMERIC;
  v_obras_lat_min NUMERIC;
  v_obras_lng_max NUMERIC;
  v_obras_lng_min NUMERIC;
BEGIN
  -- Buscar configuracao do filtro
  SELECT * INTO v_filtro
  FROM wa_alerta_filtros
  WHERE id = p_filtro_id AND ativo = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Se tem coordenadas, usar PostGIS
  IF v_filtro.centro_lat IS NOT NULL AND v_filtro.centro_lng IS NOT NULL THEN
    -- Calcular bounding box aproximada (graus = km / 111)
    v_obras_lat_max := v_filtro.centro_lat + (v_filtro.raio_km / 111.0);
    v_obras_lat_min := v_filtro.centro_lat - (v_filtro.raio_km / 111.0);
    v_obras_lng_max := v_filtro.centro_lng + (v_filtro.raio_km / (111.0 * COS(RADIANS(v_filtro.centro_lat))));
    v_obras_lng_min := v_filtro.centro_lng - (v_filtro.raio_km / (111.0 * COS(RADIANS(v_filtro.centro_lat))));

    RETURN QUERY
    WITH obras_filtradas AS (
      SELECT
        o.id,
        o.endereco_logradouro || ', ' || COALESCE(o.endereco_numero, '') || ' - ' ||
          COALESCE(o.endereco_bairro, '') || ', ' || o.endereco_cidade || ' ' || o.endereco_uf as endereco,
        o.endereco_cidade as cidade,
        o.fase_atual as fase,
        o.porte,
        o.tenant_id,
        o.created_at,
        -- Score simples: fase inicial + porte + recencia
        (
          CASE WHEN o.fase_atual IN ('alvara', 'fundacao') THEN 30 ELSE 0 END +
          CASE WHEN o.porte = 'grande' THEN 25 WHEN o.porte = 'medio' THEN 15 ELSE 5 END +
          CASE WHEN o.created_at > NOW() - INTERVAL '7 days' THEN 25
               WHEN o.created_at > NOW() - INTERVAL '14 days' THEN 15
               ELSE 5 END
        ) as score,
        -- Distancia aproximada em km
        (
          SQRT(
            POWER((o.lat - v_filtro.centro_lat) * 111.0, 2) +
            POWER((o.lng - v_filtro.centro_lng) * 111.0 * COS(RADIANS(v_filtro.centro_lat)), 2)
          )
        ) as distancia_km
      FROM radar_obras o
      WHERE o.tenant_id = v_filtro.tenant_id
        AND o.status = 'ativa'
        AND o.lat BETWEEN v_obras_lat_min AND v_obras_lat_max
        AND o.lng BETWEEN v_obras_lng_min AND v_obras_lng_max
        AND (v_filtro.cidade IS NULL OR o.endereco_cidade = v_filtro.cidade)
        AND o.fase_atual = ANY(v_filtro.fases)
        AND o.created_at > v_filtro.ultimo_envio_em
    )
    SELECT
      obras_filtradas.id,
      obras_filtradas.endereco,
      obras_filtradas.cidade,
      obras_filtradas.fase,
      obras_filtradas.porte,
      obras_filtradas.distancia_km,
      obras_filtradas.score
    FROM obras_filtradas
    WHERE obras_filtradas.tenant_id = v_filtro.tenant_id
    ORDER BY obras_filtradas.score DESC, obras_filtradas.distancia_km ASC
    LIMIT p_max_obras;

  ELSE
    -- Fallback: buscar por cidade
    RETURN QUERY
    SELECT
      o.id,
      (o.endereco_logradouro || ', ' || COALESCE(o.endereco_numero, '') || ' - ' ||
        COALESCE(o.endereco_bairro, '') || ', ' || o.endereco_cidade || ' ' || o.endereco_uf) as endereco,
      o.endereco_cidade as cidade,
      o.fase_atual as fase,
      o.porte,
      NULL::NUMERIC as distancia_km,
      (
        CASE WHEN o.fase_atual IN ('alvara', 'fundacao') THEN 30 ELSE 0 END +
        CASE WHEN o.porte = 'grande' THEN 25 WHEN o.porte = 'medio' THEN 15 ELSE 5 END +
        CASE WHEN o.created_at > NOW() - INTERVAL '7 days' THEN 25
             WHEN o.created_at > NOW() - INTERVAL '14 days' THEN 15
             ELSE 5 END
      ) as score
    FROM radar_obras o
    WHERE o.tenant_id = v_filtro.tenant_id
      AND o.status = 'ativa'
      AND (v_filtro.cidade IS NULL OR o.endereco_cidade = v_filtro.cidade)
      AND o.fase_atual = ANY(v_filtro.fases)
      AND o.created_at > COALESCE(v_filtro.ultimo_envio_em, NOW() - INTERVAL '30 days')
    ORDER BY o.created_at DESC
    LIMIT p_max_obras;
  END IF;
END;
$$;

COMMENT ON FUNCTION fn_wa_alerta_obras_montar IS
'Busca obras novas para alerta. Retorna obras ordenadas por score e distancia.';

-- =============================================================================
-- 5. Funcao: Processar resposta do bot de welcome
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_wa_bot_processar_resposta(
  p_user_id UUID,
  p_resposta TEXT,
  p_telefone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao RECORD;
  v_estado TEXT;
  v_contexto JSONB;
  v_novo_estado TEXT;
  v_mensagem TEXT;
  v_segmentos TEXT[] := ARRAY['concreto', 'locacao', 'material', 'servico', 'outro'];
  v_cidades TEXT[] := ARRAY['Uberlandia', 'Uberaba', 'Araguari', 'Ituiutaba', 'Patos de Minas', 'Patrocinio', 'Frutal'];
  v_obras UUID[];
  v_obra RECORD;
  v_resultado JSONB := '{"proxima_mensagem": null, "estado": null, "contexto": {}}';
BEGIN
  -- Buscar sessao ativa
  SELECT * INTO v_sessao
  FROM wa_session
  WHERE user_id = p_user_id
    AND estado NOT IN ('EXPIRADO', 'CONCLUIDO')
    AND expira_em > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Criar nova sessao
    INSERT INTO wa_session (user_id, estado, contexto)
    VALUES (p_user_id, 'CIDADE', '{"telefone": ' || COALESCE('"' || p_telefone || '"', 'null') || '}')
    RETURNING estado, contexto INTO v_estado, v_contexto;

    v_resultado := jsonb_build_object(
      'proxima_mensagem', 'Bem-vindo ao Radar Canteiro! 🏗️' || E'\n\n' ||
        'Em que cidade você trabalha? (Ex: Uberlandia, Uberaba)',
      'estado', 'CIDADE',
      'contexto', '{"telefone": ' || COALESCE('"' || p_telefone || '"', 'null') || '}'
    );
    RETURN v_resultado;
  END IF;

  v_estado := v_sessao.estado;
  v_contexto := v_sessao.contexto;

  -- Processar por estado
  IF v_estado = 'CIDADE' THEN
    -- Normalizar resposta
    p_resposta := TRIM(INITCAP(LOWER(p_resposta)));

    -- Tentar encontrar cidade
    IF p_resposta = ANY(v_cidades) THEN
      v_contexto := v_contexto || jsonb_build_object('cidade', p_resposta);
      v_novo_estado := 'SEGMENTO';

      v_resultado := jsonb_build_object(
        'proxima_mensagem', 'Ótimo! Em `' || p_resposta || '` temos obras novas toda semana!' || E'\n\n' ||
          'Qual seu segmento principal?' || E'\n\n' ||
          '1️⃣ Concreteira' || E'\n' ||
          '2️⃣ Locadora de equipamentos' || E'\n' ||
          '3️⃣ Fornecedor de material' || E'\n' ||
          '4️⃣ Prestador de serviço' || E'\n' ||
          '5️⃣ Outro' || E'\n\n' ||
          'Responda com o número ou nome do segmento.',
        'estado', v_novo_estado,
        'contexto', v_contexto
      );
    ELSE
      v_resultado := jsonb_build_object(
        'proxima_mensagem', 'Cidade não reconhecida. 🙏' || E'\n\n' ||
          'Atualmente cobrimos: Uberlandia, Uberaba, Araguari, Ituiutaba, Patos de Minas, Patrocinio e Frutal.' || E'\n\n' ||
          'Em qual dessas cidades você trabalha?',
        'estado', v_estado,
        'contexto', v_contexto
      );
    END IF;

  ELSIF v_estado = 'SEGMENTO' THEN
    -- Mapear resposta para segmento
    p_resposta := LOWER(TRIM(p_resposta));
    CASE
      WHEN p_resposta IN ('1', 'concreto', 'concreteira') THEN p_resposta := 'concreto';
      WHEN p_resposta IN ('2', 'locacao', 'locadora') THEN p_resposta := 'locacao';
      WHEN p_resposta IN ('3', 'material', 'fornecedor') THEN p_resposta := 'material';
      WHEN p_resposta IN ('4', 'servico', 'prestador') THEN p_resposta := 'servico';
      WHEN p_resposta IN ('5', 'outro') THEN p_resposta := 'outro';
      ELSE p_resposta := NULL;
    END CASE;

    IF p_resposta IS NOT NULL AND p_resposta = ANY(v_segmentos) THEN
      v_contexto := v_contexto || jsonb_build_object('segmento', p_resposta);
      v_novo_estado := 'AMOSTRA';

      v_resultado := jsonb_build_object(
        'proxima_mensagem', 'Perfeito! Segmento: *' || UPPER(p_resposta) || '*' || E'\n\n' ||
          'Quer receber uma amostra gratuita das 3 obras mais recentes na sua região?' || E'\n\n' ||
          '📍 Obras em fase de Alvará e Fundação' || E'\n' ||
          '📍 Ranking por potencial de oportunidade' || E'\n\n' ||
          'Responda *SIM* para receber ou *NÃO* para pular.',
        'estado', v_novo_estado,
        'contexto', v_contexto
      );
    ELSE
      v_resultado := jsonb_build_object(
        'proxima_mensagem', 'Segmento não reconhecido. 🙏' || E'\n\n' ||
          'Escolha uma opção:' || E'\n\n' ||
          '1️⃣ Concreteira' || E'\n' ||
          '2️⃣ Locadora de equipamentos' || E'\n' ||
          '3️⃣ Fornecedor de material' || E'\n' ||
          '4️⃣ Prestador de serviço' || E'\n' ||
          '5️⃣ Outro',
        'estado', v_estado,
        'contexto', v_contexto
      );
    END IF;

  ELSIF v_estado = 'AMOSTRA' THEN
    p_resposta := UPPER(TRIM(p_resposta));

    IF p_resposta IN ('SIM', 'S', 'YES', 'Y', 'QUERO', 'OK') THEN
      -- Buscar 3 obras de exemplo
      v_contexto := v_contexto || jsonb_build_object('amostra_solicitada', true, 'obras_enviadas', '[]'::TEXT);

      v_resultado := jsonb_build_object(
        'proxima_mensagem', '🎁 *Aqui estão 3 obras quentes na sua região!*' || E'\n\n' ||
          '📍 *Carregando obras...*' || E'\n\n' ||
          'Aguarde, estamos preparando seu conteúdo personalizado.',
        'estado', 'AMOSTRA',
        'contexto', v_contexto,
        'enviar_amostra', true,
        'segmento', v_contexto->>'segmento',
        'cidade', v_contexto->>'cidade'
      );
    ELSE
      v_contexto := v_contexto || jsonb_build_object('amostra_solicitada', false);
      v_novo_estado := 'CONCLUIDO';

      v_resultado := jsonb_build_object(
        'proxima_mensagem', 'Ok! Sem problemas.' || E'\n\n' ||
          'Você receberá o *Alerta Diário de Obras* todos os dias pela manhã com as novidades.' || E'\n\n' ||
          '🟢 Configure seus filtros em: /whatsapp/alertas' || E'\n\n' ||
          'Bem-vindo ao Radar Canteiro! 🚀',
        'estado', v_novo_estado,
        'contexto', v_contexto
      );
    END IF;
  END IF;

  -- Atualizar sessao
  UPDATE wa_session
  SET estado = COALESCE(v_novo_estado, estado),
      contexto = v_contexto,
      expira_em = CASE
        WHEN v_novo_estado = 'AMOSTRA' THEN NOW() + INTERVAL '10 minutes'
        WHEN v_novo_estado = 'CONCLUIDO' THEN NOW() - INTERVAL '1 second'
        ELSE expira_em
      END,
      updated_at = NOW()
  WHERE id = v_sessao.id;

  -- Se concluiu, registrar opt-in se houver telefone
  IF v_novo_estado = 'CONCLUIDO' AND v_contexto->>'telefone' IS NOT NULL THEN
    INSERT INTO wa_optins (user_id, tenant_id, numero, escopo)
    VALUES (p_user_id, v_sessao.tenant_id, v_contexto->>'telefone', ARRAY['utilidade'])
    ON CONFLICT (numero) DO UPDATE
    SET revoked_at = NULL, updated_at = NOW();
  END IF;

  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION fn_wa_bot_processar_resposta IS
'Processa resposta do bot de welcome. Gerencia estados CIDADE->SEGMENTO->AMOSTRA e retorna próxima mensagem.';

-- =============================================================================
-- 6. Funcao: Verificar saude da instancia
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_whatsapp_check_health(p_instance_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance RECORD;
  v_api_url TEXT;
  v_api_key TEXT;
  v_response JSONB;
  v_status TEXT;
  v_last_seen TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_instance
  FROM whatsapp_instances
  WHERE id = p_instance_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Instance not found');
  END IF;

  v_api_url := v_instance.evolution_api_url;
  v_api_key := v_instance.evolution_api_key;

  BEGIN
    SELECT content::jsonb INTO v_response
    FROM http_get(
      v_api_url || '/instance/connectionState/' || v_instance.instance_name,
      jsonb_build_object('apikey', v_api_key)::text
    ) AS req
    WHERE req.status BETWEEN 200 AND 299;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'HTTP request failed: ' || SQLERRM,
      'instance_status', v_instance.status
    );
  END;

  -- Extrair status da resposta
  v_status := COALESCE(
    v_response->>'instance'->>'state',
    v_response->>'state',
    'unknown'
  );

  -- Mapear para status do banco
  CASE v_status
    WHEN 'open', 'connected' THEN
      v_status := 'connected';
      v_last_seen := NOW();
    WHEN 'close', 'disconnected' THEN
      v_status := 'disconnected';
      IF v_instance.disconnected_at IS NULL THEN
        v_last_seen := NOW();
      ELSE
        v_last_seen := v_instance.disconnected_at;
      END IF;
    ELSE
      v_status := 'connecting';
  END CASE;

  -- Atualizar instancia
  UPDATE whatsapp_instances
  SET status = v_status,
      disconnected_at = CASE
        WHEN v_status = 'disconnected' AND disconnected_at IS NULL THEN NOW()
        WHEN v_status = 'connected' THEN NULL
        ELSE disconnected_at
      END,
      updated_at = NOW()
  WHERE id = p_instance_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'raw_state', v_status,
    'instance_id', p_instance_id
  );
END;
$$;

COMMENT ON FUNCTION fn_whatsapp_check_health IS
'Verifica saude de uma instancia WhatsApp via Evolution API.';

-- =============================================================================
-- 7. Funcao: Registrar opt-out
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_wa_optout(p_numero TEXT, p_via TEXT DEFAULT 'palavra_chave')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE wa_optins
  SET revoked_at = NOW(),
      revoked_via = p_via,
      updated_at = NOW()
  WHERE numero = p_numero
    AND revoked_at IS NULL;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'message', 'Opt-out registrado com sucesso.');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Opt-in não encontrado ou já revogado.');
  END IF;
END;
$$;

COMMENT ON FUNCTION fn_wa_optout IS
'Registra opt-out de WhatsApp. Via pode ser: palavra_chave, manual, email_link.';

-- =============================================================================
-- 8. Funcao: Verificar se numero tem opt-in ativo
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_wa_check_optin(p_numero TEXT, p_escopo TEXT DEFAULT 'utilidade')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM wa_optins
  WHERE numero = p_numero
    AND revoked_at IS NULL
    AND p_escopo = ANY(escopo);

  RETURN v_count > 0;
END;
$$;

COMMENT ON FUNCTION fn_wa_check_optin IS
'Verifica se numero tem opt-in ativo para o escopo especificado.';
