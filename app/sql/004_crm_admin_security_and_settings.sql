alter table public.crm_profiles alter column status set default 'inactive';

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
    'inactive'
  )
  on conflict (id) do update
  set nome = excluded.nome,
      email = excluded.email;
  return new;
end;
$$;

drop policy if exists crm_profiles_admin_write on public.crm_profiles;
create policy crm_profiles_admin_write on public.crm_profiles
for all to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());

insert into public.crm_settings (key, value)
values ('auth_config', jsonb_build_object('allow_public_signup', true))
on conflict (key) do nothing;

drop policy if exists crm_settings_public_read on public.crm_settings;
create policy crm_settings_public_read on public.crm_settings
for select to anon, authenticated
using (key in ('agency_config', 'auth_config'));
