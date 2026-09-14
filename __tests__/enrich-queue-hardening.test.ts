// =============================================================================
// ETL Tests - Radar CRM - Hardening da fila de enriquecimento
// =============================================================================

import { describe, test, expect } from '@jest/globals';

const MAX_ATTEMPTS = 5;

describe('Limite de retries do enriquecimento', () => {
  function deveDesistir(attempts: number): boolean {
    return attempts >= MAX_ATTEMPTS;
  }

  function classificarItem(attempts: number, idadeMinutos: number): {
    categoria: 'pendente_novo' | 'em_retry' | 'desistiu' | 'preso';
    deveDesistir: boolean;
  } {
    if (attempts >= MAX_ATTEMPTS) {
      return { categoria: 'desistiu', deveDesistir: true };
    }
    if (attempts > 0) {
      return { categoria: 'em_retry', deveDesistir: false };
    }
    if (idadeMinutos >= 60) {
      return { categoria: 'preso', deveDesistir: false };
    }
    return { categoria: 'pendente_novo', deveDesistir: false };
  }

  describe('deveDesistir', () => {
    test('desiste apos 5 tentativas', () => {
      expect(deveDesistir(5)).toBe(true);
    });
    test('desiste apos mais de 5', () => {
      expect(deveDesistir(7)).toBe(true);
    });
    test('nao desiste com menos de 5', () => {
      expect(deveDesistir(4)).toBe(false);
      expect(deveDesistir(0)).toBe(false);
    });
  });

  describe('classificarItem', () => {
    test('attempts >= 5 -> desistiu', () => {
      expect(classificarItem(5, 30).categoria).toBe('desistiu');
    });
    test('attempts 1..4 -> em_retry', () => {
      expect(classificarItem(1, 10).categoria).toBe('em_retry');
      expect(classificarItem(4, 10).categoria).toBe('em_retry');
    });
    test('attempts 0 e idade < 60min -> pendente_novo', () => {
      expect(classificarItem(0, 0).categoria).toBe('pendente_novo');
      expect(classificarItem(0, 59).categoria).toBe('pendente_novo');
    });
    test('attempts 0 e idade >= 60min -> preso (fila travada)', () => {
      expect(classificarItem(0, 60).categoria).toBe('preso');
      expect(classificarItem(0, 120).categoria).toBe('preso');
    });
  });
});
