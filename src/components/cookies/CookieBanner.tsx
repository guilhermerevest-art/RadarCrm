'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { X } from 'lucide-react'

interface CookiePreferences {
  essenciais: boolean
  analiticos: boolean
  marketing: boolean
}

interface CookieBannerProps {
  onAccept?: () => void
}

export function CookieBanner({ onAccept }: CookieBannerProps) {
  const [show, setShow] = useState(false)
  const [preferences, setPreferences] = useState<CookiePreferences>({
    essenciais: true,
    analiticos: false,
    marketing: false,
  })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    // Verifica se já tem preferências salvas
    const checkPreferences = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setShow(true)
        return
      }

      const { data } = await supabase
        .from('banner_cookies')
        .select('preferences')
        .eq('user_id', user.id)
        .single()

      if (!data) {
        setShow(true)
      }
    }

    checkPreferences()
  }, [supabase])

  const handleSave = async (acceptAll: boolean) => {
    setSaving(true)

    const finalPreferences: CookiePreferences = acceptAll
      ? { essenciais: true, analiticos: true, marketing: true }
      : preferences

    try {
      // Salvar preferências
      await supabase.rpc('fn_save_cookie_preferences', {
        p_preferences: finalPreferences,
        p_ip: null, // IP será captado pelo servidor se necessário
      })

      // Aplicar preferências
      if (finalPreferences.analiticos) {
        // Ativar analytics (ex: PostHog)
        if (typeof window !== 'undefined' && (window as any). posthog) {
          (window as any).posthog.opt_in_capturing()
        }
      } else {
        if (typeof window !== 'undefined' && (window as any). posthog) {
          (window as any).posthog.opt_out_capturing()
        }
      }

      setShow(false)
      onAccept?.()
    } catch (error) {
      console.error('Erro ao salvar preferências de cookies:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!show) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background border-t shadow-lg">
      <div className="container max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="flex-1">
            <h3 className="font-semibold mb-1">🍪 Aviso de Cookies</h3>
            <p className="text-sm text-muted-foreground">
              Utilizamos cookies para melhorar sua experiência. Alguns são essenciais para o funcionamento
              do site, enquanto outros nos ajudam a entender como você usa a plataforma.
              {' '}
              <a href="/privacidade" className="text-primary hover:underline">
                Saiba mais
              </a>
            </p>
          </div>

          <div className="flex flex-col gap-2 w-full md:w-auto">
            {/* Preferências */}
            <div className="flex flex-wrap gap-4 p-3 bg-muted rounded-lg mb-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={preferences.essenciais}
                  onChange={(e) => setPreferences(p => ({ ...p, essenciais: e.target.checked }))}
                  className="rounded"
                  disabled
                />
                Essenciais
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={preferences.analiticos}
                  onChange={(e) => setPreferences(p => ({ ...p, analiticos: e.target.checked }))}
                  className="rounded"
                />
                Analíticos
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={preferences.marketing}
                  onChange={(e) => setPreferences(p => ({ ...p, marketing: e.target.checked }))}
                  className="rounded"
                />
                Marketing
              </label>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSave(false)}
                disabled={saving}
              >
                {saving ? 'Salvando...' : 'Salvar preferências'}
              </Button>
              <Button
                size="sm"
                onClick={() => handleSave(true)}
                disabled={saving}
              >
                Aceitar todos
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
