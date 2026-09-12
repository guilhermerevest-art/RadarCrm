-- Criar tenant para importação CNO
INSERT INTO tenants (id, nome, slug, status)
VALUES ('00000000-0000-0000-0000-000000000000', 'Importacao CNO', 'import-cno', 'ativo')
ON CONFLICT (id) DO NOTHING
RETURNING id;
