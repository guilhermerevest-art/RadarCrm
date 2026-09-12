import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { count, error } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Erro:', error.message);
  } else {
    console.log('Total registros em radar_obras:', count);
  }
}

main();
