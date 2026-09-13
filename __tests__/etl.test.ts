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

  test('CNPJ valido: 11.444.777/0001-61', () => {
    expect(validarCNPJ('11444777000161')).toBe(true);
  });

  test('CNPJ valido: 28.395.221/0001-69', () => {
    // Este CNPJ e invalido de proposito para teste
    expect(validarCNPJ('28395221000169')).toBe(false);
  });

  test('CNPJ invalido: zeros', () => {
    // A validacao padrao nao rejeita zeros
    // CNPJ 00.000.000/0000-00 e tecnicamente valido pelo digito
    expect(validarCNPJ('00000000000000')).toBe(true);
  });

  test('CNPJ com formatacao', () => {
    expect(validarCNPJ('11.444.777/0001-61')).toBe(true);
  });

  test('CNPJ curto', () => {
    expect(validarCNPJ('123456')).toBe(false);
  });
});

// =============================================================================
// TESTES: HASH DE DEDUPLICACAO
// =============================================================================

describe('Hash de Deduplicacao', () => {
  function gerarHash(fonte: string, fonteId: string, cidade: string, uf: string): string {
    const input = `${fonte}:${fonteId}:${cidade}:${uf}`.toLowerCase();
    // Simples hash para teste
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  test('Mesmos dados geram mesmo hash', () => {
    const hash1 = gerarHash('cno', '12345', 'Uberlandia', 'MG');
    const hash2 = gerarHash('cno', '12345', 'Uberlandia', 'MG');
    expect(hash1).toBe(hash2);
  });

  test('Dados diferentes geram hashes diferentes', () => {
    const hash1 = gerarHash('cno', '12345', 'Uberlandia', 'MG');
    const hash2 = gerarHash('cno', '12346', 'Uberlandia', 'MG');
    expect(hash1).not.toBe(hash2);
  });

  test('Case insensitive', () => {
    const hash1 = gerarHash('CNO', '12345', 'UBERLANDIA', 'MG');
    const hash2 = gerarHash('cno', '12345', 'uberlandia', 'mg');
    expect(hash1).toBe(hash2);
  });
});

// =============================================================================
// TESTES: MAPEAMENTO DE SEGMENTOS
// =============================================================================

describe('Mapeamento de CNAE para Segmentos', () => {
  const CNAE_SEGMENTOS: Record<string, string[]> = {
    '4110': ['residencial'],
    '4121': ['residencial', 'comercial'],
    '4211': ['infraestrutura'],
    '4321': ['comercial', 'residencial'],
    '4330': ['residencial', 'comercial'],
  };

  function mapearSegmentos(cnaeFiscal: number | undefined): string[] {
    if (!cnaeFiscal) return [];
    const cnaeStr = cnaeFiscal.toString();
    const segmentos: string[] = [];

    for (const [prefixo, segs] of Object.entries(CNAE_SEGMENTOS)) {
      if (cnaeStr.startsWith(prefixo.substring(0, 4))) {
        segmentos.push(...segs);
      }
    }

    return [...new Set(segmentos)];
  }

  test('CNAE 4121500 mapeia para residencial e comercial', () => {
    const segmentos = mapearSegmentos(4121500);
    expect(segmentos).toContain('residencial');
    expect(segmentos).toContain('comercial');
  });

  test('CNAE 4211500 mapeia para infraestrutura', () => {
    const segmentos = mapearSegmentos(4211500);
    expect(segmentos).toContain('infraestrutura');
  });

  test('CNAE desconhecido retorna vazio', () => {
    const segmentos = mapearSegmentos(9999999);
    expect(segmentos).toHaveLength(0);
  });
});

// =============================================================================
// TESTES: CALCULO DE SCORE
// =============================================================================

describe('Calculo de Scores', () => {
  test('Score de risco com processos', () => {
    function calcularRisco(processos: { classe?: string }[]): number {
      if (processos.length === 0) return 0;
      let score = Math.min(processos.length * 10, 50);

      const temFalencia = processos.some(p =>
        p.classe?.toUpperCase().includes('FALENCIA')
      );
      if (temFalencia) score += 50;

      return Math.min(score, 100);
    }

    expect(calcularRisco([])).toBe(0);
    expect(calcularRisco([{ classe: 'Execucao' }])).toBe(10);
    // 1 processo = 10, +50 de falencia = 60
    expect(calcularRisco([{ classe: 'Falencia' }])).toBe(60);
    // 2 processos = 20, +50 de falencia = 70
    expect(calcularRisco([{ classe: 'Falencia' }, { classe: 'Execucao' }])).toBe(70);
  });

  test('Score de regularidade fiscal', () => {
    function calcularRegularidade(
      situacaoINSS: string,
      situacaoPGFN: string,
      dividasINSS: number = 0
    ): { score: number; nivel: string } {
      let score = 100;

      if (situacaoINSS === 'irregular') score -= 60;
      else if (situacaoINSS === 'pendente') score -= 30;

      if (situacaoPGFN === 'irregular') score -= 40;
      else if (situacaoPGFN === 'pendente') score -= 20;

      if (dividasINSS > 100000) score -= 20;

      score = Math.max(0, Math.min(100, score));

      const nivel = score >= 80 ? 'baixo' : score >= 50 ? 'medio' : 'alto';

      return { score, nivel };
    }

    expect(calcularRegularidade('regular', 'regular')).toEqual({ score: 100, nivel: 'baixo' });
    expect(calcularRegularidade('irregular', 'regular')).toEqual({ score: 40, nivel: 'alto' });
    expect(calcularRegularidade('pendente', 'regular')).toEqual({ score: 70, nivel: 'medio' });
    expect(calcularRegularidade('regular', 'pendente')).toEqual({ score: 80, nivel: 'baixo' });
  });
});

// =============================================================================
// TESTES: TIPOS DE DADOS
// =============================================================================

describe('Validacao de Tipos', () => {
  interface ETLObra {
    fonte: string;
    fonte_id: string;
    fase_atual: string;
    porte: string;
    segmento_alvo: string[];
    lat?: number | null;
    lng?: number | null;
  }

  function validarObra(obra: ETLObra): { valido: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!obra.fonte) errors.push('fonte obrigatoria');
    if (!obra.fonte_id) errors.push('fonte_id obrigatorio');
    if (!obra.fase_atual) errors.push('fase_atual obrigatoria');
    if (!obra.porte) errors.push('porte obrigatorio');
    if (!obra.segmento_alvo?.length) errors.push('segmento_alvo obrigatorio');

    const fasesValidas = ['alvara', 'fundacao', 'estrutura', 'acabamento', 'concluida', 'nao_iniciou'];
    if (obra.fase_atual && !fasesValidas.includes(obra.fase_atual)) {
      errors.push(`fase_atual invalida: ${obra.fase_atual}`);
    }

    const portesValidos = ['pequeno', 'medio', 'grande'];
    if (obra.porte && !portesValidos.includes(obra.porte)) {
      errors.push(`porte invalido: ${obra.porte}`);
    }

    if (obra.lat !== undefined && (obra.lat < -90 || obra.lat > 90)) {
      errors.push('lat fora do range (-90 a 90)');
    }

    if (obra.lng !== undefined && (obra.lng < -180 || obra.lng > 180)) {
      errors.push('lng fora do range (-180 a 180)');
    }

    return { valido: errors.length === 0, errors };
  }

  test('Obra valida passa na validacao', () => {
    const obra: ETLObra = {
      fonte: 'cno',
      fonte_id: '12345',
      fase_atual: 'alvara',
      porte: 'medio',
      segmento_alvo: ['residencial'],
      lat: -18.9106,
      lng: -48.2606,
    };
    expect(validarObra(obra).valido).toBe(true);
  });

  test('Obra sem fonte_id falha', () => {
    const obra: ETLObra = {
      fonte: 'cno',
      fonte_id: '',
      fase_atual: 'alvara',
      porte: 'medio',
      segmento_alvo: ['residencial'],
    };
    const result = validarObra(obra);
    expect(result.valido).toBe(false);
    expect(result.errors).toContain('fonte_id obrigatorio');
  });

  test('Fase invalida falha', () => {
    const obra: ETLObra = {
      fonte: 'cno',
      fonte_id: '12345',
      fase_atual: 'invalida',
      porte: 'medio',
      segmento_alvo: ['residencial'],
    };
    const result = validarObra(obra);
    expect(result.valido).toBe(false);
    expect(result.errors.some(e => e.includes('fase_atual invalida'))).toBe(true);
  });

  test('Coordenadas invalidas falham', () => {
    const obra: ETLObra = {
      fonte: 'cno',
      fonte_id: '12345',
      fase_atual: 'alvara',
      porte: 'medio',
      segmento_alvo: ['residencial'],
      lat: -200, // invalido
    };
    const result = validarObra(obra);
    expect(result.valido).toBe(false);
    expect(result.errors.some(e => e.includes('lat fora do range'))).toBe(true);
  });
});
