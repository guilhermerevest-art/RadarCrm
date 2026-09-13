/**
 * Script de importação do CNO para o Supabase
 * Versão simples e robusta
 */

// @ts-nocheck - Script standalone, não faz parte do build do Next.js

import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'readline';
import { createReadStream } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const BATCH_SIZE = 500;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TENANT_ID = process.env.CNO_TENANT_ID || '00000000-0000-0000-0000-000000000000';

const supabase = createClient(supabaseUrl, supabaseKey);

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function mapCnoToObra(values: string[], headers: string[]): Record<string, unknown> {
  const row: Record<string, string> = {};
  headers.forEach((header, idx) => {
    row[header] = values[idx] || '';
  });

  const logradouro = [
    row['Tipo de logradouro'] || '',
    row['Logradouro'] || ''
  ].filter(Boolean).join(' ');

  const estado = (row['Estado'] || '').substring(0, 2).toUpperCase();
  const situacao = row['Situação'] || '';

  let status = 'ativa';
  if (situacao === '15') status = 'concluida';
  else if (situacao.includes('08') || situacao.includes('Baixado')) status = 'cancelada';

  const niResponsavel = row['NI do responsável'] || '';
  const cno = row['CNO'] || '';
  const hash = `${niResponsavel}-${cno}`.trim();

  return {
    tenant_id: TENANT_ID,
    fonte: 'cno',
    fonte_id: cno,
    endereco_logradouro: (logradouro || 'S/N').substring(0, 255),
    endereco_numero: (row['Nº do logradouro'] || row['Número do logradouro'] || '').substring(0, 20),
    endereco_bairro: (row['Bairro'] || '').substring(0, 100),
    endereco_cidade: (row['Nome do município'] || '').substring(0, 100),
    endereco_uf: estado || 'XX',
    endereco_cep: (row['CEP'] || '').replace(/\D/g, '').substring(0, 8),
    data_inicio: row['Data de início'] || null,
    porte: 'medio',
    descricao: ((row['Nome'] || '') + ' - ' + (row['Nome empresarial'] || '')).substring(0, 500),
    responsavel_nome: row['Nome'] || null,
    responsavel_documento: niResponsavel?.replace(/\D/g, '').slice(0, 18) || null,
    responsavel_qualificacao: row['Qualificação do responsável'] || null,
    status,
    qualidade_score: 50,
    hash_deduplicacao: hash,
    raw_payload: {
      responsavel: row['Nome'] || null,
      responsavel_documento: niResponsavel?.replace(/\D/g, '').slice(0, 18) || null,
      responsavel_qualificacao: row['Qualificação do responsável'] || null,
      ni_responsavel: niResponsavel,
      area_total: row['Área total'],
      situacao: row['Situação'],
      codigo_localizacao: row['Código de localização']
    }
  };
}

async function insertBatch(records: Record<string, unknown>[]) {
  if (records.length === 0) return { inserted: 0, skipped: 0 };

  const { error } = await supabase
    .from('radar_obras')
    .upsert(records, {
      onConflict: 'tenant_id,hash_deduplicacao',
      ignoreDuplicates: true
    });

  if (error) {
    console.error('Erro:', error.message);
    return { inserted: 0, skipped: records.length };
  }

  return { inserted: records.length, skipped: 0 };
}

async function main() {
  const filePath = process.argv[2] || 'cno.csv';

  console.log('='.repeat(60));
  console.log('🚀 Importador CNO → Supabase');
  console.log('='.repeat(60));
  console.log('');

  // Testa conexão
  console.log('🔌 Testando conexão...');
  const { error: connError } = await supabase.from('planos').select('count');
  if (connError) {
    console.error('❌ Erro de conexão:', connError.message);
    process.exit(1);
  }
  console.log('✅ Conexão OK\n');

  let batch: Record<string, unknown>[] = [];
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let lineNumber = 0;
  let headers: string[] = [];

  console.log('📊 Processando arquivo...\n');

  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    lineNumber++;

    // Primeira linha = header
    if (lineNumber === 1) {
      headers = parseCSVLine(line);
      process.stdout.write(`   Header: ${headers.length} colunas\n`);
      continue;
    }

    // Pula linhas vazias ou header duplicado
    if (!line.trim() || line.startsWith('"CNO"')) {
      continue;
    }

    const values = parseCSVLine(line);
    const cno = values[headers.indexOf('CNO')] || '';

    // Validação básica
    if (!cno || cno.length < 5) {
      continue;
    }

    try {
      const obra = mapCnoToObra(values, headers);
      batch.push(obra);

      if (batch.length >= BATCH_SIZE) {
        const result = await insertBatch(batch);
        totalInserted += result.inserted;
        totalSkipped += result.skipped;
        totalProcessed += batch.length;
        batch = [];

        if (lineNumber % 50000 === 0) {
          const progress = Math.round((lineNumber / 3600000) * 100);
          process.stdout.write(`\r   Linhas: ${lineNumber.toLocaleString()} | Progresso: ${progress}% | Inseridos: ${totalInserted.toLocaleString()}`);
        }
      }
    } catch (err) {
      // Ignora erros de parsing
    }
  }

  // Processa último batch
  if (batch.length > 0) {
    const result = await insertBatch(batch);
    totalInserted += result.inserted;
    totalSkipped += result.skipped;
    totalProcessed += batch.length;
  }

  console.log('\n');
  console.log('='.repeat(60));
  console.log('✅ IMPORTAÇÃO CONCLUÍDA');
  console.log('='.repeat(60));
  console.log(`   Total linhas: ${lineNumber.toLocaleString()}`);
  console.log(`   Processados: ${totalProcessed.toLocaleString()}`);
  console.log(`   Inseridos: ${totalInserted.toLocaleString()}`);
  console.log(`   Ignorados: ${totalSkipped.toLocaleString()}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
