import { useEffect, useMemo, useState } from 'react'
import { Building2, KeyRound, Percent, Plus, Save, Search, ShieldCheck, UserRound, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { formatPercent, formatPeriod, money, normalizePercent, safeText, toNumber } from '@/lib/certifast'
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
  baseLiquidaVendas: number
  baseLiquidaSoftware: number
  baseLiquidaHardware: number
  impostoRetidoVendas: number
  impostoRetidoSoftware: number
  impostoRetidoHardware: number
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
    baseLiquidaVendas: 0,
    baseLiquidaSoftware: 0,
    baseLiquidaHardware: 0,
    impostoRetidoVendas: 0,
    impostoRetidoSoftware: 0,
    impostoRetidoHardware: 0,
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
  const impostoPercentual = normalizePercent(participant.imposto)
  const percentualVenda = normalizePercent(participant.percentual_venda)
  const percentualCertificado = normalizePercent(participant.percentual_software)
  const percentualHardware = normalizePercent(participant.percentual_hardware)

  for (const row of sales) {
    const comissaoBruta = toNumber(row.comissao)
    const impostoRetido = comissaoBruta * impostoPercentual
    const baseLiquida = comissaoBruta - impostoRetido
    metrics.salesCount += 1
    metrics.salesRevenue += toNumber(row.faturamento)
    metrics.salesCommission += comissaoBruta
    metrics.impostoRetidoVendas += impostoRetido
    metrics.baseLiquidaVendas += baseLiquida
    metrics.vendaRepasse += baseLiquida * percentualVenda
  }

  for (const row of validations) {
    const softCommission = toNumber(row.comissao_software)
    const hardCommission = toNumber(row.comissao_hardware)
    const softTax = softCommission * impostoPercentual
    const hardTax = hardCommission * impostoPercentual
    const softNet = softCommission - softTax
    const hardNet = hardCommission - hardTax
    metrics.validationsCount += 1
    metrics.validationsGross += toNumber(row.bruto_software) + toNumber(row.bruto_hardware)
    metrics.validationsCommission += softCommission + hardCommission
    metrics.impostoRetidoSoftware += softTax
    metrics.impostoRetidoHardware += hardTax
    metrics.baseLiquidaSoftware += softNet
    metrics.baseLiquidaHardware += hardNet
    metrics.softwareRepasse += softNet * percentualCertificado
    metrics.hardwareRepasse += hardNet * percentualHardware
  }

  metrics.brutoParceiro = metrics.vendaRepasse + metrics.softwareRepasse + metrics.hardwareRepasse
  metrics.descontos = toNumber(participant.contabilidade) + toNumber(participant.verificacao)
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

function SectionTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{eyebrow}</p>
      <h4 className="mt-2 text-base font-bold text-slate-900">{title}</h4>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
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
        <div className="xl:col-span-2">
          <SectionTitle
            eyebrow="Cadastro"
            title="Dados principais do parceiro"
            detail="Base do cadastro operacional, identificação da unidade e dados próprios de cada parceiro."
          />
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Nome base</span>
          <input
            value={participant.nome}
            disabled
            className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-500 outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Slug técnico</span>
          <input
            value={participant.slug}
            disabled
            className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-500 outline-none"
          />
        </label>

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

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Telefone</span>
          <input
            value={participant.telefone ?? ''}
            onChange={(event) => onChange(participant.id, 'telefone', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Razão social</span>
          <input
            value={participant.razao_social ?? ''}
            onChange={(event) => onChange(participant.id, 'razao_social', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">CPF/CNPJ</span>
          <input
            value={participant.documento ?? ''}
            onChange={(event) => onChange(participant.id, 'documento', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Contato financeiro</span>
          <input
            value={participant.contato_financeiro ?? ''}
            onChange={(event) => onChange(participant.id, 'contato_financeiro', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-3">
          <SectionTitle
            eyebrow="Comissão"
            title="Percentuais e repasses"
            detail="Aceita percentual em dois formatos: 0,05 = 5% e 5 = 5%. O cálculo sempre retém imposto antes do repasse."
          />
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">% venda</span>
          <input
            value={String(participant.percentual_venda ?? 0)}
            onChange={(event) => onChange(participant.id, 'percentual_venda', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">% certificado</span>
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
        <div className="xl:col-span-4">
          <SectionTitle
            eyebrow="Custos"
            title="Custos fixos e situação cadastral"
            detail="O imposto é percentual sobre a comissão bruta da certificadora. Você pode informar 0,105 para 10,5% ou 10,5 para o mesmo efeito."
          />
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Imposto %</span>
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

      <div className="mt-5 grid gap-4 xl:grid-cols-4">
        <div className="xl:col-span-4">
          <SectionTitle
            eyebrow="Pagamento"
            title="Dados financeiros e recebimento"
            detail="Campos específicos do parceiro para comissão, repasse e cadastro de pagamento."
          />
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Favorecido</span>
          <input
            value={participant.favorecido ?? ''}
            onChange={(event) => onChange(participant.id, 'favorecido', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">PIX</span>
          <input
            value={participant.pix ?? ''}
            onChange={(event) => onChange(participant.id, 'pix', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Banco</span>
          <input
            value={participant.banco ?? ''}
            onChange={(event) => onChange(participant.id, 'banco', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Tipo conta</span>
          <input
            value={participant.tipo_conta ?? ''}
            onChange={(event) => onChange(participant.id, 'tipo_conta', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Agência</span>
          <input
            value={participant.agencia ?? ''}
            onChange={(event) => onChange(participant.id, 'agencia', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Conta</span>
          <input
            value={participant.conta ?? ''}
            onChange={(event) => onChange(participant.id, 'conta', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block xl:col-span-2">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Observações financeiras</span>
          <textarea
            value={participant.observacoes_financeiras ?? ''}
            onChange={(event) => onChange(participant.id, 'observacoes_financeiras', event.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>

      <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SectionTitle
            eyebrow="Acesso"
            title="Usuários vinculados e senha"
            detail="O CRM não guarda senha em texto. O controle aqui é pelo e-mail de acesso e pela redefinição segura via Supabase."
          />
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
          <SectionTitle
            eyebrow="Relatório individual"
            title={`Recebimento do mês em ${periodLabel}`}
            detail="A comissão bruta da certificadora é abatida pelo imposto do parceiro e só depois vira base de repasse."
          />
          <div className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600">
            {report.salesCount + report.validationsCount} lançamento(s)
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-4">
          <MetricBox label="Comissão bruta vendas" value={`${report.salesCount} · ${money(report.salesCommission)}`} />
          <MetricBox label="Comissão bruta validações" value={`${report.validationsCount} · ${money(report.validationsCommission)}`} />
          <MetricBox label="Valor bruto do parceiro" value={money(report.brutoParceiro)} tone="green" />
          <MetricBox label="Valor final a pagar" value={money(report.liquido)} tone={report.liquido >= 0 ? 'green' : 'amber'} />
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-4">
          <MetricBox label="Imposto retido vendas" value={money(report.impostoRetidoVendas)} tone="amber" />
          <MetricBox label="Imposto retido certificado" value={money(report.impostoRetidoSoftware)} tone="amber" />
          <MetricBox label="Imposto retido hardware" value={money(report.impostoRetidoHardware)} tone="amber" />
          <MetricBox label="Descontos fixos" value={money(report.descontos)} tone="amber" />
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-5">
          <MetricBox label="Base líquida vendas" value={money(report.baseLiquidaVendas)} />
          <MetricBox label="Base líquida certificado" value={money(report.baseLiquidaSoftware)} />
          <MetricBox label="Base líquida hardware" value={money(report.baseLiquidaHardware)} />
          <MetricBox label="Repasse venda" value={money(report.vendaRepasse)} />
          <MetricBox label="Repasse certificado" value={money(report.softwareRepasse)} />
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          <MetricBox label="Repasse hardware" value={money(report.hardwareRepasse)} />
          <MetricBox label="Faturamento" value={money(report.salesRevenue + report.validationsGross)} />
          <MetricBox label="Imposto configurado" value={formatPercent(participant.imposto)} />
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
  const [showNew, setShowNew] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newCodrev, setNewCodrev] = useState('')
  const [creating, setCreating] = useState(false)

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
        participant.telefone,
        participant.razao_social,
        participant.documento,
        participant.contato_financeiro,
        participant.favorecido,
        participant.banco,
        participant.pix,
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
        telefone: participant.telefone?.trim() || null,
        razao_social: participant.razao_social?.trim() || null,
        documento: participant.documento?.trim() || null,
        contato_financeiro: participant.contato_financeiro?.trim() || null,
        percentual_venda: participant.percentual_venda ?? 0,
        percentual_software: participant.percentual_software ?? 0,
        percentual_hardware: participant.percentual_hardware ?? 0,
        imposto: participant.imposto ?? 0,
        contabilidade: participant.contabilidade ?? 0,
        verificacao: participant.verificacao ?? 0,
        favorecido: participant.favorecido?.trim() || null,
        banco: participant.banco?.trim() || null,
        agencia: participant.agencia?.trim() || null,
        conta: participant.conta?.trim() || null,
        tipo_conta: participant.tipo_conta?.trim() || null,
        pix: participant.pix?.trim() || null,
        observacoes_financeiras: participant.observacoes_financeiras?.trim() || null,
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

  async function createParticipant() {
    const nome = newNome.trim()
    if (!nome) return
    setCreating(true)
    setMessage(null)
    const slug = nome
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    try {
      const { data, error } = await supabase
        .from('crm_participants')
        .insert({ nome, slug: `${slug}-${Date.now()}`, codigo_revenda: newCodrev.trim() || null })
        .select()
        .single()
      if (error) throw error
      setParticipants((current) => [...current, { ...(data as Participant), dirty: false }])
      setNewNome('')
      setNewCodrev('')
      setShowNew(false)
      setMessage({ type: 'ok', text: `Parceiro "${nome}" criado com sucesso.` })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível criar o parceiro.' })
    } finally {
      setCreating(false)
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

            <div className="flex w-full flex-col gap-4 lg:max-w-3xl">
              <div className="grid gap-4 lg:grid-cols-[1fr,220px]">
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

              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="inline-flex items-center gap-2 self-start rounded-full bg-[#275ca8] px-5 py-3 text-sm font-semibold text-white"
              >
                {showNew ? <X size={16} /> : <Plus size={16} />}
                {showNew ? 'Cancelar' : 'Novo parceiro'}
              </button>

              {showNew && (
                <div className="rounded-[20px] border border-blue-200 bg-blue-50 p-5">
                  <p className="mb-4 text-sm font-semibold text-slate-700">Novo parceiro — preencha o nome e o código de revenda (opcional). Os demais dados podem ser editados depois.</p>
                  <div className="grid gap-4 sm:grid-cols-[1fr,200px,auto]">
                    <input
                      value={newNome}
                      onChange={(e) => setNewNome(e.target.value)}
                      placeholder="Nome do parceiro *"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      value={newCodrev}
                      onChange={(e) => setNewCodrev(e.target.value)}
                      placeholder="Código de revenda"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      disabled={creating || !newNome.trim()}
                      onClick={createParticipant}
                      className="inline-flex items-center gap-2 rounded-2xl bg-[#275ca8] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <Save size={14} />
                      {creating ? 'Criando...' : 'Criar'}
                    </button>
                  </div>
                </div>
              )}
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
