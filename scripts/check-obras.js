require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: 'public' } }
);

async function run() {
  // Contar total de obras no tenant MVP
  const { count, error } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001');

  if (error) {
    console.error('Erro:', error.message);
    return;
  }

  console.log(`📊 Total de obras de Uberlandia (tenant MVP): ${count}`);

  // Verificar se tenant existe
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, nome, slug')
    .eq('slug', 'uberlandia-mvp')
    .single();

  console.log(`\n🏢 Tenant: ${tenant?.nome || 'não encontrado'}`);
}

run().catch(console.error);
