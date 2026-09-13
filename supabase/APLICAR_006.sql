-- =============================================================================
-- MIGRATION 006: corrigir RLS recursivo em tenant_users
-- Cole no SQL Editor e rode 1x
-- =============================================================================

-- Cria função exec_sql (pra futuras migrations via CLI)
CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop TODAS as policies de tenant_users (a antiga é recursiva)
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

-- Recriar policies SEM recursão:
-- 1) Usuário vê o próprio vínculo
CREATE POLICY "Vê próprio vínculo" ON tenant_users
  FOR SELECT USING (user_id = auth.uid());

-- 2) Usuário vê os colegas do mesmo tenant (usa função SECURITY DEFINER pra evitar loop)
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE POLICY "Vê colegas do mesmo tenant" ON tenant_users
  FOR SELECT USING (tenant_id = get_my_tenant_id());

-- 3) Admin pode atualizar/deletar (sem recursão, via função)
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

CREATE POLICY "Admin gerencia tenant_users" ON tenant_users
  FOR ALL USING (is_admin_of(tenant_id));

-- Permite INSERT direto para signup (auth.users pode criar seu próprio vínculo via trigger)
CREATE POLICY "Insert próprio vínculo" ON tenant_users
  FOR INSERT WITH CHECK (user_id = auth.uid());
