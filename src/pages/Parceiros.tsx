import { useEffect, useMemo, useState } from 'react'
import { Building2, KeyRound, Percent, Save, Search, ShieldCheck, UserRound } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { formatPeriod, money, safeText, toNumber } from '@/lib/certifast'
import { parseCurrency } from '@/lib/imports'
import { supabase } from '@/lib/supabase'
import type { Participant, SalesRow, ValidationRow } from '@/types'

type EditableParticipant = Participant & { dirty?: boolean }

type ParticipantAccess = {
  id: string
  nome: string
  email: string
  role: string
  status: string
  linked_at: string
}

type ParticipantMetrics = {
  salesCount: number
  salesRevenue: number
  salesCommission: number
  validationsCount: number
  validationsGross: number
  validationsCommission: number
  vendaRepasse: number
  softwareRepasse: number
  hardwareRepasse: number
  brutoParceiro: number
  descontos: number
  liquido: number
}

type ParticipantCardProps = {
  participant: EditableParticipant
  accessRows: ParticipantAccess[]
  report: ParticipantMetrics
  periodLabel: string
  onChange: (id: string, field: keyof Participant, value: string | boolean) => void
  onSave: (participant: EditableParticipant) => void
  onSendReset: (participant: EditableParticipant, targetEmail: string | null) => void
  saving: boolean
  resetting: boolean
}

function emptyMetrics(): ParticipantMetrics {
  return {
    salesCount: 0,
    salesRevenue: 0,
    salesCommission: 0,
    validationsCount: 0,
    validationsGross: 0,
    validationsCommission: 0,
    vendaRepasse: 0,
    softwareRepasse: 0,
    hardwareRepasse: 0,
    brutoParceiro: 0,
    descontos: 0,
    liquido: 0,
  }
}

function normalizeLookup(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function buildReport(participant: Participant, sales: SalesRow[], validations: ValidationRow[]) {
  const metrics = emptyMetrics()

  for (const row of sales) {
    metrics.salesCount += 1
    metrics.salesRevenue += toNumber(row.faturamento)
    metrics.salesCommission += toNumber(row.comissao)
  }

  for (const row of validations) {
    const softCommission = toNumber(row.comissao_software)
    const hardCommission = toNumber(row.comissao_hardware)
    metrics.validationsCount += 1
    metrics.validationsGross += toNumber(row.bruto_software) + toNumber(row.bruto_hardware)
    metrics.validationsCommission += softCommission + hardCommission
    metrics.softwareRepasse += softCommission * (toNumber(participant.percentual_software) / 100)
    metrics.hardwareRepasse += hardCommission * (toNumber(participant.percentual_hardware) / 100)
  }

  metrics.vendaRepasse = metrics.salesCommission * (toNumber(participant.percentual_venda) / 100)
  metrics.brutoParceiro = metrics.vendaRepasse + metrics.softwareRepasse + metrics.hardwareRepasse
  metrics.descontos = toNumber(participant.imposto) + toNumber(participant.contabilidade) + toNumber(participant.verificacao)
  metrics.liquido = metrics.brutoParceiro - metrics.descontos

  return metrics
}

function StatCard({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: typeof Building2 }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
        <Icon size={22} />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </div>
  )
}

