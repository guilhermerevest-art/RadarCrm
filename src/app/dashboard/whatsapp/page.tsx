import { WhatsAppChat } from '@/components/whatsapp/WhatsAppChat'
import { MessageCircle } from 'lucide-react'

export default function WhatsAppPage() {
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-primary" />
          WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suas conversas WhatsApp em um só lugar
        </p>
      </div>

      <WhatsAppChat />
    </div>
  )
}
