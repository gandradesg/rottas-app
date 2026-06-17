-- v23: corretores (item 3) e clientes/leads (item 4)

-- ── CORRETORES (vinculados a uma imobiliária) ──────────────────────────────
create table if not exists public.corretores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  imobiliaria_id uuid references public.imobiliarias(id) on delete set null,
  imobiliaria_nome text,           -- denormalizado p/ filtro sem join
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);
create index if not exists idx_corretores_imob on public.corretores(imobiliaria_nome);
alter table public.corretores enable row level security;
drop policy if exists "logados leem corretores" on public.corretores;
create policy "logados leem corretores" on public.corretores for select using (auth.uid() is not null);
drop policy if exists "logados criam corretores" on public.corretores;
create policy "logados criam corretores" on public.corretores for insert with check (auth.uid() is not null);
drop policy if exists "admin edita corretores" on public.corretores;
create policy "admin edita corretores" on public.corretores for update using (public.is_admin());
drop policy if exists "admin deleta corretores" on public.corretores;
create policy "admin deleta corretores" on public.corretores for delete using (public.is_admin());

-- ── CLIENTES / LEADS (base compartilhada) ──────────────────────────────────
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);
create index if not exists idx_clientes_telefone on public.clientes(telefone);
create index if not exists idx_clientes_email on public.clientes(lower(email));
alter table public.clientes enable row level security;
drop policy if exists "logados leem clientes" on public.clientes;
create policy "logados leem clientes" on public.clientes for select using (auth.uid() is not null);
drop policy if exists "logados criam clientes" on public.clientes;
create policy "logados criam clientes" on public.clientes for insert with check (auth.uid() is not null);
drop policy if exists "admin edita clientes" on public.clientes;
create policy "admin edita clientes" on public.clientes for update using (public.is_admin());

-- vínculo opcional nas atividades (mantém tb os campos texto cliente/corretor)
alter table public.atividades add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.atividades add column if not exists corretor_id uuid references public.corretores(id) on delete set null;

select 'migration v23 OK' as status;
