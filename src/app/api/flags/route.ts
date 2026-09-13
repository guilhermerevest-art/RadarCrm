import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tenantId = searchParams.get('tenant_id')

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Parâmetro "tenant_id" é obrigatório' },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('fn_get_tenant_feature_flags', {
    p_tenant_id: tenantId,
  })

  if (error) {
    console.error('Erro ao buscar feature flags:', error)
    return NextResponse.json(
      { error: 'Erro interno' },
      { status: 500 }
    )
  }

  // Converter array para objeto { key: value }
  const flags: Record<string, any> = {}
  for (const row of data ?? []) {
    flags[row.key] = row.value
  }

  return NextResponse.json(flags)
}
