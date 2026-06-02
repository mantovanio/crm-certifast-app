export type UserRole = 'admin' | 'participant'

export type PermissaoPagina =
  | 'dashboard'
  | 'comissoes'
  | 'parceiros'
  | 'importacoes'
  | 'renovacoes'
  | 'usuarios'
  | 'configuracoes'

export interface Profile {
  id: string
  nome: string
  email: string
  role: UserRole
  status: 'active' | 'inactive'
  created_at: string
  updated_at?: string
}

export interface Participant {
  id: string
  nome: string
  slug: string
  nome_vendedor: string | null
  nome_validador: string | null
  fantasia: string | null
  faixa: string | null
  email: string | null
  codigo_revenda: string | null
  imposto: number
  contabilidade: number
  verificacao: number
  percentual_venda: number
  percentual_software: number
  percentual_hardware: number
  ativo: boolean
  created_at: string
  updated_at?: string
}

export interface ProfileParticipantLink {
  id: string
  profile_id: string
  participant_id: string
  created_at: string
}

export interface SalesRow {
  id: string
  import_file_id: string | null
  period: string
  participant_id: string | null
  participant_nome: string
  document_key: string | null
  pedido: string
  cliente: string | null
  data_pedido: string | null
  data_verificacao: string | null
  produto: string | null
  faturamento: number
  comissao: number
  status: string | null
  created_at: string
}

export interface ImportFileRow {
  id: string
  file_name: string
  file_type: 'parceiros' | 'revenda' | 'validacoes' | 'renovacoes'
  period: string
  source_area: 'principal' | 'historico_renovacao'
  storage_path: string | null
  file_size_bytes: number
  imported_by: string | null
  created_at: string
}

export interface ValidationRow {
  id: string
  import_file_id: string | null
  period: string
  participant_id: string | null
  participant_nome: string
  document_key: string | null
  pedido: string
  cliente: string | null
  data_pedido: string | null
  data_validacao: string | null
  produto: string | null
  bruto_software: number
  bruto_hardware: number
  comissao_software: number
  comissao_hardware: number
  status: string | null
  created_at: string
}

export interface RenewalRow {
  id: string
  import_file_id: string | null
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
  created_at: string
}

export interface CustomerRow {
  id: string
  document_key: string
  participant_id: string | null
  participant_nome: string | null
  nome: string | null
  email_principal: string | null
  telefone_principal: string | null
  cpf: string | null
  cnpj: string | null
  razao_social: string | null
  agente: string | null
  ar: string | null
  ponto_atendimento: string | null
  contato_status: string | null
  observacoes: string | null
  proximo_contato_em: string | null
  created_at: string
  updated_at?: string
}
