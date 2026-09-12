# Epicos e Tasks — Radar CRM SaaS

Origem: derivado de RADAR_CRM_SAAS_SPEC_v1.1.md (secoes 1 a 12).
Total: 13 epicos, 113 tasks.
Cada task tem: ID, titulo, estimativa em dias-homem, dependencias, criterio de aceite, referencia a secao da spec.
Estimativas sao brutas — nao incluem review, deploy, nem buffer. Multiplique por 1,4 para cronograma real.

---

## Legenda

- Estimativa: DH (dias-homem) — 1 DH = 1 dia de 1 dev focado.
- Prioridade: P0 (bloqueia venda) · P1 (essencial mes 1) · P2 (diferencial mes 3) · P3 (escala).
- Spec: secao correspondente na spec.
- DoD (Definition of Done): codigo em producao + metrica observavel.

---

## Epico 1 — Fundacao Multi-tenant

Objetivo: permitir que multiplos clientes (tenants) coexistam no mesmo banco, com isolamento total.
Sem isso, nenhuma venda online e possivel.

| ID | Task | DH | Prioridade | Spec | DoD |
|---|---|---|---|---|---|
| E1-T1 | Criar tabela tenants com slug unico, CNPJ, plano, status | 1 | P0 | 8.1 | Tabela criada, indice UNIQUE validado, RLS aplicada |
| E1-T2 | Criar tabela tenant_users (vinculo user <-> tenant) com papel | 1 | P0 | 8.1 | Tabela criada, indice UNIQUE(tenant_id, user_id) |
| E1-T3 | Criar tabela tenant_invites com token, expiracao | 1 | P0 | 8.1 | Tabela criada, funcao de hash do token |
| E1-T4 | Funcao fn_tenant_criar(usuario, nome, slug, plano) | 1 | P0 | 8.1 | Funcao roda, cria tenant e tenant_users |
| E1-T5 | Funcao fn_tenant_convidar(tenant, email, papel) | 1 | P0 | 8.1 | Convite criado, e-mail enviado, log de aceite |
| E1-T6 | Funcao fn_tenant_aceitar_convite(token, user) | 1 | P0 | 8.1 | Convite aceita idempotente, papel atribuido |
| E1-T7 | Adicionar coluna tenant_id em radar_obras + 9 tabelas relacionadas | 2 | P0 | 8.1 | Todas as 10 tabelas com tenant_id NOT NULL e FK |
| E1-T8 | Adicionar coluna tenant_id em empresa + 6 tabelas filhas | 1.5 | P0 | 8.1 | empresa, empresa_contatos, empresa_enderecos, etc. com tenant_id |
| E1-T9 | Adicionar coluna tenant_id em 9 tabelas do CRM | 1.5 | P0 | 8.1 | crm_leads, crm_deals, crm_atividades, etc. com tenant_id |
| E1-T10 | Reescrever todas as RLS para usar current_setting('app.tenant_id') | 3 | P0 | 8.1 | Policies recriadas, testes de isolamento passam |
| E1-T11 | Middleware de request que seta app.tenant_id via SET LOCAL | 1 | P0 | 8.1 | Request sem tenant retorna erro 401; com tenant retorna dados isolados |
| E1-T12 | Script de migracao backfill (UPDATE FROM user_id) | 2 | P0 | 8.1 | Dados existentes migrados, contagem bate, zero NULLs |
| E1-T13 | Testes de regressao: tenant A nao ve tenant B | 2 | P0 | 8.1 | Suite com 20+ cenarios de isolamento passa |

Total do epico: 18 DH
Duracao estimada com 1 dev: 4 semanas
Status: pre-requisito de TUDO.

---

## Epico 2 — Autenticacao e Provisionamento

Objetivo: usuario cria conta via Google ou magic link, recebe tenant automaticamente, escolhe se MFA.

| ID | Task | DH | Prioridade | Spec | DoD |
|---|---|---|---|---|---|
| E2-T1 | Habilitar Google OAuth no Supabase Auth | 0.5 | P0 | 8.2 | Login com Google funciona, perfil criado |
| E2-T2 | Implementar magic link com expiracao de 15 min | 1 | P0 | 8.2 | E-mail chega, link expira apos 1 uso |
| E2-T3 | Trigger on_auth_user_created chama fn_provision_new_user | 1 | P0 | 8.2 | Signup organico cria tenant + tenant_users admin |
| E2-T4 | Diferenciar signup organico de aceite de convite | 0.5 | P0 | 8.2 | raw_user_meta_data->>'source' controla fluxo |
| E2-T5 | Habilitar MFA TOTP para role admin | 1 | P1 | 8.2 | Admin ve tela de MFA no primeiro login; pode pular |
| E2-T6 | Bloqueio apos 5 tentativas erradas em 15 min | 0.5 | P1 | 8.2 | Conta bloqueada, exige CAPTCHA ou reset |
| E2-T7 | Logout invalida refresh token | 0.5 | P1 | 8.2 | Sessao revogada, novo login necessario |
| E2-T8 | Pagina /auth/callback que decide rota pos-login | 1 | P0 | 8.2 | Onboarding se trial, dashboard se assinante |

Total do epico: 6 DH
Dependencia: E1
Duracao: 1.5 semanas

