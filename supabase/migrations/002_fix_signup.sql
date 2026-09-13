-- =============================================================================
-- DIAGNÓSTICO SEM ACESSO A auth.users
-- Apenas queries permitidas no schema public
-- =============================================================================

-- 1. Tabelas existentes no schema public
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. RLS policies em public
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public';

-- 3. Funções que NÃO fazem referência a auth.users
SELECT
  n.nspname AS schema,
  p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- 4. Triggers no schema public
SELECT
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
