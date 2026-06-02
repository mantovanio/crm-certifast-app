import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function UpdatePassword() {
  const { updatePassword, finishPasswordRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) return setError('As senhas não coincidem.')
    setLoading(true)
    const { error } = await updatePassword(password)
    if (error) setError(error)
    else setOk(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-slate-900">Definir nova senha</h1>
        <p className="mt-2 text-sm text-slate-500">Finalize sua recuperação de acesso.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nova senha" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" required />
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirmar nova senha" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" required />
          {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
          {ok && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Senha atualizada com sucesso.</div>}
          <button type="submit" disabled={loading} className="w-full rounded-2xl bg-[#275ca8] px-4 py-4 text-sm font-semibold text-white">
            {loading ? <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Salvando...</span> : 'Salvar nova senha'}
          </button>
          <button type="button" onClick={finishPasswordRecovery} className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-sm font-semibold text-slate-600">
            Voltar ao CRM
          </button>
        </form>
      </div>
    </div>
  )
}
