import * as XLSX from 'xlsx'

export type ImportType = 'revenda' | 'validacoes' | 'renovacoes'
export type ImportSourceArea = 'principal' | 'historico_renovacao'

export type ParsedRow = Record<string, string>

export type ImportInfo = {
  type: ImportType
  period: string
  periods: string[]
  sourceArea: ImportSourceArea
}

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  janeiro: '01',
  fev: '02',
  fevereiro: '02',
  mar: '03',
  marco: '03',
  março: '03',
  abr: '04',
  abril: '04',
  mai: '05',
  maio: '05',
  jun: '06',
  junho: '06',
  jul: '07',
  julho: '07',
  ago: '08',
  agosto: '08',
  set: '09',
  setembro: '09',
  out: '10',
  outubro: '10',
  nov: '11',
  novembro: '11',
  dez: '12',
  dezembro: '12',
}

const HEADER_SIGNALS = new Set([
  'PEDIDO',
  'DATA DE VENCIMENTO',
  'CLIENTE',
  'NOME CLIENTE',
  'EMAIL',
  'E-MAIL',
  'TELEFONE',
  'TELE',
  'PRODUTO',
  'AR',
  'PONTO DE ATENDIMENTO',
  'STATUS DO PEDIDO',
  'STATUS PEDIDO',
  'CPF',
  'CNPJ',
  'RAZAO SOCIAL',
  'NOME VENDEDOR',
  'NOME VALIDADOR',
  'DESC. AGENTE VAL.',
  'AGENTE',
  'DT.PEDIDO',
  'DT.VERIFICAÇÃO',
  'DT.VALIDAÇÃO',
  'VAL. FATURAMENTO',
  'VALOR TOT. COMISS.',
  'VAL. BRUTO SOFT',
  'VAL. BRUTO HARD',
  'VAL. COMISS. SOFT',
  'VAL. COMISS. HARD',
])

const ROW_ALIAS_GROUPS: Array<[string, string[]]> = [
  ['Cliente', ['Cliente', 'Nome Cliente']],
  ['Nome Cliente', ['Nome Cliente', 'Cliente']],
  ['Email', ['Email', 'E-MAIL', 'E-mail']],
  ['Telefone', ['Telefone', 'Tele', 'Fone', 'Celular']],
  ['Tele', ['Tele', 'Telefone']],
  ['Data de Vencimento', ['Data de Vencimento', 'Vencimento', 'Data Vencimento']],
  ['Status do Pedido', ['Status do Pedido', 'Status Pedido', 'Status']],
  ['Status Pedido', ['Status Pedido', 'Status do Pedido', 'Status']],
  ['Ponto de Atendimento', ['Ponto de Atendimento', 'Ponto Atendimento']],
  ['Razão Social', ['Razão Social', 'Razao Social']],
  ['Agente', ['Agente', 'Desc. Agente Val.']],
  ['Desc. Agente Val.', ['Desc. Agente Val.', 'Agente']],
]

function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function cleanHeaderLabel(value: unknown) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeHeaderSignal(value: unknown) {
  return normalizeText(cleanHeaderLabel(value))
}

function scoreHeaderRow(cells: unknown[]) {
  return cells.reduce<number>((score, cell) => score + (HEADER_SIGNALS.has(normalizeHeaderSignal(cell)) ? 1 : 0), 0)
}

function findBestHeaderRow(matrix: unknown[][]) {
  let bestIndex = 0
  let bestScore = -1
  const limit = Math.min(matrix.length, 20)

  for (let index = 0; index < limit; index += 1) {
    const row = Array.isArray(matrix[index]) ? matrix[index] : []
    const score = scoreHeaderRow(row)
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  }

  return { index: bestIndex, score: bestScore }
}

function enrichRowAliases(row: ParsedRow) {
  const enriched = { ...row }

  for (const [targetKey, aliases] of ROW_ALIAS_GROUPS) {
    if (!String(enriched[targetKey] ?? '').trim()) {
      const sourceKey = aliases.find((alias) => String(enriched[alias] ?? '').trim())
      if (sourceKey) enriched[targetKey] = enriched[sourceKey]
    }
  }

  return enriched
}

