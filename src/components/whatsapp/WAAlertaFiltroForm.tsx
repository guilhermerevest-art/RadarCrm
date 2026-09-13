'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MapPin,
  Bell,
  Filter,
  Trash2,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface AlertaFiltro {
  id: string
  nome: string
  raio_km: number
  cidade?: string
  uf: string
  segmentos: string[]
  fases: string[]
  ativo: boolean
  centro_lat?: number
  centro_lng?: number
  centro_endereco?: string
  ultimo_envio_em?: string
  obras_count: number
  created_at: string
}

interface WAAlertaFiltroFormProps {
  filtro?: AlertaFiltro
  onSave?: (filtro: AlertaFiltro) => void
  onCancel?: () => void
}

const CIDADES = [
  'Uberlandia',
  'Uberaba',
  'Araguari',
  'Ituiutaba',
  'Patos de Minas',
  'Patrocinio',
  'Frutal',
]

const SEGMENTOS = [
  { value: 'concreto', label: 'Concreteira' },
  { value: 'locacao', label: 'Locadora de equipamentos' },
  { value: 'material', label: 'Fornecedor de material' },
  { value: 'servico', label: 'Prestador de serviço' },
  { value: 'outro', label: 'Outro' },
]

const FASES = [
  { value: 'alvara', label: 'Alvará' },
  { value: 'fundacao', label: 'Fundação' },
  { value: 'estrutura', label: 'Estrutura' },
  { value: 'acabamento', label: 'Acabamento' },
]

