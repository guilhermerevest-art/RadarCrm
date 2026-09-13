-- =============================================================================
-- MVP: isolar apenas obras de Uberlândia, em UM único tenant
-- Estratégia:
--   1. Criar/garantir tenant "Uberlândia MVP"
--   2. APAGAR (DELETE) todos os tenants antigos (cascade remove obras, leads, etc.)
--   3. Reimportar apenas obras de Uberlândia (triângulo mineiro)
-- =============================================================================

-- 1. Tenant Uberlândia MVP
INSERT INTO tenants (id, nome, slug, plano, status, cor_primaria, cor_secundaria, onboard_completo)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Uberlândia MVP',
  'uberlandia-mvp',
  'individual',
  'ativo',
  '#D9541F',
  '#2E6F8E',
  TRUE
)
ON CONFLICT (slug) DO UPDATE SET
  status = 'ativo',
  onboard_completo = TRUE,
  updated_at = NOW();

-- 2. Resetar usuário admin (se existir) para o novo tenant
UPDATE tenant_users
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id != '00000000-0000-0000-0000-000000000001'
  AND papel = 'admin';

-- 3. Apagar tudo exceto: tenant MVP, tenant_users vinculados a ele, planos
DELETE FROM tenants
WHERE id != '00000000-0000-0000-0000-000000000001'
  AND slug != 'uberlandia-mvp';

-- 4. Apagar todas as obras — vamos reimportar apenas Uberlândia
DELETE FROM radar_obras;

-- 5. Apagar leads, deals e atividades órfãos do MVP
DELETE FROM crm_atividades;
DELETE FROM crm_deals;
DELETE FROM crm_leads;

-- 6. Resetar pipeline padrão (estágios)
DELETE FROM crm_pipeline_estagios;
INSERT INTO crm_pipeline_estagios (tenant_id, nome, ordem, cor, probabilidade_padrao) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Novo',         1, '#94a3b8', 10),
  ('00000000-0000-0000-0000-000000000001', 'Contato',      2, '#3b82f6', 25),
  ('00000000-0000-0000-0000-000000000001', 'Proposta',     3, '#f59e0b', 50),
  ('00000000-0000-0000-0000-000000000001', 'Negociação',   4, '#8b5cf6', 70),
  ('00000000-0000-0000-0000-000000000001', 'Fechamento',   5, '#10b981', 90),
  ('00000000-0000-0000-0000-000000000001', 'Ganho',        6, '#22c55e', 100),
  ('00000000-0000-0000-0000-000000000001', 'Perdido',      7, '#ef4444', 0);

-- 7. Limpar obras globais (serão recriadas ao re-marcar fase)
DELETE FROM radar_obras_globais;

-- 8. Limpar notificações
DELETE FROM audit_log;

-- =============================================================================
-- NOTA: depois de aplicar essa migration, rode:
--   npx tsx scripts/import-cno-uberlandia.ts
-- para reimportar apenas obras de Uberlândia
-- =============================================================================
