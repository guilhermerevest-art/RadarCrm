import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { email, password, nome } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha obrigatórios' }, { status: 400 })
    }

    // Usa service_role para criar usuário (bypassa Auth público com problema)
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Cria usuário via admin API
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nome: nome || email.split('@')[0],
      },
    })

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }

    if (!userData.user) {
      return NextResponse.json({ error: 'Falha ao criar usuário' }, { status: 500 })
    }

    // Cria tenant e tenant_user em uma transação
    const tenantName = nome || email.split('@')[0]

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        nome: tenantName,
        email,
        plano: 'trial',
        ativo: true,
        trial_expira_em: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (tenantError) {
      console.error('Erro ao criar tenant:', tenantError)
    }

    if (tenant) {
      await supabaseAdmin.from('tenant_users').insert({
        tenant_id: tenant.id,
        user_id: userData.user.id,
        papel: 'admin',
        nome: tenantName,
        ativo: true,
      })
    }

    // Agora faz login do usuário na sessão
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {}
          },
        },
      }
    )

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      return NextResponse.json({
        user: userData.user,
        message: 'Conta criada, mas falha no login automático. Faça login manualmente.',
        warning: signInError.message,
      }, { status: 200 })
    }

    return NextResponse.json({
      user: userData.user,
      session: signInData.session,
      message: 'Conta criada com sucesso!',
    })

  } catch (error: any) {
    console.error('Erro no signup:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
