import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, History, UploadCloud } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { comparePeriodsDesc, formatPeriod, safeText } from '@/lib/certifast'
import { groupRowsByPeriod, parseCurrency, readSpreadsheet, resolveImportInfo, type ImportSourceArea, type ImportType, type ParsedRow } from '@/lib/imports'
import { supabase } from '@/lib/supabase'
import type { ImportFileRow, Participant } from '@/types'

const BUCKET = 'crm-certifast-imports'

type ImportSlot = {
  title: string
  type: ImportType
  sourceArea?: ImportSourceArea
  helper: string
  multiple?: boolean
}

const IMPORT_SLOTS: ImportSlot[] = [
  {
    title: 'Revenda',
    type: 'revenda',
    helper: 'Aceita XLSX, XLS e CSV. O período será identificado pelas colunas de data, não pelo nome do arquivo.',
    multiple: true,
  },
  {
    title: 'Validações',
    type: 'validacoes',
    helper: 'Aceita XLSX, XLS e CSV. O sistema lê pelas colunas do relatório operacional de validação.',
    multiple: true,
  },
  {
    title: 'Renovação do período',
    type: 'renovacoes',
    sourceArea: 'principal',
    helper: 'Use a planilha principal da carteira. O período é detectado pela coluna de vencimento.',
    multiple: true,
  },
  {
    title: 'Histórico de renovação',
    type: 'renovacoes',
    sourceArea: 'historico_renovacao',
    helper: 'Aceita arquivos analíticos ou históricos com nomes variados, desde que as colunas estejam corretas.',
    multiple: true,
  },
]

type ImportState = Record<string, File[]>

