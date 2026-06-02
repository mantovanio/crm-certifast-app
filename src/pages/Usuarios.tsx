import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Link2, Shield } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Participant, Profile, ProfileParticipantLink } from '@/types'

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
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [links, setLinks] = useState<ProfileParticipantLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError(null)

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
        setProfiles((profilesResp.data ?? []) as Profile[])
        setParticipants((participantsResp.data ?? []) as Participant[])
        setLinks((linksResp.data ?? []) as ProfileParticipantLink[])
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Não foi possível carregar os acessos.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [])

  const participantMap = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  )

  const linkedByProfile = useMemo(() => {
    const map = new Map<string, Participant[]>()

    for (const link of links) {
      const participant = participantMap.get(link.participant_id)
      if (!participant) continue
      const current = map.get(link.profile_id) ?? []
      current.push(participant)
      map.set(link.profile_id, current)
    }

    return map
  }, [links, participantMap])

  const activeUsers = profiles.filter((profile) => profile.status === 'active').length
  const participantUsers = profiles.filter((profile) => profile.role === 'participant').length

  return (
    <div className="p-6">
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Módulo de acesso</p>
          <h2 className="mt-3 text-3xl font-bold text-slate-900">Perfis e vínculos operacionais</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Esta primeira entrega mostra quem entra no CRM, o papel de cada acesso e quais parceiros estão vinculados.
            A edição completa e os envios automáticos de senha entram no próximo passo do módulo.
          </p>
        </section>

        {error && <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}

        <section className="grid gap-4 xl:grid-cols-3">
          <StatCard label="Usuários" value={String(profiles.length)} detail="Cadastros encontrados no CRM." />
          <StatCard label="Ativos" value={String(activeUsers)} detail="Acessos prontos para uso hoje." />
          <StatCard label="Participantes" value={String(participantUsers)} detail="Contas restritas ao escopo próprio." />
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <Shield size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Visão inicial dos acessos</h3>
              <p className="text-sm text-slate-500">Base real de `crm_profiles` e `crm_profile_participants`.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            {profiles.map((profile) => {
              const linkedParticipants = linkedByProfile.get(profile.id) ?? []

              return (
                <article key={profile.id} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h4 className="text-lg font-bold text-slate-900">{profile.nome}</h4>
                      <p className="text-sm text-slate-500">{profile.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className={`rounded-full px-3 py-1 ${profile.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-700'}`}>
                        {profile.role === 'admin' ? 'Administrador' : 'Participante'}
                      </span>
                      <span className={`rounded-full px-3 py-1 ${profile.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {profile.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[180px_1fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <KeyRound size={16} />
                        Escopo
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {profile.role === 'admin'
                          ? 'Acesso total aos módulos administrativos.'
                          : 'Acesso restrito aos parceiros vinculados.'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Link2 size={16} />
                        Parceiros vinculados
                      </div>
                      {linkedParticipants.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500">
                          {loading ? 'Carregando vínculos...' : 'Nenhum parceiro vinculado ainda.'}
                        </p>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {linkedParticipants.map((participant) => (
                            <span key={participant.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                              {participant.nome}{participant.fantasia ? ` · ${participant.fantasia}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
