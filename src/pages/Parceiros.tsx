import { useEffect, useMemo, useState } from 'react'
import { Building2, Percent, Save, Search } from 'lucide-react'
import { parseCurrency } from '@/lib/imports'
import { supabase } from '@/lib/supabase'
import type { Participant } from '@/types'

type EditableParticipant = Participant & { dirty?: boolean }

function ParticipantCard({
  participant,
  onChange,
  onSave,
  saving,
}: {
  participant: EditableParticipant
  onChange: (id: string, field: keyof Participant, value: string | boolean) => void
  onSave: (participant: EditableParticipant) => void
  saving: boolean
}) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{participant.nome}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {participant.fantasia || 'Sem unidade definida'}{participant.faixa ? ` · ${participant.faixa}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${participant.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {participant.ativo ? 'Ativo' : 'Inativo'}
          </span>
          <button
            type="button"
            disabled={saving || !participant.dirty}
            onClick={() => onSave(participant)}
            className="inline-flex items-center gap-2 rounded-full bg-[#275ca8] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Nome vendedor</span>
          <input
            value={participant.nome_vendedor ?? ''}
            onChange={(event) => onChange(participant.id, 'nome_vendedor', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Nome validador</span>
          <input
            value={participant.nome_validador ?? ''}
            onChange={(event) => onChange(participant.id, 'nome_validador', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Código revenda</span>
          <input
            value={participant.codigo_revenda ?? ''}
            onChange={(event) => onChange(participant.id, 'codigo_revenda', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">E-mail</span>
          <input
            value={participant.email ?? ''}
            onChange={(event) => onChange(participant.id, 'email', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">% venda</span>
          <input
            value={String(participant.percentual_venda ?? 0)}
            onChange={(event) => onChange(participant.id, 'percentual_venda', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">% software</span>
          <input
            value={String(participant.percentual_software ?? 0)}
            onChange={(event) => onChange(participant.id, 'percentual_software', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">% hardware</span>
          <input
            value={String(participant.percentual_hardware ?? 0)}
            onChange={(event) => onChange(participant.id, 'percentual_hardware', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>
    </article>
  )
}

export default function Parceiros() {
  const [participants, setParticipants] = useState<EditableParticipant[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      try {
        const { data, error } = await supabase.from('crm_participants').select('*').order('nome')
        if (error) throw error
        if (!active) return
        setParticipants(((data ?? []) as Participant[]).map((item) => ({ ...item, dirty: false })))
      } catch (error) {
        if (!active) return
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível carregar os parceiros.' })
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return participants
    return participants.filter((participant) =>
      [
        participant.nome,
        participant.fantasia,
        participant.nome_vendedor,
        participant.nome_validador,
        participant.codigo_revenda,
        participant.email,
      ].some((value) => String(value ?? '').toLowerCase().includes(term)),
    )
  }, [participants, search])

  function updateParticipant(id: string, field: keyof Participant, rawValue: string | boolean) {
    setParticipants((current) => current.map((participant) => {
      if (participant.id !== id) return participant

      let value: unknown = rawValue
      if (field === 'percentual_venda' || field === 'percentual_software' || field === 'percentual_hardware') {
        value = parseCurrency(rawValue)
      }

      return { ...participant, [field]: value, dirty: true }
    }))
  }

  async function saveParticipant(participant: EditableParticipant) {
    setSavingId(participant.id)
    setMessage(null)

    try {
      const payload = {
        nome_vendedor: participant.nome_vendedor?.trim() || null,
        nome_validador: participant.nome_validador?.trim() || null,
        codigo_revenda: participant.codigo_revenda?.trim() || null,
        email: participant.email?.trim() || null,
        percentual_venda: participant.percentual_venda ?? 0,
        percentual_software: participant.percentual_software ?? 0,
        percentual_hardware: participant.percentual_hardware ?? 0,
      }

      const { error } = await supabase.from('crm_participants').update(payload).eq('id', participant.id)
      if (error) throw error

      setParticipants((current) => current.map((item) => item.id === participant.id ? { ...item, ...payload, dirty: false } : item))
      setMessage({ type: 'ok', text: `Parceiro ${participant.nome} atualizado com sucesso.` })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar o parceiro.' })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="p-6">
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Base comercial</p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">Parceiros e vínculos operacionais</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                Ajuste aqui os nomes usados para casar revenda e validações, além do `codrev` e percentuais de comissão do parceiro.
              </p>
            </div>

            <div className="w-full max-w-sm">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Buscar parceiro</label>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome, vendedor, validador, codrev..."
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
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <Building2 size={22} />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Parceiros</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{participants.length}</p>
            <p className="mt-2 text-sm text-slate-500">Base total da CertiFast.</p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Percent size={22} />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Com codrev</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{participants.filter((item) => item.codigo_revenda).length}</p>
            <p className="mt-2 text-sm text-slate-500">Parceiros já amarrados ao código de revenda.</p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <Search size={22} />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Filtrados</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{filtered.length}</p>
            <p className="mt-2 text-sm text-slate-500">Resultado atual da pesquisa.</p>
          </div>
        </section>

        <section className="grid gap-5">
          {loading ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
              Carregando parceiros...
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
              Nenhum parceiro encontrado para o filtro atual.
            </div>
          ) : (
            filtered.map((participant) => (
              <ParticipantCard
                key={participant.id}
                participant={participant}
                onChange={updateParticipant}
                onSave={saveParticipant}
                saving={savingId === participant.id}
              />
            ))
          )}
        </section>
      </div>
    </div>
  )
}
