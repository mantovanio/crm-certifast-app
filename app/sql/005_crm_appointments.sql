-- Módulo de agendamentos: registra visitas para renovação de certificados digitais

create table if not exists public.crm_appointments (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references public.crm_participants(id) on delete set null,
  participant_nome text,
  client_name text not null default '',
  cpf_cnpj text,
  phone text,
  mobile text,
  email_cliente text,
  pedido text,
  codigo text,
  produto text,
  posto text,
  scheduled_date date,
  scheduled_time text,
  status text not null default 'agendado'
    check (status in ('agendado', 'realizado', 'nao_atendeu', 'cancelado', 'reagendado')),
  notes text,
  imported_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists crm_appointments_update_timestamp on public.crm_appointments;
create trigger crm_appointments_update_timestamp
  before update on public.crm_appointments
  for each row execute function public.crm_now_update();

create index if not exists crm_appointments_participant_idx on public.crm_appointments(participant_id);
create index if not exists crm_appointments_scheduled_date_idx on public.crm_appointments(scheduled_date desc);
create index if not exists crm_appointments_status_idx on public.crm_appointments(status);

create table if not exists public.crm_appointment_documents (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.crm_appointments(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_size_bytes bigint,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists crm_appt_docs_appointment_idx on public.crm_appointment_documents(appointment_id);

-- RLS
alter table public.crm_appointments enable row level security;
alter table public.crm_appointment_documents enable row level security;

-- Admin: acesso total
drop policy if exists crm_appointments_admin on public.crm_appointments;
create policy crm_appointments_admin on public.crm_appointments
  for all to authenticated
  using (public.crm_is_admin())
  with check (public.crm_is_admin());

-- Participante: ver seus agendamentos (pelo participant_id vinculado ou pelo próprio imported_by)
drop policy if exists crm_appointments_participant_select on public.crm_appointments;
create policy crm_appointments_participant_select on public.crm_appointments
  for select to authenticated
  using (
    imported_by = auth.uid()
    or participant_id in (
      select participant_id from public.crm_profile_participants
      where profile_id = auth.uid()
    )
  );

-- Participante: pode inserir (será importado_by = auth.uid())
drop policy if exists crm_appointments_participant_insert on public.crm_appointments;
create policy crm_appointments_participant_insert on public.crm_appointments
  for insert to authenticated
  with check (imported_by = auth.uid());

-- Participante: pode atualizar status/notas dos seus agendamentos
drop policy if exists crm_appointments_participant_update on public.crm_appointments;
create policy crm_appointments_participant_update on public.crm_appointments
  for update to authenticated
  using (
    imported_by = auth.uid()
    or participant_id in (
      select participant_id from public.crm_profile_participants
      where profile_id = auth.uid()
    )
  );

-- Documentos — Admin
drop policy if exists crm_appt_docs_admin on public.crm_appointment_documents;
create policy crm_appt_docs_admin on public.crm_appointment_documents
  for all to authenticated
  using (public.crm_is_admin())
  with check (public.crm_is_admin());

-- Documentos — Participante: ver documentos dos seus agendamentos
drop policy if exists crm_appt_docs_participant_select on public.crm_appointment_documents;
create policy crm_appt_docs_participant_select on public.crm_appointment_documents
  for select to authenticated
  using (
    appointment_id in (
      select a.id from public.crm_appointments a
      where a.imported_by = auth.uid()
        or a.participant_id in (
          select participant_id from public.crm_profile_participants
          where profile_id = auth.uid()
        )
    )
  );

-- Documentos — Participante: inserir documentos nos seus agendamentos
drop policy if exists crm_appt_docs_participant_insert on public.crm_appointment_documents;
create policy crm_appt_docs_participant_insert on public.crm_appointment_documents
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and appointment_id in (
      select a.id from public.crm_appointments a
      where a.imported_by = auth.uid()
        or a.participant_id in (
          select participant_id from public.crm_profile_participants
          where profile_id = auth.uid()
        )
    )
  );

-- Documentos — Participante: excluir documentos que ele mesmo enviou
drop policy if exists crm_appt_docs_participant_delete on public.crm_appointment_documents;
create policy crm_appt_docs_participant_delete on public.crm_appointment_documents
  for delete to authenticated
  using (uploaded_by = auth.uid());

-- Bucket de documentos de agendamento (execute no Supabase Storage dashboard ou via CLI)
-- Bucket: crm-certifast-docs (privado, autenticado)
-- Políticas de storage precisam ser configuradas no painel do Supabase:
--   INSERT: authenticated users (path prefix: appointments/)
--   SELECT: authenticated users (owner = auth.uid() ou via RLS customizada)
--   DELETE: owner = auth.uid() ou admin