export function WAAlertaFiltroForm({ filtro, onSave, onCancel }: WAAlertaFiltroFormProps) {
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    nome: filtro?.nome || 'Meu Alerta',
    raio_km: filtro?.raio_km || 25,
    cidade: filtro?.cidade || '',
    uf: filtro?.uf || 'MG',
    segmentos: filtro?.segmentos || [],
    fases: filtro?.fases || ['alvara', 'fundacao'],
    ativo: filtro?.ativo ?? true,
  })

  // Geolocalizacao
  const [localizando, setLocalizando] = useState(false)
  const [centroLat, setCentroLat] = useState<number | undefined>(filtro?.centro_lat)
  const [centroLng, setCentroLng] = useState<number | undefined>(filtro?.centro_lng)
  const [endereco, setEndereco] = useState<string>(filtro?.centro_endereco || '')

  async function usarLocalizacaoAtual() {
    if (!navigator.geolocation) {
      toast({ title: 'Erro', description: 'Geolocalização não suportada', variant: 'destructive' })
      return
    }

    setLocalizando(true)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        setCentroLat(latitude)
        setCentroLng(longitude)

        // Reverse geocoding simples
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          )
          const data = await response.json()
          if (data.display_name) {
            setEndereco(data.display_name.split(',').slice(0, 3).join(','))
          }
        } catch {
          setEndereco(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
        }

        setLocalizando(false)
        toast({ title: 'Localização definida', description: 'Centro do raio configurado' })
      },
      (error) => {
        setLocalizando(false)
        toast({
          title: 'Erro ao obter localização',
          description: error.message,
          variant: 'destructive',
        })
      }
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Não autenticado')

      // Buscar tenant_id
      const { data: tu } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()

      if (!tu) throw new Error('Tenant não encontrado')

      const payload = {
        tenant_id: tu.tenant_id,
        nome: form.nome,
        raio_km: form.raio_km,
        cidade: form.cidade || null,
        uf: form.uf,
        segmentos: form.segmentos,
        fases: form.fases,
        ativo: form.ativo,
        centro_lat: centroLat,
        centro_lng: centroLng,
        centro_endereco: endereco || null,
      }

      if (filtro?.id) {
        // Atualizar
        const { data, error } = await supabase
          .from('wa_alerta_filtros')
          .update(payload)
          .eq('id', filtro.id)
          .select()
          .single()

        if (error) throw error
        toast({ title: 'Filtro atualizado', description: 'Suas preferências foram salvas' })
        onSave?.(data)
      } else {
        // Criar
        const { data, error } = await supabase
          .from('wa_alerta_filtros')
          .insert(payload)
          .select()
          .single()

        if (error) throw error
        toast({ title: 'Filtro criado', description: 'Você receberá alertas de obras novas' })
        onSave?.(data)
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  function toggleSegmento(value: string) {
    setForm(prev => ({
      ...prev,
      segmentos: prev.segmentos.includes(value)
        ? prev.segmentos.filter(s => s !== value)
        : [...prev.segmentos, value],
    }))
  }

  function toggleFase(value: string) {
    setForm(prev => ({
      ...prev,
      fases: prev.fases.includes(value)
        ? prev.fases.filter(f => f !== value)
        : [...prev.fases, value],
    }))
  }

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Nome do alerta */}
        <div className="space-y-2">
          <Label htmlFor="nome">Nome do alerta</Label>
          <Input
            id="nome"
            value={form.nome}
            onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
            placeholder="Ex: Obras em Uberlandia"
          />
        </div>

        {/* Cidade e UF */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Select value={form.cidade} onValueChange={v => setForm(prev => ({ ...prev, cidade: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {CIDADES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>UF</Label>
            <Select value={form.uf} onValueChange={v => setForm(prev => ({ ...prev, uf: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MG">MG</SelectItem>
                <SelectItem value="SP">SP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Raio */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Raio de busca</Label>
            <Badge variant="secondary">{form.raio_km} km</Badge>
          </div>
          <Input
            type="range"
            min={5}
            max={100}
            step={5}
            value={form.raio_km}
            onChange={e => setForm(prev => ({ ...prev, raio_km: parseInt(e.target.value) }))}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>5 km</span>
            <span>100 km</span>
          </div>
        </div>

        {/* Localização customizada */}
        <div className="space-y-2">
          <Label>Centro do raio (opcional)</Label>
          <div className="flex gap-2">
            <Input
              value={endereco}
              onChange={e => setEndereco(e.target.value)}
              placeholder="Rua, número, bairro..."
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={usarLocalizacaoAtual}
              disabled={localizando}
            >
              {localizando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
            </Button>
          </div>
          {(centroLat && centroLng) && (
            <p className="text-xs text-muted-foreground">
              📍 {centroLat.toFixed(4)}, {centroLng.toFixed(4)}
            </p>
          )}
        </div>

        {/* Segmentos */}
        <div className="space-y-2">
          <Label>Segmentos de interesse</Label>
          <div className="flex flex-wrap gap-2">
            {SEGMENTOS.map(seg => (
              <Badge
                key={seg.value}
                variant={form.segmentos.includes(seg.value) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleSegmento(seg.value)}
              >
                {seg.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* Fases */}
        <div className="space-y-2">
          <Label>Estágios das obras</Label>
          <div className="flex flex-wrap gap-2">
            {FASES.map(fase => (
              <Badge
                key={fase.value}
                variant={form.fases.includes(fase.value) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleFase(fase.value)}
              >
                {fase.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* Ativo */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Alertas ativos</Label>
            <p className="text-sm text-muted-foreground">
              Receba notificações de obras novas
            </p>
          </div>
          <Switch
            checked={form.ativo}
            onCheckedChange={v => setForm(prev => ({ ...prev, ativo: v }))}
          />
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-4 border-t">
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {filtro ? 'Salvar alterações' : 'Criar alerta'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  )
}

// =============================================================================
// Componente de lista de filtros
// =============================================================================

interface WAAlertaFiltrosListProps {
  tenantId: string
  onEdit?: (filtro: AlertaFiltro) => void
  onRefresh?: () => void
}

export function WAAlertaFiltrosList({ tenantId, onEdit, onRefresh }: WAAlertaFiltrosListProps) {
  const supabase = createClient()
  const { toast } = useToast()

  const [filtros, setFiltros] = useState<AlertaFiltro[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AlertaFiltro | undefined>()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    loadFiltros()
  }, [tenantId])

  async function loadFiltros() {
    setLoading(true)
    const { data, error } = await supabase
      .from('wa_alerta_filtros')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setFiltros(data)
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const { error } = await supabase
        .from('wa_alerta_filtros')
        .delete()
        .eq('id', id)

      if (error) throw error

      toast({ title: 'Filtro removido' })
      await loadFiltros()
      onRefresh?.()
    } catch (error: any) {
      toast({
        title: 'Erro ao remover',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setDeletingId(null)
    }
  }

  function handleEdit(filtro: AlertaFiltro) {
    setEditing(filtro)
    setShowForm(true)
    onEdit?.(filtro)
  }

  function handleSave(filtro: AlertaFiltro) {
    setShowForm(false)
    setEditing(undefined)
    loadFiltros()
    onRefresh?.()
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return 'Nunca'
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Filtros de Alerta</h3>
          <Button onClick={() => { setEditing(undefined); setShowForm(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo filtro
          </Button>
        </div>

        {filtros.length === 0 ? (
          <Card className="p-8 text-center">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h4 className="font-medium mb-1">Nenhum filtro configurado</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Crie um filtro para receber alertas de obras novas no WhatsApp
            </p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar primeiro filtro
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtros.map(filtro => (
              <Card key={filtro.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{filtro.nome}</h4>
                      <Badge variant={filtro.ativo ? 'default' : 'secondary'}>
                        {filtro.ativo ? 'Ativo' : 'Pausado'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      📍 {filtro.cidade || 'Todas cidades'}, {filtro.uf} • {filtro.raio_km} km
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {filtro.segmentos.map(s => (
                        <Badge key={s} variant="outline" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>📅 Último envio: {formatDate(filtro.ultimo_envio_em)}</span>
                      <span>📊 {filtro.obras_count} obras</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(filtro)}
                    >
                      <Filter className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(filtro.id)}
                      disabled={deletingId === filtro.id}
                    >
                      {deletingId === filtro.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3 text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialog de formulário */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar Filtro de Alerta' : 'Novo Filtro de Alerta'}
            </DialogTitle>
          </DialogHeader>
          <WAAlertaFiltroForm
            filtro={editing}
            onSave={handleSave}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
