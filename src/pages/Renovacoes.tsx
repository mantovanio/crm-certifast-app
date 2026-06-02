import { useEffect, useMemo, useState } from 'react'
import { Phone, Save, Search, UserRound } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { comparePeriodsDesc, formatPeriod, safeText } from '@/lib/certifast'
import { supabase } from '@/lib/supabase'
import type { CustomerRow, RenewalRow, SalesRow, ValidationRow } from '@/types'

type RenewalSituation = 'renovado' | 'em_validacao' | 'a_renovar' | 'a_vencer'

type RenewalCustomer = {
  customerId: string | null
  documentKey: string
  nome: string
  email: string | null
  telefone: string | null
  cpf: string | null
  cnpj: string | null
  razaoSocial: string | null
  participantNome: string | null
  agente: string | null
  ar: string | null
  pontoAtendimento: string | null
  contatoStatus: string | null
  observacoes: string | null
  proximoContatoEm: string | null
  ultimoVencimento: string | null
  statusAtual: string | null
  situacao: RenewalSituation
  situacaoDetalhe: string
  ultimaVendaEm: string | null
  ultimaValidacaoEm: string | null
  totalRegistros: number
  history: RenewalRow[]
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </div>
  )
}

function normalizeLookup(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w@.\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function dateSortValue(value: string | null | undefined) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) return `${match[3]}${match[2].padStart(2, '0')}${match[1].padStart(2, '0')}`
  return raw
}

function chooseLatestText(rows: RenewalRow[], picker: (row: RenewalRow) => string | null) {
  const ordered = [...rows].sort((a, b) => dateSortValue(b.data_vencimento).localeCompare(dateSortValue(a.data_vencimento)))
  for (const row of ordered) {
    const value = String(picker(row) ?? '').trim()
    if (value) return value
  }
  return null
}

