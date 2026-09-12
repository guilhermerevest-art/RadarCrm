# Especificacao Tecnica — Radar CRM SaaS

Contexto: Este documento descreve o modulo completo de Radar de Obras, Radar de Empresas e CRM atualmente existente no sistema e-sweet-code-play, a ser extraido e evoluido para um produto SaaS independente.

Esta versao (1.2) acrescenta a Secao 10 (Cadastros Comerciais e Operacao de Venda) e atualiza a Secao 9 com nova conta financeira considerando o ticket medio elevado para R$ 480.

---

# Indice

1. Visao geral do produto
2. Modulos do sistema
3. Radar de Obras
4. CRM
5. Canal WhatsApp
6. Stack tecnologica
7. Seguranca e multi-tenancy
8. Requisitos ausentes e camadas complementares
9. Ordem de construcao revisada e conta financeira
10. Cadastros comerciais e operacao de venda
11. Mudanca de stack: WhatsApp via EvolutionAPI
12. Escopo geografico do MVP

---

# 1. Visao geral do produto

## 1.1 Nome e posicionamento

Radar CRM e uma plataforma SaaS para prospeccao e gestao comercial voltada ao mercado de construcao civil. O produto combina tres nucleos:

- Radar de Obras: identificacao automatica de obras em fase inicial a partir de fontes publicas.
- Radar de Empresas: base de dados de CNPJ com filtros setoriais.
- CRM: gestao de leads, deals, atividades, agendamentos e fluxos de WhatsApp.

Publico-alvo: concreteiras, locadoras de equipamentos, fornecedores de material, prestadores de servico tecnico e incorporadoras de pequeno e medio porte.

## 1.2 Proposta de valor

Concreterias e locadoras tradicionais perdem oportunidades porque:

- Dependem de indicacao boca a boca, sem visibilidade de obras novas.
- Nao tem ferramenta propria de CRM — usam planilha, papel ou WhatsApp pessoal.
- Nao conseguem acompanhar follow-up de propostas e orcamentos.
- Nao tem controle de comissao, meta ou funil de vendas.

O Radar CRM resolve com:

- Alerta diario de obra nova no WhatsApp da empresa.
- Mapa interativo com obras em fase inicial filtradas por segmento, regiao e porte.
- CRM com pipeline kanban, agendamento e automacao.
- Canal de WhatsApp conectado diretamente ao CRM, com opt-in LGPD-compliant.

## 1.3 Modelo de negocio

SaaS B2B com cobranca mensal por assinatura. Quatro planos:

| Plano | Preco | Usuarios | Limite de obras | Limite de leads | Limite de envios WA/dia | Recursos |
|---|---|---|---|---|---|---|
| Individual | R$ 197 | 1 | 500/mes | 200 | 100 | Basicos |
| Equipe | R$ 397 | 5 | 2.500/mes | 1.000 | 500 | + pipeline, time, automacao |
| Regional | R$ 797 | 20 | 10.000/mes | 5.000 | 2.000 | + multi-cidade, API |
| Obras | sob consulta | ilimitado | ilimitado | ilimitado | ilimitado | + marca branca, SLA, suporte dedicado |

Trial gratuito de 14 dias, sem cartao de credito.

## 1.4 Metricas de sucesso

- MRR (Monthly Recurring Revenue): meta R$ 20 mil em 12 meses.
- Churn mensal: alvo abaixo de 5%.
- Conversao trial -> pago: alvo 25%.
- NPS: alvo acima de 50.
- Ticket medio: R$ 297 (Individual + Equipe) no MVP, R$ 480 ao incluir Regional com Cadastros Comerciais.

---

# 2. Modulos do sistema

O sistema e composto por 6 modulos principais:

1. Radar de Obras — identificacao de obras a partir de fontes publicas.
2. Radar de Empresas — base de CNPJ com filtros setoriais.
3. CRM — gestao de leads, deals, atividades, tarefas.
4. Canal WhatsApp — mensagens transacionais, marketing e atendimento.
5. Billing — gestao de planos, assinaturas, faturas.
6. Admin Panel — gestao interna para a equipe do SaaS.

Cada modulo tem sua propria pagina inicial, navegacao lateral e contexto de uso.

---

# 3. Radar de Obras

## 3.1 Objetivo

Detectar obras em fase inicial (alvara, fundacao, estrutura) e apresentar ao usuario com informacoes uteis para prospeccao: tipo, porte, dono, endereco, valor estimado, fase, segmento alvo.

## 3.2 Fontes de dados

Fontes publicas utilizadas:

| Fonte | Volume estimado/mes | Cobertura | Forma de acesso |
|---|---|---|---|
| Alvaras de construcao (prefeituras) | 700 a 1.000 por cidade ativa | Municipal | Portal da transparencia (scraping) |
| CNO (Receita Federal) | 1.200 nacional | Nacional | API publica CSV mensal |
| PNCP (contratacoes publicas) | 300 nacional | Nacional | API REST |
| Licenciamento ambiental (SEMAD MG) | 80 MG | Estadual | Portal SEMAD |

Para o MVP, cobrir Uberlandia, Uberaba, Araguari, Patos de Minas, Ituiutaba, Patrocinio e Frutal.

## 3.3 Schema principal

Tabela radar_obras:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK tenants — multi-tenancy |
| fonte | text | cno, alvara_prefeitura, pncp, semad_mg |
| fonte_id | text | ID externo na fonte |
| tipo | text | alvara, cno, pncp, semad |
| endereco_logradouro | text | |
| endereco_numero | text | |
| endereco_bairro | text | |
| endereco_cidade | text | |
| endereco_uf | char(2) | |
| endereco_cep | text | |
| lat | numeric(10,7) | |
| lng | numeric(10,7) | |
| geo | geography(Point, 4326) | coluna gerada |
| fase_atual | text | alvara, fundacao, estrutura, acabamento |
| data_inicio | date | |
| data_previsao_termino | date | |
| valor_estimado | numeric(14,2) | |
| porte | text | pequeno, medio, grande |
| segmento_alvo | text[] | tags: concreto, locacao, material, etc. |
| dono_pessoa_juridica_id | uuid | FK empresas |
| construtora_id | uuid | FK empresas |
| descricao | text | texto livre |
| status | text | ativa, pausada, concluida, cancelada |
| qualidade_score | int | 0 a 100 |
| hash_deduplicacao | text | UNIQUE |
| raw_payload | jsonb | payload original da fonte |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Indices: GIST em geo, BTREE em (tenant_id, fase_atual), BTREE em (endereco_cidade, status), UNIQUE em hash_deduplicacao.

## 3.4 Fluxo de ingestao

Job diario (cron) executa pipeline ETL por fonte:

1. Coleta bruto: scraping, CSV ou API.
2. Normalizacao: endereco, lat/lng, fase, porte.
3. Geocoding reverso: se faltar lat/lng, resolver via Mapbox Geocoding.
4. Deduplicacao: hash do endereco + tipo + fonte para evitar duplicatas.
5. Deteccao de fase: se faltar, estimar por data_inicio + tipo.
6. Insersao ou atualizacao em radar_obras.
7. Marcacao de fase como ativa, pausada ou concluida.
8. Disparo de alerta WhatsApp para tenants com filtro ativo.

## 3.5 Score de oportunidade

Score de 0 a 100 que combina: fase inicial (peso 40), proximidade geografica (peso 20), porte (peso 15), valor estimado (peso 15), segmento compativel (peso 10).

Calculado por tenant e segmento. Armazenado em tabela radar_obras_score.

## 3.6 Endpoints e UI

Endpoints principais (REST):

| Metodo | Path | Descricao |
|---|---|---|
| GET | /api/radar/obras | Lista com filtros |
| GET | /api/radar/obras/{id} | Detalhe |
| POST | /api/radar/obras/{id}/visita | Marca visita |
| GET | /api/radar/obras/no-raio | Busca por raio em km |

Telas no frontend:

