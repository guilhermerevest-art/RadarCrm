import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && user) {
      // Verifica se o usuário já tem tenant
      const { data: tu } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()

      if (!tu) {
        // Redireciona para completar onboarding
        return NextResponse.redirect(`${origin}/signup`)
      }

      return NextResponse.redirect(`${origin}${redirect}`)
    }
  }

  // Erro ou sem código
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
