-- v52: LOGS DE REGISTRO (diagnóstico).
-- Grava cada ETAPA de um registro feito pelo gerente (início, fotos, gravação,
-- confirmação, sucesso/falha) com duração e o erro real. Serve pra descobrir
-- EM QUE PONTO os registros estão travando, em vez de adivinhar.
create table if not exists public.registro_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  user_nome   text,
  tipo        text,          -- checkin | atendimento | proposta | outro | agendamento
  etapa       text,          -- inicio | fotos | gravacao | confirmacao | sucesso | falha
  ok          boolean,
  duracao_ms  integer,
  erro        text,
  tentativa   integer,
  app_version text,
  online      boolean,
  dispositivo text,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_registro_logs_criado on public.registro_logs (criado_em desc);
create index if not exists idx_registro_logs_user   on public.registro_logs (user_id, criado_em desc);

alter table public.registro_logs enable row level security;

-- Qualquer usuário logado grava os PRÓPRIOS logs.
drop policy if exists "loga proprio registro" on public.registro_logs;
create policy "loga proprio registro" on public.registro_logs
  for insert to authenticated
  with check (user_id = auth.uid());

-- Cada um lê os próprios; a hierarquia (master/gestor/superintendente/gestor
-- regional) lê os de todos, pra diagnosticar a equipe.
drop policy if exists "le logs de registro" on public.registro_logs;
create policy "le logs de registro" on public.registro_logs
  for select to authenticated
  using (
    user_id = auth.uid()
    or current_user_role() in ('master','gestor','superintendente','gestor_regional')
  );

-- Só master limpa os logs.
drop policy if exists "master limpa logs" on public.registro_logs;
create policy "master limpa logs" on public.registro_logs
  for delete to authenticated
  using (current_user_role() = 'master');

select 'migration v52 OK' as status;
