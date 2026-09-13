'use client'

import { WhatsAppSetup } from '@/components/whatsapp/WhatsAppSetup'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { redirect } from 'next/navigation'

export default function WhatsAppAdminPage() {
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadTenant = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        redirect('/login')
        return
      }

      const { data } = await supabase
        .from('tenant_users')
        .select('tenant_id, papel')
        .eq('user_id', user.id)
        .single()

      if (!data || data.papel !== 'admin') {
        redirect('/dashboard')
        return
      }

      setTenantId(data.tenant_id)
      setLoading(false)
    }

    loadTenant()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!tenantId) return null

  return (
    <div className="max-w-2xl">
      <WhatsAppSetup tenantId={tenantId} />
    </div>
  )
}