function normalizeCustomerKey(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function nextPeriod(period: string, offset: number) {
  if (!/^\d{6}$/.test(period)) return period
  const month = Number(period.slice(0, 2))
  const year = Number(period.slice(2))
  const date = new Date(year, month - 1 + offset, 1)
  return `${String(date.getMonth() + 1).padStart(2, '0')}${date.getFullYear()}`
}

function buildRelatedPeriods(period: string) {
  return [nextPeriod(period, -1), period, nextPeriod(period, 1), nextPeriod(period, 2)]
}

function isOperationallyValid(status: string | null | undefined) {
  const normalized = normalizeLookup(status)
  if (!normalized) return true
  return !['cancelado', 'cancelada', 'reprovado', 'reprovada', 'estornado', 'estornada'].some((item) => normalized.includes(item))
}

function compareDateDesc(a: string | null | undefined, b: string | null | undefined) {
  return dateSortValue(b).localeCompare(dateSortValue(a))
}

function classifyCustomer(
  customer: Pick<RenewalCustomer, 'ultimoVencimento' | 'statusAtual'>,
  salesMatches: SalesRow[],
  validationMatches: ValidationRow[],
): Pick<RenewalCustomer, 'situacao' | 'situacaoDetalhe' | 'ultimaVendaEm' | 'ultimaValidacaoEm'> {
  const validSales = salesMatches.filter((item) => isOperationallyValid(item.status)).sort((a, b) => compareDateDesc(a.data_verificacao || a.data_pedido, b.data_verificacao || b.data_pedido))
  const validValidations = validationMatches.filter((item) => isOperationallyValid(item.status)).sort((a, b) => compareDateDesc(a.data_validacao || a.data_pedido, b.data_validacao || b.data_pedido))
  const ultimaVendaEm = validSales[0]?.data_verificacao || validSales[0]?.data_pedido || null
  const ultimaValidacaoEm = validValidations[0]?.data_validacao || validValidations[0]?.data_pedido || null
  const hoje = new Date()
  const vencimento = customer.ultimoVencimento ? dateSortValue(customer.ultimoVencimento) : ''
  const hojeKey = `${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, '0')}${String(hoje.getDate()).padStart(2, '0')}`

  if (validValidations.length) {
    return {
      situacao: 'renovado',
      situacaoDetalhe: `Validação encontrada em ${safeText(ultimaValidacaoEm)}.`,
      ultimaVendaEm,
      ultimaValidacaoEm,
    }
  }

  if (validSales.length) {
    return {
      situacao: 'em_validacao',
      situacaoDetalhe: `Venda encontrada em ${safeText(ultimaVendaEm)} aguardando fechamento.`,
      ultimaVendaEm,
      ultimaValidacaoEm,
    }
  }

  if (vencimento && vencimento >= hojeKey) {
    return {
      situacao: 'a_vencer',
      situacaoDetalhe: `Vencimento futuro em ${safeText(customer.ultimoVencimento)} sem venda vinculada ainda.`,
      ultimaVendaEm,
      ultimaValidacaoEm,
    }
  }

  return {
    situacao: 'a_renovar',
    situacaoDetalhe: `Sem venda ou validação vinculada após o vencimento ${safeText(customer.ultimoVencimento)}.`,
    ultimaVendaEm,
    ultimaValidacaoEm,
  }
}

function buildCustomers(
  rows: RenewalRow[],
  customersByDocument: Map<string, CustomerRow>,
  salesByKey: Map<string, SalesRow[]>,
  validationsByKey: Map<string, ValidationRow[]>,
) {
  const grouped = new Map<string, RenewalRow[]>()

  for (const row of rows) {
    const key = row.document_key || `${row.cpf || ''}|${row.cnpj || ''}|${row.email || ''}|${row.telefone || ''}|${row.cliente || ''}`
    if (!key) continue
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)?.push(row)
  }

  return [...grouped.entries()].map(([documentKey, history]) => {
    const orderedHistory = [...history].sort((a, b) => dateSortValue(b.data_vencimento).localeCompare(dateSortValue(a.data_vencimento)))
    const latest = orderedHistory[0]
    const persisted = customersByDocument.get(documentKey)
    const nameKey = normalizeCustomerKey(persisted?.nome || latest?.cliente)
    const salesMatches = [...(salesByKey.get(documentKey) ?? []), ...(nameKey ? salesByKey.get(nameKey) ?? [] : [])]
    const validationMatches = [...(validationsByKey.get(documentKey) ?? []), ...(nameKey ? validationsByKey.get(nameKey) ?? [] : [])]
    const situation = classifyCustomer(
      { ultimoVencimento: latest?.data_vencimento || null, statusAtual: chooseLatestText(orderedHistory, (row) => row.status_pedido) },
      salesMatches,
      validationMatches,
    )

    return {
      customerId: persisted?.id || latest?.customer_id || null,
      documentKey,
      nome: persisted?.nome || chooseLatestText(orderedHistory, (row) => row.cliente) || 'Cliente sem nome',
      email: persisted?.email_principal || chooseLatestText(orderedHistory, (row) => row.email),
      telefone: persisted?.telefone_principal || chooseLatestText(orderedHistory, (row) => row.telefone),
      cpf: persisted?.cpf || chooseLatestText(orderedHistory, (row) => row.cpf),
      cnpj: persisted?.cnpj || chooseLatestText(orderedHistory, (row) => row.cnpj),
      razaoSocial: persisted?.razao_social || chooseLatestText(orderedHistory, (row) => row.razao_social),
      participantNome: persisted?.participant_nome || chooseLatestText(orderedHistory, (row) => row.participant_nome),
      agente: persisted?.agente || chooseLatestText(orderedHistory, (row) => row.agente),
      ar: persisted?.ar || chooseLatestText(orderedHistory, (row) => row.ar),
      pontoAtendimento: persisted?.ponto_atendimento || chooseLatestText(orderedHistory, (row) => row.ponto_atendimento),
      contatoStatus: persisted?.contato_status || null,
      observacoes: persisted?.observacoes || null,
      proximoContatoEm: persisted?.proximo_contato_em || null,
      ultimoVencimento: latest?.data_vencimento || null,
      statusAtual: chooseLatestText(orderedHistory, (row) => row.status_pedido),
      situacao: situation.situacao,
      situacaoDetalhe: situation.situacaoDetalhe,
      ultimaVendaEm: situation.ultimaVendaEm,
      ultimaValidacaoEm: situation.ultimaValidacaoEm,
      totalRegistros: orderedHistory.length,
      history: orderedHistory,
    } satisfies RenewalCustomer
  })
}

