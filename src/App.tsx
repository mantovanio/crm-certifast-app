import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import Sidebar, { type Page } from '@/components/Sidebar'
import Login from '@/pages/Login'
import UpdatePassword from '@/pages/UpdatePassword'
import Dashboard from '@/pages/Dashboard'
import Comissoes from '@/pages/Comissoes'
import Renovacoes from '@/pages/Renovacoes'
import Usuarios from '@/pages/Usuarios'
import type { PermissaoPagina } from '@/types'
import { DEFAULT_AGENCY_CONFIG, fetchAgencyConfig } from '@/lib/agencyConfig'
import { isAdminProfile, PAGE_LABELS, PERFIL_LABEL, resolveAllowedPages, resolveDefaultPage } from '@/lib/security'

function PlaceholderPage({ title, text }: { title: string; text: string }) {
  return (
    <div className="p-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-3xl font-bold text-slate-900">{title}</h2>
        <p className="mt-3 max-w-2xl text-slate-500">{text}</p>
      </div>
    </div>
  )
}

function AppContent() {
  const { user, profile, loading, signOut, isPasswordRecovery } = useAuth()
  const [page, setPage] = useState<Page>('dashboard')
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [agencyConfig, setAgencyConfig] = useState(DEFAULT_AGENCY_CONFIG)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    let active = true
    fetchAgencyConfig().then(({ data }) => {
      if (active) setAgencyConfig(data)
    })
    return () => { active = false }
  }, [])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-500">Carregando...</div>
  }

  if (!user) return <Login />
  if (isPasswordRecovery) return <UpdatePassword />

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-slate-900">Perfil aguardando configuração</h1>
          <p className="mt-2 text-sm text-slate-500">Sua conta existe, mas ainda não foi vinculada corretamente pelo administrador.</p>
          <button onClick={signOut} className="mt-6 w-full rounded-2xl bg-[#275ca8] px-4 py-3 text-sm font-semibold text-white">Voltar ao login</button>
        </div>
      </div>
    )
  }

  if (profile.status === 'inactive') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-slate-900">Acesso aguardando liberação</h1>
          <p className="mt-2 text-sm text-slate-500">Sua conta foi criada, mas ainda está pendente de ativação administrativa.</p>
          <button onClick={signOut} className="mt-6 w-full rounded-2xl bg-[#275ca8] px-4 py-3 text-sm font-semibold text-white">Voltar ao login</button>
        </div>
      </div>
    )
  }

  const allowedPages = resolveAllowedPages(profile)
  const activePage: PermissaoPagina = allowedPages.includes(page) ? page : resolveDefaultPage(profile)
  const isAdmin = isAdminProfile(profile)

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar activePage={activePage} onNavigate={setPage} allowedPages={allowedPages} onLogout={signOut} agencyConfig={agencyConfig} />
      <div className="flex-1">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
          <div>
            <span className="font-semibold text-blue-700">{PAGE_LABELS[activePage]}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-700">{profile.nome || user.email}</p>
              <p className="text-xs text-slate-400">{PERFIL_LABEL[profile.role]} — {agencyConfig.nome_agencia}</p>
            </div>
            <button onClick={() => setDark(v => !v)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
              {dark ? 'Modo claro' : 'Modo escuro'}
            </button>
          </div>
        </header>

        {activePage === 'dashboard' && <Dashboard />}
        {activePage === 'comissoes' && <Comissoes />}
        {activePage === 'parceiros' && <PlaceholderPage title="Parceiros" text="Aqui ficará a gestão completa de parceiros, impostos, percentuais e regras de comissionamento." />}
        {activePage === 'importacoes' && <PlaceholderPage title="Importações" text="Aqui ficará a nova importação server-side de parceiros, vendas, validações e renovações." />}
        {activePage === 'renovacoes' && <Renovacoes />}
        {activePage === 'usuarios' && <Usuarios />}
        {activePage === 'configuracoes' && <PlaceholderPage title="Configurações" text="Aqui ficará a personalização visual do login e parâmetros globais do CRM Certifast." />}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
