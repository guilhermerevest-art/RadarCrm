import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { whatsappProvider } from '@/lib/whatsapp-provider'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }

    const { telefone, conteudo, tipo, instanceId, leadId, dealId } = await req.json()

    if (!telefone || !conteudo) {
      return NextResponse.json({ success: false, error: 'telefone e conteudo são obrigatórios' }, { status: 400 })
    }

    // Pegar tenant do user
    const { data: tu } = await supabase
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!tu) {
      return NextResponse.json({ success: false, error: 'Tenant não encontrado' }, { status: 403 })
    }

    // Pegar instance ativa se não informada
    let targetInstanceId = instanceId
    if (!targetInstanceId) {
      const instance = await whatsappProvider.getActiveInstance(tu.tenant_id)
      if (!instance) {
        return NextResponse.json({ success: false, error: 'WhatsApp não configurado ou desconectado' }, { status: 400 })
      }
      targetInstanceId = instance.id
    }

    // Enviar via Evolution API
    const result = await whatsappProvider.sendMessage({
      instanceId: targetInstanceId,
      telefone,
      conteudo,
      tipo: tipo ?? 'text',
      leadId,
      dealId,
    })

    if (result.success) {
      return NextResponse.json({ success: true, messageId: result.messageId })
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
