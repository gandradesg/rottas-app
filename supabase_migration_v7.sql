-- =====================================================================
-- ROTTAS APP — Migration v7
-- Locais de visita (lista própria, separada de imobiliárias)
-- =====================================================================

create table if not exists public.locais_visita (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz default now()
);

alter table public.locais_visita enable row level security;

drop policy if exists "todos leem locais_visita" on public.locais_visita;
create policy "todos leem locais_visita" on public.locais_visita
  for select using (auth.uid() is not null);

drop policy if exists "admin gerencia locais_visita" on public.locais_visita;
create policy "admin gerencia locais_visita" on public.locais_visita
  for all using (public.has_permission('gerenciar_listas'))
  with check (public.has_permission('gerenciar_listas'));

drop policy if exists "gerente cria local_visita" on public.locais_visita;
create policy "gerente cria local_visita" on public.locais_visita
  for insert with check (auth.uid() is not null);

-- Seed com locais já mencionados em atividades (sem duplicar imobiliárias)
insert into public.locais_visita (nome)
select distinct trim(local_visita)
  from public.atividades
  where local_visita is not null and trim(local_visita) <> ''
on conflict (nome) do nothing;

-- Verificações
select count(*) as total_locais from public.locais_visita;