---

## Epico 3 — Onboarding de 3 Passos

Objetivo: usuario ve obras no mapa antes de preencher qualquer formulario.

| ID | Task | DH | Prioridade | Spec | DoD |
|---|---|---|---|---|---|
| E3-T1 | Detectar cidade do IP via MaxMind GeoIP2 | 1 | P0 | 8.3 | Cidade correta em 90% dos casos |
| E3-T2 | Componente OnboardingMapaPreview com Leaflet/Mapbox | 2 | P0 | 8.3 | Mapa renderiza obras da cidade detectada |
| E3-T3 | Passo 1 — botao Google/magic link com preview embaixo | 1.5 | P0 | 8.3 | Tela mostra mapa + texto "247 obras em Uberlandia" |
| E3-T4 | Passo 2 — seletor de segmento (6 botoes) | 1 | P0 | 8.3 | Botoes registram em onboarding_state.segmento |
| E3-T5 | Passo 2 — input de CEP com autocomplete ViaCEP | 1 | P0 | 8.3 | CEP resolve em cidade+lat+lng |
| E3-T6 | Passo 2 — raio configuravel (5 a 100 km) com slider | 0.5 | P0 | 8.3 | Slider persiste em onboarding_state.raio_km |
| E3-T7 | Passo 3 — opt-in WhatsApp com checkbox explicito LGPD | 1 | P0 | 8.3 | Opt-in gravado em wa_optins com evidencia |
| E3-T8 | Passo 3 — opt-in e-mail com checkbox | 0.5 | P0 | 8.3 | Opt-in gravado em tabela email_optins |
| E3-T9 | Persistencia de onboarding_state jsonb em tenants | 0.5 | P0 | 8.3 | Estado sobrevive a refresh e abandono |
| E3-T10 | E-mail de retomada D+1 com link | 1 | P1 | 8.3 | E-mail dispara, link retoma do ultimo passo |
| E3-T11 | Metrica tenant_onboarding_completed no PostHog | 0.5 | P1 | 8.3 | Funil visivel: passo 1, 2, 3, conclusao |
| E3-T12 | Teste A/B: ordem dos botoes de segmento | 1 | P3 | 8.3 | Variante definida, evento de exposicao registrado |

Total do epico: 11.5 DH
Dependencia: E1, E2
Duracao: 2 semanas

---

## Epico 4 — Billing e Planos

Objetivo: trial de 14 dias sem cartao, cobranca recorrente, mudanca de plano, cancelamento.

| ID | Task | DH | Prioridade | Spec | DoD |
|---|---|---|---|---|---|
| E4-T1 | Tabela planos com limites jsonb | 0.5 | P0 | 8.4 | 4 planos seedados (Individual/Equipe/Regional/Obras) |
| E4-T2 | Tabela assinaturas com id_externo do provedor | 1 | P0 | 8.4 | Tabela criada, RLS por tenant_id |
| E4-T3 | Tabela faturas com metodo, status, url_pagamento | 0.5 | P0 | 8.4 | Tabela criada |
| E4-T4 | Tabela uso_plano com metricas incrementais | 0.5 | P0 | 8.4 | Tabela criada, funcao fn_uso_incrementar |
| E4-T5 | Funcao fn_tenant_aplicar_plano(tenant) | 1 | P0 | 8.4 | Le assinatura ativa, atualiza tenants.plano |
| E4-T6 | Funcao fn_uso_validar_limite(tenant, metrica) | 1 | P0 | 8.4 | Retorna false se excedeu; usado em triggers |
| E4-T7 | Integracao Stripe (criar Customer, Subscription) | 2 | P0 | 8.4 | Webhook recebe, assinatura criada |
| E4-T8 | Edge Function billing-webhook valida assinatura | 1 | P0 | 8.4 | Webhook rejeita sem assinatura valida |
| E4-T9 | Edge Function billing-checkout cria sessao | 1 | P0 | 8.4 | URL de checkout retornada, trial 14d ativado |
| E4-T10 | Pagina /billing com plano atual e historico | 1.5 | P1 | 8.4 | Usuario ve fatura, status, proxima cobranca |
| E4-T11 | Mudanca de plano (upgrade/downgrade) com prorata | 2 | P1 | 8.4 | Upgrade reflete imediatamente; downgrade ao fim do ciclo |
| E4-T12 | Cancelamento com motivo obrigatorio + pesquisa | 1 | P0 | 8.4 | Motivo gravado em motivo_cancelamento |
| E4-T13 | Job de reconciliacao diaria Stripe vs banco | 1 | P1 | 8.4 | Diferencas alertadas; assinatura corrigida |
| E4-T14 | Politica de inadimplencia (grace 3d, bloqueia escrita D+4, leitura D+10) | 1.5 | P0 | validacao | Funcao fn_tenant_status_inadimplente + UI |
| E4-T15 | Politica de reembolso em Termos de Uso + UI | 0.5 | P0 | validacao | Texto juridico + tela /reembolso |
| E4-T16 | Nota fiscal eletronica via provedor (e.g. NFSe Brasil) | 2 | P1 | validacao | NFe emitida apos pagamento, link na fatura |

Total do epico: 19 DH
Dependencia: E1, E2
Duracao: 3 semanas

