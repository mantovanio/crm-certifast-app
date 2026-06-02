import type { AgencyConfig } from '@/lib/agencyConfig'
import { PAGE_LABELS } from '@/lib/security'
import type { PermissaoPagina } from '@/types'

export type Page = PermissaoPagina

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
  allowedPages: Page[]
  onLogout: () => void
  agencyConfig: AgencyConfig
}

export default function Sidebar({ activePage, onNavigate, allowedPages, onLogout, agencyConfig }: SidebarProps) {
  return (
    <aside className="hidden md:flex w-72 shrink-0 border-r border-slate-200 bg-white/90 backdrop-blur flex-col">
      <div className="px-6 py-6 border-b border-slate-200">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">crm_certifast</p>
        <h1 className="text-xl font-bold text-slate-900 mt-2">{agencyConfig.nome_agencia}</h1>
        <p className="text-sm text-slate-500 mt-1">{agencyConfig.login_subtitulo}</p>
      </div>
      <nav className="flex-1 px-4 py-4 space-y-2">
        {allowedPages.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => onNavigate(page)}
            className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-medium transition-colors ${
              activePage === page
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {PAGE_LABELS[page]}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-200">
        <button
          type="button"
          onClick={onLogout}
          className="w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
