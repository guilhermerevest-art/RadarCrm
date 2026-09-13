-- =============================================================================
-- APLICAR_004: MVP Uberlândia - isolar dados para um único tenant
-- Execute este arquivo no SQL Editor do Supabase
-- Cria o tenant Uberlândia MVP e limpa dados de tenants de teste
-- =============================================================================

-- 1. Garantir tenant Uberlândia MVP
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

-- 2. Migrar usuário admin principal para o tenant Uberlândia
UPDATE tenant_users
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id != '00000000-0000-0000-0000-000000000001'
  AND papel = 'admin';

-- 3. Limpar tenants órfãos (mantém apenas o MVP e o placeholder 000...)
DELETE FROM tenants
WHERE id NOT IN (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001'
);

-- 4. Garantir que o usuário admin existe no tenant MVP
DO $$
DECLARE
  v_admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_admin_count
  FROM tenant_users
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
    AND papel = 'admin';

  IF v_admin_count = 0 THEN
    RAISE NOTICE 'Nenhum admin no tenant MVP. Garanta que auth.users tem um usuário criado.';
  END IF;
END $$;
