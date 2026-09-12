/**
 * Criar tenant inicial para importação do CNO
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🔌 Conectando ao Supabase...');

  const tenantId = '00000000-0000-0000-0000-000000000000';

  const { data, error } = await supabase
    .from('tenants')
    .upsert({
      id: tenantId,
      nome: 'Importacao CNO',
      slug: 'import-cno',
      status: 'ativo'
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }

  console.log('✅ Tenant criado:', data);
}

main();
