import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
async function main() {
  const { count } = await s.from('radar_obras').select('id', { count: 'exact', head: true }).not('responsavel_documento', 'is', null)
  console.log('ja preenchidos:', count)
}
main()
