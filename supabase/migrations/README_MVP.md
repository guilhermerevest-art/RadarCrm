# MVP Uberlândia — guia rápido

## O que essa migration faz

- Apaga **todos os tenants** antigos
- Apaga **todas as obras, leads, deals, atividades** (cascade)
- Cria um único tenant: **Uberlândia MVP** (`slug: uberlandia-mvp`, id fixo `00000000-0000-0000-0000-000000000001`)
- Reseta pipeline padrão

## Passos

### 1. Aplicar a migration

**Opção A — SQL Editor (recomendado, 1 minuto):**
1. Abra: https://supabase.com/dashboard/project/anfczaxpxjlucpwjfsfw/sql
2. Cole o conteúdo de `supabase/migrations/004_mvp_uberlandia.sql`
3. Clique em RUN

**Opção B — connection string:** me passe a connection string que eu rodo um script.

### 2. Reimportar apenas Uberlândia

```bash
node scripts/import-cno-uberlandia.js cno.csv
```

O script filtra **somente Uberlândia/MG** no streaming. Como Uberlândia tem em torno de 5-10 mil obras CNO ativas, fica leve (~30-60 segundos).

### 3. Vinculá-lo ao seu usuário

Se você já criou conta e ela ficou no tenant antigo, rode este SQL no SQL Editor para mover:

```sql
UPDATE tenant_users
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE user_id = 'SEU_USER_ID_AQUI';

-- Se não sabe seu user_id:
-- SELECT id, email FROM auth.users;
```

### 4. Pronto

- Dashboard carrega só as obras de Uberlândia
- Marcar/confirmar fases funciona normal (precisa da migration 003 já aplicada)

## Banco depois disso

| Tabela | Quantidade esperada |
|--------|---------------------|
| tenants | 1 (Uberlândia MVP) |
| tenant_users | 1+ (vínculos ao usuário) |
| radar_obras | ~5-10k (só Uberlândia) |
| crm_leads | 0 (limpo, pronto pra começar) |
| crm_pipeline_estagios | 7 (padrão) |
