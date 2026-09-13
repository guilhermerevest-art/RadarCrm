'use client'

import { RadarRotaDia } from '@/components/radar/RadarRotaDia'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default function RotaPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/dashboard/radar">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar ao Radar
          </Button>
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-dark">
          Rota do Dia
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Planeje sua rota de visitas com as melhores oportunidades do dia
        </p>
      </div>

      <RadarRotaDia />
    </div>
  )
}
