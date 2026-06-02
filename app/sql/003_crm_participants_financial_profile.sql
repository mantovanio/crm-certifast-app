alter table public.crm_participants
  add column if not exists telefone text,
  add column if not exists razao_social text,
  add column if not exists documento text,
  add column if not exists contato_financeiro text,
  add column if not exists favorecido text,
  add column if not exists banco text,
  add column if not exists agencia text,
  add column if not exists conta text,
  add column if not exists tipo_conta text,
  add column if not exists pix text,
  add column if not exists observacoes_financeiras text;
