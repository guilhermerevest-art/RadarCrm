/**
 * ============================================================
 * RADAR CRM - Script de Geocoding em Lote
 * ============================================================
 *
 * Geocodifica enderecos de obras que ainda nao tem lat/lng
 * Usa a funcao fn_geocoding_resolver do banco
 *
 * Uso: npx tsx scripts/etl/geocode-batch.ts [tenant_id] [limite]
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

interface GeocodeResult {
  obra_id: string;
  endereco: string;
  lat: number | null;
  lng: number | null;
  provider: string;
  precisao: string;
  sucesso: boolean;
  error?: string;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tenantId = process.env.DEFAULT_TENANT_ID || process.argv[2];
  const limite = parseInt(process.argv[3] || '100', 10);

  if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variables de ambiente obrigatorias');
    console.error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('='.repeat(60));
  console.log('GEOCODING EM LOTE');
  console.log('='.repeat(60));
  console.log(`Limite: ${limite}`);
  console.log(`Tenant: ${tenantId || 'todos'}`);
  console.log('');

  // Buscar obras sem geocoding
  let query = supabase
    .from('radar_obras')
    .select('id, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf')
    .is('lat', null)
    .is('lng', null)
    .limit(limite);

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data: obras, error } = await query;

  if (error) {
    console.error('Erro ao buscar obras:', error.message);
    process.exit(1);
  }

  if (!obras || obras.length === 0) {
    console.log('Nenhuma obra para geocodificar.');
    process.exit(0);
  }

  console.log(`Obras para geocodificar: ${obras.length}`);
  console.log('');

  const results: GeocodeResult[] = [];
  let sucesso = 0;
  let falhas = 0;

  for (const obra of obras) {
    const endereco = [
      obra.endereco_logradouro,
      obra.endereco_numero,
      obra.endereco_bairro,
      obra.endereco_cidade,
      obra.endereco_uf,
    ].filter(Boolean).join(', ');

    try {
      // Chamar funcao RPC de geocoding
      const { data: geocodeResult, error: geoError } = await supabase.rpc('fn_geocoding_resolver', {
        endereco: endereco,
      });

      if (geoError || !geocodeResult || geocodeResult.error) {
        results.push({
          obra_id: obra.id,
          endereco,
          lat: null,
          lng: null,
          provider: 'erro',
          precisao: 'erro',
          sucesso: false,
          error: geoError?.message || geocodeResult?.error || 'Erro desconhecido',
        });
        falhas++;
      } else {
        // Atualizar obra com coordenadas
        const { error: updateError } = await supabase
          .from('radar_obras')
          .update({
            lat: geocodeResult.lat,
            lng: geocodeResult.lng,
            geo: geocodeResult.lat ? `POINT(${geocodeResult.lng} ${geocodeResult.lat})` : null,
          })
          .eq('id', obra.id);

        // Atualizar obra global tambem
        await supabase
          .from('radar_obras_globais')
          .update({
            lat: geocodeResult.lat,
            lng: geocodeResult.lng,
          })
          .eq('id', obra.id);

        if (updateError) {
          results.push({
            obra_id: obra.id,
            endereco,
            lat: null,
            lng: null,
            provider: geocodeResult.provider,
            precisao: geocodeResult.precisao || 'erro',
            sucesso: false,
            error: updateError.message,
          });
          falhas++;
        } else {
          results.push({
            obra_id: obra.id,
            endereco,
            lat: geocodeResult.lat,
            lng: geocodeResult.lng,
            provider: geocodeResult.provider,
            precisao: geocodeResult.precisao || 'desconhecida',
            sucesso: true,
          });
          sucesso++;
        }
      }
    } catch (err) {
      results.push({
        obra_id: obra.id,
        endereco,
        lat: null,
        lng: null,
        provider: 'erro',
        precisao: 'erro',
        sucesso: false,
        error: String(err),
      });
      falhas++;
    }

    // Rate limiting: esperar 200ms entre requisicoes
    await new Promise(resolve => setTimeout(resolve, 200));

    // Progress
    process.stdout.write(`\rProgress: ${sucesso + falhas}/${obras.length} | Sucesso: ${sucesso} | Falhas: ${falhas}`);
  }

  console.log('');
  console.log('');
  console.log('='.repeat(60));
  console.log('RESULTADO');
  console.log('='.repeat(60));
  console.log(`Total processado: ${obras.length}`);
  console.log(`Sucesso: ${sucesso}`);
  console.log(`Falhas: ${falhas}`);
  console.log('');

  // Mostrar algumas falhas
  const falhasList = results.filter(r => !r.sucesso).slice(0, 5);
  if (falhasList.length > 0) {
    console.log('Exemplos de falhas:');
    for (const f of falhasList) {
      console.log(`  - ${f.endereco.substring(0, 50)}...`);
      console.log(`    Erro: ${f.error}`);
    }
  }

  console.log('='.repeat(60));
  process.exit(falhas > sucesso ? 1 : 0);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