---

## Epico 5 — Geolocalizacao e Mapa

Objetivo: raio por km com performance, PostGIS, geocoding que aguenta volume.

| ID | Task | DH | Prioridade | Spec | DoD |
|---|---|---|---|---|---|
| E5-T1 | Habilitar extensoes PostGIS e pg_trgm | 0.5 | P0 | 8.8 | Extensoes instaladas, tipos geoespaciais disponiveis |
| E5-T2 | Adicionar coluna geo geography(Point,4326) em radar_obras | 1 | P0 | 8.8 | Backfill a partir de lat/lng, indice GIST criado |
| E5-T3 | Funcao fn_radar_obras_no_raio(lat, lng, raio, seg, fase) | 1.5 | P0 | 8.8 | Query < 50ms em 100k obras |
| E5-T4 | Funcao fn_tenant_centros(tenant) com multiplos pontos | 0.5 | P0 | 8.8 | Tenant com 2 filiais retorna obras de ambos raios |
| E5-T5 | Tabela geocoding_cache com hash UNIQUE | 0.5 | P0 | 8.7 | Cache persiste, TTL 90 dias |
| E5-T6 | Funcao fn_geocoding_resolver(endereco) com fallback chain | 2 | P0 | 8.7 | Mapbox, Google, Nominatim, retorna lat/lng/precisao |
| E5-T7 | Integracao Mapbox Geocoding API | 1 | P0 | 8.7 | Chave configurada, rate limit respeitado |
| E5-T8 | Edge Function geocoding-worker consumindo fila | 1.5 | P0 | 8.7 | Fila processada, retry com backoff |
| E5-T9 | Componente RadarMap.tsx com Mapbox GL JS | 2 | P0 | 2.4 | Mapa renderiza marcadores clusterizados |
| E5-T10 | Filtros por raio a partir de ponto no mapa | 1.5 | P0 | 2.4 | Circulo desenhado, obras filtradas em tempo real |
| E5-T11 | Componente PortalMapaRadar.tsx com filtros laterais | 2 | P1 | 2.4 | Mapa principal da home do tenant |
| E5-T12 | Componente RadarObjeto.tsx com mini-mapa | 1 | P1 | 2.4 | Detalhe da obra mostra localizacao |

Total do epico: 15 DH
Dependencia: E1
Duracao: 2.5 semanas

---

## Epico 6 — Ingestao de Obras Publicas

Objetivo: o produto abre com obras na tela, nao vazio. Sem isso, ninguem assina.

| ID | Task | DH | Prioridade | Spec | DoD |
|---|---|---|---|---|---|
| E6-T1 | Mapear fontes publicas de 2 cidades (Uberlandia + Uberaba) | 3 | P0 | 1 plano | Lista de URLs, frequencia, formato, termos de uso |
| E6-T2 | Pipeline ETL para alvaras de construcao | 3 | P0 | 1 plano | Job diario, deduplicacao, insercao em radar_obras |
| E6-T3 | Pipeline ETL para CNO (Cadastro Nacional de Obras) | 2 | P0 | 1 plano | Dados cruzados com CNPJ da Receita |
| E6-T4 | Pipeline ETL para licenciamento ambiental estadual | 2 | P1 | 1 plano | Minas Gerais prioritario (Triangulo Mineiro) |
| E6-T5 | Pipeline ETL para PNCP (contratacoes publicas) | 2 | P1 | 1 plano | Filtro por cidade/valor/segmento |
| E6-T6 | Pipeline ETL para habite-se e conclusao | 1.5 | P2 | 1 plano | Marca fase ACABAMENTO/ENCERRADA |
| E6-T7 | Estimativa de fase pela data de inicio + tipo | 1.5 | P1 | 8.5 | Funcao retorna fase plausivel se dado faltar |
| E6-T8 | Backfill de 12 meses das 2 cidades | 2 | P0 | 1 plano | Produto abre com historico |
| E6-T9 | Normalizacao de endereco (uppercase, sem acento, sem compl.) | 1 | P0 | 8.7 | Hash consistente, dedup por hash |
| E6-T10 | Job de atualizacao de fase (cron diario) | 1 | P1 | 8.5 | Obras sem visita ha X dias marcadas |
| E6-T11 | Monitor de saude do pipeline (ultima execucao, total) | 0.5 | P1 | 8.9 | Job atrasado > 24h alerta P1 |
| E6-T12 | Tratamento de LGPD (obra de pessoa fisica tem dono?) | 1 | P0 | 5.11 | Dado pessoal omitido em exibicao, log de tratamento |

Total do epico: 20.5 DH
Dependencia: E1, E5
Duracao: 4 semanas

---

## Epico 7 — Score de Obra e Rota do Dia

Objetivo: diferenciar de lista de obras. Concreteira e locadora pagam mais caro por isso.