export default function Renovacoes() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [rows, setRows] = useState<RenewalRow[]>([])
  const [customerRows, setCustomerRows] = useState<CustomerRow[]>([])
  const [salesRows, setSalesRows] = useState<SalesRow[]>([])
  const [validationRows, setValidationRows] = useState<ValidationRow[]>([])
  const [periods, setPeriods] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCustomerKey, setSelectedCustomerKey] = useState('')
  const [draftCustomer, setDraftCustomer] = useState<RenewalCustomer | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pageSize = 14

  useEffect(() => {
    let active = true

    async function loadPeriods() {
      setLoading(true)
      setError(null)

      try {
        const { data, error } = await supabase
          .from('crm_renewal_records')
          .select('period, created_at')
          .order('created_at', { ascending: false })
          .limit(4000)

        if (error) throw error

        const uniquePeriods = [...new Set((data ?? []).map((item) => String(item.period ?? '')).filter(Boolean))].sort(comparePeriodsDesc)

        if (!active) return
        setPeriods(uniquePeriods)
        setSelectedPeriod((current) => current || uniquePeriods[0] || '')
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Não foi possível carregar os períodos de renovação.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadPeriods()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selectedPeriod) {
      setRows([])
      setSalesRows([])
      setValidationRows([])
      return
    }

    let active = true

    async function loadRows() {
      setLoading(true)
      setError(null)

      try {
        const relatedPeriods = buildRelatedPeriods(selectedPeriod)
        const [renewalsResp, salesResp, validationsResp] = await Promise.all([
          supabase
            .from('crm_renewal_records')
            .select('*')
            .eq('period', selectedPeriod)
            .order('created_at', { ascending: false }),
          supabase
            .from('crm_sales')
            .select('*')
            .in('period', relatedPeriods)
            .order('created_at', { ascending: false }),
          supabase
            .from('crm_validations')
            .select('*')
            .in('period', relatedPeriods)
            .order('created_at', { ascending: false }),
        ])

        if (renewalsResp.error) throw renewalsResp.error
        if (salesResp.error) throw salesResp.error
        if (validationsResp.error) throw validationsResp.error
        if (!active) return

        const renewalRows = (renewalsResp.data ?? []) as RenewalRow[]
        setRows(renewalRows)
        setSalesRows((salesResp.data ?? []) as SalesRow[])
        setValidationRows((validationsResp.data ?? []) as ValidationRow[])

        const documentKeys = [...new Set(renewalRows.map((row) => row.document_key).filter(Boolean))]
        if (!documentKeys.length) {
          setCustomerRows([])
          return
        }

        const customersResp = await supabase
          .from('crm_customers')
          .select('*')
          .in('document_key', documentKeys)

        if (customersResp.error) {
          console.warn('crm_customers indisponível ou não migrado ainda:', customersResp.error.message)
          setCustomerRows([])
          return
        }

        setCustomerRows((customersResp.data ?? []) as CustomerRow[])
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Não foi possível carregar a carteira de renovação.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadRows()
    return () => { active = false }
  }, [selectedPeriod])

  const customersByDocument = useMemo(
    () => new Map(customerRows.map((item) => [item.document_key, item])),
    [customerRows],
  )

  const salesByKey = useMemo(() => {
    const map = new Map<string, SalesRow[]>()
    for (const row of salesRows) {
      const keys = [row.document_key, normalizeCustomerKey(row.cliente)]
      for (const key of keys.filter(Boolean) as string[]) {
        const current = map.get(key) ?? []
        current.push(row)
        map.set(key, current)
      }
    }
    return map
  }, [salesRows])

  const validationsByKey = useMemo(() => {
    const map = new Map<string, ValidationRow[]>()
    for (const row of validationRows) {
      const keys = [row.document_key, normalizeCustomerKey(row.cliente)]
      for (const key of keys.filter(Boolean) as string[]) {
        const current = map.get(key) ?? []
        current.push(row)
        map.set(key, current)
      }
    }
    return map
  }, [validationRows])

  const customers = useMemo(
    () => buildCustomers(rows, customersByDocument, salesByKey, validationsByKey),
    [customersByDocument, rows, salesByKey, validationsByKey],
  )

  const filteredCustomers = useMemo(() => {
    const term = normalizeLookup(search)
    if (!term) return customers

    return customers.filter((customer) =>
      [
        customer.nome,
        customer.email,
        customer.telefone,
        customer.cpf,
        customer.cnpj,
        customer.razaoSocial,
        customer.agente,
        customer.participantNome,
        customer.pontoAtendimento,
        customer.documentKey,
      ].some((value) => normalizeLookup(value).includes(term)),
    )
  }, [customers, search])

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize))
  const paginatedCustomers = useMemo(
    () => filteredCustomers.slice((page - 1) * pageSize, page * pageSize),
    [filteredCustomers, page],
  )

  useEffect(() => {
    setPage(1)
  }, [search, selectedPeriod])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    if (!paginatedCustomers.length) {
      setSelectedCustomerKey('')
      return
    }

    setSelectedCustomerKey((current) => {
      if (current && paginatedCustomers.some((customer) => customer.documentKey === current)) return current
      return paginatedCustomers[0]?.documentKey || ''
    })
  }, [paginatedCustomers])

  const selectedCustomer = useMemo(
    () => filteredCustomers.find((customer) => customer.documentKey === selectedCustomerKey) || null,
    [filteredCustomers, selectedCustomerKey],
  )

  useEffect(() => {
    setDraftCustomer(selectedCustomer ? { ...selectedCustomer } : null)
  }, [selectedCustomer])

  const byAgent = useMemo(() => {
    const map = new Map<string, number>()
    for (const customer of customers) {
      const key = safeText(customer.agente || customer.participantNome, 'Sem agente definido')
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [customers])

  const statusTotals = useMemo(() => {
    return customers.reduce(
      (acc, customer) => {
        acc[customer.situacao] += 1
        return acc
      },
      { renovado: 0, em_validacao: 0, a_renovar: 0, a_vencer: 0 },
    )
  }, [customers])

  async function saveCustomer() {
    if (!draftCustomer) return
    if (!draftCustomer.customerId && !draftCustomer.documentKey) return

    setSaving(true)
    setError(null)

    try {
      const payload = {
        document_key: draftCustomer.documentKey,
        participant_nome: draftCustomer.participantNome,
        nome: draftCustomer.nome,
        email_principal: draftCustomer.email,
        telefone_principal: draftCustomer.telefone,
        cpf: draftCustomer.cpf,
        cnpj: draftCustomer.cnpj,
        razao_social: draftCustomer.razaoSocial,
        agente: draftCustomer.agente,
        ar: draftCustomer.ar,
        ponto_atendimento: draftCustomer.pontoAtendimento,
        contato_status: draftCustomer.contatoStatus,
        observacoes: draftCustomer.observacoes,
        proximo_contato_em: draftCustomer.proximoContatoEm,
      }

      const resp = await supabase
        .from('crm_customers')
        .upsert(payload, { onConflict: 'document_key' })
        .select('*')
        .single()

      if (resp.error) throw resp.error

      setCustomerRows((current) => {
        const next = current.filter((item) => item.document_key !== draftCustomer.documentKey)
        next.push(resp.data as CustomerRow)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o cadastro do cliente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Módulo de renovação</p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">Carteira consolidada de clientes</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                {isAdmin
                  ? 'Visão consolidada da carteira por cliente, já com pesquisa por contato e histórico por documento.'
                  : 'Sua carteira individual de renovação, com os últimos contatos encontrados na base importada.'}
              </p>
            </div>
            <div className="grid w-full gap-4 lg:max-w-2xl lg:grid-cols-[1fr,220px]">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Buscar cliente</label>
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nome, documento, e-mail, telefone..."
                    className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="w-full">
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
          </div>
        </section>

        {error && <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}

        <section className="grid gap-4 xl:grid-cols-4">
          <SummaryCard label="Registros" value={String(rows.length)} detail="Linhas carregadas da base de renovação." />
          <SummaryCard label="Clientes únicos" value={String(customers.length)} detail={`${statusTotals.renovado} renovado(s) no cruzamento automático.`} />
          <SummaryCard label="Pendentes" value={String(statusTotals.a_renovar)} detail={`${statusTotals.em_validacao} em validação e ${statusTotals.a_vencer} a vencer.`} />
          <SummaryCard label="Período ativo" value={selectedPeriod ? formatPeriod(selectedPeriod) : '—'} detail={`${byAgent.length} agente(s) distintos no período.`} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Clientes da carteira</h3>
            <p className="mt-1 text-sm text-slate-500">Lista corrida com paginação para pesquisa rápida e retomada comercial.</p>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Mostrando {paginatedCustomers.length ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, filteredCustomers.length)}` : '0'} de {filteredCustomers.length} cliente(s)
            </div>

            <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200">
              {filteredCustomers.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  {loading ? 'Carregando carteira...' : 'Nenhum cliente encontrado para a pesquisa atual.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr className="text-left text-slate-500">
                        <th className="px-4 py-3 font-semibold">Cliente</th>
                        <th className="px-4 py-3 font-semibold">Contato</th>
                        <th className="px-4 py-3 font-semibold">Documento</th>
                        <th className="px-4 py-3 font-semibold">Agente</th>
                        <th className="px-4 py-3 font-semibold">Situação</th>
                        <th className="px-4 py-3 font-semibold">Vencimento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCustomers.map((customer) => {
                        const active = customer.documentKey === selectedCustomerKey

                        return (
                          <tr
                            key={customer.documentKey}
                            onClick={() => setSelectedCustomerKey(customer.documentKey)}
                            className={`cursor-pointer border-t border-slate-200 transition ${
                              active ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                            }`}
                          >
                            <td className="px-4 py-4">
                              <div className="font-semibold text-slate-900">{customer.nome}</div>
                              <div className="mt-1 text-xs text-slate-500">{customer.totalRegistros} ocorrência(s)</div>
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              <div>{safeText(customer.email)}</div>
                              <div className="mt-1 text-xs text-slate-500">{safeText(customer.telefone)}</div>
                            </td>
                            <td className="px-4 py-4 text-slate-600">{safeText(customer.cpf || customer.cnpj)}</td>
                            <td className="px-4 py-4 text-slate-600">{safeText(customer.agente || customer.participantNome)}</td>
                            <td className="px-4 py-4">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                customer.situacao === 'renovado'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : customer.situacao === 'em_validacao'
                                    ? 'bg-blue-100 text-blue-700'
                                    : customer.situacao === 'a_vencer'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-red-100 text-red-700'
                              }`}>
                                {customer.situacao === 'renovado'
                                  ? 'Renovado'
                                  : customer.situacao === 'em_validacao'
                                    ? 'Em validação'
                                    : customer.situacao === 'a_vencer'
                                      ? 'A vencer'
                                      : 'A renovar'}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-slate-600">{safeText(customer.ultimoVencimento)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {filteredCustomers.length > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>
                <div className="text-sm text-slate-500">
                  Página <span className="font-semibold text-slate-800">{page}</span> de <span className="font-semibold text-slate-800">{totalPages}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page === totalPages}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            )}
          </div>

          <div className="xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              {!draftCustomer ? (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  {loading ? 'Carregando ficha do cliente...' : 'Selecione um cliente para ver histórico e contato.'}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Ficha do cliente</p>
                      <h3 className="mt-2 text-2xl font-bold text-slate-900">{draftCustomer.nome}</h3>
                      <p className="mt-2 text-sm text-slate-500">
                        Último vencimento em {safeText(draftCustomer.ultimoVencimento)} · status atual {safeText(draftCustomer.statusAtual)}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">{draftCustomer.situacaoDetalhe}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        {draftCustomer.totalRegistros} ocorrência(s) no período
                      </div>
                      <button
                        type="button"
                        onClick={saveCustomer}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-full bg-[#275ca8] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        <Save size={16} />
                        {saving ? 'Salvando...' : 'Salvar cadastro'}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-blue-700">
                          <UserRound size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Contato consolidado</p>
                          <p className="text-sm text-slate-500">Último contato encontrado na carteira importada</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm text-slate-700">
                        <label className="block">
                          <span className="mb-2 block font-semibold">E-mail</span>
                          <input
                            value={draftCustomer.email ?? ''}
                            onChange={(event) => setDraftCustomer((current) => current ? { ...current, email: event.target.value } : current)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-2 block font-semibold">Telefone</span>
                          <input
                            value={draftCustomer.telefone ?? ''}
                            onChange={(event) => setDraftCustomer((current) => current ? { ...current, telefone: event.target.value } : current)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </label>
                        <div><span className="font-semibold">CPF:</span> {safeText(draftCustomer.cpf)}</div>
                        <div><span className="font-semibold">CNPJ:</span> {safeText(draftCustomer.cnpj)}</div>
                        <div><span className="font-semibold">Razão social:</span> {safeText(draftCustomer.razaoSocial)}</div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-emerald-700">
                          <Phone size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Vínculo comercial</p>
                          <p className="text-sm text-slate-500">Origem e responsável atuais na base</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm text-slate-700">
                        <div><span className="font-semibold">Parceiro:</span> {safeText(draftCustomer.participantNome)}</div>
                        <div><span className="font-semibold">Agente:</span> {safeText(draftCustomer.agente)}</div>
                        <div><span className="font-semibold">AR:</span> {safeText(draftCustomer.ar)}</div>
                        <div><span className="font-semibold">Ponto de atendimento:</span> {safeText(draftCustomer.pontoAtendimento)}</div>
                        <div><span className="font-semibold">Última venda:</span> {safeText(draftCustomer.ultimaVendaEm)}</div>
                        <div><span className="font-semibold">Última validação:</span> {safeText(draftCustomer.ultimaValidacaoEm)}</div>
                        <label className="block">
                          <span className="mb-2 block font-semibold">Status de contato</span>
                          <input
                            value={draftCustomer.contatoStatus ?? ''}
                            onChange={(event) => setDraftCustomer((current) => current ? { ...current, contatoStatus: event.target.value } : current)}
                            placeholder="Ex.: ligar hoje, aguardando retorno, renovado..."
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-2 block font-semibold">Próximo contato</span>
                          <input
                            type="date"
                            value={draftCustomer.proximoContatoEm ?? ''}
                            onChange={(event) => setDraftCustomer((current) => current ? { ...current, proximoContatoEm: event.target.value } : current)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-2 block font-semibold">Observações</span>
                          <textarea
                            value={draftCustomer.observacoes ?? ''}
                            onChange={(event) => setDraftCustomer((current) => current ? { ...current, observacoes: event.target.value } : current)}
                            rows={4}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-lg font-bold text-slate-900">Histórico do cliente</h4>
                    <p className="mt-1 text-sm text-slate-500">Base das ocorrências importadas para este documento/chave.</p>
                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-slate-400">
                            <th className="pb-3 pr-4 font-semibold">Pedido</th>
                            <th className="pb-3 pr-4 font-semibold">Vencimento</th>
                            <th className="pb-3 pr-4 font-semibold">Produto</th>
                            <th className="pb-3 pr-4 font-semibold">Agente</th>
                            <th className="pb-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {draftCustomer.history.map((row) => (
                            <tr key={row.id} className="border-b border-slate-100 last:border-0">
                              <td className="py-3 pr-4 font-medium text-slate-800">{safeText(row.pedido)}</td>
                              <td className="py-3 pr-4 text-slate-500">{safeText(row.data_vencimento)}</td>
                              <td className="py-3 pr-4 text-slate-500">{safeText(row.produto)}</td>
                              <td className="py-3 pr-4 text-slate-500">{safeText(row.agente || row.participant_nome)}</td>
                              <td className="py-3 font-medium text-slate-700">{safeText(row.status_pedido)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
