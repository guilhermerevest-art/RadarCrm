# ETL Pipelines - Radar CRM

Scripts para ingestao de dados de obras a partir de fontes publicas.

## Fontes Implementadas

### 1. PNCP (Contratacoes Publicas)
- **API**: https://api.pncp.gov.br/
- **Script**: `scripts/etl/pncp.ts`
- **Campos**: numero do processo, objeto, orgao, valor, data publicacao
- **Cron**: diario as 6h

### 2. Alvaras de Construcao
- **Uberlandia**: `scripts/etl/alvaras/uberlandia.ts`
- **Uberaba**: `scripts/etl/alvaras/uberaba.ts`
- **Campos**: numero alvara, endereco, responsavel, area, tipo obra
- **Cron**: diario as 7h

### 3. Licenciamento Ambiental (SEMAD MG)
- **Script**: `scripts/etl/semad-mg.ts`
- **URL**: https://meioambiente.mg.gov.br/
- **Campos**: numero licenca, tipo, atividade, empresa, municipio
- **Cron**: diario as 8h

## Fontes de Enriquecimento de Leads

### 4. TJMG (Tribunal de Justiça MG)
- **Script**: `scripts/etl/tjmg.ts`
- **Dados**: Processos judiciais, execuções, falências
- **Uso**: Score de risco do lead
- **Comando**: `npm run etl:tjmg`

### 5. Receita Federal (CNPJ)
- **API**: https://receitaws.com.br/v1/cnpj
- **Script**: `scripts/etl/receita-federal.ts`
- **Dados**: Razão social, situação, CNAE, endereço
- **Uso**: Enriquecer empresas no CRM
- **Rate limit**: 3 req/min
- **Comando**: `npm run etl:receita`

### 6. INSS/PGFN (Regularidade Fiscal)
- **Script**: `scripts/etl/regularidade-fiscal.ts`
- **Dados**: Certidões negativas, dívidas
- **Uso**: Qualification B2B
- **Comando**: `npm run etl:regularidade`

## Estrutura dos Scripts

Cada script ETL segue a estrutura:

```typescript
interface ETLObra {
  fonte: string;
  fonte_id: string;
  tipo: string;
  endereco_logradouro: string;
  endereco_bairro: string;
  endereco_cidade: string;
  endereco_uf: string;
  lat?: number;
  lng?: number;
  data_inicio?: string;
  valor_estimado?: number;
  fase_atual: string;
  porte: string;
  segmento_alvo: string[];
  hash_deduplicacao: string;
  raw_payload: object;
}
```

## Comandos Disponiveis

```bash
# Executar ETL especifico
npm run etl:pncp                    # PNCP
npm run etl:alvara:uberlandia       # Alvaras Uberlandia
npm run etl:alvara:uberaba          # Alvaras Uberaba
npm run etl:semad                   # SEMAD MG

# Executar todos os ETL
npm run etl:all

# Verificar status dos jobs
npm run etl:status

# Geocodificar obras sem coordenadas
npm run etl:geocode
```

## Variaveis de Ambiente

Configure no arquivo `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DEFAULT_TENANT_ID=uuid-do-tenant
```

## Cron Jobs (pg_cron)

Os jobs estao configurados na migration `011_cron_jobs_etl.sql`:

| Job | Schedule | Script |
|-----|----------|--------|
| etl-cno-diario | 0 2 * * * | etl-job-run (fonte: cno) |
| etl-alvara-diario | 0 3 * * * | etl-job-run (fonte: alvara_prefeitura) |
| etl-pncp-diario | 0 4 * * * | etl-job-run (fonte: pncp) |
| etl-semad-semanal | 0 5 * * 1 | etl-job-run (fonte: semad_mg) |
| geocoding-cleanup-diario | 0 1 * * * | Limpa cache expirado |
| geocode-batch-a-cada-15min | */15 * * * * | Geocoding em lote |

## Monitoramento

### Status dos Jobs

```bash
npm run etl:status
```

Mostra:
- Status de cada fonte (habilitada/desabilitada)
- Ultima execucao de cada job
- Jobs atrasados (> 24h)
- Total de registros importados

### Tabelas de Monitoramento

- `radar_fontes_config`: configuracao das fontes
- `radar_ingestao_jobs`: historico de execucoes
- `etl_jobs_last_run`: ultima execucao por fonte

### View de Monitoramento

```sql
SELECT * FROM vw_etl_jobs_status;
```

Retorna status consolidado com alertas.

## Deduplicacao

Cada obra e identificada por um hash unico:

```typescript
hash = SHA256(fonte + fonte_id + cidade + uf)
```

O hash evita duplicatas mesmo entre fontes diferentes.

## Fases das Obras

| Fase | Descricao |
|------|-----------|
| alvara | Alvará deferido, obra iniciando |
| nao_iniciou | Projeto/licenca previa |
| fundacao | Escavacao/fundacao |
| estrutura | Alvenaria/laje |
| acabamento | Reboco/pintura |
| concluida | Obra entregue |

## Segmentos Alvo

Tags que identificam o tipo de obra:

- `concreto` - obras com concreto usinado
- `locacao` - necessidade de locacao de equipamentos
- `material` - obras com demanda de material
- `eletrica` - instalacao eletrica
- `hidraulica` - instalacao hidraulica
- `acabamento` - fase de acabamento

## Extendendo para Novas Cidades

Para adicionar uma nova cidade nos Alvaras:

1. Criar novo script em `scripts/etl/alvaras/[cidade].ts`
2. Exportar funcao `runETL`
3. Adicionar ao `scripts/etl/index.ts`
4. Adicionar URL do portal no script
5. Criar migration para configurar cron se necessario

## Troubleshooting

### API nao responde
- Verificar URL do portal
- Implementar retry com backoff
- Manter dados de fallback para continuidade

### Geocoding falhando
- Verificar chave da API Mapbox
- Rate limiting pode estar ativo
- Usar Nominatim como fallback

### Performance
- Batch size padrao: 100 registros
- Rate limit entre requests: 200ms
- Paginas: max 50 para PNCP
