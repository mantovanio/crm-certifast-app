import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, KeyRound, Percent, Plus, Save, Search, ShieldCheck, Trash2, Upload, UserRound, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { formatPercent, formatPeriod, money, normalizePercent, safeText, toNumber } from '@/lib/certifast'
import { parseCurrency, parsePartnersSpreadsheet, readSpreadsheet } from '@/lib/imports'
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
  salesCommission: number
  validationsCount: number
  validationsCommission: number
  brutoParceiro: number
  liquido: number
}

function emptyMetrics(): ParticipantMetrics {
  return { salesCount: 0, salesCommission: 0, validationsCount: 0, validationsCommission: 0, brutoParceiro: 0, liquido: 0 }
}

function normalizeLookup(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function buildReport(participant: Participant, sales: SalesRow[], validations: ValidationRow[]): ParticipantMetrics {
  const imposto = normalizePercent(participant.imposto)
  const pVenda = normalizePercent(participant.percentual_venda)
  const pSoft = normalizePercent(participant.percentual_software)
  const pHard = normalizePercent(participant.percentual_hardware)
  let salesCommission = 0, validationsCommission = 0, vendaRepasse = 0, softRepasse = 0, hardRepasse = 0

  for (const row of sales) {
    const bruta = toNumber(row.comissao)
    const liquida = bruta - bruta * imposto
    salesCommission += bruta
    vendaRepasse += liquida * pVenda
  }
  for (const row of validations) {
    const soft = toNumber(row.comissao_software)
    const hard = toNumber(row.comissao_hardware)
    validationsCommission += soft + hard
    softRepasse += (soft - soft * imposto) * pSoft
    hardRepasse += (hard - hard * imposto) * pHard
  }

  const brutoParceiro = vendaRepasse + softRepasse + hardRepasse
  const descontos = toNumber(participant.contabilidade) + toNumber(participant.verificacao)
  return {
    salesCount: sales.length,
    salesCommission,
    validationsCount: validations.length,
    validationsCommission,
    brutoParceiro,
    liquido: brutoParceiro - descontos,
  }
}

function Field({ label, value, onChange, disabled = false, type = 'text' }: {
  label: string; value: string; onChange?: (v: string) => void; disabled?: boolean; type?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={e => onChange?.(e.target.value)}
        className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${disabled ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-200 bg-white text-slate-700'}`}
      />
    </label>
  )
}

function MetricBox({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' | 'amber' }) {
  const cls = tone === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-700'
    : 'border-slate-200 bg-slate-50 text-slate-700'
  return (
    <div className={`rounded-2xl border px-4 py-3 ${cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</p>
      <p className="mt-1 text-base font-bold">{value}</p>
    </div>
  )
}

function EditModal({ participant, accessRows, report, periodLabel, onSave, onDelete, onSendReset, onClose, saving, deleting, resetting }: {
  participant: EditableParticipant
  accessRows: ParticipantAccess[]
  report: ParticipantMetrics
  periodLabel: string
  onSave: (p: EditableParticipant) => void
  onDelete: (id: string) => void
  onSendReset: (p: EditableParticipant, email: string | null) => void
  onClose: () => void
  saving: boolean
  deleting: boolean
  resetting: boolean
}) {
  const [local, setLocal] = useState<EditableParticipant>(participant)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const mainEmail = accessRows[0]?.email || local.email || null

  function set(field: keyof Participant, rawValue: string | boolean) {
    const numeric = ['percentual_venda', 'percentual_software', 'percentual_hardware', 'imposto', 'contabilidade', 'verificacao']
    const value = typeof rawValue === 'string' && numeric.includes(field) ? parseCurrency(rawValue) : rawValue
    setLocal(c => ({ ...c, [field]: value, dirty: true }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Parceiro</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">{local.nome}</h3>
            <p className="mt-0.5 text-sm text-slate-500">{local.fantasia || 'Sem unidade definida'}{local.faixa ? ` · ${local.faixa}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} className="mt-1 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          {/* Relatório */}
          <section>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Relatório — {periodLabel}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricBox label="Vendas" value={`${report.salesCount} · ${money(report.salesCommission)}`} />
              <MetricBox label="Validações" value={`${report.validationsCount} · ${money(report.validationsCommission)}`} />
              <MetricBox label="Bruto parceiro" value={money(report.brutoParceiro)} tone="green" />
              <MetricBox label="Imposto config." value={formatPercent(local.imposto)} tone="amber" />
              <MetricBox label="Descontos fixos" value={money(toNumber(local.contabilidade) + toNumber(local.verificacao))} tone="amber" />
              <MetricBox label="Valor final" value={money(report.liquido)} tone={report.liquido >= 0 ? 'green' : 'amber'} />
            </div>
          </section>

          {/* Cadastro */}
          <section>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Cadastro</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome base" value={local.nome} disabled />
              <Field label="Fantasia / unidade" value={local.fantasia ?? ''} onChange={v => set('fantasia', v)} />
              <Field label="Faixa / tabela" value={local.faixa ?? ''} onChange={v => set('faixa', v)} />
              <Field label="Código revenda" value={local.codigo_revenda ?? ''} onChange={v => set('codigo_revenda', v)} />
              <Field label="Nome vendedor (planilha)" value={local.nome_vendedor ?? ''} onChange={v => set('nome_vendedor', v)} />
              <Field label="Nome validador (planilha)" value={local.nome_validador ?? ''} onChange={v => set('nome_validador', v)} />
              <Field label="E-mail" value={local.email ?? ''} onChange={v => set('email', v)} />
              <Field label="Telefone" value={local.telefone ?? ''} onChange={v => set('telefone', v)} />
              <Field label="Razão social" value={local.razao_social ?? ''} onChange={v => set('razao_social', v)} />
              <Field label="CPF / CNPJ" value={local.documento ?? ''} onChange={v => set('documento', v)} />
              <Field label="Contato financeiro" value={local.contato_financeiro ?? ''} onChange={v => set('contato_financeiro', v)} />
              <div className="flex items-end">
                <label className="flex w-full cursor-pointer items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                  <span>Parceiro ativo</span>
                  <input type="checkbox" checked={local.ativo} onChange={e => set('ativo', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                </label>
              </div>
            </div>
          </section>

          {/* Comissão */}
          <section>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Comissão e custos</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="% venda" value={String(local.percentual_venda ?? 0)} onChange={v => set('percentual_venda', v)} />
              <Field label="% certificado" value={String(local.percentual_software ?? 0)} onChange={v => set('percentual_software', v)} />
              <Field label="% hardware" value={String(local.percentual_hardware ?? 0)} onChange={v => set('percentual_hardware', v)} />
              <Field label="Imposto %" value={String(local.imposto ?? 0)} onChange={v => set('imposto', v)} />
              <Field label="Contabilidade" value={String(local.contabilidade ?? 0)} onChange={v => set('contabilidade', v)} />
              <Field label="Verificação" value={String(local.verificacao ?? 0)} onChange={v => set('verificacao', v)} />
            </div>
          </section>

          {/* Dados bancários */}
          <section>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Dados bancários</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Favorecido" value={local.favorecido ?? ''} onChange={v => set('favorecido', v)} />
              <Field label="PIX" value={local.pix ?? ''} onChange={v => set('pix', v)} />
              <Field label="Banco" value={local.banco ?? ''} onChange={v => set('banco', v)} />
              <Field label="Tipo conta" value={local.tipo_conta ?? ''} onChange={v => set('tipo_conta', v)} />
              <Field label="Agência" value={local.agencia ?? ''} onChange={v => set('agencia', v)} />
              <Field label="Conta" value={local.conta ?? ''} onChange={v => set('conta', v)} />
            </div>
            <div className="mt-4">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Observações financeiras</span>
              <textarea value={local.observacoes_financeiras ?? ''} onChange={e => set('observacoes_financeiras', e.target.value)} rows={3}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </section>

          {/* Acesso */}
          <section className="rounded-[20px] border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Usuários vinculados</p>
              <button type="button" disabled={resetting || !mainEmail} onClick={() => onSendReset(local, mainEmail)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
                <KeyRound size={13} />
                {resetting ? 'Enviando...' : 'Redefinir senha'}
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {accessRows.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum usuário vinculado.</p>
              ) : accessRows.map(a => (
                <div key={a.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="font-semibold text-slate-900">{a.nome}</p>
                  <p className="text-sm text-slate-500">{a.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-3 py-1">{safeText(a.role)}</span>
                    <span className={`rounded-full px-3 py-1 ${a.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{safeText(a.status)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <div>
            {confirmDelete ? (
              <div className="inline-flex items-center gap-2 text-sm text-red-600">
                <span className="font-semibold">Confirmar exclusão?</span>
                <button type="button" disabled={deleting} onClick={() => onDelete(local.id)} className="underline disabled:opacity-50">{deleting ? 'Excluindo...' : 'Sim, excluir'}</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="underline">Cancelar</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                <Trash2 size={14} /> Excluir parceiro
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Fechar</button>
            <button type="button" disabled={saving || !local.dirty} onClick={() => onSave(local)}
              className="inline-flex items-center gap-2 rounded-full bg-[#275ca8] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
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
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newCodrev, setNewCodrev] = useState('')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  const selectedParticipant = useMemo(() => participants.find(p => p.id === selectedId) ?? null, [participants, selectedId])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const [pR, peR, prR, lR] = await Promise.all([
          supabase.from('crm_participants').select('*').order('nome'),
          supabase.from('crm_import_files').select('period,created_at').order('created_at', { ascending: false }).limit(4000),
          supabase.from('crm_profiles').select('id,nome,email,role,status'),
          supabase.from('crm_profile_participants').select('profile_id,participant_id,created_at'),
        ])
        if (pR.error) throw pR.error
        if (!active) return

        const uniquePeriods = [...new Set((peR.data ?? []).map(i => String(i.period || '')).filter(Boolean))]
        const profileMap = new Map((prR.data ?? []).map(i => [i.id, i]))
        const accessMap: Record<string, ParticipantAccess[]> = {}
        for (const link of lR.data ?? []) {
          const p = profileMap.get(link.profile_id)
          if (!p) continue
          if (!accessMap[link.participant_id]) accessMap[link.participant_id] = []
          accessMap[link.participant_id].push({ id: p.id, nome: p.nome, email: p.email, role: p.role, status: p.status, linked_at: link.created_at })
        }

        setParticipants(((pR.data ?? []) as Participant[]).map(p => ({ ...p, dirty: false })))
        setPeriods(uniquePeriods)
        setSelectedPeriod(c => c || uniquePeriods[0] || '')
        setAccessByParticipant(accessMap)
      } catch (error) {
        if (!active) return
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erro ao carregar parceiros.' })
      } finally {
        if (active) setLoading(false)
      }
    }
    if (isAdmin) void load()
    else setLoading(false)
    return () => { active = false }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin || !selectedPeriod) { setSales([]); setValidations([]); return }
    let active = true
    async function loadPeriod() {
      setLoadingPeriod(true)
      try {
        const [sR, vR] = await Promise.all([
          supabase.from('crm_sales').select('*').eq('period', selectedPeriod),
          supabase.from('crm_validations').select('*').eq('period', selectedPeriod),
        ])
        if (!active) return
        setSales((sR.data ?? []) as SalesRow[])
        setValidations((vR.data ?? []) as ValidationRow[])
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
      map.get(key)!.push(row)
    }
    return map
  }, [sales])

  const validationsByParticipant = useMemo(() => {
    const map = new Map<string, ValidationRow[]>()
    for (const row of validations) {
      const key = row.participant_id || normalizeLookup(row.participant_nome)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return map
  }, [validations])

  const reportsByParticipant = useMemo(() => {
    const m = new Map<string, ParticipantMetrics>()
    for (const p of participants) {
      const s = salesByParticipant.get(p.id) ?? salesByParticipant.get(normalizeLookup(p.nome)) ?? []
      const v = validationsByParticipant.get(p.id) ?? validationsByParticipant.get(normalizeLookup(p.nome)) ?? []
      m.set(p.id, buildReport(p, s, v))
    }
    return m
  }, [participants, salesByParticipant, validationsByParticipant])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return participants
    return participants.filter(p =>
      [p.nome, p.fantasia, p.faixa, p.nome_vendedor, p.nome_validador, p.codigo_revenda, p.email, p.telefone, p.razao_social].some(v => String(v ?? '').toLowerCase().includes(term))
    )
  }, [participants, search])

  async function saveParticipant(edited: EditableParticipant) {
    setSavingId(edited.id)
    setMessage(null)
    try {
      const payload = {
        fantasia: edited.fantasia?.trim() || null, faixa: edited.faixa?.trim() || null,
        nome_vendedor: edited.nome_vendedor?.trim() || null, nome_validador: edited.nome_validador?.trim() || null,
        codigo_revenda: edited.codigo_revenda?.trim() || null, email: edited.email?.trim() || null,
        telefone: edited.telefone?.trim() || null, razao_social: edited.razao_social?.trim() || null,
        documento: edited.documento?.trim() || null, contato_financeiro: edited.contato_financeiro?.trim() || null,
        percentual_venda: edited.percentual_venda ?? 0, percentual_software: edited.percentual_software ?? 0,
        percentual_hardware: edited.percentual_hardware ?? 0, imposto: edited.imposto ?? 0,
        contabilidade: edited.contabilidade ?? 0, verificacao: edited.verificacao ?? 0,
        favorecido: edited.favorecido?.trim() || null, banco: edited.banco?.trim() || null,
        agencia: edited.agencia?.trim() || null, conta: edited.conta?.trim() || null,
        tipo_conta: edited.tipo_conta?.trim() || null, pix: edited.pix?.trim() || null,
        observacoes_financeiras: edited.observacoes_financeiras?.trim() || null, ativo: edited.ativo,
      }
      const { error } = await supabase.from('crm_participants').update(payload).eq('id', edited.id)
      if (error) throw error
      setParticipants(c => c.map(p => p.id === edited.id ? { ...p, ...payload, dirty: false } : p))
      setMessage({ type: 'ok', text: `${edited.nome} atualizado.` })
      setSelectedId(null)
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erro ao salvar.' })
    } finally {
      setSavingId(null)
    }
  }

  async function deleteParticipant(id: string) {
    setDeletingId(id)
    setMessage(null)
    try {
      const { error } = await supabase.from('crm_participants').delete().eq('id', id)
      if (error) throw error
      setParticipants(c => c.filter(p => p.id !== id))
      setSelectedId(null)
      setMessage({ type: 'ok', text: 'Parceiro excluído.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erro ao excluir.' })
    } finally {
      setDeletingId(null)
    }
  }

  async function sendReset(participant: EditableParticipant, email: string | null) {
    if (!email) { setMessage({ type: 'error', text: 'Sem e-mail configurado.' }); return }
    setResettingId(participant.id)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?reset_password=1` })
      if (error) throw error
      setMessage({ type: 'ok', text: `Link enviado para ${email}.` })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erro ao enviar.' })
    } finally {
      setResettingId(null)
    }
  }

  async function createParticipant() {
    const nome = newNome.trim()
    if (!nome) return
    setCreating(true)
    setMessage(null)
    const slug = `${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`
    try {
      const { data, error } = await supabase.from('crm_participants').insert({ nome, slug, codigo_revenda: newCodrev.trim() || null }).select().single()
      if (error) throw error
      setParticipants(c => [...c, { ...(data as Participant), dirty: false }])
      setNewNome(''); setNewCodrev(''); setShowNew(false)
      setMessage({ type: 'ok', text: `Parceiro "${nome}" criado.` })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erro ao criar.' })
    } finally {
      setCreating(false)
    }
  }

  async function importPartnersFile(file: File) {
    setImporting(true)
    setMessage(null)
    try {
      const allRows = await readSpreadsheet(file)
      const parsed = parsePartnersSpreadsheet(allRows)
      if (parsed.length === 0) { setMessage({ type: 'error', text: 'Nenhum parceiro encontrado. Verifique a coluna "Nome Vendedor".' }); return }
      let created = 0, updated = 0
      for (const row of parsed) {
        const existing = participants.find(p => p.codigo_revenda === row.codigo_revenda && row.codigo_revenda)
        if (existing) {
          await supabase.from('crm_participants').update({ nome_vendedor: row.nome_vendedor, nome_validador: row.nome_validador, fantasia: row.fantasia, faixa: row.faixa, percentual_venda: row.percentual_venda, percentual_software: row.percentual_software, percentual_hardware: row.percentual_hardware, razao_social: row.razao_social, email: row.email, imposto: row.imposto, contabilidade: row.contabilidade, verificacao: row.verificacao }).eq('id', existing.id)
          updated++
        } else {
          const { data, error } = await supabase.from('crm_participants').insert(row).select().single()
          if (!error && data) { setParticipants(c => [...c, { ...(data as Participant), dirty: false }]); created++ }
        }
      }
      if (updated > 0) {
        const { data } = await supabase.from('crm_participants').select('*').order('nome')
        if (data) setParticipants((data as Participant[]).map(p => ({ ...p, dirty: false })))
      }
      setMessage({ type: 'ok', text: `Importação: ${created} criado(s), ${updated} atualizado(s).` })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erro ao importar.' })
    } finally {
      setImporting(false)
    }
  }

  if (!isAdmin) return (
    <div className="p-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-3xl font-bold text-slate-900">Parceiros</h2>
        <p className="mt-3 text-slate-500">Este módulo é exclusivo do administrador.</p>
      </div>
    </div>
  )

  return (
    <div className="p-6">
      <div className="space-y-5">
        {/* Header */}
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Base comercial</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">Parceiros</h2>
              <p className="mt-1 text-sm text-slate-500">Clique em um parceiro para editar seus dados.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="w-56 rounded-2xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                {periods.length === 0 && <option value="">Sem períodos</option>}
                {periods.map(p => <option key={p} value={p}>{formatPeriod(p)}</option>)}
              </select>
              <button type="button" onClick={() => setShowNew(v => !v)} className="inline-flex items-center gap-2 rounded-full bg-[#275ca8] px-4 py-2.5 text-sm font-semibold text-white">
                {showNew ? <X size={15} /> : <Plus size={15} />} {showNew ? 'Cancelar' : 'Novo'}
              </button>
              <label className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${importing ? 'pointer-events-none opacity-50' : ''}`}>
                <Upload size={15} /> {importing ? 'Importando...' : 'Importar'}
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={importing}
                  onChange={e => { const f = e.target.files?.[0]; if (f) { void importPartnersFile(f); e.target.value = '' } }} />
              </label>
            </div>
          </div>

          {showNew && (
            <div className="mt-5 rounded-[20px] border border-blue-200 bg-blue-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-700">Novo parceiro</p>
              <div className="flex flex-wrap gap-3">
                <input value={newNome} onChange={e => setNewNome(e.target.value)} placeholder="Nome do parceiro *" className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                <input value={newCodrev} onChange={e => setNewCodrev(e.target.value)} placeholder="Código de revenda" className="w-44 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="button" disabled={creating || !newNome.trim()} onClick={createParticipant} className="inline-flex items-center gap-2 rounded-2xl bg-[#275ca8] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  <Save size={14} /> {creating ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </div>
          )}
        </section>

        {message && (
          <div className={`rounded-[20px] px-5 py-4 text-sm ${message.type === 'ok' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-red-200 bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            { icon: Building2, title: 'Parceiros', value: String(participants.length), detail: 'Base total' },
            { icon: Percent, title: 'Com codrev', value: String(participants.filter(p => p.codigo_revenda).length), detail: 'Vinculados à planilha' },
            { icon: UserRound, title: 'Com acesso', value: String(Object.values(accessByParticipant).filter(a => a.length > 0).length), detail: 'Com login ativo' },
            { icon: ShieldCheck, title: 'Em relatório', value: loadingPeriod ? '...' : String(filtered.length), detail: selectedPeriod ? formatPeriod(selectedPeriod) : 'Sem período' },
          ].map(({ icon: Icon, title, value, detail }) => (
            <div key={title} className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Icon size={18} /></div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
              <p className="mt-1 text-xs text-slate-500">{detail}</p>
            </div>
          ))}
        </div>

        {/* Lista */}
        <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">Nenhum parceiro encontrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <th className="px-5 py-3">Parceiro</th>
                  <th className="px-5 py-3 hidden sm:table-cell">Codrev</th>
                  <th className="px-5 py-3 hidden md:table-cell">Faixa</th>
                  <th className="px-5 py-3 hidden lg:table-cell">Bruto {selectedPeriod ? formatPeriod(selectedPeriod) : ''}</th>
                  <th className="px-5 py-3 hidden lg:table-cell">Líquido</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(p => {
                  const r = reportsByParticipant.get(p.id) ?? emptyMetrics()
                  return (
                    <tr key={p.id} onClick={() => setSelectedId(p.id)} className="cursor-pointer hover:bg-blue-50 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{p.nome}</p>
                        <p className="text-xs text-slate-500">{p.fantasia || '—'}</p>
                      </td>
                      <td className="px-5 py-4 hidden sm:table-cell text-slate-600">{p.codigo_revenda || '—'}</td>
                      <td className="px-5 py-4 hidden md:table-cell text-slate-600">{p.faixa || '—'}</td>
                      <td className="px-5 py-4 hidden lg:table-cell text-slate-700 font-medium">{money(r.brutoParceiro)}</td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span className={`font-semibold ${r.liquido >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{money(r.liquido)}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${p.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {p.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Modal */}
      {selectedParticipant && (
        <EditModal
          participant={selectedParticipant}
          accessRows={accessByParticipant[selectedParticipant.id] ?? []}
          report={reportsByParticipant.get(selectedParticipant.id) ?? emptyMetrics()}
          periodLabel={selectedPeriod ? formatPeriod(selectedPeriod) : 'sem período'}
          onSave={saveParticipant}
          onDelete={deleteParticipant}
          onSendReset={sendReset}
          onClose={() => setSelectedId(null)}
          saving={savingId === selectedParticipant.id}
          deleting={deletingId === selectedParticipant.id}
          resetting={resettingId === selectedParticipant.id}
        />
      )}
    </div>
  )
}