type ImportInsertResult = {
  inserted: number
  skipped: number
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

function slugify(value: string) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function cleanKeyPart(value: unknown) {
  return normalizeText(value)
}

function buildSalesDedupKey(record: {
  period: string
  pedido: string
  data_verificacao?: string | null
  produto?: string | null
  participant_nome?: string | null
}) {
  return [
    cleanKeyPart(record.period),
    cleanKeyPart(record.pedido),
    cleanKeyPart(record.data_verificacao),
    cleanKeyPart(record.produto),
    cleanKeyPart(record.participant_nome),
  ].join('|')
}

function buildValidationDedupKey(record: {
  period: string
  pedido: string
  data_validacao?: string | null
  produto?: string | null
  participant_nome?: string | null
}) {
  return [
    cleanKeyPart(record.period),
    cleanKeyPart(record.pedido),
    cleanKeyPart(record.data_validacao),
    cleanKeyPart(record.produto),
    cleanKeyPart(record.participant_nome),
  ].join('|')
}

function buildRenewalDedupKey(record: {
  period: string
  document_key: string
  data_vencimento?: string | null
  produto?: string | null
  pedido?: string | null
}) {
  return [
    cleanKeyPart(record.period),
    cleanKeyPart(record.document_key),
    cleanKeyPart(record.data_vencimento),
    cleanKeyPart(record.produto),
    cleanKeyPart(record.pedido),
  ].join('|')
}

type RenewalImportRecord = {
  import_file_id: string
  customer_id?: string | null
  period: string
  participant_id: string | null
  participant_nome: string | null
  document_key: string
  pedido: string | null
  data_vencimento: string | null
  cliente: string | null
  email: string | null
  telefone: string | null
  produto: string | null
  ar: string | null
  ponto_atendimento: string | null
  agente: string | null
  status_pedido: string | null
  cpf: string | null
  cnpj: string | null
  razao_social: string | null
}

function documentKeyFromRaw({ cpf = '', cnpj = '', email = '', telefone = '', cliente = '' }) {
  const cnpjKey = String(cnpj).replace(/[^\d]/g, '')
  const cpfKey = String(cpf).replace(/[^\d]/g, '')
  const emailKey = normalizeText(email).toLowerCase()
  const phoneKey = String(telefone).replace(/[^\d]/g, '')
  const clientKey = normalizeText(cliente)
  return cnpjKey || cpfKey || emailKey || phoneKey || clientKey
}

function buildImportKey(type: ImportType, sourceArea?: ImportSourceArea) {
  return `${type}:${sourceArea || 'principal'}`
}

function buildParticipantIndex(participants: Participant[]) {
  const byVendor = new Map<string, Participant>()
  const byValidator = new Map<string, Participant>()
  const byAlias = new Map<string, Participant>()
  const byCodrev = new Map<string, Participant>()
  const all = [...participants]

  for (const item of participants) {
    if (item.nome_vendedor) byVendor.set(normalizeText(item.nome_vendedor), item)
    if (item.nome_validador) byValidator.set(normalizeText(item.nome_validador), item)
    byVendor.set(normalizeText(item.nome), item)
    byValidator.set(normalizeText(item.nome), item)
    if (item.codigo_revenda) byCodrev.set(String(item.codigo_revenda).replace(/[^\dA-Za-z]/g, '').toUpperCase(), item)

    const aliases = [item.nome, item.nome_vendedor, item.nome_validador, item.fantasia].filter(Boolean) as string[]
    for (const alias of aliases) {
      const normalized = normalizeText(alias)
      byAlias.set(normalized, item)
      const firstWord = normalized.split(' ')[0]
      if (firstWord) byAlias.set(firstWord, item)
    }
  }

  return { byVendor, byValidator, byAlias, byCodrev, all }
}

function extractCodrev(row: ParsedRow) {
  const value =
    row['Cod.Vendedor'] ||
    row['Cod. Vendedor'] ||
    row['Cod. Vend'] ||
    row['Cod.Vend'] ||
    row['CodVend'] ||
    row['CodRev'] ||
    row['CODREV'] ||
    row['Cod Rev'] ||
    row['Cod. Rev'] ||
    row['Código Revenda'] ||
    row['Codigo Revenda'] ||
    row['Código de Revenda'] ||
    row['Codigo de Revenda'] ||
    ''

  return String(value).replace(/[^\dA-Za-z]/g, '').toUpperCase()
}

function findParticipantForRenewal(
  row: ParsedRow,
  index: ReturnType<typeof buildParticipantIndex>,
) {
  const agente = normalizeText(row['Agente'] || row['Desc. Agente Val.'] || '')
  const ponto = normalizeText(row['Ponto de Atendimento'] || '')
  const ar = normalizeText(row['AR'] || '')

  if (agente && index.byAlias.has(agente)) return index.byAlias.get(agente) ?? null

  for (const participant of index.all) {
    const fields = [participant.nome, participant.nome_vendedor, participant.nome_validador, participant.fantasia]
      .filter(Boolean)
      .map((item) => normalizeText(item))

    if (agente && fields.some((field) => field.includes(agente) || agente.includes(field))) return participant
    if (ponto && fields.some((field) => ponto.includes(field) || field.includes(ponto))) return participant
    if (ar && fields.some((field) => ar.includes(field) || field.includes(ar))) return participant
  }

  return null
}

function ImportCard({
  slot,
  files,
  disabled,
  onFileChange,
  onSubmit,
  running,
}: {
  slot: ImportSlot
  files: File[]
  disabled: boolean
  onFileChange: (slot: ImportSlot, files: File[]) => void
  onSubmit: (slot: ImportSlot) => void
  running: boolean
}) {
  const id = buildImportKey(slot.type, slot.sourceArea)

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <UploadCloud size={20} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">{slot.title}</h3>
          <p className="text-sm text-slate-500">{slot.helper}</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <input
          id={id}
          type="file"
          multiple={slot.multiple}
          accept=".xlsx,.xls,.csv"
          onChange={(event) => onFileChange(slot, Array.from(event.target.files ?? []))}
          className="block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
        />

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          {files.length === 0
            ? 'Nenhum arquivo selecionado.'
            : `${files.length} arquivo(s) pronto(s) para importação.`}
        </div>

        <button
          type="button"
          disabled={disabled || files.length === 0}
          onClick={() => onSubmit(slot)}
          className="w-full rounded-2xl bg-[#275ca8] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? 'Importando...' : `Importar ${slot.title}`}
        </button>
      </div>
    </div>
  )
}

