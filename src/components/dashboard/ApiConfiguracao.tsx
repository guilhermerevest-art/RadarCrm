'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Tipos
interface ApiKey {
  id: string
  tenant_id: string
  nome: string
  prefixo: string
  escopo: string[]
  ativo: boolean
  ultimo_uso: string | null
  expira_em: string | null
  created_at: string
  key?: string
}

interface Webhook {
  id: string
  tenant_id: string
  nome: string
  url: string
  secret_hmac: string
  eventos: string[]
  ativo: boolean
  created_at: string
}

const EVENTOS_DISPONIVEIS = [
  { value: 'obra.nova', label: 'Nova obra detectada' },
  { value: 'obra.atualizada', label: 'Obra atualizada' },
  { value: 'lead.criado', label: 'Lead criado' },
  { value: 'lead.atualizado', label: 'Lead atualizado' },
  { value: 'lead.convertido', label: 'Lead convertido' },
  { value: 'deal.criado', label: 'Deal criado' },
  { value: 'deal.ganho', label: 'Deal ganho' },
  { value: 'deal.perdido', label: 'Deal perdido' },
  { value: 'visita.registrada', label: 'Visita registrada' },
  { value: 'whatsapp.mensagem', label: 'Mensagem WhatsApp' },
]

// Componente principal
export default function ApiConfiguracao() {
  const [activeTab, setActiveTab] = useState<'apikeys' | 'webhooks'>('apikeys')
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal states
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [showWebhookModal, setShowWebhookModal] = useState(false)
  const [newApiKey, setNewApiKey] = useState<ApiKey | null>(null)

  useEffect(() => {
    loadData()
  }, [activeTab])

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      if (activeTab === 'apikeys') {
        const res = await fetch('/api/api-keys')
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        setApiKeys(json.data || [])
      } else {
        const res = await fetch('/api/webhooks')
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        setWebhooks(json.data || [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  async function createApiKey(data: { nome: string; escopo: string; expira_em?: string }) {
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)

      setNewApiKey(json.data)
      setShowApiKeyModal(false)
      loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao criar API key')
    }
  }

  async function revokeApiKey(id: string) {
    if (!confirm('Tem certeza que deseja revogar esta API key?')) return

    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao revogar API key')
    }
  }

  async function createWebhook(data: { nome: string; url: string; eventos: string[] }) {
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)

      setShowWebhookModal(false)
      loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao criar webhook')
    }
  }

  async function deleteWebhook(id: string) {
    if (!confirm('Tem certeza que deseja deletar este webhook?')) return

    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao deletar webhook')
    }
  }

  async function toggleWebhook(id: string, ativo: boolean) {
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao atualizar webhook')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuracoes de API</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie chaves de API e webhooks para integracoes externas
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b">
        <button
          onClick={() => setActiveTab('apikeys')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'apikeys'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          API Keys
        </button>
        <button
          onClick={() => setActiveTab('webhooks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'webhooks'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Webhooks
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">{error}</div>
      ) : activeTab === 'apikeys' ? (
        <ApiKeysTab
          keys={apiKeys}
          onCreate={() => setShowApiKeyModal(true)}
          onRevoke={revokeApiKey}
        />
      ) : (
        <WebhooksTab
          webhooks={webhooks}
          onCreate={() => setShowWebhookModal(true)}
          onDelete={deleteWebhook}
          onToggle={toggleWebhook}
        />
      )}

      {/* Modals */}
      {showApiKeyModal && (
        <ApiKeyModal
          onClose={() => setShowApiKeyModal(false)}
          onCreate={createApiKey}
        />
      )}

      {newApiKey && (
        <ApiKeyCreatedModal
          apiKey={newApiKey}
          onClose={() => setNewApiKey(null)}
        />
      )}

      {showWebhookModal && (
        <WebhookModal
          onClose={() => setShowWebhookModal(false)}
          onCreate={createWebhook}
          eventosDisponiveis={EVENTOS_DISPONIVEIS}
        />
      )}
    </div>
  )
}

