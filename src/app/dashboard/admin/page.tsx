import { AdminPanel } from '@/components/admin/AdminPanel'
import { isAdmin } from '@/lib/admin'

export default async function AdminPage() {
  // Verifica se é admin global (em produção, usar session)
  // Por enquanto, permite acesso - implementar verificação real depois
  return <AdminPanel />
}
