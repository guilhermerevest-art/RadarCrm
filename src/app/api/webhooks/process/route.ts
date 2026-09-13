// =============================================================================
// API Route: Process Webhooks
// Pode ser chamada por cron job para processar webhooks pendentes
// GET /api/webhooks/process
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServer } from '@/lib/supabase/server'
import { processWebhooks, cleanupOldLogs } from '@/lib/webhook-sender'

export const runtime = 'edge'

// Apenas permite chamada interna (com API key do sistema) ou cron
async function verifyCronSecret(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('Authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) return false
  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const action = url.searchParams.get('action') || 'process'

  // Verificar se e chamada legitima
  const isCron = await verifyCronSecret(request)

  if (!isCron) {
    // Verificar se e admin (para testes manuais)
    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: tenantUser } = await supabase
      .from('tenant_users')
      .select('papel')
      .eq('user_id', user.id)
      .eq('papel', 'admin')
      .single()

    if (!tenantUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  try {
    if (action === 'process') {
      const result = await processWebhooks()
      return NextResponse.json({
        success: true,
        action: 'process',
        ...result,
        timestamp: new Date().toISOString(),
      })
    }

    if (action === 'cleanup') {
      const deleted = await cleanupOldLogs()
      return NextResponse.json({
        success: true,
        action: 'cleanup',
        deleted,
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('[Webhook Process] Error:', error)
    return NextResponse.json(
      { error: 'Internal error', details: String(error) },
      { status: 500 }
    )
  }
}
