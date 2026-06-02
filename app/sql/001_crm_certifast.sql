create extension if not exists "pgcrypto";

create or replace function public.crm_now_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.crm_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
  role text not null default 'participant' check (role in ('admin', 'participant')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists crm_profiles_update_timestamp on public.crm_profiles;
create trigger crm_profiles_update_timestamp
before update on public.crm_profiles
for each row execute function public.crm_now_update();

create or replace function public.crm_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.crm_profiles (id, nome, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    new.email,
    'participant',
    'active'
  )
  on conflict (id) do update
  set nome = excluded.nome,
      email = excluded.email;
  return new;
end;
$$;

drop trigger if exists crm_on_auth_user_created on auth.users;
create trigger crm_on_auth_user_created
after insert on auth.users
for each row execute function public.crm_handle_new_user();

create table if not exists public.crm_participants (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  nome_vendedor text,
  nome_validador text,
  fantasia text,
  faixa text,
  email text,
  codigo_revenda text,
  imposto numeric(12,6) not null default 0,
  contabilidade numeric(12,2) not null default 0,
  verificacao numeric(12,2) not null default 0,
  percentual_venda numeric(12,6) not null default 0,
  percentual_software numeric(12,6) not null default 0,
  percentual_hardware numeric(12,6) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists crm_participants_update_timestamp on public.crm_participants;
create trigger crm_participants_update_timestamp
before update on public.crm_participants
for each row execute function public.crm_now_update();

create table if not exists public.crm_profile_participants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.crm_profiles(id) on delete cascade,
  participant_id uuid not null references public.crm_participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, participant_id)
);

create table if not exists public.crm_import_files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_type text not null check (file_type in ('parceiros', 'revenda', 'validacoes', 'renovacoes')),
  period text not null,
  source_area text not null default 'principal' check (source_area in ('principal', 'historico_renovacao')),
  storage_path text,
  file_size_bytes bigint not null default 0,
  imported_by uuid references public.crm_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.crm_profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_sales (
  id uuid primary key default gen_random_uuid(),
  import_file_id uuid references public.crm_import_files(id) on delete cascade,
  period text not null,
  participant_id uuid references public.crm_participants(id) on delete set null,
  participant_nome text not null,
  document_key text,
  pedido text not null,
  cliente text,
  data_pedido text,
  data_verificacao text,
  produto text,
  faturamento numeric(12,2) not null default 0,
  comissao numeric(12,2) not null default 0,
  status text,
  created_at timestamptz not null default now()
);

create index if not exists crm_sales_period_idx on public.crm_sales(period);
create index if not exists crm_sales_participant_idx on public.crm_sales(participant_id);
create index if not exists crm_sales_document_idx on public.crm_sales(document_key);
create unique index if not exists crm_sales_unique_business_idx
  on public.crm_sales (
    period,
    pedido,
    coalesce(data_verificacao, ''),
    coalesce(produto, ''),
    participant_nome
  );

create table if not exists public.crm_validations (
  id uuid primary key default gen_random_uuid(),
  import_file_id uuid references public.crm_import_files(id) on delete cascade,
  period text not null,
  participant_id uuid references public.crm_participants(id) on delete set null,
  participant_nome text not null,
  document_key text,
  pedido text not null,
  cliente text,
  data_pedido text,
  data_validacao text,
  produto text,
  bruto_software numeric(12,2) not null default 0,
  bruto_hardware numeric(12,2) not null default 0,
  comissao_software numeric(12,2) not null default 0,
  comissao_hardware numeric(12,2) not null default 0,
  status text,
  created_at timestamptz not null default now()
);

create index if not exists crm_validations_period_idx on public.crm_validations(period);
create index if not exists crm_validations_participant_idx on public.crm_validations(participant_id);
create index if not exists crm_validations_document_idx on public.crm_validations(document_key);
create unique index if not exists crm_validations_unique_business_idx
  on public.crm_validations (
    period,
    pedido,
    coalesce(data_validacao, ''),
    coalesce(produto, ''),
    participant_nome
  );

