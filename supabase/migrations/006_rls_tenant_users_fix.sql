-- =============================================================================
-- MIGRATION 006: corrigir RLS recursivo em tenant_users
-- =============================================================================
-- A policy original "Tenant users admin" fazia:
--   USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND papel = 'admin'))
-- Isso lia da PROPRIA tabela tenant_users dentro da policy = loop infinito.
--
-- Solução: usar funções SECURITY DEFINER que rodam como dono da função
-- (bypassando RLS) e retornar valores escalares (UUID, BOOLEAN).
-- =============================================================================

-- Helper: rodar migrations via CLI/JS
CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop policies antigas que tinham recursão
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenant_users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON tenant_users', r.policyname);
  END LOOP;
END $$;

-- 1) Usuário vê o próprio vínculo
CREATE POLICY "tenant_users_self_select" ON tenant_users
  FOR SELECT USING (user_id = auth.uid());

-- 2) Função SECURITY DEFINER: pega tenant do user logado (bypass RLS)
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() LIMIT 1
$$;

-- 3) Vê colegas do mesmo tenant (via função, sem recursão)
CREATE POLICY "tenant_users_same_tenant_select" ON tenant_users
  FOR SELECT USING (tenant_id = get_my_tenant_id());

-- 4) Admin pode gerenciar (criar/atualizar/deletar)
CREATE OR REPLACE FUNCTION is_admin_of(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = auth.uid()
      AND tenant_id = p_tenant
      AND papel = 'admin'
      AND ativo = true
  )
$$;

CREATE POLICY "tenant_users_admin_all" ON tenant_users
  FOR ALL USING (is_admin_of(tenant_id));

-- 5) Permite INSERT próprio no signup (via trigger ou código)
CREATE POLICY "tenant_users_self_insert" ON tenant_users
  FOR INSERT WITH CHECK (user_id = auth.uid());