| ID | Task | DH | Prioridade | Spec | DoD |
|---|---|---|---|---|---|
| E7-T1 | Tabela radar_obras_score (PK composta obra_id + segmento) | 0.5 | P1 | 8.5 | Tabela criada, indice composto |
| E7-T2 | Funcao fn_radar_obras_calcular_score(obra, segmento) | 2 | P1 | 8.5 | Pesos por segmento implementados |
| E7-T3 | Trigger que recalcula score ao mudar fase/porte/localizacao | 0.5 | P1 | 8.5 | Score sempre atualizado |
| E7-T4 | Componente RadarScoreBadge.tsx no detalhe da obra | 1 | P2 | 8.5 | Mostra score por segmento |
| E7-T5 | Ordenacao padrao por score no PortalRadar.tsx | 0.5 | P2 | 8.5 | Lista ordenada quando tenant tem segmento |
| E7-T6 | Tabela radar_rotas com obra_ids[], distancia, tempo | 0.5 | P2 | 8.6 | Tabela criada |
| E7-T7 | Funcao fn_radar_rota_montar(tenant, user, data, max) | 3 | P2 | 8.6 | Nearest neighbor, retorna ordem otimizada |
| E7-T8 | Integracao Mapbox Directions API (matriz de distancia) | 1.5 | P2 | 8.6 | Rota calculada com distancia real |
| E7-T9 | Componente RadarRotaDia.tsx (mapa + lista ordenada) | 2 | P2 | 8.6 | Tela mostra 8 obras do dia com tempo estimado |
| E7-T10 | Botao "Iniciar rota" abre Google Maps/Waze com waypoints | 0.5 | P2 | 8.6 | Deep link funciona |
| E7-T11 | Marcar visita (via WhatsApp ou app) entra na timeline | 1 | P1 | 5.3 | Registro com data, posicao se disponivel |

Total do epico: 12.5 DH
Dependencia: E1, E5
Duracao: 2.5 semanas

---

## Epico 8 — Canal WhatsApp da Plataforma

Objetivo: alerta diario de obra nova. E o habito que segura o churn.

| ID | Task | DH | Prioridade | Spec | DoD |
|---|---|---|---|---|---|
| E8-T1 | Criar WABA da plataforma (Meta Business) | 1 | P0 | 5.1 | Conta verificada, templates em aprovacao |
| E8-T2 | Tabela wa_contas com canal='plataforma' | 0.5 | P0 | 5.2 | Registro da conta institucional |
| E8-T3 | Tabela wa_templates seed com 8 templates utilidade | 1 | P0 | 5.2 | Templates submetidos a Meta |
| E8-T4 | Tabela wa_optins com escopo utilidade/marketing | 0.5 | P0 | 5.2 | Tabela criada |
| E8-T5 | Edge Function wa-webhook com validacao HMAC | 2 | P0 | 5.4 | Responde 200 em < 5s, processa async |
| E8-T6 | Funcao fn_wa_processar_webhook(evento) | 2 | P0 | 5.3 | Resolve tenant, deduplica por wamid, atualiza status |
| E8-T7 | Funcao fn_wa_enviar com 6 verificacoes | 2 | P0 | 5.3 | Rejeita sem opt-in, fora da janela, qualidade RED |
| E8-T8 | Tabela wa_envios_fila com prioridade e backoff | 0.5 | P0 | 5.2 | Fila com indice status, agendado_para, prioridade |
| E8-T9 | Edge Function wa-send (cron 1 min) | 1.5 | P0 | 5.4 | Consome fila, respeita tier_limite_24h |
| E8-T10 | Tabela wa_alerta_filtros com raio, segmento, frequencia | 0.5 | P0 | 5.2 | Tabela criada |
| E8-T11 | Funcao fn_wa_alerta_obras_montar(filtro) | 2 | P0 | 5.3 | Retorna null se vazio (nao envia nada) |
| E8-T12 | Edge Function wa-alerta-obras (cron 15 min e diario) | 1.5 | P0 | 5.4 | Pula filtro sem resultado |
| E8-T13 | Componente WAAlertaFiltroForm.tsx com mapa e raio | 2 | P0 | 5.9 | Tenant cria filtro em < 60s |
| E8-T14 | Componente WAInbox.tsx (lista de conversas) | 2 | P1 | 5.9 | Inbox mostra janela, nao lidas, ultimo contato |
| E8-T15 | Componente WAChat.tsx com badge de janela 24h | 2 | P1 | 5.9 | Campo de texto bloqueado se janela fechada |
| E8-T16 | Componente WAJanelaBadge.tsx com countdown | 0.5 | P1 | 5.9 | Mostra tempo restante |
| E8-T17 | Maquina de estados do bot (wa-bot) | 2 | P0 | 5.8 | Cidade, segmento, amostra 3 obras, trial |
| E8-T18 | Trigger trg_wa_mensagem_para_timeline | 0.5 | P1 | 5.3 | Mensagem vira entrada em crm_timeline ou radar_obras_timeline |
| E8-T19 | Trigger trg_wa_optout_por_palavra (SAIR/PARAR) | 0.5 | P1 | 5.3 | Opt-out registrado em < 1 min |
| E8-T20 | Comando VISITEI 4821 registra visita | 1 | P0 | 5.6 | Timeline atualizada sem abrir app |
| E8-T21 | Deploy da EvolutionAPI no VPS | 2 | P0 | 11.18 | VPS provisionado, Docker rodando |
| E8-T22 | Configurar webhook EvolutionAPI -> Supabase | 1 | P0 | 11.7 | Webhook recebe e processa eventos |
| E8-T23 | WAConexaoWizard.tsx com QR Code em tempo real | 1.5 | P0 | 11.8 | QR Code exibido, atualiza ao conectar |
| E8-T24 | Edge Function wa-rate-limiter com Upstash Redis | 1 | P0 | 11.11 | Limite por minuto, dia, contato, horario |
| E8-T25 | Edge Function wa-health-monitor com reconexao | 1.5 | P1 | 11.12 | Detecta disconnect em 5 min, alerta |
| E8-T26 | Tabela wa_contas ganha colunas de provider | 1 | P0 | 11.5 | evolution_instance_id, evolution_api_key, etc |
| E8-T27 | Edge Function wa-migrate-provider | 1 | P2 | 11.13 | Migra Cloud API para EvolutionAPI |
| E8-T28 | Rate limit configuravel por tenant no painel | 0.5 | P1 | 11.10 | Tenant ajusta limite no UI |

