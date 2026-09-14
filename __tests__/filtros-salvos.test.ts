// =============================================================================
// ETL Tests - Radar CRM - Filtros salvos do Radar (listas de prospecção)
// =============================================================================

import { describe, test, expect } from '@jest/globals'

type ScoreFiltro = 'todos' | 'alto' | 'medio'

interface Filtros {
  fase: string | null
  cidade: string | null
  score: ScoreFiltro
  raioKm: number
}

function serializarFiltros(f: Filtros): Record<string, unknown> {
  return {
    fase: f.fase,
    cidade: f.cidade,
    score: f.score,
    raioKm: f.raioKm,
  }
}

function validarNome(nome: string): { valido: boolean; erro?: string } {
  const trimmed = nome.trim()
  if (trimmed.length === 0) {
    return { valido: false, erro: 'Nome não pode ser vazio' }
  }
  if (trimmed.length > 80) {
    return { valido: false, erro: 'Nome muito longo (max 80 chars)' }
  }
  return { valido: true }
}

function validarFiltros(f: Partial<Filtros>): boolean {
  if (f.raioKm !== undefined && (f.raioKm < 1 || f.raioKm > 200)) return false
  if (f.score !== undefined && !['todos', 'alto', 'medio'].includes(f.score)) return false
  return true
}

describe('FiltrosSalvos - serialização e validação', () => {
  describe('serializarFiltros', () => {
    test('serializa todos os campos', () => {
      const f: Filtros = {
        fase: 'estrutura',
        cidade: 'Uberlândia',
        score: 'alto',
        raioKm: 50,
      }
      expect(serializarFiltros(f)).toEqual({
        fase: 'estrutura',
        cidade: 'Uberlândia',
        score: 'alto',
        raioKm: 50,
      })
    })

    test('preserva nulls em fase e cidade', () => {
      const f: Filtros = {
        fase: null,
        cidade: null,
        score: 'todos',
        raioKm: 25,
      }
      expect(serializarFiltros(f).fase).toBeNull()
      expect(serializarFiltros(f).cidade).toBeNull()
    })
  })

  describe('validarNome', () => {
    test('aceita nome simples', () => {
      expect(validarNome('Obras Uberlândia').valido).toBe(true)
    })

    test('rejeita string vazia', () => {
      expect(validarNome('').valido).toBe(false)
    })

    test('rejeita só espaços', () => {
      expect(validarNome('   ').valido).toBe(false)
    })

    test('rejeita mais de 80 chars', () => {
      expect(validarNome('a'.repeat(81)).valido).toBe(false)
    })

    test('trima espaços antes de validar', () => {
      expect(validarNome('  Minas Gerais  ').valido).toBe(true)
    })
  })

  describe('validarFiltros', () => {
    test('aceita raio dentro do range 1..200', () => {
      expect(validarFiltros({ raioKm: 1 })).toBe(true)
      expect(validarFiltros({ raioKm: 100 })).toBe(true)
      expect(validarFiltros({ raioKm: 200 })).toBe(true)
    })

    test('rejeita raio fora do range', () => {
      expect(validarFiltros({ raioKm: 0 })).toBe(false)
      expect(validarFiltros({ raioKm: 201 })).toBe(false)
    })

    test('rejeita score inválido', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(validarFiltros({ score: 'baixo' as any })).toBe(false)
    })
  })
})