function MetricBox({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' | 'amber' }) {
  const classes =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-slate-200 bg-slate-50 text-slate-700'

  return (
    <div className={`rounded-2xl border px-4 py-3 ${classes}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-2 text-lg font-bold">{value}</p>
    </div>
  )
}

function ParticipantCard({
  participant,
  accessRows,
  report,
  periodLabel,
  onChange,
  onSave,
  onSendReset,
  saving,
  resetting,
}: ParticipantCardProps) {
  const mainAccessEmail = accessRows[0]?.email || participant.email || null

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
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Fantasia / unidade</span>
          <input
            value={participant.fantasia ?? ''}
            onChange={(event) => onChange(participant.id, 'fantasia', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Faixa / tabela</span>
          <input
            value={participant.faixa ?? ''}
            onChange={(event) => onChange(participant.id, 'faixa', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

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
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">E-mail principal</span>
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

      <div className="mt-5 grid gap-4 xl:grid-cols-4">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Imposto</span>
          <input
            value={String(participant.imposto ?? 0)}
            onChange={(event) => onChange(participant.id, 'imposto', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Contabilidade</span>
          <input
            value={String(participant.contabilidade ?? 0)}
            onChange={(event) => onChange(participant.id, 'contabilidade', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Verificação</span>
          <input
            value={String(participant.verificacao ?? 0)}
            onChange={(event) => onChange(participant.id, 'verificacao', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="flex items-end">
          <span className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <span>Parceiro ativo</span>
            <input
              type="checkbox"
              checked={participant.ativo}
              onChange={(event) => onChange(participant.id, 'ativo', event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
          </span>
        </label>
      </div>

      <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Acesso</p>
            <h4 className="mt-2 text-base font-bold text-slate-900">Usuários vinculados e senha</h4>
            <p className="mt-1 text-sm text-slate-500">
              O CRM não guarda senha em texto. O controle aqui é pelo e-mail de acesso e pela redefinição segura via Supabase.
            </p>
          </div>
          <button
            type="button"
            disabled={resetting || !mainAccessEmail}
            onClick={() => onSendReset(participant, mainAccessEmail)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <KeyRound size={14} />
            {resetting ? 'Enviando...' : 'Enviar redefinição de senha'}
          </button>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {accessRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
              Nenhum usuário vinculado a este parceiro ainda.
            </div>
          ) : (
            accessRows.map((access) => (
              <div key={access.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{access.nome}</p>
                    <p className="mt-1 text-sm text-slate-500">{access.email}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${access.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {safeText(access.status)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-100 px-3 py-1">{safeText(access.role)}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">Vinculado em {new Date(access.linked_at).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Relatório individual</p>
            <h4 className="mt-2 text-base font-bold text-slate-900">Recebimento do mês em {periodLabel}</h4>
          </div>
          <div className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600">
            {report.salesCount + report.validationsCount} lançamento(s)
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-4">
          <MetricBox label="Vendas" value={`${report.salesCount} · ${money(report.salesCommission)}`} />
          <MetricBox label="Validações" value={`${report.validationsCount} · ${money(report.validationsCommission)}`} />
          <MetricBox label="Bruto parceiro" value={money(report.brutoParceiro)} tone="green" />
          <MetricBox label="Líquido estimado" value={money(report.liquido)} tone={report.liquido >= 0 ? 'green' : 'amber'} />
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-5">
          <MetricBox label="Repasse venda" value={money(report.vendaRepasse)} />
          <MetricBox label="Repasse software" value={money(report.softwareRepasse)} />
          <MetricBox label="Repasse hardware" value={money(report.hardwareRepasse)} />
          <MetricBox label="Descontos fixos" value={money(report.descontos)} tone="amber" />
          <MetricBox label="Faturamento" value={money(report.salesRevenue + report.validationsGross)} />
        </div>
      </div>
    </article>
  )
}

export default function Parceiros() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [participants, setParticipants] = useState<EditableParticipant[]>([])
  const [sales, setSales] = useState<SalesRow[]>([])
  const [validations, setValidations] = useState<ValidationRow[]>([])
  const [periods, setPeriods] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [accessByParticipant, setAccessByParticipant] = useState<Record<string, ParticipantAccess[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadingPeriod, setLoadingPeriod] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      try {
        const [participantsResp, periodsResp, profilesResp, linksResp] = await Promise.all([
          supabase.from('crm_participants').select('*').order('nome'),
          supabase.from('crm_import_files').select('period, created_at').order('created_at', { ascending: false }).limit(4000),
          supabase.from('crm_profiles').select('id,nome,email,role,status'),
          supabase.from('crm_profile_participants').select('profile_id,participant_id,created_at'),
        ])

        if (participantsResp.error) throw participantsResp.error
        if (periodsResp.error) throw periodsResp.error
        if (profilesResp.error) throw profilesResp.error
        if (linksResp.error) throw linksResp.error
        if (!active) return

        const uniquePeriods = [...new Set((periodsResp.data ?? []).map((item) => String(item.period || '')).filter(Boolean))]
        const profileMap = new Map((profilesResp.data ?? []).map((item) => [item.id, item]))
        const accessMap: Record<string, ParticipantAccess[]> = {}

        for (const link of linksResp.data ?? []) {
          const linkedProfile = profileMap.get(link.profile_id)
          if (!linkedProfile) continue
          if (!accessMap[link.participant_id]) accessMap[link.participant_id] = []
          accessMap[link.participant_id].push({
            id: linkedProfile.id,
            nome: linkedProfile.nome,
            email: linkedProfile.email,
            role: linkedProfile.role,
            status: linkedProfile.status,
            linked_at: link.created_at,
          })
        }

        setParticipants(((participantsResp.data ?? []) as Participant[]).map((item) => ({ ...item, dirty: false })))
        setPeriods(uniquePeriods)
        setSelectedPeriod((current) => current || uniquePeriods[0] || '')
        setAccessByParticipant(accessMap)
      } catch (error) {
        if (!active) return
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível carregar os parceiros.' })
      } finally {
        if (active) setLoading(false)
      }
    }

    if (isAdmin) void load()
    else setLoading(false)

    return () => { active = false }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin || !selectedPeriod) {
      setSales([])
      setValidations([])
      return
    }

    let active = true

    async function loadPeriod() {
      setLoadingPeriod(true)
      try {
        const [salesResp, validationsResp] = await Promise.all([
          supabase.from('crm_sales').select('*').eq('period', selectedPeriod),
          supabase.from('crm_validations').select('*').eq('period', selectedPeriod),
        ])

        if (salesResp.error) throw salesResp.error
        if (validationsResp.error) throw validationsResp.error
        if (!active) return

        setSales((salesResp.data ?? []) as SalesRow[])
        setValidations((validationsResp.data ?? []) as ValidationRow[])
      } catch (error) {
        if (!active) return
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível carregar o relatório do período.' })
      } finally {
        if (active) setLoadingPeriod(false)
      }
    }

    void loadPeriod()
    return () => { active = false }
  }, [isAdmin, selectedPeriod])

  const salesByParticipant = useMemo(() => {
    const map = new Map<string, SalesRow[]>()
    for (const row of sales) {
      const key = row.participant_id || normalizeLookup(row.participant_nome)
      if (!map.has(key)) map.set(key, [])
      map.get(key)?.push(row)
    }
    return map
  }, [sales])

  const validationsByParticipant = useMemo(() => {
    const map = new Map<string, ValidationRow[]>()
    for (const row of validations) {
      const key = row.participant_id || normalizeLookup(row.participant_nome)
      if (!map.has(key)) map.set(key, [])
      map.get(key)?.push(row)
    }
    return map
  }, [validations])

  const reportsByParticipant = useMemo(() => {
    const reportMap = new Map<string, ParticipantMetrics>()

    for (const participant of participants) {
      const participantSales = salesByParticipant.get(participant.id) ?? salesByParticipant.get(normalizeLookup(participant.nome)) ?? []
      const participantValidations = validationsByParticipant.get(participant.id) ?? validationsByParticipant.get(normalizeLookup(participant.nome)) ?? []
      reportMap.set(participant.id, buildReport(participant, participantSales, participantValidations))
    }

    return reportMap
  }, [participants, salesByParticipant, validationsByParticipant])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return participants
    return participants.filter((participant) =>
      [
        participant.nome,
        participant.fantasia,
        participant.faixa,
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
      if (
        field === 'percentual_venda' ||
        field === 'percentual_software' ||
        field === 'percentual_hardware' ||
        field === 'imposto' ||
        field === 'contabilidade' ||
        field === 'verificacao'
      ) {
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
        fantasia: participant.fantasia?.trim() || null,
        faixa: participant.faixa?.trim() || null,
        nome_vendedor: participant.nome_vendedor?.trim() || null,
        nome_validador: participant.nome_validador?.trim() || null,
        codigo_revenda: participant.codigo_revenda?.trim() || null,
        email: participant.email?.trim() || null,
        percentual_venda: participant.percentual_venda ?? 0,
        percentual_software: participant.percentual_software ?? 0,
        percentual_hardware: participant.percentual_hardware ?? 0,
        imposto: participant.imposto ?? 0,
        contabilidade: participant.contabilidade ?? 0,
        verificacao: participant.verificacao ?? 0,
        ativo: participant.ativo,
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

  async function sendReset(participant: EditableParticipant, targetEmail: string | null) {
    if (!targetEmail) {
      setMessage({ type: 'error', text: `O parceiro ${participant.nome} não tem e-mail configurado para acesso.` })
      return
    }

    setResettingId(participant.id)
    setMessage(null)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/?reset_password=1`,
      })

      if (error) throw error
      setMessage({ type: 'ok', text: `Link de redefinição enviado para ${targetEmail}.` })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível enviar a redefinição de senha.' })
    } finally {
      setResettingId(null)
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-3xl font-bold text-slate-900">Parceiros</h2>
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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Base comercial</p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">Parceiros e vínculos operacionais</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                Ajuste comissões, repasses, custos fixos, vínculos de acesso e acompanhe o relatório individual do parceiro no período pesquisado.
              </p>
            </div>

            <div className="grid w-full gap-4 lg:max-w-2xl lg:grid-cols-[1fr,220px]">
              <div>
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

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Período do relatório</label>
                <select
                  value={selectedPeriod}
                  onChange={(event) => setSelectedPeriod(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {periods.length === 0 && <option value="">Sem períodos importados</option>}
                  {periods.map((period) => (
                    <option key={period} value={period}>{formatPeriod(period)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {message && (
          <div className={`rounded-[24px] px-5 py-4 text-sm ${message.type === 'ok' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-red-200 bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}

        <section className="grid gap-4 xl:grid-cols-4">
          <StatCard title="Parceiros" value={String(participants.length)} detail="Base total da CertiFast." icon={Building2} />
          <StatCard title="Com codrev" value={String(participants.filter((item) => item.codigo_revenda).length)} detail="Parceiros amarrados ao código de revenda." icon={Percent} />
          <StatCard title="Com acesso" value={String(Object.values(accessByParticipant).filter((items) => items.length > 0).length)} detail="Parceiros com pelo menos um login vinculado." icon={UserRound} />
          <StatCard title="Em relatório" value={loadingPeriod ? '...' : String(filtered.length)} detail={selectedPeriod ? `Pesquisa atual em ${formatPeriod(selectedPeriod)}.` : 'Sem período ativo.'} icon={ShieldCheck} />
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
                accessRows={accessByParticipant[participant.id] ?? []}
                report={reportsByParticipant.get(participant.id) ?? emptyMetrics()}
                periodLabel={selectedPeriod ? formatPeriod(selectedPeriod) : 'sem período'}
                onChange={updateParticipant}
                onSave={saveParticipant}
                onSendReset={sendReset}
                saving={savingId === participant.id}
                resetting={resettingId === participant.id}
              />
            ))
          )}
        </section>
      </div>
    </div>
  )
}