Total do epico: 34.5 DH
Dependencia: E1, E2
Duracao: 6 semanas (incluindo mudanca para EvolutionAPI)

---

## Epico 9 — Canal WhatsApp do Tenant + CRM

Objetivo: cliente conecta o proprio numero, responde leads, dispara follow-up. E o que justifica o plano mais caro.

| ID | Task | DH | Prioridade | Spec | DoD |
|---|---|---|---|---|---|
| E9-T1 | Embedded Signup do Meta (substituido por QR Code wizard) | 3 | P1 | 5.1 / 11.18 | Tenant conecta em < 5 min |
| E9-T2 | Funcao fn_wa_conta_conectar(tenant, dados) com validacao | 1 | P1 | 5.3 | phone_number_id unico validado |
| E9-T3 | Vault Supabase para access_token (nunca em claro) | 1 | P1 | 5.10 | Token criptografado, sem leitura pelo frontend |
| E9-T4 | Componente WATemplateEditor.tsx (criar/submeter template) | 2 | P1 | 5.9 | Template vai pra fila da Meta |
| E9-T5 | Componente WATemplatePicker.tsx (preview, variaveis) | 1.5 | P1 | 5.9 | Preview com dados reais |
| E9-T6 | Tabela wa_fluxos (escopo: obras/crm/interno) | 0.5 | P1 | 5.2 | Tabela criada |
| E9-T7 | Tabela wa_fluxo_passos (ordem, atraso, acao, condicao) | 0.5 | P1 | 5.2 | Tabela criada |
| E9-T8 | Tabela wa_fluxo_execucoes com proximo_passo_em | 0.5 | P1 | 5.2 | Indice para worker |
| E9-T9 | Funcao fn_wa_fluxo_disparar(fluxo, contexto) | 1.5 | P1 | 5.3 | Cria execucao idempotente |
| E9-T10 | Funcao fn_wa_fluxo_avancar(execucao) | 2 | P1 | 5.3 | Avalia condicao_parada, agenda proximo |
| E9-T11 | Edge Function wa-fluxo-worker (cron 5 min) | 1 | P1 | 5.4 | Avanca execucoes ativas |
| E9-T12 | Componente WAFluxoBuilder.tsx (editor visual) | 4 | P2 | 5.9 | Drag-and-drop de passos |
| E9-T13 | Trigger trg_wa_resposta_encerra_fluxo | 0.5 | P1 | 5.3 | Resposta encerra fluxo ativo |
| E9-T14 | Funcao fn_wa_conversa_para_lead(conversa) | 1 | P1 | 5.3 | Cria lead com origem='whatsapp' |
| E9-T15 | Funcao fn_wa_obra_vincular_conversa(obra, numero) | 0.5 | P1 | 5.3 | Conversa aparece na timeline da obra |
| E9-T16 | Click-to-WhatsApp com ref rastreado | 1 | P2 | 5.7 | wa.me/...?text=...&ref=campanha_X parseado |
| E9-T17 | CRM: pipeline kanban com drag-and-drop | 3 | P1 | 4.4 | 5 colunas padrao, deal move altera probabilidade |
| E9-T18 | CRM: lead detail com timeline + WhatsApp | 2 | P1 | 4.4 | Tudo do lead em uma tela |
| E9-T19 | CRM: dashboard com KPIs (conversao, valor, tempo medio) | 2 | P2 | 4.4 | Graficos renderizam com dados reais |
| E9-T20 | CRM: agendador (calendario de tarefas e atividades) | 2 | P2 | 4.4 | Visao mensal com drag-to-reschedule |
| E9-T21 | CRM: automacoes (CRMAutomacaoForm) | 2 | P1 | 4.4 | CRUD de regras com triggers e acoes |
| E9-T22 | Edge Function wa-templates-sync (cron 1h) | 1 | P2 | 5.4 | Status de aprovacao atualizado |
| E9-T23 | Edge Function wa-saude-conta (cron 6h) | 1.5 | P1 | 5.4 | YELLOW pausa marketing, RED pausa tudo |
| E9-T24 | Componente WASaudeConta.tsx (quality rating, custo) | 1 | P1 | 5.9 | Painel mostra tier, consumo, projecao |
| E9-T25 | PropostaCard.tsx no deal do CRM | 2 | P0 | 10.13 | Card da proposta no deal |
| E9-T26 | AlcadaBadge.tsx com logica de aprovacao inline | 1 | P0 | 10.13 | Status de alcada em tempo real |
| E9-T27 | RelatorioComissoes.tsx | 1.5 | P1 | 10.13 | Relatorio por vendedor, export CSV |
| E9-T28 | Migracao de leads/deals para incluir vendedor_id | 2 | P0 | 10.13 | Colunas adicionadas, dados migrados |
| E9-T29 | PipelineVendedorView.tsx com toggle "Ver todos" | 1.5 | P1 | 10.13 | Toggle respeita permissao |
| E9-T30 | Testes E2E do fluxo proposta -> aceite | 1 | P0 | 10.13 | Suite Playwright cobre fluxo completo |
| E9-T31 | Embedded Signup substituido por QR Code wizard | 2 | P0 | 11.18 | Tenant conecta com QR Code |
| E9-T32 | Templates viram "modelos de mensagem" sem aprovacao | 0.5 | P1 | 11.18 | Modelos livres, sem fila Meta |

