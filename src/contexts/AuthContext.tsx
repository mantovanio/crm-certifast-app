import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

export interface SignUpData {
  nome: string
  email: string
  password: string
}

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  linkedParticipantIds: string[]
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (data: SignUpData) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  updatePassword: (password: string) => Promise<{ error: string | null }>
  isPasswordRecovery: boolean
  finishPasswordRecovery: () => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function mapProfileRow(row: Record<string, unknown> | null): Profile | null {
  if (!row) return null

  return {
    id: String(row.id ?? ''),
    nome: String(row.nome ?? ''),
    email: String(row.email ?? ''),
    role: row.role === 'admin' ? 'admin' : 'participant',
    status: row.status === 'inactive' ? 'inactive' : 'active',
    created_at: String(row.created_at ?? ''),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [linkedParticipantIds, setLinkedParticipantIds] = useState<string[]>([])

  function hasRecoveryUrl() {
    const params = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return params.get('reset_password') === '1' || params.get('type') === 'recovery' || hashParams.get('type') === 'recovery'
  }

  function clearRecoveryUrl() {
    window.history.replaceState({}, document.title, window.location.pathname)
  }

  async function ensureOwnProfile(currentUser: User) {
    const payload = {
      id: currentUser.id,
      nome: String(currentUser.user_metadata?.nome || currentUser.email?.split('@')[0] || 'Usuário').trim(),
      email: String(currentUser.email || '').trim(),
      role: 'participant',
      status: 'active',
    }

    const { error } = await supabase.from('crm_profiles').upsert(payload, { onConflict: 'id' })
    if (error) throw new Error('Seu usuário autenticou, mas o perfil do CRM não pôde ser inicializado.')
  }

  async function loadProfile(userId: string, currentUser?: User | null) {
    let { data, error } = await supabase
      .from('crm_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) throw new Error('Não foi possível carregar seu perfil do CRM.')

    if (!data && currentUser) {
      await ensureOwnProfile(currentUser)
      const retry = await supabase.from('crm_profiles').select('*').eq('id', userId).single()
      data = retry.data
      error = retry.error
      if (error) throw new Error('Seu perfil do CRM não pôde ser recarregado após a autenticação.')
    }

    const links = await supabase
      .from('crm_profile_participants')
      .select('participant_id')
      .eq('profile_id', userId)

    if (links.error) throw new Error('Não foi possível carregar os vínculos deste acesso.')

    setProfile(mapProfileRow(data))
    setLinkedParticipantIds((links.data ?? []).map((item) => String(item.participant_id)))
  }

  async function refreshProfile() {
    if (user) {
      setLoading(true)
      try {
        await loadProfile(user.id, user)
      } finally {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)

      try {
        if (session?.user && hasRecoveryUrl()) setIsPasswordRecovery(true)
        if (session?.user) await loadProfile(session.user.id, session.user)
        else {
          setProfile(null)
          setLinkedParticipantIds([])
        }
      } catch (error) {
        console.error(error)
        setProfile(null)
        setLinkedParticipantIds([])
      } finally {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      try {
        if (event === 'PASSWORD_RECOVERY' || (session?.user && hasRecoveryUrl())) setIsPasswordRecovery(true)
        if (session?.user) await loadProfile(session.user.id, session.user)
        else {
          setProfile(null)
          setLinkedParticipantIds([])
          setIsPasswordRecovery(false)
        }
      } catch (error) {
        console.error(error)
        setProfile(null)
        setLinkedParticipantIds([])
      } finally {
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signUp({ nome, email, password }: SignUpData) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome } },
    })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    setIsPasswordRecovery(false)
    clearRecoveryUrl()
    setLinkedParticipantIds([])
    await supabase.auth.signOut()
  }

  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?reset_password=1`,
    })
    return { error: error?.message ?? null }
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    return { error: error?.message ?? null }
  }

  function finishPasswordRecovery() {
    setIsPasswordRecovery(false)
    clearRecoveryUrl()
  }

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, linkedParticipantIds, signIn, signUp, signOut, resetPassword, updatePassword, isPasswordRecovery, finishPasswordRecovery, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
