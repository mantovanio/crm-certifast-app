import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { comparePeriodsDesc, formatPeriod, safeText } from '@/lib/certifast'
import { supabase } from '@/lib/supabase'
import type { RenewalRow } from '@/types'

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </div>
  )
}

export default function Renovacoes() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [rows, setRows] = useState<RenewalRow[]>([])
  const [periods, setPeriods] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      return
    }

    let active = true

    async function loadRows() {
      setLoading(true)
      setError(null)

      try {
        const { data, error } = await supabase
          .from('crm_renewal_records')
          .select('*')
          .eq('period', selectedPeriod)
          .order('created_at', { ascending: false })

        if (error) throw error
        if (!active) return
        setRows((data ?? []) as RenewalRow[])
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

  const byAgent = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of rows) {
      const key = safeText(row.agente, 'Sem agente definido')
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  return (
    <div className="p-6">
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Próximo módulo</p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">Carteira de renovação</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                {isAdmin
                  ? 'Visão administrativa da carteira importada, já preparada para a próxima fase de tratamento operacional.'
                  : 'Sua carteira individual de renovação, já respeitando o escopo de acesso do usuário logado.'}
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
          <SummaryCard label="Registros" value={String(rows.length)} detail="Itens carregados da base de renovação." />
          <SummaryCard label="Agentes" value={String(byAgent.length)} detail="Agentes distintos no período." />
          <SummaryCard label="Período ativo" value={selectedPeriod ? formatPeriod(selectedPeriod) : '—'} detail="Prévia operacional para a próxima etapa." />
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Oportunidades por agente</h3>
            <p className="mt-1 text-sm text-slate-500">Distribuição atual da carteira por agente.</p>
            <div className="mt-4 space-y-3">
              {byAgent.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  {loading ? 'Carregando carteira...' : 'Nenhuma renovação encontrada neste período.'}
                </div>
              ) : byAgent.map(([agent, total]) => (
                <div key={agent} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">{agent}</span>
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">{total} cliente(s)</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Amostragem da carteira</h3>
            <p className="mt-1 text-sm text-slate-500">Prévia dos itens a tratar na próxima fase do módulo.</p>
            <div className="mt-4 overflow-x-auto">
              {rows.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  {loading ? 'Carregando carteira...' : 'Sem registros para mostrar.'}
                </div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-400">
                      <th className="pb-3 pr-4 font-semibold">Cliente</th>
                      <th className="pb-3 pr-4 font-semibold">Vencimento</th>
                      <th className="pb-3 pr-4 font-semibold">Produto</th>
                      <th className="pb-3 pr-4 font-semibold">Agente</th>
                      <th className="pb-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 18).map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4 font-medium text-slate-800">{safeText(row.cliente)}</td>
                        <td className="py-3 pr-4 text-slate-500">{safeText(row.data_vencimento)}</td>
                        <td className="py-3 pr-4 text-slate-500">{safeText(row.produto)}</td>
                        <td className="py-3 pr-4 text-slate-500">{safeText(row.agente)}</td>
                        <td className="py-3 font-medium text-slate-700">{safeText(row.status_pedido)}</td>
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
