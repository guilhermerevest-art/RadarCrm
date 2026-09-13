import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import fs from 'fs'
config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function main() {
  const supabase = createClient(URL, SERVICE)
  // O Supabase guarda a anon key publica derivada do JWT
  // Vou ler do secrets manager do projeto via API HTTP
  const r = await fetch(`${URL}/auth/v1/settings`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  })
  const j: any = await r.json()
  console.log('settings keys:', Object.keys(j))

  // Tenta via management API
  const projRef = URL.replace('https://', '').replace('.supabase.co', '')
  const mgmt = await fetch(`https://api.supabase.com/v1/projects/${projRef}/api-keys`, {
    headers: { Authorization: `Bearer ${SERVICE}` },
  })
  console.log('mgmt status:', mgmt.status)
  const mj: any = await mgmt.json()
  console.log('api keys:', mj)
}

main().catch(e => console.error(e))