// API Keys Tab
function ApiKeysTab({
  keys,
  onCreate,
  onRevoke,
}: {
  keys: ApiKey[]
  onCreate: () => void
  onRevoke: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">API Keys</h2>
          <p className="text-sm text-muted-foreground">
            Use API keys para acessar programaticamente a API do Radar CRM
          </p>
        </div>
        <button onClick={onCreate} className="btn btn-primary">
          Nova API Key
        </button>
      </div>

      {keys.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <p className="text-muted-foreground">Nenhuma API key criada</p>
          <button onClick={onCreate} className="btn btn-primary mt-4">
            Criar primeira API key
          </button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Nome</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Prefixo</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Escopo</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Ultimo Uso</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {keys.map((key) => (
                <tr key={key.id}>
                  <td className="px-4 py-3 text-sm">{key.nome}</td>
                  <td className="px-4 py-3 text-sm font-mono">
                    {key.prefixo}-****
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-flex gap-1">
                      {key.escopo.map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 text-xs rounded bg-muted"
                        >
                          {s}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {key.ultimo_uso
                      ? format(new Date(key.ultimo_uso), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                      : 'Nunca'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {key.ativo ? (
                      <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-800">
                        Ativa
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-800">
                        Revogada
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {key.ativo && (
                      <button
                        onClick={() => onRevoke(key.id)}
                        className="text-sm text-destructive hover:underline"
                      >
                        Revogar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Webhooks Tab
function WebhooksTab({
  webhooks,
  onCreate,
  onDelete,
  onToggle,
}: {
  webhooks: Webhook[]
  onCreate: () => void
  onDelete: (id: string) => void
  onToggle: (id: string, ativo: boolean) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Webhooks</h2>
          <p className="text-sm text-muted-foreground">
            Receba notificacoes em tempo real quando eventos ocorrerem
          </p>
        </div>
        <button onClick={onCreate} className="btn btn-primary">
          Novo Webhook
        </button>
      </div>

      {webhooks.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <p className="text-muted-foreground">Nenhum webhook configurado</p>
          <button onClick={onCreate} className="btn btn-primary mt-4">
            Criar primeiro webhook
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {webhooks.map((webhook) => (
            <div key={webhook.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{webhook.nome}</h3>
                    <span
                      className={`px-2 py-0.5 text-xs rounded ${
                        webhook.ativo
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {webhook.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground font-mono truncate max-w-md">
                    {webhook.url}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {webhook.eventos.map((evento) => (
                      <span
                        key={evento}
                        className="px-2 py-0.5 text-xs rounded bg-muted"
                      >
                        {evento}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onToggle(webhook.id, !webhook.ativo)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {webhook.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    onClick={() => onDelete(webhook.id)}
                    className="text-sm text-destructive hover:underline"
                  >
                    Deletar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Modal de criar API Key
function ApiKeyModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (data: { nome: string; escopo: string; expira_em?: string }) => void
}) {
  const [nome, setNome] = useState('')
  const [escopo, setEscopo] = useState('read')
  const [expiraEm, setExpiraEm] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return
    onCreate({
      nome: nome.trim(),
      escopo,
      expira_em: expiraEm || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-semibold mb-4">Nova API Key</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: IntegracaoPipefy"
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Escopo</label>
            <select
              value={escopo}
              onChange={(e) => setEscopo(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="read">Leitura (read)</option>
              <option value="write">Leitura e Escrita (read, write)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Expira em (opcional)
            </label>
            <input
              type="date"
              value={expiraEm}
              onChange={(e) => setExpiraEm(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Criar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Modal de API Key criada
function ApiKeyCreatedModal({
  apiKey,
  onClose,
}: {
  apiKey: ApiKey
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiKey.key || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">&#128274;</span>
          <h2 className="text-lg font-semibold">API Key Criada</h2>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-yellow-800">
            <strong>Importante:</strong> Copie esta chave agora. Por seguranca,
            ela nao sera exibida novamente.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Sua API Key</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={apiKey.key || ''}
              readOnly
              className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm bg-muted"
            />
            <button onClick={copyToClipboard} className="btn btn-secondary">
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>

        <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
          <p className="font-medium mb-1">Como usar:</p>
          <code className="block text-muted-foreground">
            Authorization: Bearer {apiKey.key}
          </code>
        </div>

        <div className="flex justify-end pt-4">
          <button onClick={onClose} className="btn btn-primary">
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}

// Modal de criar Webhook
function WebhookModal({
  onClose,
  onCreate,
  eventosDisponiveis,
}: {
  onClose: () => void
  onCreate: (data: { nome: string; url: string; eventos: string[] }) => void
  eventosDisponiveis: { value: string; label: string }[]
}) {
  const [nome, setNome] = useState('')
  const [url, setUrl] = useState('')
  const [eventos, setEventos] = useState<string[]>([])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim() || !url.trim() || eventos.length === 0) return
    onCreate({ nome: nome.trim(), url: url.trim(), eventos })
  }

  const toggleEvento = (value: string) => {
    setEventos((prev) =>
      prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Novo Webhook</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: NotificacoesSlack"
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://seu-servidor.com/webhook"
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Eventos</label>
            <div className="grid grid-cols-2 gap-2">
              {eventosDisponiveis.map((evento) => (
                <label key={evento.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={eventos.includes(evento.value)}
                    onChange={() => toggleEvento(evento.value)}
                    className="rounded"
                  />
                  <span className="text-sm">{evento.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={eventos.length === 0}
              className="btn btn-primary disabled:opacity-50"
            >
              Criar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
