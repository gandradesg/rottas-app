-- v57: LEMBRETES DA AGENDA (e-mail + notificação do app)
-- 1) agendador (pg_cron) e chamadas HTTP do banco (pg_net)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Inscrições de notificação (Web Push). Um aparelho = uma linha.
create table if not exists public.push_inscricoes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  dispositivo text,
  criado_em   timestamptz not null default now(),
  ultimo_uso  timestamptz
);
create index if not exists push_inscricoes_user_idx on public.push_inscricoes(user_id);
alter table public.push_inscricoes enable row level security;
drop policy if exists "ve proprias inscricoes" on public.push_inscricoes;
create policy "ve proprias inscricoes" on public.push_inscricoes
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "cria propria inscricao" on public.push_inscricoes;
create policy "cria propria inscricao" on public.push_inscricoes
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "atualiza propria inscricao" on public.push_inscricoes;
create policy "atualiza propria inscricao" on public.push_inscricoes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "remove propria inscricao" on public.push_inscricoes;
create policy "remove propria inscricao" on public.push_inscricoes
  for delete to authenticated using (user_id = auth.uid());

-- 3) Registro de lembretes enviados: a CHAVE única impede mandar o mesmo
--    lembrete duas vezes (se o agendador disparar de novo ou a função repetir).
create table if not exists public.lembretes_enviados (
  chave      text primary key,              -- ex.: diario:<user>:2026-10-08:email
  user_id    uuid,
  modo       text,
  canal      text,
  qtd        integer,
  ok         boolean,
  erro       text,
  enviado_em timestamptz not null default now()
);
alter table public.lembretes_enviados enable row level security;
drop policy if exists "master le lembretes" on public.lembretes_enviados;
create policy "master le lembretes" on public.lembretes_enviados
  for select to authenticated using (current_user_role() = 'master');
