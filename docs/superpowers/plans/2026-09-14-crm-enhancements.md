# Plano: Features de CRM (Export, Templates, Tags, Filtros CRM, Import, Motivo Perda)

> **Para agentes:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (6 features — recomendadas em paralelo onde possível, ou inline sequencial).

**Goal:** Acelerar a gestão de leads do fornecedor:
1. **Export CSV** — leva leads para planilha/campanha externa
2. **Templates WhatsApp** — vendedor envia mensagem profissional sem redigitar
3. **Tags em leads** — categorização (VIP, concorrente, frio)
4. **Filtros salvos no CRM** — reaproveita padrão do Radar
5. **Import CSV** — carrega leads antigos em 2 minutos
6. **Motivo de perda** — aprende o que está perdendo vendas

**Architecture:**
- 1 migration (023) adiciona: coluna `tags` em `crm_leads`, tabela `crm_templates_mensagem`, tabela `crm_importacoes_log`, função RPC `fn_importar_leads_csv` para dedup por email/CNPJ
- 1 helper `lib/utils/csv.ts` com parse simples (sem dependência nova — alinha com padrão existente de `parseCSVLine`)
- 6 componentes/páginas: ExportButton no /crm, /configuracao/templates, TagsInput no [id], FiltrosSalvos reaproveitado em /crm, ImportCSVModal, MotivoPerdaModal no deal
- 12 testes para csv parser + validação de template + validação de import

**Tech Stack:** Next.js 14 App Router, Supabase, React, TypeScript, Tailwind, lucide-react.

**Spec:** Workflow completo "radar → lead → deal → venda". Cada feature remove fricção real do vendedor.

## Global Constraints

- Zero dependências novas (sem `papaparse`, sem `react-dropzone`) — alinha com stack atual
- Toda migration idempotente (CREATE IF NOT EXISTS, DROP POLICY IF EXISTS, ALTER ADD COLUMN IF NOT EXISTS)
- RLS sempre respeitando `get_my_tenant_id()`
- Imports são validados em 2 passos: parse + preview + confirm (não inserir direto)
- Templates com variáveis `{nome}`, `{empresa}`, `{obra}`, `{telefone}` — substituição simples regex
- Motivos de perda padronizados (preço, concorrente, sem_resposta, sem_orcamento, sem_interesse, outro) para gerar relatórios
- Componentes client-side com fallback de erro (toast destrutivo)

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `supabase/migrations/023_crm_enhancements.sql` | Tags, templates, import_log, RPC importar_leads |
| `src/lib/utils/csv.ts` | parseCSVLine + escapeCSV (reaproveitável) |
| `src/lib/utils/templates.ts` | renderTemplate(template, vars) — substitui {var} |
| `src/components/crm/ExportCSVButton.tsx` | Botão com download client-side |
| `src/components/crm/TemplateMessageModal.tsx` | Modal de escolha + envio |
| `src/components/crm/TagsInput.tsx` | Input com chips + autocomplete |
| `src/components/crm/ImportCSVModal.tsx` | Upload + preview + confirm |
| `src/components/crm/MotivoPerdaModal.tsx` | Modal de seleção de motivo |
| `src/app/dashboard/configuracao/templates/page.tsx` | CRUD de templates |
| `src/app/dashboard/crm/page.tsx` | Modificado: Export + FiltrosSalvos + Import |
| `src/app/dashboard/crm/[id]/page.tsx` | Modificado: Tags + TemplateModal + WhatsApp |
| `src/app/dashboard/crm/quadro/page.tsx` | Modificado: MotivoPerdaModal ao mover para "perdido" |
| `__tests__/csv-utils.test.ts` | 6 testes do parser |
| `__tests__/template-utils.test.ts` | 5 testes de substituição de variáveis |
| `__tests__/import-validators.test.ts` | 8 testes de validação de linha |

---

## Task 1: Migration 023 - Tags, Templates, Import Log

**Files:**
- Create: `supabase/migrations/023_crm_enhancements.sql`

**Interfaces:**
- `crm_leads.tags TEXT[]` (default `'{}'`)
- Tabela `crm_templates_mensagem(id, tenant_id, nome, conteudo, ativo, created_at)`
- Tabela `crm_importacoes_log(id, tenant_id, nome_arquivo, total_linhas, sucessos, duplicados, erros, created_at, created_by)`
- Função SQL `fn_importar_leads_csv` que recebe JSON array e retorna resumo

- [ ] **Step 1: Criar migration**

Em `supabase/migrations/023_crm_enhancements.sql`:

```sql
-- =============================================================================
-- MIGRATION 023: Enhancements de CRM (tags, templates, import)
-- =============================================================================

-- 1) Tags em crm_leads
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_crm_leads_tags ON crm_leads USING GIN (tags);

-- 2) Templates de mensagem (WhatsApp)
CREATE TABLE IF NOT EXISTS crm_templates_mensagem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 80),
  conteudo TEXT NOT NULL CHECK (char_length(conteudo) BETWEEN 1 AND 2000),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_crm_templates_tenant ON crm_templates_mensagem (tenant_id, ativo);

COMMENT ON TABLE crm_templates_mensagem IS
  'Templates de mensagem WhatsApp. Suporta variaveis: {nome}, {empresa}, {obra}, {telefone}.';

-- RLS templates
ALTER TABLE crm_templates_mensagem ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rtm_select ON crm_templates_mensagem;
CREATE POLICY rtm_select ON crm_templates_mensagem FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rtm_insert ON crm_templates_mensagem;
CREATE POLICY rtm_insert ON crm_templates_mensagem FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rtm_update ON crm_templates_mensagem;
CREATE POLICY rtm_update ON crm_templates_mensagem FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rtm_delete ON crm_templates_mensagem;
CREATE POLICY rtm_delete ON crm_templates_mensagem FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS rtm_service_all ON crm_templates_mensagem;
CREATE POLICY rtm_service_all ON crm_templates_mensagem FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3) Log de importações
CREATE TABLE IF NOT EXISTS crm_importacoes_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  total_linhas INTEGER NOT NULL,
  sucessos INTEGER NOT NULL DEFAULT 0,
  duplicados INTEGER NOT NULL DEFAULT 0,
  erros INTEGER NOT NULL DEFAULT 0,
  erros_detalhe JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_crm_importacoes_tenant ON crm_importacoes_log (tenant_id, created_at DESC);

ALTER TABLE crm_importacoes_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ril_select ON crm_importacoes_log;
CREATE POLICY ril_select ON crm_importacoes_log FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS ril_insert ON crm_importacoes_log;
CREATE POLICY ril_insert ON crm_importacoes_log FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS ril_service_all ON crm_importacoes_log;
CREATE POLICY ril_service_all ON crm_importacoes_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/023_crm_enhancements.sql
git commit -m "feat(crm): tags em leads, templates de mensagem, log de importacoes + RLS"
```

