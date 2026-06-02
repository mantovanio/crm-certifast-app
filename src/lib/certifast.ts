export function toNumber(value: unknown) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

export function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function periodSortValue(period: string) {
  if (!/^\d{6}$/.test(period)) return period
  return `${period.slice(2)}${period.slice(0, 2)}`
}

export function comparePeriodsDesc(a: string, b: string) {
  return periodSortValue(b).localeCompare(periodSortValue(a), 'pt-BR')
}

export function formatPeriod(period: string) {
  if (!/^\d{6}$/.test(period)) return period || 'Sem período'
  return `${period.slice(0, 2)}/${period.slice(2)}`
}

export function safeText(value: string | null | undefined, fallback = '—') {
  const text = String(value ?? '').trim()
  return text || fallback
}

export function normalizeKey(value: string | null | undefined, fallback: string) {
  const text = String(value ?? '').trim()
  return text || fallback
}
