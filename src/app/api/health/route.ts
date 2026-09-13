import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function GET() {
  const start = Date.now()
  let dbStatus: 'ok' | 'error' = 'ok'
  let dbLatency = 0

  try {
    const supabase = await createClient()
    const t0 = Date.now()
    const { error } = await supabase.from('tenants').select('id').limit(1)
    dbLatency = Date.now() - t0

    if (error) {
      dbStatus = 'error'
    }
  } catch {
    dbStatus = 'error'
  }

  const status = dbStatus === 'ok' ? 200 : 503

  return NextResponse.json(
    {
      status: dbStatus,
      version: process.env.npm_package_version ?? '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime?.() ?? 0,
      services: {
        database: {
          status: dbStatus,
          latency_ms: dbLatency,
        },
      },
      response_ms: Date.now() - start,
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      },
    }
  )
}