Total do epico: 44.5 DH
Dependencia: E1, E8
Duracao: 8 semanas

---

## Epico 10 — LGPD, Seguranca e Compliance

Objetivo: juridicamente apto a operar e a vender para B2B grande.

| ID | Task | DH | Prioridade | Spec | DoD |
|---|---|---|---|---|---|
| E10-T1 | Pagina /termos com versao e data | 1 | P0 | 8.13 | Termos redigidos por advogado, versionados |
| E10-T2 | Pagina /privacidade | 1 | P0 | 8.13 | Politica publicada |
| E10-T3 | Pagina /dpa (Data Processing Agreement) | 1.5 | P0 | 8.13 | DPA publicado, anexo em contrato enterprise |
| E10-T4 | Aceite versionado no signup (aceites_legais) | 1 | P0 | 8.13 | Cada signup registra versao aceita + IP + UA |
| E10-T5 | Banner de cookies com opt-in granular | 1 | P0 | 8.13 | Banner aparece, preferencias gravadas |
| E10-T6 | Funcao fn_wa_apagar_dados_contato(numero) | 1 | P1 | 5.11 | Remove mensagens, midia; preserva opt-out |
| E10-T7 | Funcao fn_tenant_apagar_definitivo(tenant) | 2 | P1 | validacao | Apaga obras, leads, conversas; preserva fiscal/opt-out |
| E10-T8 | Tabela audit_log com retencao 12 meses | 1 | P0 | 8.19 | Logs de login, alteracao, export |
| E10-T9 | Deteccao de ATO (login de pais/IP novo) | 1.5 | P1 | 8.19 | E-mail de alerta + bloqueio temporario |
| E10-T10 | Encarregado (DPO) designado e documentado | 0.5 | P0 | validacao | Nome e contato na politica de privacidade |
| E10-T11 | Contrato operador-controlador no Embedded Signup | 1 | P0 | 5.11 | Aceite antes de conectar WABA |
| E10-T12 | Criptografia em repouso de wa_midia no Storage | 0.5 | P1 | 5.2 | SSE-S3 ativo no bucket |
| E10-T13 | Rotacao de tokens de longa duracao a cada 60 dias | 1 | P2 | 5.10 | Job de rotacao + notificacao ao tenant |
| E10-T14 | Backup PITR habilitado no Supabase Pro | 0.5 | P0 | 8.11 | Retencao 7 dias ativa |
| E10-T15 | Runbook postgres-down.md | 0.5 | P1 | 8.11 | Sintomas, diagnostico, acao documentados |
| E10-T16 | Runbook whatsapp-number-banned.md | 0.5 | P1 | 8.11 | Contato Meta, contingencia, comunicacao |
| E10-T17 | Runbook billing-webhook-stuck.md | 0.5 | P1 | 8.11 | Reconciliacao manual documentada |
| E10-T18 | Status page publica com Uptime Kuma | 1 | P1 | 8.12 | 5 componentes monitorados, 90 dias de historico |
| E10-T19 | Sentry configurado em frontend e Edge Functions | 1 | P0 | 8.9 | Erros aparecem com stack trace e contexto |
| E10-T20 | PostHog com eventos de produto | 1.5 | P0 | 8.9 | Funil e metricas visiveis |
| E10-T21 | Politica de cancelamento e reembolso nos Termos | 0.5 | P0 | validacao | Texto juridico publicado |

Total do epico: 19 DH
Dependencia: E1, E2
Duracao: 3 semanas (paralelo a E3 a E9)

---

## Epico 11 — Suporte, Admin e Operacao

Objetivo: voce opera o produto sem entrar no banco. Cliente tem onde pedir ajuda.