function parseSheetRows(sheet: XLSX.WorkSheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  }) as unknown[][]

  if (!matrix.length) return { rows: [] as ParsedRow[], headerScore: 0 }

  const { index: headerIndex, score: headerScore } = findBestHeaderRow(matrix)
  const headers = (matrix[headerIndex] || []).map(cleanHeaderLabel)
  const rows: ParsedRow[] = []

  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const values = matrix[rowIndex] || []
    if (!values.some((value) => String(value ?? '').trim())) continue

    const row: ParsedRow = {}
    headers.forEach((header, columnIndex) => {
      if (!header || /^__EMPTY/i.test(header)) return
      row[header] = String(values[columnIndex] ?? '')
    })

    if (Object.keys(row).length) rows.push(enrichRowAliases(row))
  }

  return { rows, headerScore }
}

export async function readSpreadsheet(file: File) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false })
  const rows: ParsedRow[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const parsed = parseSheetRows(sheet)
    if (parsed.rows.length) rows.push(...parsed.rows)
  }

  return rows
}

export function parseCurrency(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const normalized = raw
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) ? num : 0
}

function buildPeriodSort(period: string) {
  return /^\d{6}$/.test(period) ? `${period.slice(2)}${period.slice(0, 2)}` : period
}

function parsePeriodFromDateValue(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  let match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/)
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3]
    return `${String(match[2]).padStart(2, '0')}${year}`
  }

  match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (match) return `${String(match[2]).padStart(2, '0')}${match[1]}`

  match = raw.match(/^(\d{1,2})[\/.-](\d{4})$/)
  if (match) return `${String(match[1]).padStart(2, '0')}${match[2]}`

  return null
}

function extractRenewalPeriods(name: string) {
  const upper = normalizeText(name)
  const periods = new Set<string>()
  const addPeriod = (month: string | undefined, year: string | undefined) => {
    const mm = String(month || '').padStart(2, '0')
    const yyyy = String(year || '')
    if (/^\d{2}$/.test(mm) && /^\d{4}$/.test(yyyy)) periods.add(`${mm}${yyyy}`)
  }

  let match = upper.match(/^RENOVACAO\s+(\d{2,4})\s+([A-Z]+)\.(XLSX|XLS|CSV)$/)
  if (match) addPeriod(MONTH_MAP[match[2].toLowerCase()], match[1].length === 2 ? `20${match[1]}` : match[1])

  match = upper.match(/^RENOVACAO\s+([A-Z]+)\s+(\d{4})\.(XLSX|XLS|CSV)$/)
  if (match) addPeriod(MONTH_MAP[match[1].toLowerCase()], match[2])

  match = upper.match(/^RELATORIORENOVACAOANALITICO\s+(\d{2})_(\d{2})\.(XLSX|XLS|CSV)$/)
  if (match) addPeriod(match[1], `20${match[2]}`)

  match = upper.match(/^RELATORIORENOVACAOANALITICO\s+(\d{2})\s+E\s+(\d{2})_(\d{2})\.(XLSX|XLS|CSV)$/)
  if (match) {
    addPeriod(match[1], `20${match[3]}`)
    addPeriod(match[2], `20${match[3]}`)
  }

  match = upper.match(/^RELATORIORENOVACAO([A-Z]+)(\d{4})\.(XLSX|XLS|CSV)$/)
  if (match) addPeriod(MONTH_MAP[match[1].toLowerCase()], match[2])

  match = upper.match(/^RELATORIORENOVACAO\s+([A-Z]+)(\d{2})\.(XLSX|XLS|CSV)$/)
  if (match) addPeriod(MONTH_MAP[match[1].toLowerCase()], `20${match[2]}`)

  match = upper.match(/^(\d{2})\s+([A-Z]+)\.(CSV|XLSX|XLS)$/)
  if (match) addPeriod(MONTH_MAP[match[2].toLowerCase()], `20${match[1]}`)

  match = upper.match(/^RENOVACAO\s+\d{2}([A-Z]+)\s+\d{2}([A-Z]+)\s+(\d{4})\.(XLSX|XLS|CSV)$/)
  if (match) {
    addPeriod(MONTH_MAP[match[1].toLowerCase()], match[3])
    addPeriod(MONTH_MAP[match[2].toLowerCase()], match[3])
  }

  return [...periods].sort((a, b) => buildPeriodSort(a).localeCompare(buildPeriodSort(b)))
}

