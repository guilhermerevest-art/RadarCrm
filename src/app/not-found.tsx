import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { MapPin, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <MapPin className="h-10 w-10 text-primary" />
        </div>
        <h1 className="font-heading text-6xl font-bold text-primary">404</h1>
        <h2 className="font-heading mt-4 text-2xl font-bold text-dark">
          Página não encontrada
        </h2>
        <p className="mt-3 text-muted-foreground">
          A obra que você procura pode ter sido realocada, removida ou nunca existiu.
        </p>
        <div className="mt-8 flex gap-2 justify-center">
          <Link href="/dashboard">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao Dashboard
            </Button>
          </Link>
          <Link href="/dashboard/radar">
            <Button variant="outline">
              Ver Radar de Obras
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
