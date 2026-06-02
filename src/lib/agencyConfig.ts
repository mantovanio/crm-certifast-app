import { supabase } from '@/lib/supabase'

const DEFAULT_BRAND_LOGO = ''

export type AgencyConfig = {
  nome_agencia: string
  responsavel: string
  telefone: string
  cidade: string
  logo_url: string
  logo_login_url: string
  logo_interna_url: string
  login_titulo: string
  login_subtitulo: string
  cor_primaria: string
  fundo_inicio: string
  fundo_fim: string
}

export const DEFAULT_AGENCY_CONFIG: AgencyConfig = {
  nome_agencia: 'Certifast',
  responsavel: 'Administração Certifast',
  telefone: '',
  cidade: 'São Paulo - SP',
  logo_url: DEFAULT_BRAND_LOGO,
  logo_login_url: DEFAULT_BRAND_LOGO,
  logo_interna_url: DEFAULT_BRAND_LOGO,
  login_titulo: 'CRM Certifast',
  login_subtitulo: 'Comissões, parceiros e inteligência de renovação',
  cor_primaria: '#275ca8',
  fundo_inicio: '#173d7a',
  fundo_fim: '#275ca8',
}

export function buildAuthBackground(startColor: string, endColor: string) {
  return `
    radial-gradient(circle at top, rgba(255,255,255,0.12), transparent 32%),
    linear-gradient(145deg, ${startColor} 0%, #102647 48%, ${endColor} 100%)
  `
}

export async function fetchAgencyConfig() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'agency')
    .maybeSingle()

  if (error) return { data: DEFAULT_AGENCY_CONFIG, error }
  if (!data?.value || typeof data.value !== 'object') return { data: DEFAULT_AGENCY_CONFIG, error: null }

  return {
    data: { ...DEFAULT_AGENCY_CONFIG, ...(data.value as Partial<AgencyConfig>) },
    error: null,
  }
}