- /radar — mapa principal com clusterizacao.
- /radar/[id] — detalhe com timeline, tarefas e opcao de virar lead.
- /radar/rota — otimizacao de rota com N obras selecionadas.
- /radar/filtros — CRUD de filtros salvos (raio, segmento, fase).

---

# 4. CRM

## 4.1 Objetivo

Gestao completa de leads, deals, atividades, tarefas, agendamentos, automacoes e integracao com WhatsApp.

## 4.2 Entidades principais

Entidades:

- Lead: pessoa ou empresa que demonstrou interesse.
- Deal: oportunidade de venda vinculada a lead.
- Atividade: tarefa, ligacao, reuniao, e-mail registrado.
- Pipeline: configuracao de estagios do kanban.
- Fluxo de automacao: regra gatilho-acao.
- Anotacao: nota livre em qualquer entidade.

## 4.3 Schema principal

Tabela crm_leads:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| nome | text | |
| empresa_id | uuid | FK empresas (opcional) |
| email | text | |
| telefone | text | |
| origem | text | whatsapp, formulario_site, indicacao, manual |
| utm_source | text | |
| utm_campaign | text | |
| utm_medium | text | |
| utm_content | text | |
| endereco_cidade | text | |
| score_engajamento | int | 0 a 100 |
| status | text | novo, qualificado, descarte, convertido |
| responsavel_id | uuid | FK tenant_users |
| observacoes | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Tabela crm_deals:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| lead_id | uuid | FK crm_leads |
| obra_id | uuid | FK radar_obras (opcional) |
| titulo | text | |
| estagio | text | novo, contato, proposta, negociacao, fechamento, ganho, perdido |
| valor_estimado | numeric(14,2) | |
| valor_final | numeric(14,2) | |
| probabilidade | int | 0 a 100 |
| data_fechamento_prevista | date | |
| data_fechamento_real | date | |
| motivo_perda | text | |
| responsavel_id | uuid | FK tenant_users |
| comissao_percentual | numeric(5,2) | |
| comissao_valor | numeric(12,2) | |
| proposta_id | uuid | FK propostas |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Tabela crm_atividades:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| lead_id | uuid | FK crm_leads (opcional) |
| deal_id | uuid | FK crm_deals (opcional) |
| tipo | text | tarefa, ligacao, reuniao, email, whatsapp |
| descricao | text | |
| data_vencimento | timestamptz | |
| data_conclusao | timestamptz | |
| responsavel_id | uuid | FK tenant_users |
| status | text | pendente, concluida, cancelada |
| created_at | timestamptz | |

Tabela crm_pipeline_estagios:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| nome | text | |
| ordem | int | |
| cor | text | |
| probabilidade_padrao | int | |
| created_at | timestamptz | |

## 4.4 UI e fluxos

Telas principais:

- /crm — kanban de deals com drag-and-drop.
- /crm/leads — lista com filtros e busca.
- /crm/leads/[id] — detalhe do lead com timeline, deals, atividades.
- /crm/deals/[id] — detalhe do deal com historico e WhatsApp.
- /crm/automacoes — CRUD de regras de automacao.

Funcoes do frontend:

- Arrastar deal entre colunas altera probabilidade automaticamente.
- Clicar em lead abre timeline com WhatsApp, e-mails, atividades.
- Criar atividade a partir de qualquer entidade.
- Configurar automacao: SE deal entra em estagio X ENTAO enviar mensagem WhatsApp.

## 4.5 Automacoes

Tabela crm_automacoes:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| nome | text | |
| gatilho_tipo | text | deal_entrou_estagio, lead_recebeu_tag, etc. |
| gatilho_config | jsonb | configuracao do gatilho |
| acao_tipo | text | enviar_whatsapp, criar_atividade, etc. |
| acao_config | jsonb | |
| ativo | boolean | |
| created_at | timestamptz | |

Trigger em crm_deals verifica se ha automacao para o estagio e executa acao.

---

# 5. Canal WhatsApp

## 5.1 Visao geral

O modulo WhatsApp do Radar CRM opera em dois papeis:

- Canal da plataforma (WABA institucional): envia alertas diarios de obra nova para todos os usuarios ativos. Usa templates de utilidade Meta. Nao exige conexao do numero do cliente.
- Canal do tenant (numero do cliente): permite que cada empresa conecte seu proprio numero via QR Code (EvolutionAPI) ou Embedded Signup (Cloud API). Suporta inbox, envio de templates, modelos de mensagem livre e fluxos de automacao.

## 5.2 Schema do canal da plataforma

Tabela wa_contas:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK tenants (NULL para conta institucional) |
| identificador | text | ID do numero de telefone ou WABA |
| nome_exibicao | text | |
| provider | text | cloud_api, evolution, plataforma |
| canal | text | plataforma, tenant |
| phone_number_id | text | API Cloud (legacy) |
| waba_id | text | API Cloud (legacy) |
| evolution_instance_id | text | EvolutionAPI |
| evolution_api_key | text | criptografado no Vault |
| status | text | ativa, pausada, desconectada, banida |
| quality_tier | text | GREEN, YELLOW, RED, UNKNOWN |
| webhook_secret | text | HMAC secret para validar webhooks |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Tabela wa_templates:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK (NULL para templates globais) |
| wa_conta_id | uuid | FK wa_contas |
| nome | text | nome interno |
| categoria | text | MARKETING, UTILITY, AUTHENTICATION |
| idioma | text | pt-BR |
| corpo | text | corpo do template com {{variaveis}} |
| variaveis | text[] | nomes das variaveis |
| meta_template_id | text | ID na Meta (quando aplicavel) |
| meta_status | text | APPROVED, PENDING, REJECTED |
| ativo | boolean | |

Tabela wa_optins:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| numero | text | DDI + DDD + numero |
| escopo | text[] | utilidade, marketing |
| consented_at | timestamptz | |
| ip_consent | text | |
| user_agent_consent | text | |
| evidence_url | text | link para screenshot/registro |
| revoked_at | timestamptz | NULL = opt-in ativo |
| revoked_via | text | palavra_chave, manual, email_link |

Tabela wa_envios_fila:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| wa_conta_id | uuid | FK wa_contas |
| template_id | uuid | FK wa_templates (opcional) |
| contato_numero | text | |
| mensagem | text | corpo renderizado |
| tipo | text | texto, media, template |
| media_url | text | |
| agendado_para | timestamptz | |
| status | text | pendente, processando, enviado, entregue, lido, erro, cancelado |
| tentativas | int | default 0 |
| ultimo_erro | text | |
| motivo_cancelamento | text | |
| tentativas_a_mais | text | logs de tentativas |
| prioridade | int | 0 a 10 |
| message_id | text | ID retornado pela Meta/Evolution |
| created_at | timestamptz | |
| enviado_em | timestamptz | |

Tabela wa_mensagens:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| wa_conta_id | uuid | FK wa_contas |
| message_id | text | UNIQUE — para deduplicacao |
| de_numero | text | |
| para_numero | text | |
| direcao | text | inbound, outbound |
| tipo | text | texto, imagem, audio, video, documento, location, contact |
| conteudo | text | texto ou caption |
| media_url | text | |
| media_id | text | ID na Meta |
| raw_payload | jsonb | |
| lida | boolean | |
| recebida_em | timestamptz | |
| entregue_em | timestamptz | |
| lida_em | timestamptz | |

Indices: BTREE em (tenant_id, de_numero, recebida_em DESC), BTREE em (wa_conta_id, lida) onde lida=false.

## 5.3 Schema do canal do tenant

Tabela wa_fluxos:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| nome | text | |
| escopo | text | obras, crm, interno |
| gatilho | text | evento que dispara |
| gatilho_config | jsonb | |
| ativo | boolean | |
| created_at | timestamptz | |

Tabela wa_fluxo_passos:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| fluxo_id | uuid | FK wa_fluxos |
| ordem | int | |
| atraso_minutos | int | 0 = imediato |
| acao | text | enviar_mensagem, criar_lead, mover_deal |
| acao_config | jsonb | corpo da mensagem, etc. |
| condicao_parada | text | se_resposta, se_palavra, se_tag |

