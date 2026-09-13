'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function CrispChat() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const checkCrispEnabled = async () => {
      const supabase = createClient()

      // Obter tenant do usuário
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: tenantUser } = await supabase
        .from('tenant_users')
        .select('tenant_id, tenants!inner(plano)')
        .eq('user_id', user.id)
        .single()

      if (!tenantUser?.tenant_id) return

      // Verificar feature flag
      const { data: flagData } = await supabase.rpc('fn_get_feature_flag', {
        p_key: 'crisp_chat',
        p_tenant_id: tenantUser.tenant_id,
      })

      if (flagData?.value) {
        setEnabled(true)
      }
    }

    checkCrispEnabled()
  }, [])

  useEffect(() => {
    if (!enabled) return

    // Inicializar Crisp
    window.$crisp = window.$crisp || []
    window.$crisp.push(['do', 'chat:hide'])

    // Configurar widget ID do Crisp (substituir pelo ID real)
    window.$crisp.push(['config', 'token', 'YOUR_CRISP_TOKEN'])
    window.$crisp.push(['set', 'user:email', ['']])
    window.$crisp.push(['set', 'user:nickname', ['']])

    // Carregar script do Crisp
    const script = document.createElement('script')
    script.src = 'https://client.crisp.chat/l.js'
    script.async = true
    document.head.appendChild(script)

    return () => {
      // Cleanup se necessário
      const existingScript = document.querySelector('script[src*="crisp.chat"]')
      if (existingScript) {
        existingScript.remove()
      }
    }
  }, [enabled])

  return null
}

// Adicionar declaração de tipos para window.$crisp
declare global {
  interface Window {
    $crisp: any[]
    CRISP_WEBSITE_ID: string
  }
}
