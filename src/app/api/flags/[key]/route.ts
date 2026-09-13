import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  if (!key) {
    return NextResponse.json(
      { error: 'Parâmetro "key" é obrigatório' },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('fn_get_feature_flag', {
    p_key: key,
    p_tenant_id: null,
  })

  if (error) {
    console.error('Erro ao buscar feature flag:', error)
    return NextResponse.json(
      { error: 'Erro interno' },
      { status: 500 }
    )
  }

  return NextResponse.json(data)
}