Tabela wa_fluxo_execucoes:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| fluxo_id | uuid | FK |
| tenant_id | uuid | FK |
| contato_numero | text | |
| contexto | jsonb | variaveis preenchidas |
| passo_atual | int | |
| proximo_passo_em | timestamptz | |
| encerrada_em | timestamptz | |
| motivo_encerramento | text | |

## 5.4 Webhook

Edge Function (ou Cloudflare Worker, vide Secao 11) recebe webhook da EvolutionAPI ou Meta Cloud API. Validacao por HMAC SHA-256 do corpo com webhook_secret.

Processamento:

1. Receber POST com evento.
2. Validar HMAC.
3. Responder 200 em < 5 segundos.
4. Em paralelo, enfileirar para processamento assincrono.

Eventos tratados:

- messages.upsert — mensagem recebida ou enviada.
- messages.update — status mudou (entregue, lida, erro).
- connection.update — estado mudou (open, close).
- template.status_update — template aprovado/rejeitado.
- account.quality_update — qualidade mudou.
- account.alerts — Meta detectou padrao problematico.

## 5.5 Funcoes de envio

Funcao fn_wa_enviar(envio_id) executa 6 verificacoes antes de enviar:

1. Opt-in ativo para o numero.
2. Janela de 24h aberta (se mensagem livre) ou template aprovado (se template).
3. Horario permitido (8h as 21h do destinatario).
4. Rate limit do numero do destinatario (max 1 mensagem/dia).
5. Rate limit do tenant (max 30 msg/min, 500 msg/dia).
6. Quality tier GREEN ou YELLOW (pausa RED).

Se qualquer verificacao falhar, o envio e reagendado ou cancelado com motivo.

## 5.6 Fila e retry

Edge Function wa-send (cron 1 minuto) consome wa_envios_fila onde status='pendente' e agendado_para <= NOW(). Processa em lotes de 100.

Retry: tentativas com backoff exponencial 1min, 5min, 30min, 2h, 6h. Apos 5 tentativas, DLQ (dead letter queue) com alerta.

## 5.7 Templates

O Meta exige que mensagens outbound (iniciadas pelo tenant) usem templates pre-aprovados, exceto dentro da janela de 24h apos mensagem do cliente.

Templates tem categoria MARKETING (precisa de opt-in) ou UTILITY (transacional, nao precisa). Categoria AUTHENTICATION exige confirmacao explicita do numero.

Submissao: POST /{waba_id}/message_templates na Meta Graph API. Aprovacao tipicamente em minutos para UTILITY, ate 24h para MARKETING.

## 5.8 Bot de welcome (WABA institucional)

Quando usuario novo faz signup e opta por receber alertas de obra, bot envia fluxo:

1. Mensagem 1: "Bem-vindo ao Radar Canteiro! Em que cidade voce trabalha?"
2. Aguarda resposta, identifica cidade.
3. Mensagem 2: "Qual seu segmento principal?" (botoes: Concreteira, Locadora, Fornecedor, Outro).
4. Aguarda resposta, salva em wa_session.
5. Mensagem 3: "Voce quer amostra gratis das 3 obras mais recentes na sua regiao?"
6. Se sim, envia 3 obras com link para abrir no app.

Estado salvo em wa_session (jsonb) com expiracao de 30 min.

## 5.9 UI

- /whatsapp — inbox com lista de conversas.
- /whatsapp/templates — gestao de templates com preview e submissao.
- /whatsapp/fluxos — editor visual de fluxos de automacao.
- /whatsapp/configuracoes — qualidade, limite, opt-ins, opt-outs.
- /whatsapp/alertas — CRUD de filtros para alerta diario de obra nova.

## 5.10 Tokens e credenciais

Access tokens do Meta armazenados em Supabase Vault (criptografado com pgsodium). Service role key nunca no frontend. Rotacao automatica a cada 60 dias para tokens de longa duracao.

## 5.11 LGPD e compliance

- Opt-in explicito por canal (utilidade vs marketing).
- Opt-out em 1 clique ou palavra-chave (SAIR, PARAR).
- DPO designado documentado na politica de privacidade.
- Mensagens de obra de pessoa fisica NAO incluem dados pessoais do dono (apenas CNPJ se PJ).
- Direito ao esquecimento: funcao fn_wa_apagar_dados_contato(numero) remove historico e midia.
- Contrato operador-controlador no Embedded Signup.

---

# 6. Stack tecnologica

## 6.1 Frontend

- React 18 com TypeScript.
- Vite para build.
- TanStack Query para cache de servidor.
- Zustand para estado local.
- TailwindCSS para estilizacao.
- shadcn/ui para componentes base.
- React Hook Form + Zod para formularios.
- Mapbox GL JS para mapas.
- TanStack Router para roteamento client-side.

## 6.2 Backend

- Supabase para banco, autenticacao e storage.
- Postgres 15 com extensao PostGIS, pg_trgm e pgsodium.
- Edge Functions (Deno) para webhooks e jobs cron.
- Cloudflare Workers + Upstash QStash para fila WhatsApp (opcional, vide Secao 11).

## 6.3 Storage

- Supabase Storage para avatares, midia de WhatsApp, PDFs de proposta.
- Cloudflare R2 para backup de sessoes EvolutionAPI.

## 6.4 Provedores externos

- Stripe: billing recorrente.
- Mapbox: geocoding e mapa.
- Resend: e-mails transacionais.
- PostHog: analytics de produto.
- Sentry: error tracking.
- Crisp ou Intercom: chat de suporte.
- Upstash: Redis para rate limit.
- Cloudflare: CDN, Workers, R2.

## 6.5 Evolucao do stack WhatsApp (Secao 11)

Para escalar alem de 50 clientes ativos, migrar para EvolutionAPI (auto-hospedado em VPS) com Cloudflare Workers + Upstash QStash para fila e retry.

---

# 7. Seguranca e multi-tenancy

## 7.1 Multi-tenancy

Postgres multi-tenant com coluna tenant_id em todas as tabelas de dados. RLS (Row Level Security) habilitada e testada para todas as tabelas.

Funcao fn_tenant_criar(usuario, nome, slug, plano) cria tenant e vincula usuario como admin. Funcao fn_tenant_convidar(tenant, email, papel) gera convite. Funcao fn_tenant_aceitar_convite(token, user) atribui papel.

Middleware de request seta current_setting('app.tenant_id') via SET LOCAL no inicio de cada transacao. Requests sem tenant retornam 401.

## 7.2 Autenticacao

- Google OAuth (provider principal).
- Magic link por e-mail (alternativo).
- MFA TOTP obrigatorio para papel admin.
- Bloqueio apos 5 tentativas erradas em 15 min.

## 7.3 RBAC (papel e permissoes)

Papeis definidos por tenant:

- admin — controle total do tenant.
- gerente — gerencia time, ve metricas, aprova descontos.
- vendedor — CRUD de leads/deals, envia WhatsApp.
- leitor — somente leitura.

Permissoes granulares por papel armazenadas em tenant_papeis.permissoes (jsonb).

## 7.4 Seguranca de dados

- Criptografia em repouso (Supabase nativo).
- Criptografia em transito (TLS 1.3).
- Backups PITR 7 dias (Supabase Pro).
- Audit log para acoes sensiveis (criacao/delecao de tenant, mudanca de papel).
- Deteccao de ATO (login de IP/regiao nova) com bloqueio temporario.

---

# 8. Requisitos ausentes e camadas complementares

O sistema e-sweet-code-play existente cobre os nucleos basicos de Radar e CRM. Para evoluir para SaaS multi-tenant com cobrancas e operacao em escala, 11 camadas complementares sao necessarias:

## 8.1 Fundacao multi-tenant (cobrir no Epic 1)

Migrar de single-tenant para multi-tenant. Criar tabelas tenants, tenant_users, tenant_invites. Adicionar tenant_id em todas as 25+ tabelas. Reescrever RLS.

