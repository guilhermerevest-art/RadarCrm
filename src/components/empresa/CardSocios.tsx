'use client'

import { Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { RadarObraSocio } from '@/lib/supabase/types'

interface CardSociosProps {
  socios: RadarObraSocio[]
  loading?: boolean
}

export function CardSocios({ socios, loading }: CardSociosProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!socios || socios.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" />
            Sócios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-2">
            Nenhum sócio cadastrado no Quadro Societário.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5" />
          Sócios ({socios.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {socios.map((socio, idx) => (
            <div key={socio.id || idx} className="pb-3 border-b last:border-0 last:pb-0">
              <p className="font-medium leading-tight">{socio.nome}</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {socio.qualificacao && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {socio.qualificacao}
                  </Badge>
                )}
                {socio.faixa_etaria && (
                  <Badge variant="secondary" className="text-xs font-normal">
                    {socio.faixa_etaria}
                  </Badge>
                )}
              </div>
              {socio.data_entrada && (
                <p className="text-xs text-muted-foreground mt-1">
                  Entrada: {new Date(socio.data_entrada).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