export default function Importacoes() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [participants, setParticipants] = useState<Participant[]>([])
  const [history, setHistory] = useState<ImportFileRow[]>([])
  const [filesBySlot, setFilesBySlot] = useState<ImportState>({})
  const [loading, setLoading] = useState(true)
  const [runningSlot, setRunningSlot] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    let active = true

    async function loadReferenceData() {
      setLoading(true)
      try {
        const [participantsResp, filesResp] = await Promise.all([
          supabase.from('crm_participants').select('*').order('nome'),
          supabase.from('crm_import_files').select('*').order('created_at', { ascending: false }).limit(200),
        ])

        if (participantsResp.error) throw participantsResp.error
        if (filesResp.error) throw filesResp.error

        if (!active) return
        setParticipants((participantsResp.data ?? []) as Participant[])
        setHistory((filesResp.data ?? []) as ImportFileRow[])
      } catch (error) {
        if (!active) return
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível carregar a área de importações.' })
      } finally {
        if (active) setLoading(false)
      }
    }

    if (isAdmin) void loadReferenceData()
    else setLoading(false)

    return () => { active = false }
  }, [isAdmin])

  const participantIndex = useMemo(() => buildParticipantIndex(participants), [participants])

  function setSlotFiles(slot: ImportSlot, files: File[]) {
    setFilesBySlot((current) => ({ ...current, [buildImportKey(slot.type, slot.sourceArea)]: files }))
  }

  async function writeAudit(action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
    if (!profile) return
    await supabase.from('crm_audit_logs').insert({
      actor_id: profile.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    })
  }

  async function uploadRawFile(file: File, info: { type: ImportType; period: string; sourceArea: ImportSourceArea }, customPath?: string) {
    const storagePath = customPath || `${info.sourceArea}/${info.type}/${info.period}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, { upsert: true })
    if (error) throw error
    return storagePath
  }

  async function createImportFile(file: File, info: { type: ImportType; period: string; sourceArea: ImportSourceArea }, storagePath: string | null) {
    const payload = {
      file_name: file.name,
      file_type: info.type,
      period: info.period,
      source_area: info.sourceArea,
      storage_path: storagePath,
      file_size_bytes: file.size,
      imported_by: profile?.id ?? null,
    }

    const { data, error } = await supabase.from('crm_import_files').insert(payload).select('*').single()
    if (error) throw error

    await writeAudit('import_file', 'crm_import_files', String(data.id), payload)
    return data as ImportFileRow
  }

  async function syncRenewalCustomers(records: RenewalImportRecord[]) {
    const uniqueRecords = records.filter((record, index, all) => {
      return all.findIndex((item) => item.document_key === record.document_key) === index
    })

    if (!uniqueRecords.length) return new Map<string, string>()

    const payload = uniqueRecords.map((record) => ({
      document_key: record.document_key,
      participant_id: record.participant_id,
      participant_nome: record.participant_nome,
      nome: record.cliente,
      email_principal: record.email,
      telefone_principal: record.telefone,
      cpf: record.cpf,
      cnpj: record.cnpj,
      razao_social: record.razao_social,
      agente: record.agente,
      ar: record.ar,
      ponto_atendimento: record.ponto_atendimento,
    }))

    const upsertResp = await supabase
      .from('crm_customers')
      .upsert(payload, { onConflict: 'document_key' })
      .select('id,document_key')

    if (upsertResp.error) {
      console.warn('crm_customers indisponível ou não migrado ainda:', upsertResp.error.message)
      return new Map<string, string>()
    }

    return new Map((upsertResp.data ?? []).map((item) => [String(item.document_key), String(item.id)]))
  }

  async function insertSales(rows: ParsedRow[], importFileId: string, period: string): Promise<ImportInsertResult> {
    const records = rows
      .map((row) => {
        const codrev = extractCodrev(row)
        const participant =
          (codrev ? participantIndex.byCodrev.get(codrev) : null) ||
          participantIndex.byVendor.get(normalizeText(row['Nome Vendedor'])) ||
          null
        return {
          import_file_id: importFileId,
          period,
          participant_id: participant?.id || null,
          participant_nome: participant?.nome || String(row['Nome Vendedor'] || row['CodRev'] || '').trim(),
          document_key: documentKeyFromRaw({ cliente: row['Nome Cliente'] }),
          pedido: String(row['Pedido'] || '').trim(),
          cliente: String(row['Nome Cliente'] || '').trim() || null,
          data_pedido: String(row['Dt.Pedido'] || '').trim() || null,
          data_verificacao: String(row['Dt.Verificação'] || '').trim() || null,
          produto: String(row['Desc.Produto'] || '').trim() || null,
          faturamento: parseCurrency(row['Val. Faturamento']),
          comissao: parseCurrency(row['Valor Tot. Comiss.']),
          status: String(row['Status Pedido'] || '').trim() || null,
        }
      })
      .filter((item) => item.pedido)

    const existingResp = await supabase
      .from('crm_sales')
      .select('period,pedido,data_verificacao,produto,participant_nome')
      .eq('period', period)

    if (existingResp.error) throw existingResp.error

    const existingKeys = new Set(
      (existingResp.data ?? []).map((item) => buildSalesDedupKey(item)),
    )
    const pendingKeys = new Set<string>()
    const recordsToInsert = records.filter((record) => {
      const dedupKey = buildSalesDedupKey(record)
      if (existingKeys.has(dedupKey) || pendingKeys.has(dedupKey)) return false
      pendingKeys.add(dedupKey)
      return true
    })

    for (const batch of chunk(recordsToInsert, 300)) {
      const { error } = await supabase.from('crm_sales').insert(batch)
      if (error) throw error
    }

    return {
      inserted: recordsToInsert.length,
      skipped: records.length - recordsToInsert.length,
    }
  }

  async function insertValidations(rows: ParsedRow[], importFileId: string, period: string): Promise<ImportInsertResult> {
    const records = rows
      .map((row) => {
        const codrev = extractCodrev(row)
        const participant =
          (codrev ? participantIndex.byCodrev.get(codrev) : null) ||
          participantIndex.byValidator.get(normalizeText(row['Desc. Agente Val.'] || row['Agente'])) ||
          null
        return {
          import_file_id: importFileId,
          period,
          participant_id: participant?.id || null,
          participant_nome: participant?.nome || String(row['Desc. Agente Val.'] || row['Agente'] || row['CodRev'] || '').trim(),
          document_key: documentKeyFromRaw({ cliente: row['Nome Cliente'] }),
          pedido: String(row['Pedido'] || '').trim(),
          cliente: String(row['Nome Cliente'] || '').trim() || null,
          data_pedido: String(row['Dt.Pedido'] || '').trim() || null,
          data_validacao: String(row['Dt.Validação'] || '').trim() || null,
          produto: String(row['Produto'] || '').trim() || null,
          bruto_software: parseCurrency(row['Val. Bruto Soft']),
          bruto_hardware: parseCurrency(row['Val. Bruto Hard']),
          comissao_software: parseCurrency(row['Val. Comiss. Soft']),
          comissao_hardware: parseCurrency(row['Val. Comiss. Hard']),
          status: String(row['Status Pedido'] || '').trim() || null,
        }
      })
      .filter((item) => item.pedido)

    const existingResp = await supabase
      .from('crm_validations')
      .select('period,pedido,data_validacao,produto,participant_nome')
      .eq('period', period)

    if (existingResp.error) throw existingResp.error

    const existingKeys = new Set(
      (existingResp.data ?? []).map((item) => buildValidationDedupKey(item)),
    )
    const pendingKeys = new Set<string>()
    const recordsToInsert = records.filter((record) => {
      const dedupKey = buildValidationDedupKey(record)
      if (existingKeys.has(dedupKey) || pendingKeys.has(dedupKey)) return false
      pendingKeys.add(dedupKey)
      return true
    })

    for (const batch of chunk(recordsToInsert, 300)) {
      const { error } = await supabase.from('crm_validations').insert(batch)
      if (error) throw error
    }

    return {
      inserted: recordsToInsert.length,
      skipped: records.length - recordsToInsert.length,
    }
  }

  async function insertRenewals(rows: ParsedRow[], importFileId: string, period: string): Promise<ImportInsertResult> {
    const records: RenewalImportRecord[] = rows
      .map((row) => {
        const participant = findParticipantForRenewal(row, participantIndex)
        const cliente = String(row['Cliente'] || '').trim()
        const email = String(row['Email'] || '').trim()
        const telefone = String(row['Telefone'] || row['Tele'] || '').trim()
        const cpf = String(row['CPF'] || '').trim()
        const cnpj = String(row['CNPJ'] || '').trim()

        return {
          import_file_id: importFileId,
          period,
          participant_id: participant?.id || null,
          participant_nome: participant?.nome || String(row['Agente'] || row['Desc. Agente Val.'] || row['Ponto de Atendimento'] || '').trim() || null,
          document_key: documentKeyFromRaw({ cpf, cnpj, email, telefone, cliente }),
          pedido: String(row['Pedido'] || '').trim() || null,
          data_vencimento: String(row['Data de Vencimento'] || row['Vencimento'] || row['Data Vencimento'] || '').trim() || null,
          cliente: cliente || null,
          email: email || null,
          telefone: telefone || null,
          produto: String(row['Produto'] || '').trim() || null,
          ar: String(row['AR'] || '').trim() || null,
          ponto_atendimento: String(row['Ponto de Atendimento'] || '').trim() || null,
          agente: String(row['Agente'] || row['Desc. Agente Val.'] || '').trim() || null,
          status_pedido: String(row['Status do Pedido'] || row['Status Pedido'] || '').trim() || null,
          cpf: cpf || null,
          cnpj: cnpj || null,
          razao_social: String(row['Razão Social'] || row['Razao Social'] || '').trim() || null,
        }
      })
      .filter((item) => item.document_key)

    const customerIdsByDocument = await syncRenewalCustomers(records)
    const recordsWithCustomer = records.map((record) => ({
      ...record,
      customer_id: customerIdsByDocument.get(record.document_key) || null,
    }))

    const existingResp = await supabase
      .from('crm_renewal_records')
      .select('period,document_key,data_vencimento,produto,pedido')
      .eq('period', period)

    if (existingResp.error) throw existingResp.error

    const existingKeys = new Set(
      (existingResp.data ?? []).map((item) => buildRenewalDedupKey(item)),
    )
    const pendingKeys = new Set<string>()
    const recordsToInsert = recordsWithCustomer.filter((record) => {
      const dedupKey = buildRenewalDedupKey(record)
      if (existingKeys.has(dedupKey) || pendingKeys.has(dedupKey)) return false
      pendingKeys.add(dedupKey)
      return true
    })

    for (const batch of chunk(recordsToInsert, 300)) {
      const { error } = await supabase.from('crm_renewal_records').insert(batch)
      if (error && !String(error.message || '').includes('customer_id')) throw error
      if (error && String(error.message || '').includes('customer_id')) {
        const fallbackBatch = batch.map(({ customer_id, ...rest }) => rest)
        const fallbackResp = await supabase.from('crm_renewal_records').insert(fallbackBatch)
        if (fallbackResp.error) throw fallbackResp.error
      }
    }

    return {
      inserted: recordsToInsert.length,
      skipped: records.length - recordsToInsert.length,
    }
  }

  async function importResolvedRows(file: File, type: ImportType, period: string, sourceArea: ImportSourceArea, rows: ParsedRow[], storagePathOverride?: string | null) {
    const storagePath = storagePathOverride || await uploadRawFile(file, { type, period, sourceArea })
    const importFile = await createImportFile(file, { type, period, sourceArea }, storagePath)

    if (type === 'revenda') return insertSales(rows, importFile.id, period)
    if (type === 'validacoes') return insertValidations(rows, importFile.id, period)
    if (type === 'renovacoes') return insertRenewals(rows, importFile.id, period)
    return { inserted: 0, skipped: 0 }
  }

  async function processFiles(slot: ImportSlot) {
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'Acesso restrito ao administrador.' })
      return
    }

    const slotKey = buildImportKey(slot.type, slot.sourceArea)
    const files = filesBySlot[slotKey] ?? []
    if (!files.length) {
      setMessage({ type: 'error', text: 'Selecione ao menos um arquivo.' })
      return
    }

    setRunningSlot(slotKey)
    setMessage({ type: 'info', text: `Preparando importação de ${files.length} arquivo(s) para ${slot.title}.` })

    try {
      let totalInserted = 0
      let totalSkipped = 0

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex]
        setMessage({ type: 'info', text: `Lendo arquivo ${fileIndex + 1} de ${files.length}: ${file.name}.` })
        const rows = await readSpreadsheet(file)
        const info = resolveImportInfo(file.name, rows, slot.type, slot.sourceArea)
        const groups = groupRowsByPeriod(rows, info.type, info.period)
        const orderedPeriods = [...groups.keys()].sort(comparePeriodsDesc)

        const sharedStoragePath =
          orderedPeriods.length > 1
            ? await uploadRawFile(file, { type: info.type, period: info.period, sourceArea: info.sourceArea }, `${info.sourceArea}/${info.type}/multi-period/${Date.now()}-${file.name}`)
            : null

        for (let periodIndex = 0; periodIndex < orderedPeriods.length; periodIndex += 1) {
          const period = orderedPeriods[periodIndex]
          const periodRows = groups.get(period) ?? []
          setMessage({
            type: 'info',
            text: `Importando ${file.name}: período ${formatPeriod(period)} (${periodIndex + 1} de ${orderedPeriods.length}).`,
          })
          const result = await importResolvedRows(file, info.type, period, info.sourceArea, periodRows, sharedStoragePath)
          totalInserted += result.inserted
          totalSkipped += result.skipped
        }
      }

      const filesResp = await supabase.from('crm_import_files').select('*').order('created_at', { ascending: false }).limit(200)
      if (filesResp.error) throw filesResp.error
      setHistory((filesResp.data ?? []) as ImportFileRow[])
      setFilesBySlot((current) => ({ ...current, [slotKey]: [] }))
      setMessage({
        type: 'ok',
        text: `Importação concluída para ${slot.title}. Novos registros: ${totalInserted}. Duplicados ignorados: ${totalSkipped}.`,
      })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Falha na importação.' })
    } finally {
      setRunningSlot(null)
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-3xl font-bold text-slate-900">Importações</h2>
          <p className="mt-3 max-w-2xl text-slate-500">Este módulo é exclusivo do administrador.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Módulo operacional</p>
              <h2 className="mt-1 text-3xl font-bold text-slate-900">Importações da CertiFast</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                Aceita arquivos `xlsx`, `xls` e `csv`. O sistema identifica a estrutura pelas colunas da planilha e grava nas tabelas reais de revenda, validações e renovação.
              </p>
            </div>
          </div>
        </section>

        {message && (
          <div className={`rounded-[24px] px-5 py-4 text-sm ${
            message.type === 'error'
              ? 'border border-red-200 bg-red-50 text-red-700'
              : message.type === 'ok'
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border border-blue-200 bg-blue-50 text-blue-700'
          }`}>
            {message.text}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-2">
          {IMPORT_SLOTS.map((slot) => {
            const key = buildImportKey(slot.type, slot.sourceArea)
            return (
              <ImportCard
                key={key}
                slot={slot}
                files={filesBySlot[key] ?? []}
                disabled={loading || runningSlot !== null}
                onFileChange={setSlotFiles}
                onSubmit={processFiles}
                running={runningSlot === key}
              />
            )
          })}
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <History size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Histórico de importações</h3>
              <p className="text-sm text-slate-500">Últimos arquivos processados na base da CertiFast.</p>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            {history.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                {loading ? 'Carregando histórico...' : 'Nenhum arquivo importado ainda.'}
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-400">
                    <th className="pb-3 pr-4 font-semibold">Arquivo</th>
                    <th className="pb-3 pr-4 font-semibold">Tipo</th>
                    <th className="pb-3 pr-4 font-semibold">Período</th>
                    <th className="pb-3 pr-4 font-semibold">Origem</th>
                    <th className="pb-3 pr-4 font-semibold">Tamanho</th>
                    <th className="pb-3 font-semibold">Importado em</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4 font-medium text-slate-800">{item.file_name}</td>
                      <td className="py-3 pr-4 text-slate-500">{safeText(item.file_type)}</td>
                      <td className="py-3 pr-4 text-slate-500">{formatPeriod(item.period)}</td>
                      <td className="py-3 pr-4 text-slate-500">{safeText(item.source_area)}</td>
                      <td className="py-3 pr-4 text-slate-500">{(Number(item.file_size_bytes || 0) / 1024).toFixed(1)} KB</td>
                      <td className="py-3 text-slate-500">{new Date(item.created_at).toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
