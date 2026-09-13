import { createClient as createSupabaseServer } from '@/lib/supabase/server'
import ApiConfiguracao from '@/components/dashboard/ApiConfiguracao'

export const metadata = {
  title: 'Configuracoes de API - Radar CRM',
  description: 'Gerencie API keys e webhooks',
}

export default async function ApiPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Voce precisa estar logado para acessar esta pagina.</p>
      </div>
    )
  }

  // Verificar se e admin
  const { data: tenantUser } = await supabase
    .from('tenant_users')
    .select('tenant_id, papel')
    .eq('user_id', user.id)
    .eq('papel', 'admin')
    .single()

  if (!tenantUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-destructive font-medium">Acesso Restrito</p>
          <p className="text-muted-foreground mt-2">
            Apenas administradores podem acessar as configuracoes de API.
          </p>
        </div>
      </div>
    )
  }

  return <ApiConfiguracao />
}