| ID | Task | DH | Prioridade | Spec | DoD |
|---|---|---|---|---|---|
| E11-T1 | Help center no Notion (ou similar) com 12 artigos | 2 | P1 | 8.14 | URLs amigaveis, busca funcional |
| E11-T2 | Integracao Crisp (chat in-app para plano Equipe+) | 1 | P1 | 8.14 | Widget aparece, mensagem chega |
| E11-T3 | SLA visivel no painel do cliente | 0.5 | P2 | 8.14 | Mostra tempo de resposta esperado |
| E11-T4 | Admin panel: lista de tenants com filtros | 2 | P1 | 8.15 | Refine/Appsmith conectado, busca funciona |
| E11-T5 | Admin panel: detalhe do tenant (uso, cobranca, logs) | 2 | P1 | 8.15 | Click no tenant ve tudo |
| E11-T6 | Admin panel: impersonar usuario com audit log | 1.5 | P1 | 8.15 | Login como tenant registra em admin_actions |
| E11-T7 | Admin panel: pausar/reativar tenant | 0.5 | P1 | 8.15 | Toggle funciona, status reflete imediatamente |
| E11-T8 | Admin panel: metricas globais (MRR, churn, conversao) | 2 | P2 | 8.15 | Dashboard com numeros reais |
| E11-T9 | Job de reconciliacao billing | 1 | P1 | 8.4 | Diferencas Stripe vs banco alertadas |
| E11-T10 | Migracao e-sweet-code-play self-service (CSV) | 2 | P2 | 8.16 | Botao importa obras e leads com mapping |
| E11-T11 | Migracao assistida para bases > 5.000 registros | 3 | P3 | 8.16 | Edge function le antigo, escreve novo |
| E11-T12 | Feature flag system com tabela e cache Redis | 1.5 | P2 | 8.18 | Flag muda em runtime sem deploy |
| E11-T13 | Catalogo inicial de 6 feature flags | 0.5 | P2 | 8.18 | Flags dos planos criadas |
| E11-T14 | Edge Function feature-flag-resolver | 0.5 | P2 | 8.18 | Frontend consome, UI adapta |

Total do epico: 19.5 DH
Dependencia: E1
Duracao: 3 semanas

---

## Epico 12 — API Publica e Escala

Objetivo: revenda, integracoes, expansao para outros nichos.

| ID | Task | DH | Prioridade | Spec | DoD |
|---|---|---|---|---|---|
| E12-T1 | Tabela api_keys com prefixo, hash, escopo | 1 | P2 | 8.17 | Tabela criada |
| E12-T2 | Funcao fn_api_key_validar(chave) (Argon2) | 1 | P2 | 8.17 | Validacao em < 50ms |
| E12-T3 | Endpoints REST com x-tenant-id ou Authorization: Bearer | 3 | P2 | 8.17 | 10 endpoints principais documentados |
| E12-T4 | Tabela webhooks_tenant com secret HMAC | 0.5 | P2 | 8.17 | Tabela criada |
| E12-T5 | Edge Function de envio de webhooks com retry | 2 | P2 | 8.17 | Backoff 1m/5m/30m, DLQ apos 3 falhas |
| E12-T6 | Tabela webhooks_eventos_enviados (log 30 dias) | 0.5 | P2 | 8.17 | Admin ve historico |
| E12-T7 | Documentacao OpenAPI gerada por codigo | 2 | P2 | 8.17 | Scalar ou Mintlify publico |
| E12-T8 | Versionamento de API (/v1/) | 0.5 | P2 | validacao | Politica definida, exemplos |
| E12-T9 | Rate limit por API key em Redis | 1 | P2 | 8.10 | Limite por escopo, retorna 429 com Retry-After |
| E12-T10 | Tabela lead_origem_tracking (UTM completo) | 0.5 | P2 | validacao | Origem registrada em landing, blog, anuncio |
| E12-T11 | Widget de captacao para sites de clientes (marca branca) | 3 | P3 | 8.18 | Script JS colado em site captura lead |
| E12-T12 | Programa de revenda: tabela revendedores, comissoes | 3 | P3 | validacao | Dashboard de revenda, payout mensal |
| E12-T13 | Sandbox tenant (ambiente de teste) | 4 | P3 | validacao | Tenant paralelo, dados isolados |
| E12-T14 | Modo escuro | 1 | P3 | validacao | Toggle persiste, contraste WCAG AA |
| E12-T15 | Checklist de acessibilidade WCAG AA nas telas principais | 2 | P2 | validacao | Lighthouse axe 0 issues nas 10 telas-chave |

Total do epico: 25 DH
Dependencia: E1, E5, E8, E9
Duracao: 5 semanas (pode comecar no mes 6)

---

## Epico 13 — Cadastros Comerciais e Operacao de Venda

Objetivo: o cliente emite proposta profissional com a marca dele, controla alcada de desconto por papel, e cada vendedor ve so o que lhe compete. E o que justifica o plano Regional e puxa o ticket de R$ 350 -> R$ 480.
Origem: spec v1.2, secao 10.