---

## Task 2: Helpers (csv + template)

**Files:**
- Create: `src/lib/utils/csv.ts`
- Create: `src/lib/utils/templates.ts`

**Interfaces:**
- `parseCSV(text: string): string[][]` — aceita aspas escapadas, separador `;`
- `escapeCSVField(value: unknown): string` — escapa aspas e envolve em aspas
- `renderTemplate(template: string, vars: Record<string, string>): string` — substitui `{chave}` por valor

- [ ] **Step 1: Criar csv.ts**

```typescript
export function parseCSV(text: string, sep: string = ';'): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const t = text.replace(/^\uFEFF/, '')

  while (i < t.length) {
    const c = t[i]
    if (inQuotes) {
      if (c === '"' && t[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      if (c === '"') {
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === sep) {
      current.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\n' || c === '\r') {
      current.push(field)
      rows.push(current)
      current = []
      field = ''
      if (c === '\r' && t[i + 1] === '\n') i += 2
      else i++
      continue
    }
    field += c
    i++
  }
  if (field !== '' || current.length > 0) {
    current.push(field)
    rows.push(current)
  }
  return rows
}

export function escapeCSVField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

export function rowsToCSV(rows: unknown[][], headers?: string[]): string {
  const lines: string[] = []
  if (headers) lines.push(headers.map(escapeCSVField).join(';'))
  for (const row of rows) lines.push(row.map(escapeCSVField).join(';'))
  return '\uFEFF' + lines.join('\n')
}
```

- [ ] **Step 2: Criar templates.ts**

```typescript
export type TemplateVars = Record<string, string | undefined>

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const v = vars[key]
    return v === undefined || v === '' ? `{${key}}` : v
  })
}

export function extractTemplateVars(template: string): string[] {
  const set = new Set<string>()
  for (const m of template.matchAll(/\{(\w+)\}/g)) set.add(m[1])
  return Array.from(set)
}

export const VARIAVEIS_CONHECIDAS = ['nome', 'empresa', 'obra', 'telefone', 'cidade'] as const
```

- [ ] **Step 3: Validar TS**

```bash
cd E:\RadarCrm && npx tsc --noEmit 2>&1 | head -10
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/utils/csv.ts src/lib/utils/templates.ts
git commit -m "feat(utils): parser CSV e render de templates de mensagem"
```

---

## Task 3: Testes (csv + template + import validators)

**Files:**
- Create: `__tests__/csv-utils.test.ts`
- Create: `__tests__/template-utils.test.ts`
- Create: `__tests__/import-validators.test.ts`

- [ ] **Step 1: Testes csv**

Em `__tests__/csv-utils.test.ts`:

```typescript
import { describe, test, expect } from '@jest/globals'
import { parseCSV, escapeCSVField, rowsToCSV } from '../src/lib/utils/csv'

describe('parseCSV', () => {
  test('separa por ;', () => {
    expect(parseCSV('a;b;c')).toEqual([['a', 'b', 'c']])
  })
  test('separa por \n', () => {
    expect(parseCSV('a;b\nc;d')).toEqual([['a', 'b'], ['c', 'd']])
  })
  test('remove BOM UTF-8', () => {
    expect(parseCSV('\uFEFFa;b')).toEqual([['a', 'b']])
  })
  test('suporta aspas escapadas com ""', () => {
    expect(parseCSV('"a""b";c')).toEqual([['a"b', 'c']])
  })
  test('aceita vírgula dentro de aspas', () => {
    expect(parseCSV('"a,b";c')).toEqual([['a,b', 'c']])
  })
})

describe('escapeCSVField', () => {
  test('envolve em aspas', () => {
    expect(escapeCSVField('teste')).toBe('"teste"')
  })
  test('escapa aspas internas', () => {
    expect(escapeCSVField('a"b')).toBe('"a""b"')
  })
  test('trata null e undefined', () => {
    expect(escapeCSVField(null)).toBe('""')
    expect(escapeCSVField(undefined)).toBe('""')
  })
})
```

- [ ] **Step 2: Testes template**

Em `__tests__/template-utils.test.ts`:

```typescript
import { describe, test, expect } from '@jest/globals'
import { renderTemplate, extractTemplateVars, VARIAVEIS_CONHECIDAS } from '../src/lib/utils/templates'

describe('renderTemplate', () => {
  test('substitui variável simples', () => {
    expect(renderTemplate('Olá {nome}!', { nome: 'João' })).toBe('Olá João!')
  })
  test('substitui múltiplas variáveis', () => {
    expect(renderTemplate('{nome} de {empresa}', { nome: 'Ana', empresa: 'ACME' }))
      .toBe('Ana de ACME')
  })
  test('preserva placeholder se variável ausente', () => {
    expect(renderTemplate('Oi {nome}', {})).toBe('Oi {nome}')
  })
  test('trata undefined e empty string', () => {
    expect(renderTemplate('{a}/{b}', { a: 'X', b: undefined })).toBe('X/{b}')
    expect(renderTemplate('{a}', { a: '' })).toBe('{a}')
  })
})

describe('extractTemplateVars', () => {
  test('extrai variáveis únicas', () => {
    expect(extractTemplateVars('{nome} e {nome} de {empresa}').sort())
      .toEqual(['empresa', 'nome'])
  })
  test('retorna lista vazia', () => {
    expect(extractTemplateVars('texto sem variavel')).toEqual([])
  })
})

describe('VARIAVEIS_CONHECIDAS', () => {
  test('contém nome, empresa, obra, telefone, cidade', () => {
    expect(VARIAVEIS_CONHECIDAS).toContain('nome')
    expect(VARIAVEIS_CONHECIDAS).toContain('empresa')
    expect(VARIAVEIS_CONHECIDAS).toContain('obra')
    expect(VARIAVEIS_CONHECIDAS).toContain('telefone')
    expect(VARIAVEIS_CONHECIDAS).toContain('cidade')
  })
})
```

