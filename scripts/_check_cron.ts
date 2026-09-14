import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Tentar via PostgREST direto em cron.job (sem passar por exec_sql)
s.from('cron.job').select('jobname,schedule,active')
  .eq('jobname', 'enrich-cnpj-diario')
  .then(r => console.log('cron.job (REST):', JSON.stringify(r.data), 'err:', r.error?.message))

// Tentar cron.job_run_details para ver historico
s.from('cron.job_run_details').select('jobid,start_time,status')
  .order('start_time', { ascending: false })
  .limit(5)
  .then(r => console.log('cron.job_run_details:', JSON.stringify(r.data?.slice(0,3)), 'err:', r.error?.message))
