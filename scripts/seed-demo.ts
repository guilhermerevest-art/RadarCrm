// =============================================================================
// seed-demo.ts
// Popula dados realistas para um tenant demo. Opt-in via env DEMO_TENANT_ID.
// Uso: DEMO_TENANT_ID=<uuid> npx tsx scripts/seed-demo.ts
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })

const DEMO_TENANT = process.env.DEMO_TENANT_ID
if (!DEMO_TENANT) {
  console.error('Defina DEMO_TENANT_ID=<uuid> antes de rodar.')
  console.error('Para criar um tenant demo, rode:')
  console.error('  INSERT INTO tenants (id, nome) VALUES (gen_random_uuid(), \'demo\');')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type FaseObra = 'fundacao' | 'estrutura' | 'alvenaria' | 'acabamento'

interface ObraFase {
  fase: FaseObra
  area: number
  valor: number
}

const OBRAS_FAKE: ObraFase[] = [
  { fase: 'fundacao', area: 320, valor: 850000 },
  { fase: 'estrutura', area: 480, valor: 1200000 },
  { fase: 'alvenaria', area: 240, valor: 620000 },
  { fase: 'acabamento', area: 180, valor: 480000 },
  { fase: 'fundacao', area: 1200, valor: 3500000 },
  { fase: 'estrutura', area: 250, valor: 580000 },
  { fase: 'alvenaria', area: 360, valor: 940000 },
]

const CIDADES = ['Uberlândia', 'Uberaba', 'Araguari', 'Ituiutaba', 'Patos de Minas', 'Patrocínio']

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomCNPJ(): string {
  return Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('')
}

async function seedObras(): Promise<number> {
  const rows = Array.from({ length: 50 }, () => {
    const o = randomFrom(OBRAS_FAKE)
    return {
      tenant_id: DEMO_TENANT,
      fonte: 'CNO',
      fonte_id: `DEMO-${Math.random().toString(36).slice(2, 8)}`,
      status: 'ativa' as const,
      fase_atual: o.fase,
      endereco_cidade: randomFrom(CIDADES),
      endereco_uf: 'MG',
      area_construida_m2: o.area,
      valor_estimado: o.valor,
      responsavel_documento: randomCNPJ(),
      responsavel_nome: 'Construtora Demo Ltda',
      responsavel_qualificacao: 'Proprietário',
      qualidade_score: Math.floor(Math.random() * 30 + 70),
      lat: -18.918 + (Math.random() - 0.5) * 0.5,
      lng: -48.276 + (Math.random() - 0.5) * 0.5,
      data_inicio: new Date(Date.now() - Math.random() * 365 * 86400000).toISOString(),
    }
  })
  const { error } = await supabase.from('radar_obras').insert(rows)
  if (error) throw error
  return rows.length
}

async function seedLeads(): Promise<number> {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    tenant_id: DEMO_TENANT,
    nome: `Lead Demo ${i + 1}`,
    empresa: `Construtora ${randomFrom(['Alfa', 'Beta', 'Gama', 'Delta'])} Ltda`,
    email: `lead${i + 1}@demo.com.br`,
    telefone: `+55 34 9${Math.floor(Math.random() * 90000000 + 10000000)}`,
    origem: randomFrom(['radar', 'indicacao', 'whatsapp']),
    score_engajamento: Math.floor(Math.random() * 100),
    status: randomFrom(['novo', 'qualificado', 'em_contato']),
  }))
  const { error } = await supabase.from('crm_leads').insert(rows)
  if (error) throw error
  return rows.length
}

async function seedDeals(): Promise<number> {
  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('tenant_id', DEMO_TENANT)
    .limit(5)
  if (!leads || leads.length === 0) return 0

  const estagios = ['prospeccao', 'qualificacao', 'proposta', 'negociacao', 'fechado_ganho']
  const rows = leads.map((l, i) => ({
    tenant_id: DEMO_TENANT,
    lead_id: l.id,
    titulo: `Obra Demo ${i + 1}`,
    estagio: estagios[i % estagios.length],
    valor_estimado: 50000 + Math.floor(Math.random() * 200000),
    probabilidade: Math.floor(Math.random() * 100),
  }))
  const { error } = await supabase.from('crm_deals').insert(rows)
  if (error) throw error
  return rows.length
}

async function main() {
  console.log(`[seed-demo] Tenant: ${DEMO_TENANT}`)
  const obras = await seedObras()
  const leads = await seedLeads()
  const deals = await seedDeals()
  console.log({ obras, leads, deals })
}

main().catch((e) => {
  console.error('Erro:', e)
  process.exit(1)
})
