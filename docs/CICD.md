# CI/CD & Testing - Radar CRM

## GitHub Actions

### Workflow Principal: `.github/workflows/ci.yml`

#### Jobs

| Job | Gatilho | Descrição |
|-----|---------|-----------|
| **lint** | push, PR | TypeScript check + ESLint |
| **test** | após lint | Unit tests |
| **build** | após test | Next.js build |
| **deploy-preview** | PR | Deploy preview no Vercel |
| **deploy-production** | push master | Deploy produção |
| **etl-validate** | schedule/diaily | Validação scripts ETL |
| **db-migrate** | commit com "migration" | Push migrations |

#### Secrets Necessários

Configure no GitHub: Settings → Secrets and variables → Actions

| Secret | Descrição |
|--------|-----------|
| `VERCEL_TOKEN` | Token da API Vercel |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave admin Supabase |
| `SUPABASE_ACCESS_TOKEN` | Token pessoal Supabase |
| `SUPABASE_DB_URL` | URL do banco |
| `SLACK_WEBHOOK_URL` | Webhook Slack (opcional) |

#### Variáveis de Repositório

Configure em: Settings → Variables → Actions

| Variável | Valor |
|----------|-------|
| `TURBO_TEAM` | Nome do time Turborepo |

## Testes Unitários

### Estrutura

```
__tests__/
└── etl.test.ts   # Testes de scripts ETL
```

### Comandos

```bash
# Executar todos os testes
npm test

# Modo watch
npm run test:watch

# Com coverage
npm run test:coverage
```

### Cobertura

Os testes cobrem:

- ✅ Validação de CNPJ
- ✅ Hash de deduplicação
- ✅ Mapeamento CNAE → Segmentos
- ✅ Cálculo de scores (risco, regularidade)
- ✅ Validação de tipos ETLObra

## Vercel Preview

### Setup

1. Instalar Vercel CLI: `npm i -g vercel`
2. Login: `vercel login`
3. Linkar projeto: `vercel link`
4. Configurar secrets no GitHub

### Preview URL

Após cada PR, o workflow cria um link de preview:
- Comment automático no PR
- Deploy separado do production

## Deployment Production

### Fluxo

```
push to master
    ↓
lint + test + build
    ↓
db-migrate (se migration)
    ↓
vercel deploy --prod
    ↓
Slack notification (opcional)
```

### Rollback

Se precisar reverter:

```bash
vercel rollback [deployment-url]
```

## Troubleshooting

### Build falhando

1. Verificar TypeScript: `npx tsc --noEmit`
2. Verificar dependências: `npm ci`
3. Checar variáveis de ambiente

### Deploy não funciona

1. Verificar `VERCEL_TOKEN` no GitHub
2. Verificar permissão do token
3. Checar logs do Vercel

### Testes falhando

```bash
npm run test:watch
# Faz改动 nos testes e vê o resultado em tempo real
```

## Adicionando Novos Jobs

Edite `.github/workflows/ci.yml`:

```yaml
meu-job:
  name: Meu Job
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: meu-comando
```
