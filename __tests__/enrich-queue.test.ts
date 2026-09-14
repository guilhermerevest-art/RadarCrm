// =============================================================================
// ETL Tests - Radar CRM
// Testes unitarios para scripts ETL
// =============================================================================

import { describe, test, expect } from '@jest/globals';

// =============================================================================
// TESTES: VALIDACAO DE CNPJ
// =============================================================================

describe('Validacao de CNPJ', () => {
  // Funcao de validacao (copiada do receita-federal.ts)
  function validarCNPJ(cnpj: string): boolean {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return false;

    const calc = (nums: number[]): number => {
      const peso1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const peso2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

      let sum = 0;
      nums.slice(0, 12).forEach((n, i) => sum += n * peso1[i]);
      let remainder = sum % 11;
      let digit1 = remainder < 2 ? 0 : 11 - remainder;

      sum = 0;
      nums.slice(0, 13).forEach((n, i) => sum += n * peso2[i]);
      remainder = sum % 11;
      let digit2 = remainder < 2 ? 0 : 11 - remainder;

      return digit1 * 10 + digit2;
    };

    const nums = cnpjLimpo.split('').map(Number);
    const expected = calc(nums);
    const received = parseInt(cnpjLimpo.slice(-2));

    return received === expected;
  }

  test('CNPJ valido deve retornar true', () => {
    expect(validarCNPJ('11.222.333/0001-81')).toBe(true);
  });

  test('CNPJ invalido deve retornar false', () => {
    expect(validarCNPJ('11.222.333/0001-00')).toBe(false);
  });

  test('CNPJ com tamanho errado deve retornar false', () => {
    expect(validarCNPJ('123')).toBe(false);
  });
});

// =============================================================================
// TESTES: FILA DE ENRIQUECIMENTO DE CNPJ (espelho da logica do trigger SQL)
// =============================================================================

describe('Fila de enriquecimento de CNPJ', () => {
  // Logica pura espelhada do trigger SQL fn_enqueue_cnpj_on_obra_change()
  function extrairCnpj(documento: string | null): string | null {
    if (!documento) return null;
    const limpo = documento.replace(/\D/g, '');
    return limpo.length === 14 ? limpo : null;
  }

  function deveEnfileirar(args: {
    documento: string | null;
    status: string;
    jaEnriquecido: boolean;
    jaNaoEncontrado: boolean;
  }): boolean {
    const cnpj = extrairCnpj(args.documento);
    if (!cnpj) return false;
    if (args.status !== 'ativa') return false;
    if (args.jaEnriquecido || args.jaNaoEncontrado) return false;
    return true;
  }

  describe('extrairCnpj', () => {
    test('retorna CNPJ normalizado para 14 digitos', () => {
      expect(extrairCnpj('12.345.678/0001-90')).toBe('12345678000190');
      expect(extrairCnpj('12345678000190')).toBe('12345678000190');
    });

    test('retorna null para CPF (11 digitos)', () => {
      expect(extrairCnpj('123.456.789-09')).toBeNull();
    });

    test('retorna null para string vazia ou null', () => {
      expect(extrairCnpj(null)).toBeNull();
      expect(extrairCnpj('')).toBeNull();
      expect(extrairCnpj('   ')).toBeNull();
    });

    test('retorna null para documento com tamanho invalido', () => {
      expect(extrairCnpj('123')).toBeNull();
      expect(extrairCnpj('123456789012345')).toBeNull();
    });
  });

  describe('deveEnfileirar', () => {
    const baseDoc = '12345678000190';

    test('enfileira CNPJ de obra ativa nao enriquecido', () => {
      expect(deveEnfileirar({
        documento: baseDoc,
        status: 'ativa',
        jaEnriquecido: false,
        jaNaoEncontrado: false,
      })).toBe(true);
    });

    test('nao enfileira obra inativa', () => {
      expect(deveEnfileirar({
        documento: baseDoc,
        status: 'inativa',
        jaEnriquecido: false,
        jaNaoEncontrado: false,
      })).toBe(false);
    });

    test('nao enfileira obra ja enriquecida', () => {
      expect(deveEnfileirar({
        documento: baseDoc,
        status: 'ativa',
        jaEnriquecido: true,
        jaNaoEncontrado: false,
      })).toBe(false);
    });

    test('nao enfileira obra marcada como nao_encontrado', () => {
      expect(deveEnfileirar({
        documento: baseDoc,
        status: 'ativa',
        jaEnriquecido: false,
        jaNaoEncontrado: true,
      })).toBe(false);
    });

    test('nao enfileira CPF (11 digitos)', () => {
      expect(deveEnfileirar({
        documento: '12345678909',
        status: 'ativa',
        jaEnriquecido: false,
        jaNaoEncontrado: false,
      })).toBe(false);
    });
  });

  describe('selecao de modo da Edge Function', () => {
    function selecionarModo(body: unknown): 'queue' | 'legacy' {
      if (body && typeof body === 'object' && 'mode' in body) {
        const m = (body as { mode: unknown }).mode;
        if (m === 'queue' || m === 'legacy') return m;
      }
      return 'legacy';
    }

    test('mode=queue explicitamente solicitado', () => {
      expect(selecionarModo({ mode: 'queue' })).toBe('queue');
    });

    test('mode=legacy explicitamente solicitado', () => {
      expect(selecionarModo({ mode: 'legacy' })).toBe('legacy');
    });

    test('sem param mode -> default legacy (compat)', () => {
      expect(selecionarModo({})).toBe('legacy');
      expect(selecionarModo(null)).toBe('legacy');
      expect(selecionarModo({ limit: 100 })).toBe('legacy');
    });

    test('mode invalido -> default legacy', () => {
      expect(selecionarModo({ mode: 'foo' })).toBe('legacy');
    });
  });
});
