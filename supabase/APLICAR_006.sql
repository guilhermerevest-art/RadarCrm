-- =============================================================================
-- APLICAR_006: Corrigir RLS recursivo em tenant_users
-- Execute este arquivo no SQL Editor do Supabase
-- A policy original "Tenant users admin" lia da PROPRIA tabela = loop infinito.
-- Solução: funções SECURITY DEFINER que retornam valores escalares
-- =============================================================================

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

-- 4) Função: verificar se é admin do tenant
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

-- 5) Admin pode fazer tudo no tenant_users do próprio tenant
CREATE POLICY "tenant_users_admin_all" ON tenant_users
  FOR ALL USING (is_admin_of(tenant_id));

-- 6) Permite auto-insert no signup
CREATE POLICY "tenant_users_self_insert" ON tenant_users
  FOR INSERT WITH CHECK (user_id = auth.uid());