create table if not exists public.crm_renewal_records (
  id uuid primary key default gen_random_uuid(),
  import_file_id uuid references public.crm_import_files(id) on delete cascade,
  period text not null,
  participant_id uuid references public.crm_participants(id) on delete set null,
  participant_nome text,
  document_key text not null,
  pedido text,
  data_vencimento text,
  cliente text,
  email text,
  telefone text,
  produto text,
  ar text,
  ponto_atendimento text,
  agente text,
  status_pedido text,
  cpf text,
  cnpj text,
  razao_social text,
  created_at timestamptz not null default now()
);

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

drop trigger if exists crm_customers_update_timestamp on public.crm_customers;
create trigger crm_customers_update_timestamp
before update on public.crm_customers
for each row execute function public.crm_now_update();

create index if not exists crm_renewal_period_idx on public.crm_renewal_records(period);
create index if not exists crm_renewal_document_idx on public.crm_renewal_records(document_key);
create index if not exists crm_renewal_participant_idx on public.crm_renewal_records(participant_id);
create index if not exists crm_customers_participant_idx on public.crm_customers(participant_id);
create index if not exists crm_customers_document_idx on public.crm_customers(document_key);
create unique index if not exists crm_renewal_unique_business_idx
  on public.crm_renewal_records (
    period,
    document_key,
    coalesce(data_vencimento, ''),
    coalesce(produto, ''),
    coalesce(pedido, '')
  );

insert into public.crm_settings (key, value)
values (
  'bootstrap_admin',
  jsonb_build_object(
    'token_hash',
    crypt('CRM-CERTIFAST-ADMIN-2026', gen_salt('bf')),
    'enabled',
    true
  )
)
on conflict (key) do nothing;

create or replace function public.crm_is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.crm_profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

create or replace function public.crm_has_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crm_profiles
    where role = 'admin'
      and status = 'active'
  );
$$;

create or replace function public.crm_claim_first_admin(setup_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row jsonb;
  stored_hash text;
  bootstrap_enabled boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if public.crm_has_admin() then
    raise exception 'Já existe um administrador ativo configurado.';
  end if;

  select value into settings_row
  from public.crm_settings
  where key = 'bootstrap_admin';

  if settings_row is null then
    raise exception 'Configuração de bootstrap não encontrada.';
  end if;

  bootstrap_enabled := coalesce((settings_row ->> 'enabled')::boolean, false);
  stored_hash := settings_row ->> 'token_hash';

  if not bootstrap_enabled then
    raise exception 'Bootstrap administrativo desabilitado.';
  end if;

  if stored_hash is null or crypt(setup_token, stored_hash) <> stored_hash then
    raise exception 'Token de ativação inválido.';
  end if;

  update public.crm_profiles
  set role = 'admin',
      status = 'active',
      updated_at = now()
  where id = auth.uid();

  update public.crm_settings
  set value = jsonb_set(value, '{enabled}', 'false'::jsonb, true),
      updated_at = now()
  where key = 'bootstrap_admin';

  return jsonb_build_object(
    'ok', true,
    'message', 'Administrador inicial ativado com sucesso.'
  );
end;
$$;

alter table public.crm_profiles enable row level security;
alter table public.crm_participants enable row level security;
alter table public.crm_profile_participants enable row level security;
alter table public.crm_import_files enable row level security;
alter table public.crm_sales enable row level security;
alter table public.crm_validations enable row level security;
alter table public.crm_renewal_records enable row level security;
alter table public.crm_customers enable row level security;
alter table public.crm_audit_logs enable row level security;
alter table public.crm_settings enable row level security;

drop policy if exists crm_profiles_select on public.crm_profiles;
create policy crm_profiles_select on public.crm_profiles
for select to authenticated
using (id = auth.uid() or public.crm_is_admin());

drop policy if exists crm_profiles_update_self on public.crm_profiles;
create policy crm_profiles_update_self on public.crm_profiles
for update to authenticated
using (id = auth.uid() or public.crm_is_admin())
with check (id = auth.uid() or public.crm_is_admin());

drop policy if exists crm_profiles_insert_self on public.crm_profiles;
create policy crm_profiles_insert_self on public.crm_profiles
for insert to authenticated
with check (id = auth.uid() or public.crm_is_admin());

drop policy if exists crm_participants_select on public.crm_participants;
create policy crm_participants_select on public.crm_participants
for select to authenticated
using (
  public.crm_is_admin()
  or exists (
    select 1
    from public.crm_profile_participants cpp
    where cpp.profile_id = auth.uid()
      and cpp.participant_id = crm_participants.id
  )
);

drop policy if exists crm_participants_admin_write on public.crm_participants;
create policy crm_participants_admin_write on public.crm_participants
for all to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());

