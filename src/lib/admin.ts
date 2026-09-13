import { createClient } from './supabase/server'

/**
 * Verifica se o usuário atual é um admin global (papel admin E tenant NULL)
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .from('tenant_users')
    .select('papel, tenant_id')
    .eq('user_id', user.id)
    .single()

  return data?.papel === 'admin' && data?.tenant_id === null
}

/**
 * Verifica se o usuário atual é admin de um tenant específico
 */
export async function isTenantAdmin(tenantId: string): Promise<boolean> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .from('tenant_users')
    .select('papel')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .single()

  return data?.papel === 'admin'
}

/**
 * Obtém o tenant_id do usuário atual
 */
export async function getCurrentTenantId(): Promise<string | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single()

  return data?.tenant_id ?? null
}