## 8.2 Autenticacao e provisionamento (cobrir no Epic 2)

Substituir autenticacao manual por Google OAuth + magic link. MFA para admin. Bloqueio por tentativas.

## 8.3 Onboarding de 3 passos (cobrir no Epic 3)

Criar fluxo: signup com Google -> preview do mapa com obras da cidade -> filtro de segmento -> opt-in WhatsApp com LGPD.

## 8.4 Billing e planos (cobrir no Epic 4)

Integrar Stripe. Trial 14 dias sem cartao. Cobranca recorrente. Mudanca de plano com prorata. Cancelamento. Politica de inadimplencia (grace 3d, bloqueia D+4, leitura D+10).

## 8.5 Score de oportunidade (cobrir no Epic 7)

Calcular score 0 a 100 por tenant e segmento combinando fase, proximidade, porte, valor e compatibilidade.

## 8.6 Rota otimizada (cobrir no Epic 7)

Nearest neighbor com mapa de distancia real. Ate 12 obras por rota. Deep link para Google Maps/Waze.

## 8.7 Geocoding (cobrir no Epic 5)

Resolver endereco -> lat/lng com fallback chain (Mapbox -> Google -> Nominatim). Cache 90 dias. Fila para volume.

## 8.8 PostGIS e raio (cobrir no Epic 5)

Indice GIST em geography(Point). Query < 50ms em 100k obras. Multiplos centros por tenant (filiais).

## 8.9 Monitoramento e observabilidade (cobrir no Epic 10)

Sentry para erros. PostHog para analytics. Uptime Kuma para status page. Jobs atrasados alertam.

## 8.10 Rate limiting (cobrir no Epic 12)

API publica com rate limit por chave. Webhooks com retry. DLQ apos 3 falhas.

## 8.11 Backups e DR (cobrir no Epic 10)

PITR habilitado. Runbooks para incidentes criticos (postgres down, numero banido, webhook travado).

## 8.12 Status page (cobrir no Epic 10)

Publica com 5 componentes: API, Banco, Webhooks WhatsApp, Billing, Painel. Historico 90 dias.

## 8.13 Termos, privacidade e DPA (cobrir no Epic 10)

Paginas publicas com versao. Aceite versionado no signup. DPA assinado por clientes enterprise.

## 8.14 Help center e suporte (cobrir no Epic 11)

Artigos no Notion (ou similar). Chat in-app para plano Equipe+. SLA visivel no painel.

## 8.15 Admin panel (cobrir no Epic 11)

Refine ou Appsmith conectado ao Supabase. Lista de tenants, detalhes, impersonar, pausar. Metricas globais.

## 8.16 Migracao de dados (cobrir no Epic 11)

Self-service por CSV para bases pequenas. Assistida para bases > 5.000 registros.

## 8.17 API publica (cobrir no Epic 12)

Endpoints REST com autenticacao por API key (Argon2 hash). Webhooks com HMAC. Documentacao OpenAPI. Versionamento /v1/.

## 8.18 Feature flags e white-label (cobrir no Epic 12)

Tabela feature_flags com cache Redis. White-label basico (logo + cor) para plano Obras. Widget de captacao para revenda.

## 8.19 Audit log (cobrir no Epic 10)

Tabela audit_log com retencao 12 meses. Eventos: login, alteracao de papel, mudanca de plano, deletar lead, deletar deal, export de dados.

---

# 9. Ordem de construcao revisada e conta financeira

## 9.1 Ordem de construcao recomendada

A ordem abaixo assume 1 dev full-time por 17 meses ou 2 devs por 8 meses. As dependencias estao listadas para permitir paralelismo maximo.

| Fase | Periodo | Epicos | Entregaveis visiveis |
|---|---|---|---|
| MVP fechado | Mes 1 a 4 | E1 (multi-tenant) + E2 (auth) + E3 (onboarding) + E5 (geo) | App com login, mapa, obras — mas sem pagamento nem WhatsApp |
| MVP pago | Mes 4 a 7 | E4 (billing) + E6 (ingestao) + E8 (WA plataforma) | Trial 14d, cobranca Stripe, alerta diario de obra |
| CRM funcional | Mes 6 a 11 | E7 (score+rota) + E9 (WA tenant+CRM) + E13 (cadastros comerciais) | CRM kanban, fluxo WhatsApp, proposta com PDF |
| Operacao | Mes 8 a 14 | E10 (LGPD/seguranca) + E11 (suporte/admin) | Termos, DPA, admin panel, help center |
| Escala | Mes 12 a 17 | E12 (API/escala) + melhorias em todos | API publica, revenda, sandbox |

## 9.2 Conta financeira considerando Secao 10

Premissas:

- Custo de aquiscao por cliente (CAC): R$ 150 em concreto (conteudo + outbound), R$ 300 para locadora (feira + LinkedIn ads), R$ 320 para Regional (proposta + demo).
- LTV medio: 18 meses (churn 5%/mes).
- Taxa de cobranca: 92% (8% inadimplencia).
- Infraestrutura Supabase Pro: R$ 380/mes base + R$ 12 por cliente ativo.
- Infraestrutura WhatsApp (Cloud API Meta): R$ 0.05 por mensagem utilidade, R$ 0.30 por marketing.
- Infraestrutura WhatsApp (EvolutionAPI apos migracao): R$ 350/mes fixo VPS + R$ 0 por mensagem.
- Stripe: 4% por transacao + R$ 0.39 por cobranca.

Tabela de distribuicao de clientes (projecao 12 meses):

| Plano | Preco | Clientes (mes 12) | Receita bruta | Receita liquida Stripe | Custo WA | Custo CAC | Custo infra proporcional | Contribuicao liquida |
|---|---|---|---|---|---|---|---|---|
| Individual | R$ 197 | 25 | R$ 4.925 | R$ 4.681 | R$ 246 | R$ 3.750 | R$ 50 | R$ 635 |
| Equipe | R$ 397 | 15 | R$ 5.955 | R$ 5.661 | R$ 595 | R$ 4.500 | R$ 75 | R$ 491 |
| Regional | R$ 797 | 5 | R$ 3.985 | R$ 3.787 | R$ 398 | R$ 1.600 | R$ 25 | R$ 1.764 |
| Obras | sob consulta | 2 | R$ 4.500 | R$ 4.276 | R$ 450 | R$ 1.000 | R$ 25 | R$ 2.801 |
| Totais | media R$ 480 | 47 | R$ 19.365 | R$ 18.405 | R$ 1.689 | R$ 10.850 | R$ 175 | R$ 5.691 |

Conclusao: com a Secao 10 implementada, basta 47 clientes pagantes para chegar a R$ 19.365 brutos, contra 77 clientes necessarios no modelo anterior (sem Cadastros Comerciais).

Custos fixos mensais estimados:

- Supabase Pro: R$ 380.
- VPS EvolutionAPI: R$ 350.
- Cloudflare Workers + Upstash QStash: R$ 165.
- Stripe taxa fixa: R$ 0.
- Resend (e-mails): R$ 60.
- Sentry: R$ 0 ate 5k erros/mes.
- PostHog: R$ 0 ate 1M eventos/mes.
- Cloudflare R2: R$ 5.
- Total fixo: R$ 960/mes.

Custos variaveis (com 47 clientes e 50k mensagens/mes): R$ 1.689 (WhatsApp) + R$ 738 (Stripe 4%) + R$ 175 (infra proporcional) = R$ 2.602/mes.

Custo total mensal com 47 clientes: R$ 3.562.
Receita liquida: R$ 18.405.
Margem bruta: 81%.
Contribuicao apos CAC do mes: R$ 5.691 (cobriu CAC inicial de R$ 10.850 em 2 meses).

Meta ajustada: 47 clientes pagantes (em vez de 77) em 12 meses = R$ 19.365 MRR.

CAC maximo por canal com a nova conta: R$ 320 (Regional), R$ 300 (Locadora), R$ 150 (Concreto). Escalar com qualidade, nao em volume.

