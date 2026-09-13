'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface FeatureFlags {
  [key: string]: boolean | number | string | object
}

interface UseFeatureFlagsOptions {
  tenantId?: string
  keys?: string[]
}

export function useFeatureFlags(options: UseFeatureFlagsOptions = {}) {
  const [flags, setFlags] = useState<FeatureFlags>({})
  const [loading, setLoading] = useState(true)

  const loadFlags = useCallback(async () => {
    const supabase = createClient()

    // Obter tenant do usuário se não fornecido
    let effectiveTenantId = options.tenantId

    if (!effectiveTenantId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: tenantUser } = await supabase
          .from('tenant_users')
          .select('tenant_id')
          .eq('user_id', user.id)
          .single()

        effectiveTenantId = tenantUser?.tenant_id
      }
    }

    if (!effectiveTenantId) {
      setLoading(false)
      return
    }

    // Buscar flags do tenant
    try {
      const { data, error } = await supabase.rpc('fn_get_tenant_feature_flags', {
        p_tenant_id: effectiveTenantId,
      })

      if (error) throw error

      const flagsObj: FeatureFlags = {}
      for (const row of data ?? []) {
        flagsObj[row.key] = row.value
      }

      setFlags(flagsObj)
    } catch (error) {
      console.error('Erro ao carregar feature flags:', error)
    } finally {
      setLoading(false)
    }
  }, [options.tenantId])

  useEffect(() => {
    loadFlags()
  }, [loadFlags])

  const isEnabled = useCallback((key: string, defaultValue = false): boolean => {
    const value = flags[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value > 0
    if (typeof value === 'string') return value === 'true' || value === '1'
    return defaultValue
  }, [flags])

  const getValue = useCallback(<T>(key: string, defaultValue: T): T => {
    const value = flags[key]
    if (value === undefined) return defaultValue
    return value as T
  }, [flags])

  return {
    flags,
    loading,
    isEnabled,
    getValue,
    refetch: loadFlags,
  }
}

// Hook simplificado para verificar uma única flag
export function useFeatureFlag(key: string, defaultValue = false) {
  const { flags, loading, isEnabled } = useFeatureFlags({ keys: [key] })
  return { value: isEnabled(key, defaultValue), loading }
}
