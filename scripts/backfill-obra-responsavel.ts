/**
 * Backfill: copia nome/documento/qualificação do raw_payload para colunas top-level
 * de obras que já foram importadas antes desta migration (014).
 *
 * Uso: tsx scripts/backfill-obra-responsavel.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log('🔍 Buscando obras com dados do responsável no raw_payload...');

  let offset = 0;
  const PAGE = 500;
  let total = 0;
  let atualizadas = 0;

  while (true) {
    const { data, error } = await supabase
      .from('radar_obras')
      .select('id, raw_payload, responsavel_nome, responsavel_documento, responsavel_qualificacao')
      .not('raw_payload', 'is', null)
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error('Erro:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    total += data.length;

    for (const obra of data) {
      const rp = obra.raw_payload as any;
      const updates: Record<string, unknown> = {};
      const nome = rp?.responsavel || rp?.Nome;
      const doc = rp?.responsavel_documento || rp?.ni_responsavel;
      const qualif = rp?.responsavel_qualificacao || rp?.Qualificação_do_responsável;

      if (nome && !obra.responsavel_nome) updates.responsavel_nome = String(nome).slice(0, 200);
      if (doc && !obra.responsavel_documento) {
        const limpo = String(doc).replace(/\D/g, '').slice(0, 18);
        if (limpo) updates.responsavel_documento = limpo;
      }
      if (qualif && !obra.responsavel_qualificacao) {
        updates.responsavel_qualificacao = String(qualif).slice(0, 50);
      }

      if (Object.keys(updates).length > 0) {
        const { error: upErr } = await supabase
          .from('radar_obras')
          .update(updates)
          .eq('id', obra.id);
        if (upErr) {
          console.error(`❌ ${obra.id}:`, upErr.message);
        } else {
          atualizadas++;
        }
      }
    }

    offset += PAGE;
    console.log(`  processadas ${total} | atualizadas ${atualizadas}`);
  }

  console.log('');
  console.log('====================================');
  console.log(`✅ Backfill concluído`);
  console.log(`   Total processadas: ${total}`);
  console.log(`   Atualizadas: ${atualizadas}`);
  console.log('====================================');
}

main();
