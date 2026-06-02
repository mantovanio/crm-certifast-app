import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Link2, Save, Search, Shield } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Participant, Profile, ProfileParticipantLink } from '@/types'

type EditableProfile = Profile & {
  dirty?: boolean
  participantIds: string[]
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </div>
  )
}

export default function Usuarios() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [profiles, setProfiles] = useState<EditableProfile[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [links, setLinks] = useState<ProfileParticipantLink[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setMessage(null)

      try {
        const [profilesResp, participantsResp, linksResp] = await Promise.all([
          supabase.from('crm_profiles').select('*').order('nome'),
          supabase.from('crm_participants').select('*').order('nome'),
          supabase.from('crm_profile_participants').select('*'),
        ])

        if (profilesResp.error) throw profilesResp.error
        if (participantsResp.error) throw participantsResp.error
        if (linksResp.error) throw linksResp.error

        if (!active) return

        const linksData = (linksResp.data ?? []) as ProfileParticipantLink[]
        const linksByProfile = new Map<string, string[]>()
        for (const link of linksData) {
          const current = linksByProfile.get(link.profile_id) ?? []
          current.push(link.participant_id)
          linksByProfile.set(link.profile_id, current)
        }

        setProfiles(
          ((profilesResp.data ?? []) as Profile[]).map((item) => ({
            ...item,
            participantIds: linksByProfile.get(item.id) ?? [],
            dirty: false,
          })),
        )
        setParticipants((participantsResp.data ?? []) as Participant[])
        setLinks(linksData)
      } catch (err) {
        if (!active) return
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Não foi possível carregar os acessos.' })
      } finally {
        if (active) setLoading(false)
      }
    }

    if (isAdmin) void load()
    else setLoading(false)

    return () => { active = false }
  }, [isAdmin])

  const participantMap = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  )

  const filteredProfiles = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return profiles
    return profiles.filter((item) =>
      [item.nome, item.email, item.role, item.status].some((value) => String(value ?? '').toLowerCase().includes(term)),
    )
  }, [profiles, search])

  const activeUsers = profiles.filter((item) => item.status === 'active').length
  const participantUsers = profiles.filter((item) => item.role === 'participant').length

  function updateProfile(profileId: string, field: keyof EditableProfile, value: string) {
    setProfiles((current) =>
      current.map((item) => (item.id === profileId ? { ...item, [field]: value, dirty: true } : item)),
    )
  }

  function toggleParticipant(profileId: string, participantId: string) {
    setProfiles((current) =>
      current.map((item) => {
        if (item.id !== profileId) return item
        const exists = item.participantIds.includes(participantId)
        return {
          ...item,
          participantIds: exists ? item.participantIds.filter((id) => id !== participantId) : [...item.participantIds, participantId],
          dirty: true,
        }
      }),
    )
  }

  async function saveProfile(currentProfile: EditableProfile) {
    setSavingId(currentProfile.id)
    setMessage(null)

    try {
      const profilePayload = {
        nome: currentProfile.nome.trim(),
        email: currentProfile.email.trim(),
        role: currentProfile.role,
        status: currentProfile.status,
      }

      const { error: profileError } = await supabase.from('crm_profiles').update(profilePayload).eq('id', currentProfile.id)
      if (profileError) throw profileError

      const currentLinkIds = links.filter((link) => link.profile_id === currentProfile.id).map((link) => link.participant_id)
      const toDelete = currentLinkIds.filter((id) => !currentProfile.participantIds.includes(id))
      const toInsert = currentProfile.participantIds.filter((id) => !currentLinkIds.includes(id))

      if (toDelete.length) {
        const { error } = await supabase
          .from('crm_profile_participants')
          .delete()
          .eq('profile_id', currentProfile.id)
          .in('participant_id', toDelete)
        if (error) throw error
      }

      if (toInsert.length) {
        const { error } = await supabase.from('crm_profile_participants').insert(
          toInsert.map((participantId) => ({
            profile_id: currentProfile.id,
            participant_id: participantId,
          })),
        )
        if (error) throw error
      }

      const linksResp = await supabase.from('crm_profile_participants').select('*')
      if (linksResp.error) throw linksResp.error
      setLinks((linksResp.data ?? []) as ProfileParticipantLink[])
      setProfiles((current) => current.map((item) => (item.id === currentProfile.id ? { ...item, ...profilePayload, dirty: false } : item)))
      setMessage({ type: 'ok', text: `Acesso de ${currentProfile.nome} atualizado com sucesso.` })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar este acesso.' })
    } finally {
      setSavingId(null)
    }
  }

  async function sendReset(currentProfile: EditableProfile) {
    setResettingId(currentProfile.id)
    setMessage(null)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(currentProfile.email, {
        redirectTo: `${window.location.origin}/?reset_password=1`,
      })
      if (error) throw error
      setMessage({ type: 'ok', text: `Link de redefinição enviado para ${currentProfile.email}.` })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível enviar a redefinição.' })
    } finally {
      setResettingId(null)
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-3xl font-bold text-slate-900">Acessos</h2>
          <p className="mt-3 max-w-2xl text-slate-500">Este módulo é exclusivo do administrador.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Módulo de acesso</p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">Perfis, liberação e vínculos</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                Agora você consegue realmente ativar usuários, trocar perfil, redefinir senha e vincular parceiros ao acesso.
              </p>
            </div>

            <div className="w-full max-w-md">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Buscar acesso</label>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome, email, perfil..."
                  className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </section>

        {message && (
          <div className={`rounded-[24px] px-5 py-4 text-sm ${message.type === 'ok' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-red-200 bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}

        <section className="grid gap-4 xl:grid-cols-3">
          <StatCard label="Usuários" value={String(profiles.length)} detail="Cadastros encontrados no CRM." />
          <StatCard label="Ativos" value={String(activeUsers)} detail="Acessos prontos para uso hoje." />
          <StatCard label="Participantes" value={String(participantUsers)} detail="Contas restritas ao escopo próprio." />
        </section>

        <section className="grid gap-4">
          {loading ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
              Carregando acessos...
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
              Nenhum acesso encontrado para o filtro atual.
            </div>
          ) : (
            filteredProfiles.map((item) => {
              const linkedParticipants = item.participantIds.map((id) => participantMap.get(id)).filter(Boolean) as Participant[]

              return (
                <article key={item.id} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{item.nome}</h3>
                      <p className="mt-1 text-sm text-slate-500">{item.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => sendReset(item)}
                        disabled={resettingId === item.id}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      >
                        <KeyRound size={14} />
                        {resettingId === item.id ? 'Enviando...' : 'Redefinir senha'}
                      </button>
                      <button
                        type="button"
                        onClick={() => saveProfile(item)}
                        disabled={savingId === item.id || !item.dirty}
                        className="inline-flex items-center gap-2 rounded-full bg-[#275ca8] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <Save size={14} />
                        {savingId === item.id ? 'Salvando...' : 'Salvar acesso'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Shield size={16} />
                        Dados do acesso
                      </div>

                      <div className="mt-4 grid gap-3">
                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Nome</span>
                          <input
                            value={item.nome}
                            onChange={(event) => updateProfile(item.id, 'nome', event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Email</span>
                          <input
                            value={item.email}
                            onChange={(event) => updateProfile(item.id, 'email', event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </label>

                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Perfil</span>
                            <select
                              value={item.role}
                              onChange={(event) => updateProfile(item.id, 'role', event.target.value)}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="participant">Participante</option>
                              <option value="admin">Administrador</option>
                            </select>
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Status</span>
                            <select
                              value={item.status}
                              onChange={(event) => updateProfile(item.id, 'status', event.target.value)}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="active">Ativo</option>
                              <option value="inactive">Inativo</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Link2 size={16} />
                        Parceiros vinculados
                      </div>

                      <div className="mt-4 grid gap-2">
                        {participants.map((participant) => {
                          const checked = item.participantIds.includes(participant.id)
                          return (
                            <label key={participant.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                              <span>{participant.nome}{participant.fantasia ? ` · ${participant.fantasia}` : ''}</span>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleParticipant(item.id, participant.id)}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600"
                              />
                            </label>
                          )
                        })}
                      </div>

                      {linkedParticipants.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {linkedParticipants.map((participant) => (
                            <span key={participant.id} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                              {participant.nome}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}