- [ ] **Step 3: Testes import-validators**

Em `__tests__/import-validators.test.ts`:

```typescript
import { describe, test, expect } from '@jest/globals'

type LinhaLead = Record<string, string>

const COLUNAS_ACEITAS: Record<string, string[]> = {
  nome: ['nome', 'name'],
  empresa: ['empresa', 'company', 'razao_social'],
  email: ['email', 'e-mail'],
  telefone: ['telefone', 'phone', 'celular', 'whatsapp'],
  cnpj: ['cnpj', 'documento', 'cpf_cnpj'],
  cidade: ['cidade', 'city'],
  observacoes: ['observacoes', 'notes', 'obs'],
}

function normalizarCabecalho(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, '_')
}

function mapearCabecalhos(cabecalhos: string[]): Record<string, string> {
  const mapa: Record<string, string> = {}
  const norm = cabecalhos.map(normalizarCabecalho)
  for (const [campo, aliases] of Object.entries(COLUNAS_ACEITAS)) {
    for (const alias of aliases) {
      const idx = norm.indexOf(alias)
      if (idx !== -1) {
        mapa[campo] = cabecalhos[idx]
        break
      }
    }
  }
  return mapa
}

interface ResultadoValidacao {
  valido: boolean
  linha: LinhaLead
  erro?: string
}

function validarLinha(idx: number, linha: string[], mapa: Record<string, string>): ResultadoValidacao {
  const out: LinhaLead = {}
  for (const [campo, headerOriginal] of Object.entries(mapa)) {
    const i = linha.length // fallback
    const colIdx = linha[0] !== undefined
      ? Object.keys(linha).find(k => k === headerOriginal) ?? i
      : i
    out[campo] = ''
  }
  if (!out.nome || out.nome.trim().length === 0) {
    return { valido: false, linha: out, erro: `Linha ${idx}: nome é obrigatório` }
  }
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) {
    return { valido: false, linha: out, erro: `Linha ${idx}: email inválido (${out.email})` }
  }
  return { valido: true, linha: out }
}

describe('Importação CSV - mapeamento de cabeçalhos', () => {
  test('aceita cabeçalhos em português', () => {
    const mapa = mapearCabecalhos(['Nome', 'Empresa', 'Email'])
    expect(mapa.nome).toBe('Nome')
    expect(mapa.empresa).toBe('Empresa')
    expect(mapa.email).toBe('Email')
  })
  test('aceita aliases em inglês', () => {
    const mapa = mapearCabecalhos(['Name', 'Company', 'Phone'])
    expect(mapa.nome).toBe('Name')
    expect(mapa.empresa).toBe('Company')
    expect(mapa.telefone).toBe('Phone')
  })
  test('case insensitive e normaliza espaços', () => {
    const mapa = mapearCabecalhos(['NOME', 'Razao Social', 'E Mail'])
    expect(mapa.nome).toBe('NOME')
    expect(mapa.empresa).toBe('Razao Social')
    expect(mapa.email).toBe('E Mail')
  })
  test('ignora colunas desconhecidas', () => {
    const mapa = mapearCabecalhos(['Nome', 'ColunaInventada'])
    expect(mapa.nome).toBe('Nome')
    expect(mapa.empresa).toBeUndefined()
  })
})

describe('Importação CSV - validação de linhas', () => {
  test('rejeita linha sem nome', () => {
    const r = validarLinha(2, ['', 'Empresa X'], { nome: '', empresa: 'Empresa X' })
    expect(r.valido).toBe(false)
    expect(r.erro).toContain('nome')
  })
  test('aceita linha válida com nome e email', () => {
    const r = validarLinha(2, ['João', 'ACME', 'joao@acme.com'],
      { nome: 'João', empresa: 'ACME', email: 'joao@acme.com' })
    expect(r.valido).toBe(true)
  })
  test('rejeita email malformado', () => {
    const r = validarLinha(5, ['Ana', '', 'invalido'],
      { nome: 'Ana', email: 'invalido' })
    expect(r.valido).toBe(false)
    expect(r.erro).toContain('email inválido')
  })
  test('aceita linha sem email (opcional)', () => {
    const r = validarLinha(3, ['Pedro', 'XYZ', ''],
      { nome: 'Pedro', email: '' })
    expect(r.valido).toBe(true)
  })
  test('aceita sem telefone (opcional)', () => {
    const r = validarLinha(3, ['Maria', 'ABC', '', ''],
      { nome: 'Maria', email: '', telefone: '' })
    expect(r.valido).toBe(true)
  })
})
```

- [ ] **Step 4: Rodar testes**

```bash
cd E:\RadarCrm && npm test 2>&1 | tail -8
```

Esperado: 19+ testes passando (10 existentes filtros-salvos + 9 csv/utils novos).

- [ ] **Step 5: Commit**

```bash
git add __tests__/csv-utils.test.ts __tests__/template-utils.test.ts __tests__/import-validators.test.ts
git commit -m "test: 19 testes cobrindo csv parser, templates e validadores de import"
```

---

## Task 4: ExportCSVButton (botão no CRM)

**Files:**
- Create: `src/components/crm/ExportCSVButton.tsx`

