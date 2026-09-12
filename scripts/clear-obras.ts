import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('🗑️ Limpando tabela radar_obras...');

  // Delete all records with tenant_id = the import tenant
  const { error } = await supabase
    .from('radar_obras')
    .delete()
    .eq('tenant_id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('Erro ao limpar:', error.message);
  } else {
    console.log('✅ Tabela limpa!');
  }
}

main();
