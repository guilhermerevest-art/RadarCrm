-- Diagnostico: lista policies e triggers problematicos
-- Cole no SQL Editor e mande rodar

SELECT 'POLICIES' as tipo, schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('tenant_users', 'radar_obras', 'radar_obras_globais', 'radar_obra_marcacoes', 'radar_obra_confirmacoes', 'radar_user_pontuacao')
ORDER BY tablename, policyname;
