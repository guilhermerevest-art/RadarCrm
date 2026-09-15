// =============================================================================
// Testes: Templates utils (render + extract + variáveis conhecidas)
// =============================================================================

import { describe, test, expect } from '@jest/globals'
import { renderTemplate, extractTemplateVars, VARIAVEIS_CONHECIDAS } from '../src/lib/templates'

describe('renderTemplate', () => {
  test('substitui variável simples', () => {
    expect(renderTemplate('Olá {nome}!', { nome: 'João' })).toBe('Olá João!')
  })

  test('substitui múltiplas variáveis', () => {
    expect(renderTemplate('{nome} de {empresa}', { nome: 'Ana', empresa: 'ACME' })).toBe(
      'Ana de ACME'
    )
  })

  test('preserva placeholder se variável ausente', () => {
    expect(renderTemplate('Oi {nome}', {})).toBe('Oi {nome}')
  })

  test('trata undefined e null e empty string', () => {
    expect(renderTemplate('{a}/{b}', { a: 'X', b: undefined })).toBe('X/{b}')
    expect(renderTemplate('{a}', { a: '' })).toBe('{a}')
    expect(renderTemplate('{a}', { a: null })).toBe('{a}')
  })

  test('texto sem variáveis retorna igual', () => {
    expect(renderTemplate('Apenas texto fixo', { nome: 'João' })).toBe('Apenas texto fixo')
  })
})

describe('extractTemplateVars', () => {
  test('extrai variáveis únicas', () => {
    expect(extractTemplateVars('{nome} e {nome} de {empresa}').sort()).toEqual([
      'empresa',
      'nome',
    ])
  })

  test('retorna lista vazia', () => {
    expect(extractTemplateVars('texto sem variavel')).toEqual([])
  })

  test('ordem é estável', () => {
    expect(extractTemplateVars('{a}{b}{c}{d}')).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('VARIAVEIS_CONHECIDAS', () => {
  test('contém variáveis padrão', () => {
    expect(VARIAVEIS_CONHECIDAS).toContain('nome')
    expect(VARIAVEIS_CONHECIDAS).toContain('empresa')
    expect(VARIAVEIS_CONHECIDAS).toContain('obra')
    expect(VARIAVEIS_CONHECIDAS).toContain('telefone')
    expect(VARIAVEIS_CONHECIDAS).toContain('cidade')
  })
})
