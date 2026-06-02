import { useEffect, useMemo, useState } from 'react'
import { BarChart3, BriefcaseBusiness, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { comparePeriodsDesc, formatPeriod, money, normalizeKey, safeText, toNumber } from '@/lib/certifast'
import { supabase } from '@/lib/supabase'
import type { Participant, SalesRow, ValidationRow } from '@/types'

type SummaryRow = {
  nome: string
  quantidade: number
  faturamento: number
  comissao: number
}

function Card({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: typeof BarChart3 }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
          <p className="mt-2 text-sm text-slate-500">{detail}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <Icon size={22} />
        </div>
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">{text}</div>
}

export default function Comissoes() {
  const { profile, linkedParticipantIds } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [participants, setParticipants] = useState<Participant[]>([])
  const [sales, setSales] = useState<SalesRow[]>([])
  const [validations, setValidations] = useState<ValidationRow[]>([])
  const [periods, setPeriods] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadBase() {
      setLoading(true)
      setError(null)

      try {
        const [participantsResp, salesPeriodsResp, validationsPeriodsResp] = await Promise.all([
          isAdmin
            ? supabase.from('crm_participants').select('*').order('nome')
            : supabase.from('crm_participants').select('*').in('id', linkedParticipantIds.length ? linkedParticipantIds : ['00000000-0000-0000-0000-000000000000']).order('nome'),
          supabase.from('crm_sales').select('period, created_at').order('created_at', { ascending: false }).limit(4000),
          supabase.from('crm_validations').select('period, created_at').order('created_at', { ascending: false }).limit(4000),
        ])

        if (participantsResp.error) throw participantsResp.error
        if (salesPeriodsResp.error) throw salesPeriodsResp.error
        if (validationsPeriodsResp.error) throw validationsPeriodsResp.error

        const allPeriods = [
          ...(salesPeriodsResp.data ?? []).map((item) => String(item.period ?? '')),
          ...(validationsPeriodsResp.data ?? []).map((item) => String(item.period ?? '')),
        ].filter(Boolean)

        const uniquePeriods = [...new Set(allPeriods)].sort(comparePeriodsDesc)

        if (!active) return
        setParticipants((participantsResp.data ?? []) as Participant[])
        setPeriods(uniquePeriods)
        setSelectedPeriod((current) => current || uniquePeriods[0] || '')
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados de comissão.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadBase()
    return () => { active = false }
  }, [isAdmin, linkedParticipantIds])

  useEffect(() => {
    if (!selectedPeriod) {
      setSales([])
      setValidations([])
      return
    }

    let active = true

    async function loadPeriod() {
      setLoading(true)
      setError(null)

      try {
        const [salesResp, validationsResp] = await Promise.all([
          supabase.from('crm_sales').select('*').eq('period', selectedPeriod).order('created_at', { ascending: false }),
          supabase.from('crm_validations').select('*').eq('period', selectedPeriod).order('created_at', { ascending: false }),
        ])

        if (salesResp.error) throw salesResp.error
        if (validationsResp.error) throw validationsResp.error

        if (!active) return
        setSales((salesResp.data ?? []) as SalesRow[])
        setValidations((validationsResp.data ?? []) as ValidationRow[])
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Não foi possível carregar o período selecionado.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadPeriod()
    return () => { active = false }
  }, [selectedPeriod])

  const participantMap = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  )

  const salesTotals = useMemo(() => {
    return sales.reduce((acc, row) => {
      acc.quantidade += 1
      acc.faturamento += toNumber(row.faturamento)
      acc.comissao += toNumber(row.comissao)
      return acc
    }, { quantidade: 0, faturamento: 0, comissao: 0 })
  }, [sales])

  const validationTotals = useMemo(() => {
    return validations.reduce((acc, row) => {
      acc.quantidade += 1
      acc.bruto += toNumber(row.bruto_software) + toNumber(row.bruto_hardware)
      acc.comissao += toNumber(row.comissao_software) + toNumber(row.comissao_hardware)
      return acc
    }, { quantidade: 0, bruto: 0, comissao: 0 })
  }, [validations])

  const salesByVendedor = useMemo(() => {
    const map = new Map<string, SummaryRow>()

    for (const row of sales) {
      const participant = row.participant_id ? participantMap.get(row.participant_id) : null
      const key = normalizeKey(participant?.nome_vendedor, row.participant_nome || 'Sem vendedor definido')
      const current = map.get(key) ?? { nome: key, quantidade: 0, faturamento: 0, comissao: 0 }
      current.quantidade += 1
      current.faturamento += toNumber(row.faturamento)
      current.comissao += toNumber(row.comissao)
      map.set(key, current)
    }

    return [...map.values()].sort((a, b) => b.comissao - a.comissao)
  }, [participantMap, sales])

  const validationsByAgente = useMemo(() => {
    const map = new Map<string, SummaryRow>()

    for (const row of validations) {
      const participant = row.participant_id ? participantMap.get(row.participant_id) : null
      const key = normalizeKey(participant?.nome_validador, row.participant_nome || 'Sem agente definido')
      const current = map.get(key) ?? { nome: key, quantidade: 0, faturamento: 0, comissao: 0 }
      current.quantidade += 1
      current.faturamento += toNumber(row.bruto_software) + toNumber(row.bruto_hardware)
      current.comissao += toNumber(row.comissao_software) + toNumber(row.comissao_hardware)
      map.set(key, current)
    }

    return [...map.values()].sort((a, b) => b.comissao - a.comissao)
  }, [participantMap, validations])

  return (
    <div className="p-6">
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Módulo operacional</p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">Amostragem de vendas e validações</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                {isAdmin
                  ? 'Leitura consolidada da produção por período, com visão por vendedor e agente de registro.'
                  : 'Leitura restrita ao seu escopo de acesso, respeitando os vínculos configurados no CRM.'}
              </p>
            </div>
            <div className="w-full max-w-xs">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Período</label>
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
        </section>

        {error && <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}

        <section className="grid gap-4 xl:grid-cols-3">
          <Card title="Vendas" value={String(salesTotals.quantidade)} detail={`${money(salesTotals.comissao)} em comissão`} icon={BriefcaseBusiness} />
          <Card title="Validações" value={String(validationTotals.quantidade)} detail={`${money(validationTotals.comissao)} em comissão`} icon={ShieldCheck} />
          <Card title="Período ativo" value={selectedPeriod ? formatPeriod(selectedPeriod) : '—'} detail={`${participants.length} parceiro(s) no escopo`} icon={BarChart3} />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Resumo por vendedor</h3>
            <p className="mt-1 text-sm text-slate-500">Baseado nos vínculos dos parceiros importados na Certifast.</p>
            <div className="mt-4 overflow-x-auto">
              {salesByVendedor.length === 0 ? (
                <EmptyState text={loading ? 'Carregando vendas...' : 'Nenhuma venda encontrada neste período.'} />
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-400">
                      <th className="pb-3 pr-4 font-semibold">Vendedor</th>
                      <th className="pb-3 pr-4 font-semibold">Qtd.</th>
                      <th className="pb-3 pr-4 font-semibold">Faturamento</th>
                      <th className="pb-3 font-semibold">Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesByVendedor.map((row) => (
                      <tr key={row.nome} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4 font-medium text-slate-800">{row.nome}</td>
                        <td className="py-3 pr-4 text-slate-500">{row.quantidade}</td>
                        <td className="py-3 pr-4 text-slate-500">{money(row.faturamento)}</td>
                        <td className="py-3 font-semibold text-emerald-700">{money(row.comissao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Resumo por agente de registro</h3>
            <p className="mt-1 text-sm text-slate-500">Leitura das validações associadas ao agente configurado na base.</p>
            <div className="mt-4 overflow-x-auto">
              {validationsByAgente.length === 0 ? (
                <EmptyState text={loading ? 'Carregando validações...' : 'Nenhuma validação encontrada neste período.'} />
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-400">
                      <th className="pb-3 pr-4 font-semibold">Agente</th>
                      <th className="pb-3 pr-4 font-semibold">Qtd.</th>
                      <th className="pb-3 pr-4 font-semibold">Bruto</th>
                      <th className="pb-3 font-semibold">Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationsByAgente.map((row) => (
                      <tr key={row.nome} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4 font-medium text-slate-800">{row.nome}</td>
                        <td className="py-3 pr-4 text-slate-500">{row.quantidade}</td>
                        <td className="py-3 pr-4 text-slate-500">{money(row.faturamento)}</td>
                        <td className="py-3 font-semibold text-emerald-700">{money(row.comissao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Amostragem de vendas</h3>
            <p className="mt-1 text-sm text-slate-500">Últimos registros do período para conferência operacional.</p>
            <div className="mt-4 overflow-x-auto">
              {sales.length === 0 ? (
                <EmptyState text={loading ? 'Carregando vendas...' : 'Sem vendas para mostrar.'} />
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-400">
                      <th className="pb-3 pr-4 font-semibold">Pedido</th>
                      <th className="pb-3 pr-4 font-semibold">Cliente</th>
                      <th className="pb-3 pr-4 font-semibold">Produto</th>
                      <th className="pb-3 pr-4 font-semibold">Status</th>
                      <th className="pb-3 font-semibold">Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.slice(0, 12).map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4 font-medium text-slate-800">{row.pedido}</td>
                        <td className="py-3 pr-4 text-slate-500">{safeText(row.cliente)}</td>
                        <td className="py-3 pr-4 text-slate-500">{safeText(row.produto)}</td>
                        <td className="py-3 pr-4 text-slate-500">{safeText(row.status)}</td>
                        <td className="py-3 font-semibold text-emerald-700">{money(toNumber(row.comissao))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Amostragem de validações</h3>
            <p className="mt-1 text-sm text-slate-500">Visão rápida para auditoria de software e hardware.</p>
            <div className="mt-4 overflow-x-auto">
              {validations.length === 0 ? (
                <EmptyState text={loading ? 'Carregando validações...' : 'Sem validações para mostrar.'} />
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-400">
                      <th className="pb-3 pr-4 font-semibold">Pedido</th>
                      <th className="pb-3 pr-4 font-semibold">Cliente</th>
                      <th className="pb-3 pr-4 font-semibold">Produto</th>
                      <th className="pb-3 pr-4 font-semibold">Status</th>
                      <th className="pb-3 font-semibold">Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validations.slice(0, 12).map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4 font-medium text-slate-800">{row.pedido}</td>
                        <td className="py-3 pr-4 text-slate-500">{safeText(row.cliente)}</td>
                        <td className="py-3 pr-4 text-slate-500">{safeText(row.produto)}</td>
                        <td className="py-3 pr-4 text-slate-500">{safeText(row.status)}</td>
                        <td className="py-3 font-semibold text-emerald-700">{money(toNumber(row.comissao_software) + toNumber(row.comissao_hardware))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
