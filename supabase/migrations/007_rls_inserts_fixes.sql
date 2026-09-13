-- =============================================================================
-- MIGRATION 007: corrigir RLS em radar_obras_globais, radar_obra_marcacoes,
--                       radar_obra_confirmacoes, crm_leads, crm_deals, crm_atividades,
--                       radar_obras, radar_user_pontuacao, radar_badges
-- =============================================================================
-- Sintomas que essa migration corrige:
--   1. "new row violates row-level security policy for table crm_leads" (ao gerar lead)
--   2. "Não foi possível registrar a obra global" (ao marcar fase)
--   3. Loading infinito em /dashboard/radar (recursão tenant_users - corrigido na 006)
--
-- Causa raiz: as policies usavam subqueries em `tenant_users` que têm RLS,
--             OU faltavam policies de INSERT/UPDATE/DELETE.
-- Solução: funções SECURITY DEFINER que bypassam RLS de tenant_users.
-- =============================================================================

-- Helper: retorna tenant do user logado (bypass RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION get_my_tenant_id_safe()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() LIMIT 1
$$;

-- Helper: retorna papel do user no tenant
CREATE OR REPLACE FUNCTION get_my_papel_in(p_tenant UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT papel FROM tenant_users
  WHERE user_id = auth.uid()
    AND tenant_id = p_tenant
    AND ativo = true
  LIMIT 1
$$;

-- =========================================================================
-- radar_obras_globais: faltava INSERT e UPDATE
-- =========================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='radar_obras_globais' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON radar_obras_globais', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "globais_select_all" ON radar_obras_globais
  FOR SELECT USING (true);

CREATE POLICY "globais_insert_auth" ON radar_obras_globais
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "globais_update_auth" ON radar_obras_globais
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- =========================================================================
-- radar_obra_marcacoes: policy de INSERT fazia SELECT recursivo em tenant_users
-- =========================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='radar_obra_marcacoes' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON radar_obra_marcacoes', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "marcacoes_select_auth" ON radar_obra_marcacoes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "marcacoes_insert_self" ON radar_obra_marcacoes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = get_my_tenant_id_safe()
  );

CREATE POLICY "marcacoes_delete_self" ON radar_obra_marcacoes
  FOR DELETE USING (user_id = auth.uid());

-- =========================================================================
-- radar_obra_confirmacoes
-- =========================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='radar_obra_confirmacoes' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON radar_obra_confirmacoes', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "confirmacoes_select_auth" ON radar_obra_confirmacoes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "confirmacoes_insert_self" ON radar_obra_confirmacoes
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "confirmacoes_delete_self" ON radar_obra_confirmacoes
  FOR DELETE USING (user_id = auth.uid());

-- =========================================================================
-- crm_leads / crm_deals / crm_atividades: trocar subquery recursiva por funcao
-- =========================================================================

-- crm_leads
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='crm_leads' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON crm_leads', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "leads_tenant_select" ON crm_leads
  FOR SELECT USING (tenant_id = get_my_tenant_id_safe());

CREATE POLICY "leads_tenant_insert" ON crm_leads
  FOR INSERT WITH CHECK (tenant_id = get_my_tenant_id_safe());

CREATE POLICY "leads_tenant_update" ON crm_leads
  FOR UPDATE USING (tenant_id = get_my_tenant_id_safe());

CREATE POLICY "leads_tenant_delete" ON crm_leads
  FOR DELETE USING (tenant_id = get_my_tenant_id_safe());

-- crm_deals
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='crm_deals' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON crm_deals', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "deals_tenant_select" ON crm_deals
  FOR SELECT USING (tenant_id = get_my_tenant_id_safe());

CREATE POLICY "deals_tenant_insert" ON crm_deals
  FOR INSERT WITH CHECK (tenant_id = get_my_tenant_id_safe());

CREATE POLICY "deals_tenant_update" ON crm_deals
  FOR UPDATE USING (tenant_id = get_my_tenant_id_safe());

CREATE POLICY "deals_tenant_delete" ON crm_deals
  FOR DELETE USING (tenant_id = get_my_tenant_id_safe());

-- crm_atividades
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='crm_atividades' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON crm_atividades', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "atividades_tenant_select" ON crm_atividades
  FOR SELECT USING (tenant_id = get_my_tenant_id_safe());

CREATE POLICY "atividades_tenant_insert" ON crm_atividades
  FOR INSERT WITH CHECK (tenant_id = get_my_tenant_id_safe());

CREATE POLICY "atividades_tenant_update" ON crm_atividades
  FOR UPDATE USING (tenant_id = get_my_tenant_id_safe());

CREATE POLICY "atividades_tenant_delete" ON crm_atividades
  FOR DELETE USING (tenant_id = get_my_tenant_id_safe());

-- =========================================================================
-- radar_obras: faltava INSERT/UPDATE/DELETE
-- =========================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='radar_obras' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON radar_obras', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "obras_tenant_select" ON radar_obras
  FOR SELECT USING (tenant_id = get_my_tenant_id_safe());

CREATE POLICY "obras_tenant_insert" ON radar_obras
  FOR INSERT WITH CHECK (tenant_id = get_my_tenant_id_safe());

CREATE POLICY "obras_tenant_update" ON radar_obras
  FOR UPDATE USING (tenant_id = get_my_tenant_id_safe());

CREATE POLICY "obras_tenant_delete" ON radar_obras
  FOR DELETE USING (tenant_id = get_my_tenant_id_safe());

-- =========================================================================
-- radar_user_pontuacao
-- =========================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='radar_user_pontuacao' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON radar_user_pontuacao', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "pontuacao_select_self" ON radar_user_pontuacao
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "pontuacao_insert_auth" ON radar_user_pontuacao
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "pontuacao_update_auth" ON radar_user_pontuacao
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- =========================================================================
-- radar_badges (catálogo público)
-- =========================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='radar_badges' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON radar_badges', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "badges_select_all" ON radar_badges
  FOR SELECT USING (true);