function extractPeriodsFromRows(rows: ParsedRow[], keys: string[]) {
  const periods = new Set<string>()

  for (const row of rows) {
    for (const key of keys) {
      const period = parsePeriodFromDateValue(row[key])
      if (period) periods.add(period)
    }
  }

  return [...periods].sort((a, b) => buildPeriodSort(a).localeCompare(buildPeriodSort(b)))
}

function looksLikeRenewalRows(rows: ParsedRow[]) {
  const keys = new Set<string>()
  for (const row of rows.slice(0, 5)) {
    for (const key of Object.keys(row || {})) keys.add(normalizeText(key))
  }

  const signals = [
    'CLIENTE',
    'PEDIDO',
    'DATA DE VENCIMENTO',
    'PRODUTO',
    'STATUS DO PEDIDO',
    'PONTO DE ATENDIMENTO',
    'AGENTE',
    'AR',
  ]

  return signals.filter((signal) => keys.has(signal)).length >= 3
}

export function resolveImportInfo(fileName: string, rows: ParsedRow[], expectedType: ImportType, expectedSourceArea: ImportSourceArea = 'principal'): ImportInfo {
  if (expectedType === 'revenda') {
    const periods = extractPeriodsFromRows(rows, ['Dt.Verificação', 'Dt.Pedido'])
    if (!periods.length) throw new Error(`Não consegui identificar o período do arquivo ${fileName}. Verifique as colunas de datas da revenda.`)
    return { type: 'revenda', period: periods[0], periods, sourceArea: 'principal' }
  }

  if (expectedType === 'validacoes') {
    const periods = extractPeriodsFromRows(rows, ['Dt.Validação', 'Dt.Pedido'])
    if (!periods.length) throw new Error(`Não consegui identificar o período do arquivo ${fileName}. Verifique as colunas de datas das validações.`)
    return { type: 'validacoes', period: periods[0], periods, sourceArea: 'principal' }
  }

  if (!looksLikeRenewalRows(rows)) {
    throw new Error(`O arquivo ${fileName} não parece uma planilha de renovação válida.`)
  }

  const periodsFromRows = extractPeriodsFromRows(rows, ['Data de Vencimento', 'Vencimento', 'Data Vencimento'])
  const periods = periodsFromRows.length ? periodsFromRows : extractRenewalPeriods(fileName)
  if (!periods.length) {
    throw new Error(`Não consegui identificar o período do arquivo ${fileName}. Verifique se a planilha possui a coluna "Data de Vencimento".`)
  }

  const sourceArea = expectedSourceArea || (/RELATORIORENOVACAO|^\d{2}\s+[A-Z]/.test(normalizeText(fileName)) ? 'historico_renovacao' : 'principal')
  return { type: 'renovacoes', period: periods[0], periods, sourceArea }
}

export function groupRowsByPeriod(rows: ParsedRow[], type: ImportType, fallbackPeriod: string) {
  const groups = new Map<string, ParsedRow[]>()
  const keys =
    type === 'renovacoes'
      ? ['Data de Vencimento', 'Vencimento', 'Data Vencimento']
      : type === 'validacoes'
        ? ['Dt.Validação', 'Dt.Pedido']
        : ['Dt.Verificação', 'Dt.Pedido']

  for (const row of rows) {
    let period: string | null = null
    for (const key of keys) {
      period = parsePeriodFromDateValue(row[key])
      if (period) break
    }
    period = period || fallbackPeriod
    if (!period) continue
    if (!groups.has(period)) groups.set(period, [])
    groups.get(period)?.push(row)
  }

  return groups
}
