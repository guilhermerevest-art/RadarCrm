// =============================================================================
// Testes: Validadores de importação CSV de leads
// =============================================================================

import { describe, test, expect } from '@jest/globals'

const COLUNAS_ACEITAS: Record<string, string[]> = {
  nome: ['nome', 'name'],
  empresa: ['empresa', 'company', 'company_name', 'razao_social', 'razao social'],
  email: ['email', 'e-mail', 'e_mail'],
  telefone: ['telefone', 'phone', 'celular', 'whatsapp'],
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

function linhaParaDados(
  row: string[],
  headers: string[],
  mapa: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const campo of Object.keys(COLUNAS_ACEITAS)) {
    const colOriginal = mapa[campo]
    const i = colOriginal ? headers.indexOf(colOriginal) : -1
    out[campo] = i >= 0 ? (row[i] ?? '').trim() : ''
  }
  return out
}

function validarLinha(idx: number, dados: Record<string, string>) {
  if (!dados.nome || dados.nome.trim().length === 0) {
    return { valido: false, erro: `Linha ${idx}: nome é obrigatório` }
  }
  if (dados.email && dados.email.length > 0) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
      return { valido: false, erro: `Linha ${idx}: email inválido (${dados.email})` }
    }
  }
  return { valido: true }
}

// =============================================================================
// Mapeamento de cabeçalhos
// =============================================================================

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

  test('prefere primeiro alias quando múltiplos matcham', () => {
    const mapa = mapearCabecalhos(['Company Name', 'Nome'])
    expect(mapa.nome).toBe('Nome')
    expect(mapa.empresa).toBe('Company Name')
  })
})

// =============================================================================
// Validação de linhas
// =============================================================================

describe('Importação CSV - validação de linhas', () => {
  test('rejeita linha sem nome', () => {
    const headers = ['Nome', 'Empresa']
    const mapa = mapearCabecalhos(headers)
    const dados = linhaParaDados(['', 'ACME'], headers, mapa)
    const r = validarLinha(2, dados)
    expect(r.valido).toBe(false)
    expect(r.erro).toContain('nome')
  })

  test('aceita linha válida com nome e email', () => {
    const headers = ['Nome', 'Email']
    const mapa = mapearCabecalhos(headers)
    const dados = linhaParaDados(['João', 'joao@acme.com'], headers, mapa)
    const r = validarLinha(2, dados)
    expect(r.valido).toBe(true)
  })

  test('rejeita email malformado', () => {
    const headers = ['Nome', 'Email']
    const mapa = mapearCabecalhos(headers)
    const dados = linhaParaDados(['Ana', 'invalido'], headers, mapa)
    const r = validarLinha(5, dados)
    expect(r.valido).toBe(false)
    expect(r.erro).toContain('email inválido')
  })

  test('aceita linha sem email (opcional)', () => {
    const headers = ['Nome']
    const mapa = mapearCabecalhos(headers)
    const dados = linhaParaDados(['Pedro'], headers, mapa)
    const r = validarLinha(3, dados)
    expect(r.valido).toBe(true)
  })

  test('aceita sem telefone (opcional)', () => {
    const headers = ['Nome']
    const mapa = mapearCabecalhos(headers)
    const dados = linhaParaDados(['Maria'], headers, mapa)
    const r = validarLinha(3, dados)
    expect(r.valido).toBe(true)
  })

  test('email vazio é OK (não é obrigatório)', () => {
    const headers = ['Nome', 'Email']
    const mapa = mapearCabecalhos(headers)
    const dados = linhaParaDados(['Carlos', ''], headers, mapa)
    const r = validarLinha(7, dados)
    expect(r.valido).toBe(true)
  })
})
