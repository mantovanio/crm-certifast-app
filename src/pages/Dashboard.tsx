import { LockKeyhole, RefreshCcw, ShieldCheck } from 'lucide-react'

function ModuleCard({ title, text, icon: Icon, tone }: { title: string; text: string; icon: typeof LockKeyhole; tone: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
        <Icon size={22} />
      </div>
      <h3 className="mt-4 text-xl font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  )
}

export default function Dashboard() {
  return (
    <div className="p-6">
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-700">crm_certifast</p>
          <h2 className="mt-4 text-4xl font-bold text-slate-900">Base modular em implantação</h2>
          <p className="mt-3 max-w-3xl text-slate-500">
            Esta nova base já está conectada ao schema real da Certifast para autenticação, amostragem de vendas,
            amostragem de validações e leitura inicial de renovação. O deploy segue em Docker, no mesmo padrão operacional
            que você usa hoje.
          </p>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <ModuleCard
            title="Acesso"
            text="Login, criação de conta, recuperação de senha e leitura de escopo já ligados ao `crm_profiles` e aos vínculos reais do sistema."
            icon={LockKeyhole}
            tone="bg-blue-50 text-blue-700"
          />
          <ModuleCard
            title="Vendas e Validações"
            text="Módulo inicial já mostra período, amostragem operacional e consolidação por vendedor e agente de registro."
            icon={ShieldCheck}
            tone="bg-emerald-50 text-emerald-700"
          />
          <ModuleCard
            title="Renovações"
            text="Carteira já foi preparada para a próxima fase, com leitura por período e distribuição inicial por agente."
            icon={RefreshCcw}
            tone="bg-amber-50 text-amber-700"
          />
        </section>
      </div>
    </div>
  )
}