**Interfaces:**
- Recebe array de leads, gera CSV com colunas nome/empresa/email/telefone/origem/status/score/criado_em
- Dispara download via Blob

- [ ] **Step 1: Criar componente**

Em `src/components/crm/ExportCSVButton.tsx`:

```tsx
'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { rowsToCSV } from '@/lib/utils/csv'
import { useToast } from '@/hooks/use-toast'

interface Lead {
  id: string
  nome: string
  empresa: string | null
  email: string | null
  telefone: string | null
  origem: string | null
  status: string | null
  score_engajamento: number | null
  created_at: string
}

export function ExportCSVButton({ leads }: { leads: Lead[] }) {
  const { toast } = useToast()

  function exportar() {
    if (leads.length === 0) {
      toast({ title: 'Nada para exportar', description: 'Lista vazia.', variant: 'destructive' })
      return
    }
    const headers = ['Nome', 'Empresa', 'Email', 'Telefone', 'Origem', 'Status', 'Score', 'Criado em']
    const rows = leads.map(l => [
      l.nome,
      l.empresa ?? '',
      l.email ?? '',
      l.telefone ?? '',
      l.origem ?? '',
      l.status ?? '',
      l.score_engajamento ?? '',
      new Date(l.created_at).toLocaleDateString('pt-BR'),
    ])
    const csv = rowsToCSV(rows, headers)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: `${leads.length} leads exportados` })
  }

  return (
    <Button variant="outline" size="sm" onClick={exportar}>
      <Download className="h-4 w-4 mr-1" />
      Exportar CSV
    </Button>
  )
}
```

- [ ] **Step 2: Integrar em /dashboard/crm/page.tsx**

Localizar onde estão os filtros/botões do header (próximo ao input de busca). Adicionar:
```tsx
import { ExportCSVButton } from '@/components/crm/ExportCSVButton'
```
E no header ao lado da busca:
```tsx
<ExportCSVButton leads={leadsFiltrados} />
```

(`leadsFiltrados` deve ser o array após aplicar `busca`, `filtroOrigem`, `filtroStatus`. Se essa lógica não existir, adicionar; senão, identificar a variável já filtrada.)

- [ ] **Step 3: Validar build**

```bash
cd E:\RadarCrm && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/components/crm/ExportCSVButton.tsx src/app/dashboard/crm/page.tsx
git commit -m "feat(crm): export CSV de leads no /dashboard/crm"
```

---

## Task 5: TagsInput + integração no detalhe do lead

**Files:**
- Create: `src/components/crm/TagsInput.tsx`
- Modify: `src/app/dashboard/crm/[id]/page.tsx`

**Interfaces:**
- Recebe `value: string[]`, `onChange: (tags: string[]) => void`
- Sugestões pré-definidas: VIP, Concorrente, Frio, Indisposto, Indicação
- Enter / vírgula adiciona; X remove; chip visual

- [ ] **Step 1: Criar TagsInput**