| ID | Task | DH | Prioridade | Spec | DoD |
|---|---|---|---|---|---|
| E13-T1 | Tabela tenant_empresa com CNPJ + logo + cores + RLS | 1.5 | P0 | 10.1 | Tabela criada, validacao CNPJ, RLS ativa |
| E13-T2 | EmpresaPerfilForm.tsx 3 abas (dados / marca / proposta) | 2 | P0 | 10.1 | Upload logo funciona, cor primaria persiste |
| E13-T3 | Tabela produtos com categoria, unidade, preco base/min/max | 1 | P0 | 10.2 | Tabela criada, indice ativo |
| E13-T4 | ProdutoCatalogo.tsx com busca + filtros + arquivar | 2 | P0 | 10.2 | Lista 100 produtos em < 1s |
| E13-T5 | ProdutoForm.tsx com metadata dinamica por categoria | 2 | P0 | 10.2 | Form salva e mostra preview |
| E13-T6 | fn_produto_preco_vigente() considerando tabela de preco | 0.5 | P1 | 10.2 | Funcao retorna preco correto |
| E13-T7 | Tabela propostas com enum de status + numero auto + RLS | 1.5 | P0 | 10.3 | Tabela criada, numero incrementa por tenant |
| E13-T8 | Tabela propostas_itens com subtotal gerado | 1 | P0 | 10.3 | Subtotal recalcula ao mudar item |
| E13-T9 | fn_proposta_criar() + fn_proposta_calcular_totais() | 1.5 | P0 | 10.3 | Rascunho com totais em < 500ms |
| E13-T10 | PropostaEditor.tsx 3 colunas com preview ao vivo | 4 | P0 | 10.3 | Editor abre em < 2s, drag-and-drop funciona |
| E13-T11 | Edge Function proposta-gerar-pdf com Puppeteer | 3 | P0 | 10.3 | PDF gerado em < 5s, salvo no Storage |
| E13-T12 | Portal publico /p/[token] para aceitar/recusar | 2 | P0 | 10.3 | Cliente abre sem login, IP/UA registrados |
| E13-T13 | fn_proposta_enviar() por e-mail com PDF anexado | 1 | P0 | 10.3 | E-mail chega, link do portal incluido |
| E13-T14 | fn_proposta_enviar() por WhatsApp | 1 | P1 | 10.3 | Mensagem chega com botao/link |
| E13-T15 | Tabela tenant_papeis + seed de 4 papeis padrao | 1 | P0 | 10.4 | 4 papeis seedados, RLS por tenant |
| E13-T16 | fn_proposta_validar_alcada() com regras de alcada | 2 | P0 | 10.4 | Retorna aprovado/requer/rejeitado com motivo |
| E13-T17 | TimeGestao.tsx + PapelEditor.tsx | 3 | P0 | 10.4 | Admin cria papel, atribui, convida usuario |
| E13-T18 | fn_audit_registrar() + tabela audit_log | 1.5 | P0 | 10.8 | Toda mudanca de proposta/papel gera entrada |
| E13-T19 | RelatorioComissoes.tsx + fn_comissao_calcular() | 2.5 | P1 | 10.5 | Relatorio por vendedor, export CSV |
| E13-T20 | PipelineVendedorView.tsx com toggle "Ver todos" | 2 | P1 | 10.5 | Toggle respeita permissao |
| E13-T21 | Trigger que recalcula comissao ao mudar deal | 1.5 | P1 | 10.5 | Comissao atualiza em tempo real |
| E13-T22 | Limites por plano (produtos, propostas, usuarios) | 0.5 | P1 | 10.7 | fn_uso_validar_limite cobre 3 novos casos |
| E13-T23 | ProdutoImportacaoCSV.tsx com mapping | 2 | P2 | 10.2 | Importa 1000 produtos em < 30s |
| E13-T24 | Migracao do e-sweet-code-play pra tenant_empresa/produtos | 2 | P2 | 10.13 | Dados existentes migrados, zero NULL |

Total do epico: 42 DH
Duracao estimada: 8 semanas (1 dev) ou 4 semanas (2 dev)
Dependencia: E1, E2, E4
Pode paralelizar com: E5 (geo), E6 (ingestao)

Mudanca na conta financeira:
- Ticket medio: R$ 350 -> R$ 480
- Meta de R$ 20 mil liquidos com 47 clientes (em vez de 77)
- CAC maximo sobe de R$ 117 para R$ 320 (vale a pena)
- Custo de infra sobe ~R$ 100/mes (Storage de PDFs)

---

## Resumo consolidado

| Epico | DH Total | Duracao (semanas) | Dependencias | Pode paralelizar com |
|---|---|---|---|---|
| E1 — Multi-tenant | 18 | 4 | — | — |
| E2 — Auth | 6 | 1.5 | E1 | — |
| E3 — Onboarding | 11.5 | 2 | E1, E2 | E5 |
| E4 — Billing | 19 | 3 | E1, E2 | E3, E5 |
| E5 — Geo e Mapa | 15 | 2.5 | E1 | E3 |
| E6 — Ingestao | 20.5 | 4 | E1, E5 | E4 |
| E7 — Score e Rota | 12.5 | 2.5 | E1, E5 | E6 |
| E8 — WA Plataforma | 34.5 | 6 | E1, E2 | E6 |
| E9 — WA Tenant + CRM | 44.5 | 8 | E1, E8 | E10, E11 |
| E10 — LGPD/Seguranca | 19 | 3 | E1, E2 | tudo |
| E11 — Suporte/Admin | 19.5 | 3 | E1 | E10 |
| E12 — API e Escala | 25 | 5 | E1, E5, E8, E9 | E11 |
| E13 — Cadastros Comerciais | 42 | 4 (2 dev) | E1, E2, E4 | E5, E6 |
| TOTAL | 286 DH | ~ 8 meses (2 dev) | | |

Cronograma realista com 1 dev: 17 meses (buffer 1.4x).
Cronograma com 2 devs: 8 meses.
Com 3 devs: 5 a 6 meses.