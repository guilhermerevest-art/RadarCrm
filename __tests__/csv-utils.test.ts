// =============================================================================
// Testes: CSV utils (parser, escaper, serializer)
// =============================================================================

import { describe, test, expect } from '@jest/globals'
import { parseCSV, escapeCSVField, rowsToCSV } from '../src/lib/csv'

describe('parseCSV', () => {
  test('separa por ;', () => {
    expect(parseCSV('a;b;c')).toEqual([['a', 'b', 'c']])
  })

  test('separa por \\n', () => {
    expect(parseCSV('a;b\nc;d')).toEqual([['a', 'b'], ['c', 'd']])
  })

  test('remove BOM UTF-8', () => {
    expect(parseCSV('﻿a;b')).toEqual([['a', 'b']])
  })

  test('suporta aspas escapadas com ""', () => {
    expect(parseCSV('"a""b";c')).toEqual([['a"b', 'c']])
  })

  test('aceita vírgula dentro de aspas', () => {
    expect(parseCSV('"a,b";c')).toEqual([['a,b', 'c']])
  })

  test('suporta múltiplas linhas com aspas', () => {
    const csv = 'nome;desc\n"João ""The Boss""";CEO\nMaria;Designer'
    expect(parseCSV(csv)).toEqual([
      ['nome', 'desc'],
      ['João "The Boss"', 'CEO'],
      ['Maria', 'Designer'],
    ])
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

  test('converte número', () => {
    expect(escapeCSVField(42)).toBe('"42"')
  })
})

describe('rowsToCSV', () => {
  test('gera string com header + linhas', () => {
    const csv = rowsToCSV([['Maria', 'm@x.com']], ['Nome', 'Email'])
    expect(csv).toContain('"Nome";"Email"')
    expect(csv).toContain('"Maria";"m@x.com"')
  })

  test('inclui BOM no início', () => {
    const csv = rowsToCSV([['x']], ['A'])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  test('omite header se não fornecido', () => {
    const csv = rowsToCSV([['a', 'b']])
    // sem headers, primeira (e única) linha é a de dados
    expect(csv.split('\n').length).toBe(1)
    expect(csv).toContain('"a";"b"')
  })
})
