-- v27: sugestões de melhoria. Todos os usuários enviam; o Master consulta todas.

create table if not exists public.sugestoes (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  categoria text,
  user_id uuid references auth.users(id) on delete set null,
  user_nome text,
  user_email text,
  user_role text,
  status text default 'nova',
  created_at timestamptz default now()
);
create index if not exists idx_sugestoes_created on public.sugestoes(created_at desc);
alter table public.sugestoes enable row level security;

-- Qualquer logado cria a própria sugestão
drop policy if exists "logados criam sugestoes" on public.sugestoes;
create policy "logados criam sugestoes" on public.sugestoes
  for insert with check (auth.uid() is not null and user_id = auth.uid());

-- Cada um vê as suas; Master vê todas
drop policy if exists "ve proprias ou master ve todas" on public.sugestoes;
create policy "ve proprias ou master ve todas" on public.sugestoes
  for select using (user_id = auth.uid() or public.current_user_role() = 'master');

-- Só o Master edita (status) e exclui
drop policy if exists "master edita sugestoes" on public.sugestoes;
create policy "master edita sugestoes" on public.sugestoes
  for update using (public.current_user_role() = 'master');

drop policy if exists "master deleta sugestoes" on public.sugestoes;
create policy "master deleta sugestoes" on public.sugestoes
  for delete using (public.current_user_role() = 'master');

select 'migration v27 OK' as status;
