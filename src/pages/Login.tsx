import { useEffect, useState } from 'react'
import { Shield, Eye, EyeOff, ArrowLeft, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { DEFAULT_AGENCY_CONFIG, buildAuthBackground, fetchAgencyConfig } from '@/lib/agencyConfig'

type View = 'login' | 'register' | 'forgot'

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Email ou senha incorretos.'
  if (msg.includes('Email not confirmed')) return 'Confirme seu email antes de acessar o sistema.'
  if (msg.includes('User already registered')) return 'Este email já está cadastrado.'
  if (msg.includes('Password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.'
  if (msg.includes('signup is disabled')) return 'Novos cadastros estão desabilitados. Contate o administrador.'
  if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  return msg
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        placeholder="Digite sua senha"
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 pr-11 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

export default function Login() {
  const { signIn, signUp, resetPassword } = useAuth()
  const [view, setView] = useState<View>('login')
  const [agencyConfig, setAgencyConfig] = useState(DEFAULT_AGENCY_CONFIG)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const [regNome, setRegNome] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regConfirm, setRegConfirm] = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState<string | null>(null)
  const [regOk, setRegOk] = useState(false)

  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotOk, setForgotOk] = useState(false)

  useEffect(() => {
    let active = true
    fetchAgencyConfig().then(({ data }) => {
      if (active) setAgencyConfig(data)
    })
    return () => { active = false }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)
    const { error } = await signIn(loginEmail, loginPassword)
    if (error) setLoginError(translateError(error))
    setLoginLoading(false)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegError(null)
    if (regPass !== regConfirm) return setRegError('As senhas não coincidem.')
    setRegLoading(true)
    const { error } = await signUp({ nome: regNome, email: regEmail, password: regPass })
    if (error) setRegError(translateError(error))
    else setRegOk(true)
    setRegLoading(false)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setForgotError(null)
    setForgotLoading(true)
    const { error } = await resetPassword(forgotEmail)
    if (error) setForgotError(translateError(error))
    else setForgotOk(true)
    setForgotLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: buildAuthBackground(agencyConfig.fundo_inicio, agencyConfig.fundo_fim) }}>
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[32px] bg-gradient-to-br from-[#183d79] to-[#275ca8] p-8 text-white shadow-2xl">
          <div className="rounded-[28px] border border-white/15 bg-white/8 p-8">
            <div className="h-28 rounded-[24px] border border-dashed border-white/20 bg-white/8 flex items-center justify-center text-center px-6">
              <div>
                <p className="text-3xl font-bold">CERTIFAST</p>
                <p className="mt-2 text-sm text-white/80">Sua identidade em um clique</p>
              </div>
            </div>
            <h1 className="mt-8 text-6xl font-bold leading-[0.95]">Bem-vindo ao centro de operação da Certifast</h1>
            <p className="mt-6 max-w-xl text-lg text-white/86">Acesso profissional para comissões, validações, parceiros e inteligência de renovação.</p>
          </div>
        </section>

        <section className="rounded-[32px] bg-white p-8 shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-700">Acesso ao sistema</p>
          <h2 className="mt-4 text-5xl font-bold text-slate-900">{view === 'login' ? 'Entrar no CRM' : view === 'register' ? 'Criar acesso' : 'Recuperar senha'}</h2>
          <p className="mt-3 text-slate-500">
            {view === 'login' && 'Use seu e-mail e senha para acessar seus relatórios.'}
            {view === 'register' && 'Crie o acesso inicial. Depois o administrador vincula o parceiro e libera o perfil certo.'}
            {view === 'forgot' && 'Informe seu e-mail para receber o link de redefinição de senha.'}
          </p>

          <div className="mt-6 inline-flex rounded-2xl bg-slate-100 p-1">
            <button onClick={() => setView('login')} className={`rounded-2xl px-5 py-3 text-sm font-semibold ${view === 'login' ? 'bg-white text-blue-700 shadow' : 'text-slate-500'}`}>Entrar</button>
            <button onClick={() => setView('register')} className={`rounded-2xl px-5 py-3 text-sm font-semibold ${view === 'register' ? 'bg-white text-blue-700 shadow' : 'text-slate-500'}`}>Criar acesso</button>
          </div>

          {view === 'login' && (
            <form onSubmit={handleLogin} className="mt-8 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
                <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required placeholder="voce@certifast.com.br" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-semibold text-slate-700">Senha</label>
                  <button type="button" className="text-xs font-medium text-blue-700" onClick={() => setView('forgot')}>Esqueci minha senha</button>
                </div>
                <PasswordField value={loginPassword} onChange={setLoginPassword} />
              </div>
              {loginError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{loginError}</div>}
              <button type="submit" disabled={loginLoading} className="w-full rounded-2xl bg-[#275ca8] px-4 py-4 text-sm font-semibold text-white">
                {loginLoading ? <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Entrando...</span> : 'Entrar no sistema'}
              </button>
            </form>
          )}

          {view === 'register' && (
            <form onSubmit={handleRegister} className="mt-8 space-y-4">
              <input value={regNome} onChange={e => setRegNome(e.target.value)} required placeholder="Seu nome" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} required placeholder="Seu e-mail" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <PasswordField value={regPass} onChange={setRegPass} />
              <input type="password" value={regConfirm} onChange={e => setRegConfirm(e.target.value)} required placeholder="Confirmar senha" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              {regError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{regError}</div>}
              {regOk && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Cadastro criado. Aguarde liberação do administrador.</div>}
              <button type="submit" disabled={regLoading} className="w-full rounded-2xl border border-[#275ca8] px-4 py-4 text-sm font-semibold text-[#275ca8]">
                {regLoading ? 'Criando...' : 'Criar acesso'}
              </button>
            </form>
          )}

          {view === 'forgot' && (
            <form onSubmit={handleForgot} className="mt-8 space-y-4">
              <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required placeholder="Seu e-mail" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              {forgotError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{forgotError}</div>}
              {forgotOk && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Enviamos o link de redefinição para seu e-mail.</div>}
              <button type="submit" disabled={forgotLoading} className="w-full rounded-2xl bg-[#275ca8] px-4 py-4 text-sm font-semibold text-white">
                {forgotLoading ? 'Enviando...' : 'Enviar link'}
              </button>
              <button type="button" className="inline-flex items-center gap-2 text-sm text-slate-500" onClick={() => setView('login')}>
                <ArrowLeft size={16} /> Voltar ao login
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
