-- =============================================================================
-- MIGRATION 014: Tabelas Legais e Cookies para LGPD
-- Implements Épico 10 - compliance e páginas legais versionadas
-- =============================================================================

-- 1. Tabela de aceites legais versionados (LGPD)
CREATE TABLE IF NOT EXISTS aceites_legais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('termos', 'privacidade', 'dpa', 'cookie')),
  versao TEXT NOT NULL,
  ip_endereco TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_aceites_user ON aceites_legais(user_id);
CREATE INDEX IF NOT EXISTS idx_aceites_tipo ON aceites_legais(tipo);
CREATE INDEX IF NOT EXISTS idx_aceites_created ON aceites_legais(created_at DESC);

-- RLS: usuário só vê seus próprios aceites
ALTER TABLE aceites_legais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aceites_user_read_own" ON aceites_legais
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "aceites_user_insert_own" ON aceites_legais
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 2. Tabela de versão atual dos documentos legais
CREATE TABLE IF NOT EXISTS versoes_legais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL UNIQUE CHECK (tipo IN ('termos', 'privacidade', 'dpa', 'cookie')),
  versao TEXT NOT NULL,
  titulo TEXT NOT NULL,
  conteudo TEXT,
  url_arquivo TEXT,
  data_publicacao TIMESTAMPTZ DEFAULT NOW(),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed das versões iniciais