drop policy if exists crm_profile_participants_select on public.crm_profile_participants;
create policy crm_profile_participants_select on public.crm_profile_participants
for select to authenticated
using (profile_id = auth.uid() or public.crm_is_admin());

drop policy if exists crm_profile_participants_admin_write on public.crm_profile_participants;
create policy crm_profile_participants_admin_write on public.crm_profile_participants
for all to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());

drop policy if exists crm_import_files_admin_only on public.crm_import_files;
create policy crm_import_files_admin_only on public.crm_import_files
for all to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());

drop policy if exists crm_sales_select on public.crm_sales;
create policy crm_sales_select on public.crm_sales
for select to authenticated
using (
  public.crm_is_admin()
  or exists (
    select 1
    from public.crm_profile_participants cpp
    where cpp.profile_id = auth.uid()
      and cpp.participant_id = crm_sales.participant_id
  )
);

drop policy if exists crm_sales_admin_write on public.crm_sales;
create policy crm_sales_admin_write on public.crm_sales
for all to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());

drop policy if exists crm_validations_select on public.crm_validations;
create policy crm_validations_select on public.crm_validations
for select to authenticated
using (
  public.crm_is_admin()
  or exists (
    select 1
    from public.crm_profile_participants cpp
    where cpp.profile_id = auth.uid()
      and cpp.participant_id = crm_validations.participant_id
  )
);

drop policy if exists crm_validations_admin_write on public.crm_validations;
create policy crm_validations_admin_write on public.crm_validations
for all to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());

drop policy if exists crm_renewals_select on public.crm_renewal_records;
create policy crm_renewals_select on public.crm_renewal_records
for select to authenticated
using (
  public.crm_is_admin()
  or exists (
    select 1
    from public.crm_profile_participants cpp
    where cpp.profile_id = auth.uid()
      and cpp.participant_id = crm_renewal_records.participant_id
  )
);

drop policy if exists crm_renewals_admin_write on public.crm_renewal_records;
create policy crm_renewals_admin_write on public.crm_renewal_records
for all to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());

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

drop policy if exists crm_audit_logs_admin_only on public.crm_audit_logs;
create policy crm_audit_logs_admin_only on public.crm_audit_logs
for all to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());

drop policy if exists crm_settings_admin_only on public.crm_settings;
create policy crm_settings_admin_only on public.crm_settings
for all to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());

insert into storage.buckets (id, name, public)
values ('crm-certifast-imports', 'crm-certifast-imports', false)
on conflict (id) do nothing;

drop policy if exists crm_storage_admin_read on storage.objects;
create policy crm_storage_admin_read on storage.objects
for select to authenticated
using (bucket_id = 'crm-certifast-imports' and public.crm_is_admin());

drop policy if exists crm_storage_admin_insert on storage.objects;
create policy crm_storage_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'crm-certifast-imports' and public.crm_is_admin());

drop policy if exists crm_storage_admin_update on storage.objects;
create policy crm_storage_admin_update on storage.objects
for update to authenticated
using (bucket_id = 'crm-certifast-imports' and public.crm_is_admin())
with check (bucket_id = 'crm-certifast-imports' and public.crm_is_admin());

drop policy if exists crm_storage_admin_delete on storage.objects;
create policy crm_storage_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'crm-certifast-imports' and public.crm_is_admin());
