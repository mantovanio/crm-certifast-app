import { useEffect, useState } from 'react'
import { Save, Shield, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { DEFAULT_AGENCY_CONFIG, DEFAULT_AUTH_CONFIG, type AgencyConfig, type AuthConfig } from '@/lib/agencyConfig'
import { supabase } from '@/lib/supabase'

export default function Configuracoes() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [agencyConfig, setAgencyConfig] = useState<AgencyConfig>(DEFAULT_AGENCY_CONFIG)
  const [authConfig, setAuthConfig] = useState<AuthConfig>(DEFAULT_AUTH_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setMessage(null)
      try {
        const { data, error } = await supabase
          .from('crm_settings')
          .select('key,value')
          .in('key', ['agency_config', 'auth_config'])

        if (error) throw error
        if (!active) return

        const settingsMap = new Map((data ?? []).map((item) => [String(item.key), item.value as Record<string, unknown>]))
        setAgencyConfig({ ...DEFAULT_AGENCY_CONFIG, ...(settingsMap.get('agency_config') as Partial<AgencyConfig> | undefined) })
        setAuthConfig({ ...DEFAULT_AUTH_CONFIG, ...(settingsMap.get('auth_config') as Partial<AuthConfig> | undefined) })
      } catch (error) {
        if (!active) return
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível carregar as configurações.' })
      } finally {
        if (active) setLoading(false)
      }
    }

    if (isAdmin) void load()
    else setLoading(false)

    return () => { active = false }
  }, [isAdmin])

  async function saveSettings() {
    setSaving(true)
    setMessage(null)
    try {
      const payload = [
        { key: 'agency_config', value: agencyConfig },
        { key: 'auth_config', value: authConfig },
      ]

      const { error } = await supabase.from('crm_settings').upsert(payload, { onConflict: 'key' })
      if (error) throw error
      setMessage({ type: 'ok', text: 'Configurações salvas com sucesso.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar as configurações.' })
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-3xl font-bold text-slate-900">Configurações</h2>
          <p className="mt-3 max-w-2xl text-slate-500">Este módulo é exclusivo do administrador.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Administração</p>
          <h2 className="mt-3 text-3xl font-bold text-slate-900">Configurações do CRM</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Controle da identidade visual e da segurança básica do acesso. Esta aba agora grava de verdade em `crm_settings`.
          </p>
        </section>

        {message && (
          <div className={`rounded-[24px] px-5 py-4 text-sm ${message.type === 'ok' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-red-200 bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <SlidersHorizontal size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Marca e login</h3>
              <p className="text-sm text-slate-500">Textos e aparência principal da CertiFast.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {[
              ['nome_agencia', 'Nome da agência'],
              ['responsavel', 'Responsável'],
              ['telefone', 'Telefone'],
              ['cidade', 'Cidade'],
              ['login_titulo', 'Título do login'],
              ['login_subtitulo', 'Subtítulo do login'],
              ['cor_primaria', 'Cor primária'],
              ['fundo_inicio', 'Fundo início'],
              ['fundo_fim', 'Fundo fim'],
              ['logo_url', 'Logo geral'],
              ['logo_login_url', 'Logo login'],
              ['logo_interna_url', 'Logo interna'],
            ].map(([field, label]) => (
              <label key={field} className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
                <input
                  value={String(agencyConfig[field as keyof AgencyConfig] ?? '')}
                  onChange={(event) => setAgencyConfig((current) => ({ ...current, [field]: event.target.value }))}
                  disabled={loading}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <Shield size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Segurança e acesso</h3>
              <p className="text-sm text-slate-500">Controle se o login pode aceitar novos cadastros públicos.</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <label className="flex items-center justify-between gap-4 text-sm text-slate-700">
              <div>
                <p className="font-semibold">Permitir auto cadastro no login</p>
                <p className="mt-1 text-slate-500">Quando desligado, novos usuários não conseguem abrir conta pela tela inicial.</p>
              </div>
              <input
                type="checkbox"
                checked={authConfig.allow_public_signup}
                onChange={(event) => setAuthConfig((current) => ({ ...current, allow_public_signup: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
            </label>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveSettings}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-full bg-[#275ca8] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </div>
    </div>
  )
}
