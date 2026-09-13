require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: 'public' } }
);

async function run() {
  const sqlPath = path.join(__dirname, 'supabase/migrations/004_mvp_uberlandia.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Executando migration 004_mvp_uberlandia.sql...');

  // Dividir em statements separados e executar um a um
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    const { error } = await supabase.rpc('pg_catalog.eval', { sql: stmt });
    if (error) {
      console.log('Erro no statement:', stmt.substring(0, 60) + '...');
      console.log('Erro:', error.message);
    }
  }

  console.log('✅ Migration executada!');

  // Agora verificar quantas obras existem
  const { count } = await supabase
    .from('radar_obras')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 Total de obras no banco: ${count}`);
}

run().catch(console.error);
