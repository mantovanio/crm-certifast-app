import type { PermissaoPagina, Profile } from '@/types'

export const PAGE_LABELS: Record<PermissaoPagina, string> = {
  dashboard: 'Painel',
  comissoes: 'Vendas e Validações',
  parceiros: 'Parceiros',
  importacoes: 'Importações',
  renovacoes: 'Renovações',
  usuarios: 'Acessos',
  configuracoes: 'Configurações',
}

export const PERFIL_LABEL: Record<Profile['role'], string> = {
  admin: 'Administrador',
  participant: 'Participante',
}

export function isAdminProfile(profile: Profile | null) {
  return profile?.role === 'admin'
}

export function resolveAllowedPages(profile: Profile): PermissaoPagina[] {
  if (profile.role === 'admin') {
    return ['dashboard', 'comissoes', 'parceiros', 'importacoes', 'renovacoes', 'usuarios', 'configuracoes']
  }

  return ['dashboard', 'comissoes', 'renovacoes']
}

export function resolveDefaultPage(profile: Profile): PermissaoPagina {
  return resolveAllowedPages(profile)[0] || 'dashboard'
}
