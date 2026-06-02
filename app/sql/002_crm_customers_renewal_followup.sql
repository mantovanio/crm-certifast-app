create table if not exists public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  document_key text not null unique,
  participant_id uuid references public.crm_participants(id) on delete set null,
  participant_nome text,
  nome text,
  email_principal text,
  telefone_principal text,
  cpf text,
  cnpj text,
  razao_social text,
  agente text,
  ar text,
  ponto_atendimento text,
  contato_status text,
  observacoes text,
  proximo_contato_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists crm_customers_update_timestamp on public.crm_customers;
create trigger crm_customers_update_timestamp
before update on public.crm_customers
for each row execute function public.crm_now_update();

create index if not exists crm_customers_participant_idx on public.crm_customers(participant_id);
create index if not exists crm_customers_document_idx on public.crm_customers(document_key);

alter table public.crm_renewal_records
  add column if not exists customer_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_renewal_records_customer_id_fkey'
  ) then
    alter table public.crm_renewal_records
      add constraint crm_renewal_records_customer_id_fkey
      foreign key (customer_id) references public.crm_customers(id) on delete set null;
  end if;
end $$;

alter table public.crm_customers enable row level security;

drop policy if exists crm_customers_select on public.crm_customers;
create policy crm_customers_select on public.crm_customers
for select to authenticated
using (
  public.crm_is_admin()
  or exists (
    select 1
    from public.crm_profile_participants cpp
    where cpp.profile_id = auth.uid()
      and cpp.participant_id = crm_customers.participant_id
  )
);

drop policy if exists crm_customers_admin_write on public.crm_customers;
create policy crm_customers_admin_write on public.crm_customers
for all to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());
