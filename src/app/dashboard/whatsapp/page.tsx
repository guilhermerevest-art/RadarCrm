'use client'

import { WhatsAppChat } from '@/components/whatsapp/WhatsAppChat'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageCircle, Bell, Activity, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function WhatsAppPage() {
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-primary" />
          WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suas conversas WhatsApp em um só lugar
        </p>
      </div>

      {/* Cards de navegação rápida */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 hover:shadow-md transition-shadow">
          <Link href="/dashboard/whatsapp/alertas" className="block">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Alertas de Obras</h3>
                <p className="text-sm text-muted-foreground">
                  Configure filtros para receber obras novas
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow">
          <Link href="/dashboard/whatsapp/alertas" className="block">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
                <Activity className="h-6 w-6 text-green-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Saúde da Conta</h3>
                <p className="text-sm text-muted-foreground">
                  Métricas e status da sua conexão
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow">
          <Link href="/dashboard/admin/whatsapp" className="block">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10">
                <MessageCircle className="h-6 w-6 text-secondary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Configurar</h3>
                <p className="text-sm text-muted-foreground">
                  Gerenciar instâncias e templates
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        </Card>
      </div>

      {/* Chat principal */}
      <WhatsAppChat />
    </div>
  )
}