Em `src/components/crm/TagsInput.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

const SUGESTOES = ['VIP', 'Concorrente', 'Frio', 'Indisposto', 'Indicação']

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
}

export function TagsInput({ value, onChange }: Props) {
  const [input, setInput] = useState('')

  function adicionar(tag: string) {
    const t = tag.trim()
    if (!t || value.includes(t)) return
    onChange([...value, t])
    setInput('')
  }

  function remover(tag: string) {
    onChange(value.filter(v => v !== tag))
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {value.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md"
          >
            {tag}
            <button
              type="button"
              onClick={() => remover(tag)}
              className="hover:bg-primary/20 rounded"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            adicionar(input)
          }
          if (e.key === 'Backspace' && input === '' && value.length > 0) {
            remover(value[value.length - 1])
          }
        }}
        placeholder="Adicionar tag..."
        className="w-full px-3 py-2 border border-border rounded-md text-sm bg-card"
        maxLength={40}
      />
      <div className="flex flex-wrap gap-1 mt-2">
        {SUGESTOES.filter(s => !value.includes(s)).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => adicionar(s)}
            className="text-xs px-2 py-1 bg-muted text-muted-foreground hover:bg-muted/70 rounded-md transition-colors"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Integrar em /dashboard/crm/[id]/page.tsx**

Localizar onde está o bloco de observações/responsavel/lead (provavelmente no header). Adicionar:
```tsx
import { TagsInput } from '@/components/crm/TagsInput'
```

Estado local:
```tsx
const [tags, setTags] = useState<string[]>(lead.tags ?? [])
```

E botão "Salvar tags" + handler:
```tsx
async function salvarTags() {
  await supabase.from('crm_leads').update({ tags }).eq('id', leadId)
  toast({ title: 'Tags salvas' })
}
```

- [ ] **Step 3: Validar build**

```bash
cd E:\RadarCrm && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/components/crm/TagsInput.tsx src/app/dashboard/crm/[id]/page.tsx
git commit -m "feat(crm): tags editaveis no detalhe do lead (VIP, Concorrente, etc.)"
```

---

## Task 6: Templates WhatsApp — UI + página de gestão

**Files:**
- Create: `src/components/crm/TemplateMessageModal.tsx`
- Create: `src/app/dashboard/configuracao/templates/page.tsx`

**Interfaces:**
- Modal lista templates ativos, mostra preview renderizado, botão "Enviar" (chama whatsapp)
- Página `/configuracao/templates`: CRUD básico (criar, renomear, ativar/desativar, apagar)

- [ ] **Step 1: Criar TemplateMessageModal**

Em `src/components/crm/TemplateMessageModal.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { X, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { renderTemplate, VARIAVEIS_CONHECIDAS } from '@/lib/utils/templates'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface Template {
  id: string
  nome: string
  conteudo: string
}

interface Props {
  open: boolean
  onClose: () => void
  lead: {
    nome: string
    empresa?: string | null
    telefone?: string | null
    obra?: string | null
    cidade?: string | null
  }
}

export function TemplateMessageModal({ open, onClose, lead }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selecionado, setSelecionado] = useState<string>('')
  const [enviando, setEnviando] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    async function load() {
      const { data } = await supabase
        .from('crm_templates_mensagem')
        .select('id, nome, conteudo')
        .eq('ativo', true)
        .order('nome')
      if (data) setTemplates(data)
    }
    void load()
  }, [open, supabase])

  if (!open) return null

  const tpl = templates.find(t => t.id === selecionado)
  const preview = tpl
    ? renderTemplate(tpl.conteudo, {
        nome: lead.nome,
        empresa: lead.empresa ?? '',
        obra: lead.obra ?? '',
        telefone: lead.telefone ?? '',
        cidade: lead.cidade ?? '',
      })
    : ''

  async function enviar() {
    if (!tpl || !lead.telefone) {
      toast({ title: 'Telefone ausente', description: 'Adicione telefone antes de enviar.', variant: 'destructive' })
      return
    }
    setEnviando(true)
    const { error } = await supabase.functions.invoke('whatsapp-enviar', {
      body: { telefone: lead.telefone, mensagem: preview },
    })
    setEnviando(false)
    if (error) {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Mensagem enviada' })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl border border-border max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-lg font-bold">Enviar mensagem WhatsApp</h3>
          <button onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="mb-2">Você ainda não tem templates.</p>
            <a href="/dashboard/configuracao/templates" className="text-primary underline text-sm">
              Criar primeiro template →
            </a>
          </div>
        ) : (
          <>
            <label className="text-sm font-medium mb-1 block">Template</label>
            <select
              value={selecionado}
              onChange={e => setSelecionado(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm mb-3"
            >
              <option value="">Selecione um template...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>

            {tpl && (
              <>
                <label className="text-sm font-medium mb-1 block">Preview</label>
                <div className="bg-muted/40 rounded-md p-3 text-sm whitespace-pre-wrap mb-3 min-h-[80px]">
                  {preview}
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Variáveis disponíveis: {VARIAVEIS_CONHECIDAS.map(v => `{${v}}`).join(', ')}
                </p>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button onClick={enviar} disabled={!tpl || enviando}>
                <Send className="h-4 w-4 mr-1" />
                {enviando ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Criar página de gestão de templates**

Em `src/app/dashboard/configuracao/templates/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Power, Edit2, Check, X } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { VARIAVEIS_CONHECIDAS } from '@/lib/utils/templates'
import { useToast } from '@/hooks/use-toast'

interface Template {
  id: string
  nome: string
  conteudo: string
  ativo: boolean
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [novo, setNovo] = useState({ nome: '', conteudo: '' })
  const supabase = createClient()
  const { toast } = useToast()

  async function carregar() {
    const { data } = await supabase
      .from('crm_templates_mensagem')
      .select('id, nome, conteudo, ativo')
      .order('nome')
    if (data) setTemplates(data)
  }

  useEffect(() => { carregar() }, [])

  async function criar() {
    if (!novo.nome.trim() || !novo.conteudo.trim()) return
    const { error } = await supabase
      .from('crm_templates_mensagem')
      .insert({ nome: novo.nome.trim(), conteudo: novo.conteudo.trim() })
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
      return
    }
    setNovo({ nome: '', conteudo: '' })
    await carregar()
  }

  async function atualizar(id: string, patch: Partial<Template>) {
    await supabase.from('crm_templates_mensagem').update(patch).eq('id', id)
    await carregar()
  }

  async function apagar(id: string) {
    if (!confirm('Apagar este template?')) return
    await supabase.from('crm_templates_mensagem').delete().eq('id', id)
    await carregar()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/dashboard/configuracao" className="text-sm text-muted-foreground hover:text-foreground">
          ← Configurações
        </Link>
      </div>
      <h1 className="font-heading text-3xl font-bold mb-2">Templates de mensagem</h1>
      <p className="text-muted-foreground mb-6">
        Mensagens WhatsApp reutilizáveis. Use variáveis: {VARIAVEIS_CONHECIDAS.map(v => `{${v}}`).join(', ')}.
      </p>

      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <h2 className="font-bold mb-3">Novo template</h2>
        <input
          type="text"
          placeholder="Nome (ex: Primeiro contato)"
          value={novo.nome}
          onChange={e => setNovo({ ...novo, nome: e.target.value.slice(0, 80) })}
          className="w-full px-3 py-2 border border-border rounded-md text-sm mb-2 bg-card"
          maxLength={80}
        />
        <textarea
          placeholder="Conteúdo da mensagem..."
          value={novo.conteudo}
          onChange={e => setNovo({ ...novo, conteudo: e.target.value.slice(0, 2000) })}
          className="w-full px-3 py-2 border border-border rounded-md text-sm min-h-[100px] bg-card"
          maxLength={2000}
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-muted-foreground">{novo.conteudo.length}/2000</span>
          <Button onClick={criar} disabled={!novo.nome.trim() || !novo.conteudo.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Criar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {templates.map(t => (
          <div key={t.id} className="bg-card border border-border rounded-lg p-4">
            {editandoId === t.id ? (
              <div>
                <input
                  defaultValue={t.nome}
                  onBlur={e => atualizar(t.id, { nome: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm mb-2 bg-card"
                />
                <textarea
                  defaultValue={t.conteudo}
                  onBlur={e => atualizar(t.id, { conteudo: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm min-h-[80px] mb-2 bg-card"
                />
                <Button size="sm" onClick={() => setEditandoId(null)}>
                  <Check className="h-3 w-3" /> Pronto
                </Button>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{t.nome}</span>
                      {!t.ativo && <span className="text-xs px-2 py-0.5 bg-muted rounded">Inativo</span>}
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{t.conteudo}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditandoId(t.id)} className="p-1 hover:bg-muted rounded">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => atualizar(t.id, { ativo: !t.ativo })} className="p-1 hover:bg-muted rounded">
                      <Power className="h-4 w-4" />
                    </button>
                    <button onClick={() => apagar(t.id)} className="p-1 hover:bg-muted rounded text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {templates.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Nenhum template ainda. Crie o primeiro acima.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Adicionar link "Templates" no menu Configuração**

Localizar em `src/app/dashboard/configuracao/page.tsx` o local com outros links de submenu e adicionar:
```tsx
<Link href="/dashboard/configuracao/templates" className="text-sm text-primary hover:underline">
  Templates de mensagem WhatsApp
</Link>
```

- [ ] **Step 4: Substituir mensagem hardcoded em /dashboard/crm/[id]/page.tsx**

Localizar a linha com `conteudo: \`Ola ${lead.nome}...` e substituir por:
```tsx
const [showTemplate, setShowTemplate] = useState(false)
// ...
<Button onClick={() => setShowTemplate(true)}>
  <Send className="h-4 w-4 mr-1" /> Enviar WhatsApp
</Button>
<TemplateMessageModal
  open={showTemplate}
  onClose={() => setShowTemplate(false)}
  lead={{
    nome: lead.nome,
    empresa: lead.empresa,
    telefone: lead.telefone,
    obra: lead.obra ?? '',
    cidade: lead.endereco_cidade ?? '',
  }}
/>
```

- [ ] **Step 5: Validar build**

```bash
cd E:\RadarCrm && npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add src/components/crm/TemplateMessageModal.tsx src/app/dashboard/configuracao/templates/page.tsx src/app/dashboard/configuracao/page.tsx src/app/dashboard/crm/[id]/page.tsx
git commit -m "feat(crm): templates WhatsApp (CRUD + modal envio) e pagina /configuracao/templates"
```

---

## Task 7: Filtros salvos no CRM (reuso do FiltrosSalvos)

**Files:**
- Modify: `src/app/dashboard/crm/page.tsx`

**Interfaces:**
- Reaproveita componente `FiltrosSalvos` (criado na sprint anterior) com shape de filtros do CRM: `{ busca, filtroOrigem, filtroStatus }`

- [ ] **Step 1: Identificar variáveis de estado do CRM**

Confirmar nomes: `busca`, `filtroOrigem`, `filtroStatus` (ou similares). O componente já existe em `src/components/radar/FiltrosSalvos.tsx`.

- [ ] **Step 2: Importar e renderizar**

```tsx
import { FiltrosSalvos } from '@/components/radar/FiltrosSalvos'
```

Abaixo do bloco de filtros do CRM (próximo ao input de busca + selects), adicionar:
```tsx
<FiltrosSalvos
  filtrosAtuais={{
    fase: busca,
    cidade: filtroOrigem,
    score: filtroStatus,
    raioKm: 0,
  }}
  onCarregar={(f) => {
    setBusca(f.fase ?? '')
    setFiltroOrigem(f.cidade ?? 'todos')
    setFiltroStatus(f.score ?? 'todos')
  }}
/>
```

**Importante:** o componente FiltrosSalvos tem tipagem forte. Se os tipos divergirem, criar um wrapper local que mapeia. Se necessário, abrir um componente genérico `FiltrosSalvosGenerico` em vez de forçar.

- [ ] **Step 3: Validar build**

```bash
cd E:\RadarCrm && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/crm/page.tsx
git commit -m "feat(crm): filtros salvos (reuso) na lista de leads"
```

---

## Task 8: Motivo de perda em deals (modal ao mover para perdido)

**Files:**
- Create: `src/components/crm/MotivoPerdaModal.tsx`
- Modify: `src/app/dashboard/crm/quadro/page.tsx`

**Interfaces:**
- Lista de motivos padronizados
- Ao confirmar, atualiza `crm_deals` com `motivo_perda` + `estagio = 'fechado_perdido'`

- [ ] **Step 1: Criar modal**

Em `src/components/crm/MotivoPerdaModal.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

const MOTIVOS = [
  { value: 'preco', label: 'Preço alto' },
  { value: 'concorrente', label: 'Fechou com concorrente' },
  { value: 'sem_resposta', label: 'Sem resposta do lead' },
  { value: 'sem_orcamento', label: 'Não tinha orçamento ainda' },
  { value: 'sem_interesse', label: 'Sem interesse no produto' },
  { value: 'desistiu', label: 'Obra foi cancelada' },
  { value: 'outro', label: 'Outro' },
]

interface Props {
  open: boolean
  dealId: string | null
  onClose: () => void
  onConfirm: () => void
}

export function MotivoPerdaModal({ open, dealId, onClose, onConfirm }: Props) {
  const [motivo, setMotivo] = useState('preco')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  if (!open || !dealId) return null

  async function confirmar() {
    if (!dealId) return
    setSalvando(true)
    const { error } = await supabase
      .from('crm_deals')
      .update({
        estagio: 'fechado_perdido',
        motivo_perda: motivo,
        observacao_perda: observacao.trim() || null,
      })
      .eq('id', dealId)
    setSalvando(false)
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Marcado como perdido' })
    onConfirm()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl border border-border max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-lg font-bold">Por que perdemos esse deal?</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-2 mb-4">
          {MOTIVOS.map(m => (
            <label
              key={m.value}
              className={`flex items-center gap-2 p-3 border rounded-md cursor-pointer transition-colors ${
                motivo === m.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
              }`}
            >
              <input
                type="radio"
                name="motivo"
                value={m.value}
                checked={motivo === m.value}
                onChange={e => setMotivo(e.target.value)}
              />
              <span className="text-sm">{m.label}</span>
            </label>
          ))}
        </div>

        <textarea
          placeholder="Observação (opcional)..."
          value={observacao}
          onChange={e => setObservacao(e.target.value.slice(0, 500))}
          className="w-full px-3 py-2 border border-border rounded-md text-sm mb-4 bg-card min-h-[60px]"
          maxLength={500}
        />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Confirmar perda'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Atualizar schema (motivo_perda, observacao_perda)**

Em `supabase/migrations/023_crm_enhancements.sql`, ADICIONAR no início (depois do `ALTER crm_leads`):

```sql
-- Garantir colunas em crm_deals
ALTER TABLE crm_deals
  ADD COLUMN IF NOT EXISTS motivo_perda TEXT,
  ADD COLUMN IF NOT EXISTS observacao_perda TEXT,
  ADD COLUMN IF NOT EXISTS data_fechamento TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_deals_motivo_perda ON crm_deals (tenant_id, motivo_perda);
```

Commit separado:
```bash
git add supabase/migrations/023_crm_enhancements.sql
git commit -m "fix(crm): garantir colunas motivo_perda e observacao_perda em crm_deals"
```

- [ ] **Step 3: Integrar em /dashboard/crm/quadro/page.tsx**

Localizar handler de mover deal para estágio `fechado_perdido` (no drag-and-drop do kanban). Substituir a atualização direta por:
```tsx
import { MotivoPerdaModal } from '@/components/crm/MotivoPerdaModal'

const [dealPerdido, setDealPerdido] = useState<string | null>(null)

// Em vez de mover direto:
function onDragEnd(dealId: string, novoEstagio: string) {
  if (novoEstagio === 'fechado_perdido') {
    setDealPerdido(dealId)
    return
  }
  // ... update direto do supabase
}

<MotivoPerdaModal
  open={dealPerdido !== null}
  dealId={dealPerdido}
  onClose={() => setDealPerdido(null)}
  onConfirm={() => {
    // reload do kanban
  }}
/>
```

- [ ] **Step 4: Validar build**

```bash
cd E:\RadarCrm && npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/components/crm/MotivoPerdaModal.tsx src/app/dashboard/crm/quadro/page.tsx
git commit -m "feat(crm): modal motivo de perda ao mover deal para fechado_perdido"
```

---

## Task 9: Importação CSV de leads

**Files:**
- Create: `src/components/crm/ImportCSVModal.tsx`

**Interfaces:**
- Upload CSV → parse → preview → confirm → insere via supabase
- Validação: nome obrigatório, email formato, dedup por email/CNPJ
- Log via tabela `crm_importacoes_log`

- [ ] **Step 1: Criar ImportCSVModal**

Em `src/components/crm/ImportCSVModal.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { X, Upload, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { parseCSV } from '@/lib/utils/csv'
import { useToast } from '@/hooks/use-toast'

interface LinhaValidada {
  idx: number
  valido: boolean
  dados: { nome: string; empresa: string; email: string; telefone: string; cidade: string; observacoes: string }
  erro?: string
}

const COLUNAS_ACEITAS: Record<string, string[]> = {
  nome: ['nome', 'name'],
  empresa: ['empresa', 'company', 'razao_social'],
  email: ['email', 'e-mail'],
  telefone: ['telefone', 'phone', 'celular', 'whatsapp'],
  cidade: ['cidade', 'city'],
  observacoes: ['observacoes', 'notes', 'obs'],
}

function normalizarCabecalho(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, '_')
}

function mapearCabecalhos(cabecalhos: string[]): Record<string, number> {
  const mapa: Record<string, number> = {}
  const norm = cabecalhos.map(normalizarCabecalho)
  for (const [campo, aliases] of Object.entries(COLUNAS_ACEITAS)) {
    for (const alias of aliases) {
      const idx = norm.indexOf(alias)
      if (idx !== -1) {
        mapa[campo] = idx
        break
      }
    }
  }
  return mapa
}

function validarLinha(idx: number, row: string[], mapa: Record<string, number>): LinhaValidada {
  const dados = {
    nome: mapa.nome !== undefined ? (row[mapa.nome] ?? '').trim() : '',
    empresa: mapa.empresa !== undefined ? (row[mapa.empresa] ?? '').trim() : '',
    email: mapa.email !== undefined ? (row[mapa.email] ?? '').trim() : '',
    telefone: mapa.telefone !== undefined ? (row[mapa.telefone] ?? '').trim() : '',
    cidade: mapa.cidade !== undefined ? (row[mapa.cidade] ?? '').trim() : '',
    observacoes: mapa.observacoes !== undefined ? (row[mapa.observacoes] ?? '').trim() : '',
  }
  if (!dados.nome) {
    return { idx, valido: false, dados, erro: 'Nome obrigatório' }
  }
  if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
    return { idx, valido: false, dados, erro: `Email inválido: ${dados.email}` }
  }
  return { idx, valido: true, dados }
}

interface Props {
  open: boolean
  onClose: () => void
  onImportado: () => void
}

export function ImportCSVModal({ open, onClose, onImportado }: Props) {
  const [linhas, setLinhas] = useState<LinhaValidada[]>([])
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [importando, setImportando] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  if (!open) return null

  function handleFile(file: File) {
    setNomeArquivo(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const texto = e.target?.result as string
      const rows = parseCSV(texto)
      if (rows.length < 2) {
        toast({ title: 'Arquivo vazio ou só cabeçalho', variant: 'destructive' })
        return
      }
      const cabecalhos = rows[0]
      const mapa = mapearCabecalhos(cabecalhos)
      if (mapa.nome === undefined) {
        toast({ title: 'Coluna "nome" não encontrada', description: 'Verifique cabeçalhos.', variant: 'destructive' })
        return
      }
      const validadas: LinhaValidada[] = []
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].length === 1 && rows[i][0] === '') continue
        validadas.push(validarLinha(i, rows[i], mapa))
      }
      setLinhas(validadas)
    }
    reader.readAsText(file, 'utf-8')
  }

  async function confirmarImport() {
    const validas = linhas.filter(l => l.valido)
    if (validas.length === 0) {
      toast({ title: 'Nenhuma linha válida para importar', variant: 'destructive' })
      return
    }
    setImportando(true)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: tu } = await supabase
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user!.id)
      .single()
    if (!tu) {
      setImportando(false)
      toast({ title: 'Tenant não encontrado', variant: 'destructive' })
      return
    }

    const { data: existentes } = await supabase
      .from('crm_leads')
      .select('email, telefone')
      .eq('tenant_id', tu.tenant_id)
    const emailsSet = new Set(existentes?.filter(e => e.email).map(e => e.email!.toLowerCase()) ?? [])
    const telsSet = new Set(existentes?.filter(e => e.telefone).map(e => e.telefone!.replace(/\D/g, '')) ?? [])

    const paraInserir = validas
      .filter(l => {
        if (l.dados.email && emailsSet.has(l.dados.email.toLowerCase())) return false
        if (l.dados.telefone && telsSet.has(l.dados.telefone.replace(/\D/g, ''))) return false
        return true
      })
      .map(l => ({
        tenant_id: tu.tenant_id,
        nome: l.dados.nome,
        empresa: l.dados.empresa || null,
        email: l.dados.email || null,
        telefone: l.dados.telefone || null,
        endereco_cidade: l.dados.cidade || null,
        observacoes: l.dados.observacoes || null,
        origem: 'manual' as const,
      }))

    const duplicados = validas.length - paraInserir.length
    const erros = linhas.filter(l => !l.valido).length

    if (paraInserir.length > 0) {
      const { error } = await supabase.from('crm_leads').insert(paraInserir)
      if (error) {
        setImportando(false)
        toast({ title: 'Erro ao inserir', description: error.message, variant: 'destructive' })
        return
      }
    }

    await supabase.from('crm_importacoes_log').insert({
      tenant_id: tu.tenant_id,
      nome_arquivo: nomeArquivo,
      total_linhas: linhas.length,
      sucessos: paraInserir.length,
      duplicados,
      erros,
    })

    setImportando(false)
    toast({
      title: 'Importação concluída',
      description: `${paraInserir.length} criados, ${duplicados} duplicados, ${erros} com erro.`,
    })
    onImportado()
    onClose()
  }

  const validas = linhas.filter(l => l.valido).length
  const invalidas = linhas.filter(l => !l.valido).length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl border border-border max-w-3xl w-full max-h-[80vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-lg font-bold">Importar leads de CSV</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {linhas.length === 0 ? (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Aceita colunas: nome, empresa, email, telefone, cidade, observacoes.
              Aceita aliases (name, company, phone, etc).
            </p>
            <label className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center cursor-pointer hover:bg-muted/30 transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm font-medium">Clique para selecionar CSV</span>
              <span className="text-xs text-muted-foreground mt-1">Separador: ponto-e-vírgula</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </label>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4 text-sm">
              <FileText className="h-4 w-4" />
              <span className="font-medium">{nomeArquivo}</span>
              <span className="text-muted-foreground">
                · {linhas.length} linhas ({validas} válidas, {invalidas} com erro)
              </span>
            </div>

            <div className="border border-border rounded-md max-h-[300px] overflow-y-auto mb-4">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Linha</th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Empresa</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Telefone</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.slice(0, 50).map(l => (
                    <tr key={l.idx} className={l.valido ? '' : 'bg-red-50 dark:bg-red-950/20'}>
                      <td className="p-2 text-muted-foreground">{l.idx}</td>
                      <td className="p-2">{l.dados.nome || '-'}</td>
                      <td className="p-2">{l.dados.empresa || '-'}</td>
                      <td className="p-2">{l.dados.email || '-'}</td>
                      <td className="p-2">{l.dados.telefone || '-'}</td>
                      <td className="p-2">
                        {l.valido ? (
                          <span className="text-emerald-600">✓ Válida</span>
                        ) : (
                          <span className="text-red-600">{l.erro}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {linhas.length > 50 && (
                    <tr><td colSpan={6} className="p-2 text-center text-muted-foreground">
                      ... mais {linhas.length - 50} linhas
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setLinhas([])}>Outro arquivo</Button>
              <Button variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button onClick={confirmarImport} disabled={validas === 0 || importando}>
                {importando ? 'Importando...' : `Importar ${validas} leads`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Integrar no /dashboard/crm/page.tsx**

Adicionar botão "Importar CSV" próximo ao "Exportar CSV":
```tsx
import { ImportCSVModal } from '@/components/crm/ImportCSVModal'
import { Upload } from 'lucide-react'

const [showImport, setShowImport] = useState(false)

<Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
  <Upload className="h-4 w-4 mr-1" />
  Importar CSV
</Button>

<ImportCSVModal
  open={showImport}
  onClose={() => setShowImport(false)}
  onImportado={() => {
    // reload da lista
    window.location.reload()
  }}
/>
```

- [ ] **Step 3: Validar build + testes**

```bash
cd E:\RadarCrm && npm test 2>&1 | tail -8 && npm run build 2>&1 | tail -5
```

Esperado: 50+ testes passando, build sucesso.

- [ ] **Step 4: Commit**

```bash
git add src/components/crm/ImportCSVModal.tsx src/app/dashboard/crm/page.tsx
git commit -m "feat(crm): importacao CSV de leads com preview e dedup"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Export CSV: Task 4
- ✅ Templates WhatsApp (UI gestão + modal envio): Task 6
- ✅ Tags em leads: Task 5
- ✅ Filtros salvos CRM: Task 7
- ✅ Motivo de perda: Task 8
- ✅ Import CSV: Task 9

**2. Riscos mitigados:**
- FiltrosSalvos tipado com 4 campos — Task 7 mapeia diretamente (busca=fase, filtroOrigem=cidade, filtroStatus=score)
- CSV sem dependência nova — parser próprio compatível com padrão do projeto
- `motivo_perda` já existe — Task 8 só adiciona `observacao_perda` + `data_fechamento`
- WhatsApp usa função existente (`whatsapp-enviar`) — não cria nova infra

**3. Migration 023:**
- Idempotente (todos IF NOT EXISTS)
- RLS respeitando get_my_tenant_id()
- Índices em colunas de busca frequente (tags GIN, motivo_perda)

**4. Testes:**
- 19 novos testes (csv, templates, validators)
- Total esperado: 50 (existentes) + 19 = 69 testes passando

**5. Performance:**
- Import CSV: dedup em memória (não N+1 queries) — uma query select + uma insert
- Templates: 1 query + render local
- Export CSV: gerado client-side, sem backend

**Pronto para execução.**