## 9.3 Riscos financeiros

- Concentracao em 2 cidades: se Uberlandia e Uberaba nao escalarem, plano regional fica sem destino. Mitigacao: abrir Araguari e Ituiutaba no mes 6.
- Custo de WhatsApp crescente: se passar de 100k mensagens/mes, migrar para EvolutionAPI reduz custo em ate 70%.
- Churn acima de 8%: LTV cai para 12 meses e o payback do CAC alonga para 5 meses. Mitigacao: NPS trimestral e reativacao automatica.
- Inadimplencia 8%: ja precificada. Se subir para 12%, meta de 53 clientes em vez de 47.

---

# 10. Cadastros comerciais e operacao de venda

Esta secao foi adicionada na versao 1.2 da spec. Captura os requisitos que fazem o produto justificar o ticket medio mais alto (R$ 480 com Cadastros Comerciais vs R$ 297 sem) e habilita a venda para Regional e Obras.

Origem: feedback de 3 entrevistas com concreteiras e locadoras (novembro 2025), onde os problemas identificados foram:

1. Concreteira de medio porte recebe 12 pedidos de cotacao por semana. Mandava PDF com logo da matriz em Word, com marcas e paragrafos desalinhados. Cliente nao levava a serio.
2. Locadora regional tinha 4 vendedores. Cada um dava desconto diferente. Gerente so ficava sabendo no fim do mes. Nao tinha como limitar margem minima.
3. Fornecedor de material com 3 filiais. Cada vendedor atendia uma regiao. Sem visibilidade do pipeline de cada um, gerente nao conseguia redistribuir leads nem cobrar meta.

Os tres problemas tem a mesma raiz: falta de gestao comercial integrada. Esta secao define o minimo viavel.

## 10.1 Cadastro da empresa do tenant

Cada tenant deve configurar a propria empresa (nao apenas o usuario administrador). Isso permite que propostas e PDFs usem a marca do cliente, nao da plataforma.

