'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MinhaPontuacao } from '@/components/marcacao/MinhaPontuacao'

export default function PontuacaoPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Sua contribuição</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Veja sua pontuação, badges conquistados e ajude a construir um banco de dados confiável de obras.
        </p>
      </div>

      {userId ? (
        <MinhaPontuacao userId={userId} />
      ) : (
        <div className="text-center text-muted-foreground">Carregando...</div>
      )}
    </div>
  )
}