INSERT INTO versoes_legais (tipo, versao, titulo, conteudo, ativo) VALUES
  ('termos', '1.0', 'Termos de Uso', 'TERMOS DE USO

Radar Canteiro - Plataforma SaaS para Prospecção Comercial

1. OBJETO
Estes Termos de Uso regulam a utilização da plataforma Radar Canteiro (''Plataforma''), desenvolvida e operada pela empresa titular (''Fornecedor''), voltada à identificação de obras em fase inicial, gestão de relacionamento com clientes (CRM) e comunicação via WhatsApp.

2. ACEITE
Ao criar uma conta e utilizar a Plataforma, o usuário (''Usuário'') declara que leu, compreendeu e concorda com estes Termos de Uso.

3. DESCRIÇÃO DOS SERVIÇOS
3.1 Radar de Obras: identificação automática de obras em fase inicial a partir de fontes públicas.
3.2 Radar de Empresas: base de dados de CNPJ com filtros setoriais.
3.3 CRM: gestão de leads, deals, atividades, agendamentos e fluxos de WhatsApp.
3.4 Canal WhatsApp: mensagens transacionais, marketing e atendimento.

4. PLANOS E PREÇOS
4.1 Individual: R$ 197/mês - 1 usuário
4.2 Equipe: R$ 397/mês - até 5 usuários
4.3 Regional: R$ 797/mês - até 20 usuários
4.4 Obras: sob consulta - ilimitado

5. PERÍODO DE TESTE (TRIAL)
5.1 O Usuário tem direito a 14 dias de uso gratuito sem necessidade de informar dados de pagamento.
5.2 Após o período de teste, a cobrança será ativada automaticamente caso o Usuário não cancele.

6. CANCELAMENTO E REEMBOLSO
6.1 O Usuário pode cancelar a qualquer momento pela interface da Plataforma.
6.2 Reembolso integral em até 7 dias após o pagamento para novos assinantes.
6.3 Após 7 dias, não há reembolso para o período em curso.

7. PROPRIEDADE INTELECTUAL
7.1 Todo conteúdo da Plataforma é propriedade do Fornecedor.
7.2 O Usuário mantém propriedade sobre os dados inseridos (''Dados do Cliente'').

8. RESPONSABILIDADES
8.1 O Fornecedor se compromete a manter a disponibilidade da Plataforma conforme SLA acordado.
8.2 O Usuário é responsável pela veracidade das informações inseridas.

9. DADOS E PRIVACIDADE
9.1 O tratamento de dados pessoais segue a Política de Privacidade.
9.2 O Fornecedor atua como Operador de dados conforme LGPD.
9.3 Dados de contatos de terceiros (leads, clientes) são de responsabilidade do Usuário.

10. LIMITAÇÃO DE RESPONSABILIDADE
10.1 O Fornecedor não se responsabiliza por decisões comerciais tomadas com base nos dados fornecidos.
10.2 Dados de obras são derivados de fontes públicas e podem conter imprecisões.

11. DISPOSIÇÕES GERAIS
11.1 Lei aplicável: legislação brasileira.
11.2 Foro: comarca de Uberlândia, MG.
11.3 O Fornecedor pode alterar estes termos mediante aviso prévio de 30 dias.

Versão 1.0 - Atualizado em: 2026-01-01', true),
  ('privacidade', '1.0', 'Política de Privacidade', 'POLÍTICA DE PRIVACIDADE

Radar Canteiro - Plataforma SaaS para Prospecção Comercial

1. INTRODUÇÃO
A presente Política de Privacidade descreve como a empresa titular (''Empresa'', ''nós'', ''nosso'') coleta, utiliza, armazena e protege os dados pessoais dos usuários (''você'', ''seu'') da plataforma Radar Canteiro (''Plataforma'').

2. DADOS COLETADOS
2.1 Dados de cadastro: nome, e-mail, telefone, empresa, CNPJ.
2.2 Dados de uso: comportamento na plataforma, interações, preferências.
2.3 Dados de navegação: IP, dispositivo, navegador, cookies.
2.4 Dados de terceiros: informações de leads e clientes inseridos pelo Usuário.

3. FINALIDADE DO TRATAMENTO
3.1 Prestação dos serviços contratados.
3.2 Melhoria da Plataforma e experiência do usuário.
3.3 Comunicação sobre atualizações e suporte.
3.4 Cumprimento de obrigações legais.

4. COMPARTILHAMENTO DE DADOS
4.1 Não vendemos seus dados pessoais.
4.2 Compartilhamos dados apenas com fornecedores essenciais (hospedagem, pagamentos).
4.3 Dados podem ser compartilhados para cumprimento de lei.

5. ARMAZENAMENTO E SEGURANÇA
5.1 Dados são armazenados em servidores seguros.
5.2 Utilizamos criptografia e medidas de segurança técnicas.
5.3 Período de retenção conforme necessidade operacional ou legal.

6. SEUS DIREITOS (LGPD)
Você tem direito a:
6.1 Confirmar a existência de tratamento.
6.2 Acessar seus dados pessoais.
6.3 Corrigir dados incompletos ou desatualizados.
6.4 Anonimizar, bloquear ou eliminar dados desnecessários.
6.5 Solicitar portabilidade dos dados.
6.6 Solicitar exclusão de dados tratados com consentimento.
6.7 Revogar consentimento a qualquer momento.
6.8 Opor-se a tratamento não autorizado.

7. ENCARREGADO (DPO)
Para questões sobre privacidade, entre em contato:
Nome: [Nome do Encarregado]
E-mail: privacidade@radarcanteiro.com.br

8. COOKIES
8.1 Utilizamos cookies essenciais para funcionamento.
8.2 Cookies analíticos para melhorar a experiência.
8.3 Você pode configurar seu navegador para bloquear cookies.

9. ALTERAÇÕES
Esta política pode ser atualizada. Notificaremos sobre mudanças significativas.

10. CONTATO
E-mail: privacidade@radarcanteiro.com.br
Endereço: Uberlândia, MG - Brasil

Versão 1.0 - Atualizado em: 2026-01-01', true),
  ('dpa', '1.0', 'Data Processing Agreement (DPA)', 'DATA PROCESSING AGREEMENT (DPA)

Acordo de Tratamento de Dados Pessoais

ENTRE:

FORNECEDOR: [Razão Social], inscrito no CNPJ sob nº [XX.XXX.XXX/XXXX-XX], com sede em [Endereço] (''Operador'')

E

CLIENTE: conforme cadastro na Plataforma Radar Canteiro (''Controlador'')

1. OBJETO
1.1 Este DPA regula o tratamento de dados pessoais realizado pelo Operador em nome do Controlador no âmbito da prestação de serviços da Plataforma Radar Canteiro.

2. DEFINIÇÕES
2.1 ''Dados Pessoais'': informações relacionadas a pessoa natural identificada ou identificável.
2.2 ''Tratamento'': qualquer operação realizada com dados pessoais.
2.3 ''Titular'': pessoa natural a quem se referem os dados.
2.4 ''Controlador'': quem determina as finalidades e meios do tratamento.
2.5 ''Operador'': quem realiza o tratamento em nome do Controlador.

3. OBRIGAÇÕES DO OPERADOR
3.1 Tratar dados pessoais apenas conforme instruções documentadas do Controlador.
3.2 Garantir que pessoas autorizadas mantenham confidencialidade.
3.3 Implementar medidas técnicas e organizacionais de segurança.
3.4 Não compartilhar dados com terceiros sem autorização.
3.5 Auxiliar o Controlador no atendimento a pedidos de titulares.
3.6 Notificar o Controlador sobre incidentes de segurança em até 24h.

4. OBRIGAÇÕES DO CONTROLADOR
4.1 Garantir base legal válida para cada tratamento.
4.2 Fornecer instruções claras ao Operador.
4.3 Obter consentimentos quando necessário.
4.4 Responder a solicitações de titulares.

5. SUBCONTRATADOS
5.1 O Operador pode contratar suboperadores para serviços auxiliares.
5.2 Suboperadores estão sujeitos às mesmas obrigações deste DPA.
5.3 O Operador é responsável perante o Controlador pelos atos de suboperadores.

6. TRANSFERÊNCIA INTERNACIONAL
6.1 Dados podem ser transferidos para países com proteção adequada.
6.2 Garantias apropriadas serão aplicadas conforme LGPD.

7. AUDITORIA
7.1 O Controlador pode solicitar auditorias mediante agendamento prévio.
7.2 O Operador manterá registros das atividades de tratamento.

8. INCIDENTES DE SEGURANÇA
8.1 Notificação em até 24h após conhecimento do incidente.
8.2 Descrição da natureza dos dados afetados.
8.3 Medidas adotadas e recomendações aos titulares.

9. EXCLUSÃO DE DADOS
9.1 Ao término do contrato, o Operador devolverá ou excluirá dados conforme instrução.
9.2 Dados necessários para obrigações legais serão mantidos pelo período exigido.

10. RESPONSABILIDADE
10.1 Cada parte é responsável por suas obrigações legais.
10.2 Limite de responsabilidade não se aplica em caso de dolo ou culpa grave.

11. VIGÊNCIA
11.1 Este DPA entra em vigor na data de aceite dos Termos de Uso.
11.2 Permanece vigente durante a prestação dos serviços.

Versão 1.0 - Atualizado em: 2026-01-01', true)
ON CONFLICT (tipo) DO NOTHING;

-- RLS: leitura pública para versoes_legais ativas
ALTER TABLE versoes_legais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "versoes_legais_public_read" ON versoes_legais
  FOR SELECT USING (ativo = true);
CREATE POLICY "versoes_legais_admin_write" ON versoes_legais
  FOR ALL USING (
    EXISTS (SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND papel = 'admin')
  );

-- 3. Tabela de preferências de cookies por usuário
CREATE TABLE IF NOT EXISTS banner_cookies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB DEFAULT '{"essenciais": true, "analiticos": false, "marketing": false}',
  ip_endereco TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: usuário só vê suas próprias preferências
ALTER TABLE banner_cookies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "banner_cookies_user_read" ON banner_cookies
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "banner_cookies_user_write" ON banner_cookies
  FOR ALL USING (user_id = auth.uid());

-- 4. Function para registrar aceite legal
CREATE OR REPLACE FUNCTION fn_registrar_aceite_legal(
  p_tipo TEXT,
  p_versao TEXT,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_id UUID;
BEGIN
  -- Obter user_id da sessão atual
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  INSERT INTO aceites_legais (user_id, tipo, versao, ip_endereco, user_agent)
  VALUES (v_user_id, p_tipo, p_versao, p_ip, p_user_agent)
  ON CONFLICT (user_id, tipo) DO UPDATE SET
    versao = EXCLUDED.versao,
    ip_endereco = EXCLUDED.ip_endereco,
    user_agent = EXCLUDED.user_agent,
    created_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION fn_registrar_aceite_legal IS
  'Registra aceite de documento legal versionado. Pode ser chamado após aceite explícito.';

-- 5. Function para obter preferências de cookie
CREATE OR REPLACE FUNCTION fn_get_cookie_preferences(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefs JSONB;
  v_uid UUID;
BEGIN
  IF p_user_id IS NULL THEN
    SELECT auth.uid() INTO v_uid;
  ELSE
    v_uid := p_user_id;
  END IF;

  IF v_uid IS NULL THEN
    RETURN '{"essenciais": true, "analiticos": false, "marketing": false}'::jsonb;
  END IF;

  SELECT preferences INTO v_prefs FROM banner_cookies WHERE user_id = v_uid;

  IF v_prefs IS NULL THEN
    RETURN '{"essenciais": true, "analiticos": false, "marketing": false}'::jsonb;
  END IF;

  RETURN v_prefs;
END;
$$;

COMMENT ON FUNCTION fn_get_cookie_preferences IS
  'Retorna preferências de cookies do usuário ou defaults se não configurado.';

-- 6. Function para salvar preferências de cookie
CREATE OR REPLACE FUNCTION fn_save_cookie_preferences(
  p_preferences JSONB,
  p_ip TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_id UUID;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  INSERT INTO banner_cookies (user_id, preferences, ip_endereco)
  VALUES (v_user_id, p_preferences, p_ip)
  ON CONFLICT (user_id) DO UPDATE SET
    preferences = EXCLUDED.preferences,
    ip_endereco = COALESCE(EXCLUDED.ip_endereco, banner_cookies.ip_endereco),
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION fn_save_cookie_preferences IS
  'Salva preferências de cookies do usuário.';

-- 7. Function para verificar se usuário aceitou termos vigentes
CREATE OR REPLACE FUNCTION fn_check_aceite_legal(p_tipo TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_versao_legal TEXT;
  v_aceite_versao TEXT;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Pega versão vigente do documento
  SELECT versao INTO v_versao_legal
  FROM versoes_legais
  WHERE tipo = p_tipo AND ativo = true;

  IF v_versao_legal IS NULL THEN
    RETURN true; -- Sem versão ativa, não bloqueia
  END IF;

  -- Pega versão aceita pelo usuário
  SELECT versao INTO v_aceite_versao
  FROM aceites_legais
  WHERE user_id = v_user_id AND tipo = p_tipo;

  RETURN v_aceite_versao = v_versao_legal;
END;
$$;

COMMENT ON FUNCTION fn_check_aceite_legal IS
  'Verifica se usuário aceitou a versão vigente do documento legal. Retorna true se já aceito ou se não há documento ativo.';

-- =============================================================================
-- FIM DA MIGRATION 014
-- =============================================================================