Tabela tenant_empresa:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK tenants UNIQUE |
| razao_social | text | |
| nome_fantasia | text | |
| cnpj | char(14) | UNIQUE com tenant_id |
| inscricao_estadual | text | |
| email_comercial | text | |
| telefone_comercial | text | |
| endereco_completo | text | |
| logo_url | text | URL no Storage |
| cor_primaria | text | hex (#RRGGBB) default D9541F |
| cor_secundaria | text | hex |
| proposta_modelo | text | 'padrao' \| 'minimalista' \| 'detalhado' |
| proposta_template_id | uuid | template custom (opcional) |
| validade_proposta_dias | int | default 7 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Validacao: CNPJ validado por algoritmo de digitos verificadores no frontend antes de submeter. Backend re-valida com Receita Federal (BrasilAPI) async.

UI: EmpresaPerfilForm.tsx em 3 abas:

1. Dados basicos: razao social, CNPJ, IE, e-mail, telefone.
2. Marca: upload de logo (max 2 MB, png/svg), seletor de cor primaria.
3. Proposta: modelo padrao, validade, termos.

Status: campo calculado tenant_empresa_configurada em tenants (bool). Se false, banner persistente no app ate ser preenchido.

## 10.2 Catalogo de produtos

Tenant cadastra os produtos/servicos que oferece. Esses produtos compoem as propostas.

Tabela produtos:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| categoria | text | concreto, locacao, material, servico, outro |
| subcategoria | text | opcional, livre |
| codigo_interno | text | SKU ou codigo proprio |
| nome | text | |
| descricao | text | |
| unidade | text | m3, unidade, dia, mes, kg, hora |
| preco_base | numeric(12,2) | preco sugerido |
| preco_minimo | numeric(12,2) | piso para desconto |
| preco_maximo | numeric(12,2) | teto (opcional) |
| metadata | jsonb | campos customizados (ex: fck, slump, metragem) |
| ativo | boolean | default true |
| arquivado_em | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Indices: BTREE em (tenant_id, categoria, ativo), BTREE em (tenant_id, codigo_interno).

UI: ProdutoCatalogo.tsx com:

- Lista virtualizada (suporta 1.000+ produtos).
- Busca por nome/codigo com debounce 300ms.
- Filtros laterais: categoria, ativo/arquivado.
- Botao "Arquivar" (soft delete).
- Botao "Duplicar".
- Importacao CSV.

Metadata por categoria (campo metadata):

- Concreto: fck (MPa), slump (cm), brita, tipo (usinado/engenhado).
- Locacao: tipo_equipamento, capacidade, diaria_base.
- Material: dimensoes, peso, cor.

## 10.3 Propostas

Nucleo da operacao comercial. Tenant monta uma proposta para um deal, com itens do catalogo proprio.

Tabela propostas:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| deal_id | uuid | FK crm_deals (opcional) |
| lead_id | uuid | FK crm_leads (opcional) |
| numero | text | auto-increment por tenant, formato PROP-2026-0001 |
| versao | int | default 1 |
| status | text | rascunho, em_aprovacao, enviada, visualizada, aceita, recusada, expirada, cancelada |
| cliente_nome | text | snapshot no momento |
| cliente_documento | text | CNPJ ou CPF snapshot |
| cliente_email | text | |
| cliente_telefone | text | |
| cliente_endereco | text | |
| itens_subtotal | numeric(14,2) | soma dos itens |
| desconto_percentual | numeric(5,2) | |
| desconto_valor | numeric(14,2) | |
| impostos_percentual | numeric(5,2) | |
| total | numeric(14,2) | |
| condicoes_pagamento | text | texto livre |
| prazo_entrega | text | "15 dias uteis" |
| validade_dias | int | default 7 |
| data_validade | date | calculada: criada_em + validade_dias |
| termos_adicionais | text | markdown |
| template_usado | text | nome do template |
| pdf_url | text | Storage apos geracao |
| pdf_gerado_em | timestamptz | |
| portal_token | text | UNIQUE — para /p/[token] |
| portal_token_expira_em | timestamptz | |
| enviada_em | timestamptz | |
| visualizada_em | timestamptz | |
| aceita_em | timestamptz | |
| recusada_em | timestamptz | |
| motivo_recusa | text | |
| ip_aceitacao | text | |
| user_agent_aceitacao | text | |
| criador_id | uuid | FK tenant_users |
| aprovador_id | uuid | FK tenant_users |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Tabela propostas_itens:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| proposta_id | uuid | FK |
| produto_id | uuid | FK produtos |
| ordem | int | |
| descricao | text | snapshot |
| unidade | text | snapshot |
| quantidade | numeric(12,3) | |
| preco_unitario | numeric(12,2) | snapshot |
| desconto_percentual | numeric(5,2) | |
| desconto_valor | numeric(12,2) | |
| subtotal | numeric(14,2) | calculado |
| metadata | jsonb | snapshot do produto |
| created_at | timestamptz | |

Tabela propostas_historico:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| proposta_id | uuid | FK |
| autor_id | uuid | FK tenant_users |
| acao | text | criada, editada, enviada, visualizada, aceita, recusada, comentario |
| de_status | text | |
| para_status | text | |
| comentario | text | |
| ip_origem | text | |
| created_at | timestamptz | |

Fluxo de geracao de PDF:

1. Usuario clica "Gerar PDF" no editor.
2. Frontend chama Edge Function proposta-gerar-pdf com proposta_id.
3. Edge Function monta HTML a partir do template + dados da proposta + tenant_empresa.
4. Puppeteer ou Playwright gera PDF.
5. Upload no Storage com path tenants/{tenant_id}/propostas/{proposta_id}.pdf.
6. Atualiza propostas.pdf_url e pdf_gerado_em.
7. Retorna URL assinado para download.

Tempo esperado: < 5 segundos para PDF com ate 50 itens.

Portal publico /p/[token]:

- Rota publica, sem autenticacao.
- Renderiza a proposta com a marca do tenant.
- Botoes "Aceitar" e "Recusar" (recusa pede motivo).
- Botao "Baixar PDF".
- Registra IP, UA, timestamp na visualizacao/aceite/recusa.
- Self-destruct apos 90 dias ou status terminal.

Funcoes principais:

- fn_proposta_criar(tenant, deal, dados): cria rascunho com numero auto-incrementado.
- fn_proposta_calcular_totais(proposta_id): recalcula subtotal e total apos mudanca em item.
- fn_proposta_enviar(proposta_id, canal, destinatario): envia por e-mail ou WhatsApp.
- fn_proposta_aceitar(proposta_id, ip, ua): marca como aceita, dispara webhook, atualiza deal.

## 10.4 Alcada e aprovacao

Vendedor pode ter limite de desconto. Gerente aprova o que ultrapassa. Admin configura as regras.

Tabela tenant_papeis:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| nome | text | "Vendedor Pleno", "Gerente Comercial" |
| permissoes | jsonb | ver exemplo abaixo |
| desconto_maximo_percentual | numeric(5,2) | |
| valor_maximo_proposta | numeric(14,2) | |
| requer_aprovacao_acima_de | numeric(14,2) | |
| aprovador_papel_id | uuid | FK self-reference |
| created_at | timestamptz | |

Estrutura de permissoes (jsonb):

```json
{
  "leads": ["criar", "ler", "editar", "deletar"],
  "deals": ["criar", "ler", "editar", "mover_estagio"],
  "propostas": ["criar", "ler", "editar", "enviar"],
  "obras": ["ler", "marcar_visita"],
  "produtos": ["ler"],
  "whatsapp": ["enviar_mensagem", "criar_fluxo"],
  "usuarios": [],
  "configuracoes": []
}
```

Papeis seedados:

- admin — todas as permissoes, sem limite.
- gerente — todas exceto deletar usuarios e editar billing.
- vendedor — criar/editar leads/deals, ler produtos, enviar WhatsApp, sem deletar.
- leitor — somente leitura.

Funcao fn_proposta_validar_alcada(proposta_id, usuario_id):

```sql
RETURNS jsonb
verifica:
  1. usuario.papel.desconto_maximo_percentual >= proposta.desconto_percentual
  2. usuario.papel.valor_maximo_proposta >= proposta.total
  3. se total > usuario.papel.requer_aprovacao_acima_de:
     verifica se ja existe aprovacao para essa versao
     se nao, retorna {status: 'requer_aprovacao', aprovador_papel_id}
     se sim, retorna {status: 'aprovado', aprovador_id}
  4. se tudo OK: {status: 'aprovado'}
```

UI: PropostaEditor.tsx mostra badge AlcadaBadge.tsx com status:

- Verde: "Aprovado para envio".
- Amarelo: "Requer aprovacao de [papel]".
- Vermelho: "Excede limite do papel".

Notificacao por e-mail e in-app para o aprovador. Aprovacao inline sem trocar de tela.

## 10.5 Comissao

Comissao calculada automaticamente ao mudar status do deal para GANHO. Configuravel por papel ou por vendedor.

Tabela tenant_comissoes:

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| user_id | uuid | FK tenant_users |
| percentual | numeric(5,2) | |
| valor_fixo | numeric(12,2) | opcional |
| tipo_base | text | valor_final, valor_proposta, valor_margem |
| ativo | boolean | |
| vigencia_inicio | date | |
| vigencia_fim | date | |

Trigger trg_deal_ganho_calcula_comissao:

```sql
CREATE TRIGGER ...
AFTER UPDATE OF estagio ON crm_deals
FOR EACH ROW
WHEN (NEW.estagio = 'ganho' AND OLD.estagio <> 'ganho')
EXECUTE FUNCTION fn_comissao_calcular();
```

UI: RelatorioComissoes.tsx com:

- Filtros: periodo, vendedor, status (pendente/pago).
- Tabela: vendedor, total ganho, comissao, status pagamento.
- Totalizadores: total geral, total por vendedor.
- Botao "Marcar como pago" (gera data_pagamento).
- Export CSV.

## 10.6 Pipeline por vendedor

Vendedor ve apenas os proprios deals. Gerente/admin ve todos. Toggle "Ver todos" para gerente/admin com permissao.

Coluna vendedor_id em crm_deals (default null, mas NOT NULL a partir de E13-T28).

RLS reforcada: SELECT em crm_deals WHERE vendedor_id = auth.uid() OR usuario.papel IN ('admin','gerente').

UI: PipelineVendedorView.tsx:

- Default: kanban com apenas os deals do usuario logado.
- Toggle "Ver todos" no header (visivel para gerente/admin).
- Cada card mostra responsavel (avatar + nome) quando em modo "todos".

## 10.7 Limites por plano

Adicionar 3 novas metricas ao fn_uso_validar_limite:

- produtos_ativos: COUNT(*) FROM produtos WHERE ativo = true AND tenant_id = $1.
- propostas_mes: COUNT(*) FROM propostas WHERE created_at >= date_trunc('mes', now()) AND tenant_id = $1.
- usuarios: COUNT(*) FROM tenant_users WHERE tenant_id = $1.

Limites por plano:

| Plano | produtos_ativos | propostas_mes | usuarios |
|---|---|---|---|
| Individual | 30 | 20 | 1 |
| Equipe | 200 | 100 | 5 |
| Regional | 1.000 | 500 | 20 |
| Obras | ilimitado | ilimitado | ilimitado |

Bloqueio: ao tentar criar alem do limite, UI mostra banner com CTA de upgrade.

## 10.8 Audit log de operacao comercial

Toda acao relevante em propostas, papeis, comissoes e equipe gera entrada em audit_log.

Eventos cobertos:

- proposta.criada, proposta.editada, proposta.enviada, proposta.visualizada, proposta.aceita, proposta.recusada, proposta.expirada, proposta.cancelada.
- papel.criado, papel.editado, papel.arquivado.
- usuario.convidado, usuario.aceito, usuario.removido, usuario.papel_alterado.
- comissao.calculada, comissao.paga.

Implementacao: trigger AFTER INSERT/UPDATE/DELETE em cada tabela.

## 10.9 UI consolidada

Telas adicionadas ou modificadas:

- /configuracao/empresa — EmpresaPerfilForm.tsx.
- /configuracao/time — TimeGestao.tsx (lista de usuarios + papeis).
- /configuracao/papeis — PapelEditor.tsx (criar/editar papel).
- /configuracao/comissoes — RelatorioComissoes.tsx.
- /produtos — ProdutoCatalogo.tsx.
- /produtos/novo — ProdutoForm.tsx.
- /produtos/importar — ProdutoImportacaoCSV.tsx (P2).
- /propostas — PropostasList.tsx (rascunhos, enviadas, aceitas, recusadas).
- /propostas/nova — PropostaEditor.tsx.
- /propostas/[id] — PropostaDetalhe.tsx.
- /p/[token] — Portal publico (sem autenticacao).

## 10.10 Custo e tempo adicional

Estimativa:

- 13 novos endpoints REST.
- 12 novos componentes React.
- 5 novas tabelas + 6 modificadas.
- 42 DH (dias-homem) — vide Epic 13.
- 8 semanas com 1 dev, 4 semanas com 2 devs.

Beneficios:

- Ticket medio R$ 350 -> R$ 480.
- Justifica plano Regional.
- Cria lock-in: 100 produtos cadastrados, 50 propostas no historico, 6 meses de comissao calculada — cliente sai com custo alto de migracao.
- Abre frente de revenda (plano Obras) e API (Epic 12).

## 10.11 Mitigacao de risco: complexidade do editor de proposta

O PropostaEditor.tsx e o componente mais complexo do produto. Estrategia:

1. MVP (mes 1): editor 1 coluna (lista de itens) + preview ao vivo em painel lateral.
2. Iteracao (mes 2): 3 colunas (catalogo | editor | preview) com drag-and-drop.
3. Polimento (mes 3): templates customizados, duplicar proposta, versoes.

Complexidade do gerador de PDF:

1. MVP (mes 1): template unico fixo, Puppeteer com HTML estatico.
2. Iteracao (mes 2): 3 templates (padrao, minimalista, detalhado) com seletor.
3. Polimento (mes 3): editor de template visual (avancado, baixa prioridade).

Se Puppeteer nao performar bem em serverless Edge Function (limites de tempo, memoria), considerar:

- Resend ou similar servico de PDF-as-a-Service.
- Compilar templates em React Email com renderizador de PDF.
- Cloudflare Workers com Browser Rendering (em beta).

## 10.12 Numeros do payback

Investimento para entregar Secao 10: ~42 DH = R$ 12.600 (1 dev a R$ 300/dia).

Retorno: ticket medio +37%. Com 47 clientes pagando media R$ 480 em vez de R$ 350, receita liquida adicional R$ 6.110/mes. Payback: 2 meses.

Se o produto sem a Secao 10 demora 4 meses para atingir 77 clientes (Cenario Antigo), e com a Secao 10 demora 3 meses para atingir 47 clientes (Cenario Novo):

- Cenario Antigo: receita mes 4 = R$ 16.940 (77 x R$ 220 liquido). CAC investido = R$ 11.550.
- Cenario Novo: receita mes 3 = R$ 14.384 (47 x R$ 306 liquido). CAC investido = R$ 10.850.

Receita liquida por cliente e maior no Cenario Novo, e o tempo para atingir o mesmo MRR e 33% menor.

## 10.13 Roteiro de implementacao (resumo)

Sprint 1 (semanas 1-2): tabelas tenant_empresa, produtos, propostas. UI de cadastro da empresa e catalogo.

Sprint 2 (semanas 3-4): PropostaEditor + PDF. Portal publico. Envio por e-mail.

Sprint 3 (semanas 5-6): tenant_papeis + alcada. TimeGestao. Notificacao de aprovacao.

Sprint 4 (semanas 7-8): comissoes + relatorio. PipelineVendedorView. Audit log. Limites por plano.

Sprint 5 (semana 9, buffer): migracao de dados do e-sweet-code-play. QA E2E. Documentacao.

Dependencias externas: provedor de NFe (NFe.io ou Similar), servico de PDF (Puppeteer ou Resend).

---

# 11. Mudanca de stack: WhatsApp via EvolutionAPI

## 11.1 Contexto

O sistema e-sweet-code-play usava Meta Cloud API diretamente. Para escalar com menor custo e maior flexibilidade, a versao 1.2 da spec introduz a opcao de migrar para EvolutionAPI (solucao open-source auto-hospedada) com Cloudflare Workers para fila e rate limit.

A EvolutionAPI e mantida por comunidade brasileira, usa Baileys (lib nao-oficial do WhatsApp), e roda em Node.js. Custos:

- Meta Cloud API: R$ 0.05 por mensagem utilidade + R$ 0.30 marketing. Tier gratis com 1.000 conversas de servico/mes.
- EvolutionAPI: R$ 350/mes fixo (VPS 4 GB RAM) + R$ 0 por mensagem.

Ate 7.000 mensagens/mes, Meta Cloud API e mais barato. Acima disso, EvolutionAPI ganha. Para clientes B2B que disparam > 30k mensagens/mes, a economia e de centenas de reais por cliente.

## 11.2 Decisao: qual provider usar

Regra:

- Fase MVP (0 a 50 clientes): Meta Cloud API exclusivamente. Mais simples, mais confiavel.
- Fase escala (50 a 200 clientes): hibrido. Cliente individual usa Cloud API, Regional e Obras usam EvolutionAPI.
- Fase enterprise (200+ clientes): EvolutionAPI padrao, com Cloud API como contingencia.

## 11.3 Schema atualizado

A coluna wa_contas.provider suporta 3 valores:

- cloud_api: Meta Cloud API original. Usa phone_number_id, waba_id.
- evolution: EvolutionAPI auto-hospedada. Usa evolution_instance_id, evolution_api_key.
- plataforma: WABA institucional. Apenas alertas diarios.

Colunas adicionadas em wa_contas:

| Coluna | Tipo | Descricao |
|---|---|---|
| evolution_instance_id | text | ID da instancia na Evolution |
| evolution_api_key | text | chave de API da instancia |
| evolution_webhook_url | text | URL completa do webhook |
| evolution_base_url | text | URL da VPS |

Todas criptografadas em Vault. Indices: BTREE em evolution_instance_id.

## 11.4 Provisionamento EvolutionAPI

Cada tenant que escolhe EvolutionAPI ganha uma instancia isolada na VPS. Nao compartilhamento entre tenants para isolar banimentos.

Script de criacao de instancia:

```bash
#!/bin/bash
EVOLUTION_BASE_URL="https://evolution.seudominio.com.br"
EVOLUTION_GLOBAL_KEY="..."
TENANT_ID="$1"
INSTANCE_NAME="tenant_${TENANT_ID//-/_}"

curl -X POST "$EVOLUTION_BASE_URL/instance/create" \
  -H "apikey: $EVOLUTION_GLOBAL_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"instanceName\": \"$INSTANCE_NAME\",
    \"qrcode\": true,
    \"integration\": \"WHATSAPP-BAILEYS\",
    \"webhook\": {
      \"url\": \"https://api.radarcanteiro.com.br/webhook/wa/$INSTANCE_NAME\",
      \"events\": [\"MESSAGES_UPSERT\", \"MESSAGES_UPDATE\", \"CONNECTION_UPDATE\", \"QRCODE_UPDATED\"],
      \"webhook_by_events\": false
    }
  }"
```

Funcao Edge wa-evolucao-criar-instancia(tenant_id):

1. Chama script via API.
2. Recebe instance_name, api_key, qr_code base64.
3. Salva em wa_contas (com criptografia).
4. Retorna QR Code para o front exibir.

## 11.5 QR Code e conexao

UI: WAConexaoWizard.tsx com:

1. Passo 1: "Abra WhatsApp no celular, va em Configuracoes > Aparelhos conectados > Conectar aparelho".
2. Passo 2: QR Code exibido em tempo real (SSE ou websocket).
3. Passo 3: ao detectar connection.update com state=open, salva e redireciona.

Substitui o Embedded Signup do Meta. Vantagem: nao precisa de Meta Business verificado.

## 11.6 Webhook

URL padrao: https://api.radarcanteiro.com.br/webhook/wa/{instance_name}?token={webhook_secret}

Validacao: compara token do query com wa_contas.webhook_secret. Se diferente, 401.

Processamento: enfileira no QStash via Cloudflare Worker, processa em Edge Function assincrona.

## 11.7 Edge Functions

Substituir Edge Functions Supabase por Cloudflare Workers + Upstash QStash:

| Edge Function Supabase | Cloudflare Worker | Funcao |
|---|---|---|
| wa-webhook | webhook-router | Recebe webhook EvolutionAPI |
| wa-webhook-processor | wa-process | Processa evento, atualiza banco |
| wa-send | wa-sender | Envia mensagem com rate limit |
| wa-cron-envio | wa-dispatch | Cron 1 min, le fila |

Cloudflare Workers tem vantagens: timeout 5min (vs 150s), cold start < 50ms (vs 200-800ms), cron nativo, fila via QStash com retry automatico.

Custo adicional: R$ 195/mes com Upstash + Workers ate 500k mensagens/mes. Documentacao completa em ARQUITETURA_FILA.md.

## 11.8 Templates vs modelos de mensagem livre

Diferenca fundamental:

- Cloud API: exige template pre-aprovado pela Meta para qualquer mensagem outbound fora da janela de 24h.
- EvolutionAPI (Baileys): nao exige aprovacao. Voce escreve a mensagem livre.

Risco: WhatsApp pode banir numero que manda mensagem em massa nao solicitada, com ou sem EvolutionAPI. Mas EvolutionAPI nao tem fila de aprovacao.

Recomendacao: mesmo com EvolutionAPI, mantenha a pratica de opt-in, opt-out em 1 clique, e mensagem de valor. Templates viram "modelos de mensagem" salvos, sem fila da Meta.

## 11.9 Rate limiting

Cloud API: limite por tier (1k, 10k, 100k conversas/mes). Acima disso, tier 2 com pricing por mensagem.

EvolutionAPI: sem limite tecnico, mas WhatsApp detecta padrao abusivo. Recomendado: max 30 msg/min, 500 msg/dia por numero, 1 msg/dia por contato.

Implementacao: Upstash Redis com chave por tenant + janela.

## 11.10 UI de gestao

WAConexaoWizard.tsx:

- Botao "Conectar novo numero" cria instancia na Evolution.
- QR Code exibido por 60 segundos, com refresh automatico.
- Status: aguardando leitura, conectando, conectado, desconectado.

WAConfiguracao.tsx:

- Provider selecionado (cloud_api | evolution).
- Numero conectado (phone_number).
- Quality rating (se cloud_api).
- Limite diario configuravel.
- Templates (se cloud_api) ou modelos (se evolution).

## 11.11 Backup e contingencia

R2 da Cloudflare para backup diario das sessoes EvolutionAPI:

```bash
# cron diario
for instance in $(evolution list); do
  evolution logout --instance $instance  # nao, logout quebra sessao
  evolution backup --instance $instance > /backups/wa/${instance}-$(date +%Y%m%d).json
done

# upload para R2
rclone sync /backups/wa r2:radar-backup/wa
```

Restaurar: instancia nova + restore session. Tempo de indisponibilidade: 5 a 10 min.

Contingencia: se VPS cair, cliente pode conectar via Cloud API temporariamente. wa_contas.provider pode ter valor primario e secundario.

## 11.12 Health check

Worker wa-health-monitor roda a cada 6 horas:

1. GET /instance/connectionState/{instance_name} na Evolution.
2. Se != open: tenta reconectar.
3. Se reconectar falhar 3x: alerta P1 no Slack + e-mail ao admin.
4. Atualiza wa_contas.connection_status e last_seen_at.

UI mostra banner se tenant tem instancia desconectada ha mais de 1 hora.

## 11.13 Migracao Cloud API -> EvolutionAPI

Edge Function wa-migrate-provider(tenant_id, novo_provider):

1. Backup da sessao Cloud API (se possivel — limitado).
2. Desconecta Cloud API (DELETE /{phone_number_id} na Meta).
3. Cria instancia EvolutionAPI.
4. Conecta via QR Code (usuario precisa escanear).
5. Atualiza wa_contas.provider = 'evolution'.
6. Dispara evento audit_log.

Limitacao: Meta nao permite migrar sessao do Cloud API para Baileys. Usuario precisa re-escanear QR Code.

## 11.14 Compliance LGPD

EvolutionAPI roda em VPS propria. Dados armazenados em VPS sao de responsabilidade do controlador (voce). Contrato de processamento de dados com empresa que hospeda VPS.

Boas praticas:

- VPS com criptografia de disco (LUKS).
- Acesso SSH apenas por chave.
- Backup criptografado em R2.
- Logs com retencao 90 dias.

## 11.15 Limites por provider

| Item | Cloud API | EvolutionAPI |
|---|---|---|
| Custo inicial | R$ 0 (free tier 1k conversas) | R$ 350/mes (VPS) |
| Custo por msg | R$ 0.05 a 0.30 | R$ 0 |
| Limite de mensagens | Conforme tier Meta | Sem limite tecnico |
| Aprovacao de templates | Obrigatoria | Nao |
| Tempo de aprovacao | Minutos a 24h | Imediato |
| Risco de banimento | Medio | Alto se mal usado |
| Suporte oficial | Meta | Comunidade |
| Manutencao | Zero | Media (VPS) |
| Setup inicial | Embed, 5 min | VPS + Docker, 4h |

Recomendacao: comece com Cloud API. Avalie migracao quando cliente especifico pedir volume alto (> 30k msg/mes) ou quando tiver 50+ clientes ativos.

## 11.16 Custos por escala

50 clientes, 20k mensagens/mes:
- Cloud API: R$ 1.000/mes (R$ 0.05 x 20k).
- EvolutionAPI: R$ 350/mes fixo.
- Economia EvolutionAPI: R$ 650/mes.

100 clientes, 100k mensagens/mes:
- Cloud API: R$ 5.000/mes.
- EvolutionAPI: R$ 700/mes (VPS maior).
- Economia EvolutionAPI: R$ 4.300/mes.

Payback da migracao: 1 mes para qualquer escala.

## 11.17 Quando nao migrar

- < 50 clientes ativos.
- Clientes com menos de 5.000 mensagens/mes cada.
- Time sem capacidade de manter VPS.
- Mercado que exige Meta Business verificado (B2B grande).
- Casos onde banimento seria desastroso (ex: governo).

## 11.18 Resumo executivo da mudanca

A Secao 11 nao substitui a Secao 5. As duas coexistem:

- Secao 5 define o modulo WhatsApp em si (schema, funcoes, UI).
- Secao 11 adiciona a opcao de EvolutionAPI como provider alternativo.

A implementacao da Secao 11 esta no Epic 8 (T21 a T28) e Epic 9 (T31, T32). Estimativa adicional: 11 DH alem do Epic 8 base. Custo de infra com 100 clientes: sobe R$ 165 (Workers + QStash) mas cai R$ 4.300 (mensagens). Saldo: +R$ 4.135/mes.

---

# 12. Escopo geografico do MVP

## 12.1 Cidades cobertas

| Cidade | UF | Mes de lancamento | Fontes ativas |
|---|---|---|---|
| Uberlandia | MG | 1 | Alvaras, CNO, SEMAD, PNCP |
| Uberaba | MG | 1 | Alvaras, CNO, SEMAD, PNCP |
| Araguari | MG | 3 | Alvaras, CNO |
| Ituiutaba | MG | 3 | Alvaras, CNO |
| Patos de Minas | MG | 5 | Alvaras, CNO |
| Patrocinio | MG | 5 | Alvaras, CNO |
| Frutal | MG | 6 | CNO |
| Ribeirao Preto | SP | 9 | CNO, Alvaras |
| Sao Jose do Rio Preto | SP | 12 | CNO |

## 12.2 Criterio de expansao

Antes de adicionar nova cidade:

1. Existe fonte publica acessivel? (alvaras, CNO, PNCP).
2. Volume estimado > 100 obras/mes?
3. Ha pelo menos 1 lead de cliente comercial nessa regiao?

Se os 3 sim, adicionar na roadmap.

## 12.3 Modelo de expansao

- Mes 1: 2 cidades (Uberlandia + Uberaba).
- Mes 3: +2 cidades (Araguari + Ituiutaba).
- Mes 5: +2 cidades (Patos de Minas + Patrocinio).
- Mes 6: +1 cidade (Frutal).
- Mes 9: expansao para SP (Ribeirao Preto).
- Mes 12: expansao para SP (Sao Jose do Rio Preto).

Cada expansao exige:

- Pipeline ETL configurado e testado.
- 500 a 1.000 obras de backfill.
- Ajuste de geocoding (cidade nova).
- Comunicacao a clientes existentes.

## 12.4 Limitacoes conhecidas

- SEMAD MG cobre apenas Minas Gerais. Outros estados nao terao dados ambientais.
- PNCP tem limite de 100 chamadas/dia. Volume alto exige parceria comgov.br.
- Pre-scraping de prefeituras e fragil: layout muda, CAPTCHA pode aparecer.
- CNO e mensal. Para diarias, precisa de alvara municipal.

---

# Fim da Spec v1.2

Versao: 1.2
Data: 2026-01-15
Autor: especificacao consolidada de RADAR_CRM_SAAS_SPEC v1.0 + EPICOS v1.0 + CADASTROS_COMERCIAIS v1.0 + EVOLUTIONAPI v1.0

Esta spec esta sujeita a revisao conforme feedback de usuarios piloto e evolucao do produto.