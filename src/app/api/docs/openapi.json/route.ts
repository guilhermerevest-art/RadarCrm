// =============================================================================
// OpenAPI Specification for Radar CRM API v1
// =============================================================================

export const dynamic = 'force-dynamic'

export async function GET() {
  const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Radar CRM API',
    description: `
API RESTful para integracao com o Radar CRM.

## Autenticacao

Todas as requisicoes devem incluir uma API key no header:

\`\`\`
Authorization: Bearer <sua-api-key>
\`\`\`

Ou usar o header X-API-Key:

\`\`\`
X-API-Key: <sua-api-key>
\`\`\`

## Rate Limiting

Limite de 100 requisicoes por minuto por API key.

Se o limite for excedido, a API retornara 429 com o header Retry-After.

## Respostas

Todas as respostas seguem o formato:

\`\`\`json
{
  "data": { ... },
  "meta": { ... }  // opcional
}
\`\`\`

Erros:

\`\`\`json
{
  "error": "Mensagem de erro",
  "code": "CODIGO_ERRO"
}
\`\`\`
    `,
    version: '1.0.0',
    contact: {
      name: 'Radar CRM Support',
      email: 'suporte@radarcrm.com.br',
    },
  },
  servers: [
    {
      url: 'https://api.radarcrm.com.br',
      description: 'Producao',
    },
    {
      url: 'https://api-staging.radarcrm.com.br',
      description: 'Staging',
    },
  ],
  tags: [
    { name: 'Obras', description: 'Endpoints para gerenciamento de obras' },
    { name: 'Leads', description: 'Endpoints para gerenciamento de leads' },
    { name: 'Deals', description: 'Endpoints para gerenciamento de deals' },
    { name: 'Visitas', description: 'Endpoints para registro de visitas' },
  ],
  paths: {
    '/api/v1/obras': {
      get: {
        tags: ['Obras'],
        summary: 'Lista obras',
        description: 'Retorna uma lista paginada de obras do tenant.',
        operationId: 'listObras',
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1 },
            description: 'Numero da pagina',
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 20, maximum: 100 },
            description: 'Quantidade de itens por pagina',
          },
          {
            name: 'cidade',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filtrar por cidade',
          },
          {
            name: 'fase',
            in: 'query',
            schema: { type: 'string', enum: ['alvara', 'fundacao', 'estrutura', 'acabamento', 'concluida'] },
            description: 'Filtrar por fase',
          },
          {
            name: 'porte',
            in: 'query',
            schema: { type: 'string', enum: ['pequeno', 'medio', 'grande'] },
            description: 'Filtrar por porte',
          },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', default: 'ativa' },
            description: 'Filtrar por status',
          },
        ],
        responses: {
          '200': {
            description: 'Lista de obras',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Obra' },
                    },
                    meta: {
                      type: 'object',
                      properties: {
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                        total: { type: 'integer' },
                        pages: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/api/v1/obras/{id}': {
      get: {
        tags: ['Obras'],
        summary: 'Detalhe de obra',
        description: 'Retorna os detalhes de uma obra especifica.',
        operationId: 'getObra',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID da obra',
          },
        ],
        responses: {
          '200': {
            description: 'Detalhes da obra',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/ObraDetalhe' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/obras/no-raio': {
      get: {
        tags: ['Obras'],
        summary: 'Busca obras no raio',
        description: 'Busca obras dentro de um raio a partir de coordenadas.',
        operationId: 'buscarObrasNoRaio',
        parameters: [
          {
            name: 'lat',
            in: 'query',
            required: true,
            schema: { type: 'number', minimum: -90, maximum: 90 },
            description: 'Latitude do centro',
          },
          {
            name: 'lng',
            in: 'query',
            required: true,
            schema: { type: 'number', minimum: -180, maximum: 180 },
            description: 'Longitude do centro',
          },
          {
            name: 'raio',
            in: 'query',
            required: true,
            schema: { type: 'number', default: 10, maximum: 500 },
            description: 'Raio em quilometros',
          },
          {
            name: 'fase',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filtrar por fase',
          },
        ],
        responses: {
          '200': {
            description: 'Lista de obras no raio',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/ObraComDistancia' },
                    },
                    meta: {
                      type: 'object',
                      properties: {
                        centro: {
                          type: 'object',
                          properties: { lat: { type: 'number' }, lng: { type: 'number' } },
                        },
                        raio_km: { type: 'number' },
                        total: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/leads': {
      get: {
        tags: ['Leads'],
        summary: 'Lista leads',
        description: 'Retorna uma lista paginada de leads do tenant.',
        operationId: 'listLeads',
        parameters: [
          { $ref: '#/components/parameters/Page' },
          { $ref: '#/components/parameters/Limit' },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['novo', 'qualificado', 'descarte', 'convertido'] },
          },
          {
            name: 'origem',
            in: 'query',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Lista de leads',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Lead' } },
                    meta: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Leads'],
        summary: 'Cria lead',
        description: 'Cria um novo lead.',
        operationId: 'createLead',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LeadCreate' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Lead criado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/Lead' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/api/v1/deals': {
      get: {
        tags: ['Deals'],
        summary: 'Lista deals',
        description: 'Retorna uma lista paginada de deals do tenant.',
        operationId: 'listDeals',
        parameters: [
          { $ref: '#/components/parameters/Page' },
          { $ref: '#/components/parameters/Limit' },
          {
            name: 'estagio',
            in: 'query',
            schema: { type: 'string' },
          },
          {
            name: 'lead_id',
            in: 'query',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Lista de deals',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Deal' } },
                    meta: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Deals'],
        summary: 'Cria deal',
        description: 'Cria um novo deal vinculado a um lead.',
        operationId: 'createDeal',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DealCreate' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Deal criado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/Deal' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/api/v1/visitas': {
      post: {
        tags: ['Visitas'],
        summary: 'Registrar visita',
        description: 'Registra uma visita a uma obra.',
        operationId: 'registrarVisita',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VisitaCreate' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Visita registrada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/Visita' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description: 'Use: Bearer <sua-api-key>',
      },
    },
    schemas: {
      Obra: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          fonte: { type: 'string' },
          endereco_logradouro: { type: 'string' },
          endereco_numero: { type: 'string' },
          endereco_bairro: { type: 'string' },
          endereco_cidade: { type: 'string' },
          endereco_uf: { type: 'string' },
          lat: { type: 'number' },
          lng: { type: 'number' },
          fase_atual: { type: 'string' },
          porte: { type: 'string' },
          status: { type: 'string' },
          valor_estimado: { type: 'number' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      ObraDetalhe: {
        allOf: [
          { $ref: '#/components/schemas/Obra' },
          {
            type: 'object',
            properties: {
              descricao: { type: 'string' },
              fase_comunidade: {
                type: 'object',
                properties: {
                  total_confirmacoes: { type: 'integer' },
                  marcacao_ativa: { type: 'string' },
                  fase_macro: { type: 'string' },
                },
              },
            },
          },
        ],
      },
      ObraComDistancia: {
        allOf: [
          { $ref: '#/components/schemas/Obra' },
          {
            type: 'object',
            properties: {
              distancia_km: { type: 'number' },
            },
          },
        ],
      },
      Lead: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          nome: { type: 'string' },
          empresa: { type: 'string' },
          email: { type: 'string' },
          telefone: { type: 'string' },
          origem: { type: 'string' },
          status: { type: 'string' },
          score_engajamento: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      LeadCreate: {
        type: 'object',
        required: ['nome'],
        properties: {
          nome: { type: 'string' },
          empresa: { type: 'string' },
          email: { type: 'string', format: 'email' },
          telefone: { type: 'string' },
          origem: { type: 'string' },
          utm_source: { type: 'string' },
          utm_campaign: { type: 'string' },
          observacoes: { type: 'string' },
        },
      },
      Deal: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          lead_id: { type: 'string', format: 'uuid' },
          obra_id: { type: 'string', format: 'uuid' },
          titulo: { type: 'string' },
          estagio: { type: 'string' },
          valor_estimado: { type: 'number' },
          probabilidade: { type: 'integer' },
          data_fechamento_prevista: { type: 'string', format: 'date' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      DealCreate: {
        type: 'object',
        required: ['titulo', 'lead_id'],
        properties: {
          titulo: { type: 'string' },
          lead_id: { type: 'string', format: 'uuid' },
          obra_id: { type: 'string', format: 'uuid' },
          valor_estimado: { type: 'number' },
          probabilidade: { type: 'integer' },
          data_fechamento_prevista: { type: 'string', format: 'date' },
        },
      },
      Visita: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          obra_id: { type: 'string', format: 'uuid' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          nota: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      VisitaCreate: {
        type: 'object',
        required: ['obra_id'],
        properties: {
          obra_id: { type: 'string', format: 'uuid' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          nota: { type: 'string' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          pages: { type: 'integer' },
        },
      },
    },
    parameters: {
      Page: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', default: 1 },
      },
      Limit: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 20, maximum: 100 },
      },
    },
    responses: {
      Unauthorized: {
        description: 'API key invalida ou ausente',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                code: { type: 'string' },
              },
              example: { error: 'API key required', code: 'MISSING_API_KEY' },
            },
          },
        },
      },
      NotFound: {
        description: 'Recurso nao encontrado',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'Obra not found', code: 'NOT_FOUND' },
          },
        },
      },
      RateLimited: {
        description: 'Rate limit excedido',
        headers: {
          'Retry-After': {
            schema: { type: 'integer' },
            description: 'Segundos ate poder fazer nova requisicao',
          },
        },
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              error: 'Rate limit exceeded',
              code: 'RATE_LIMIT_EXCEEDED',
              retryAfter: 60,
            },
          },
        },
      },
      BadRequest: {
        description: 'Dados invalidos',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'nome is required', code: 'VALIDATION_ERROR' },
          },
        },
      },
    },
  },
}
  return Response.json(openApiSpec)
}
