-- v29: (1) gerentes da imobiliária, (2) proposta vinculada a atendimento,
--      (4) hierarquia cria agenda p/ gerentes, (5) carteira mensal de visitas.

-- ── (1) Gerentes da imobiliária (espelha a tabela de corretores) ──────────────
create table if not exists public.gerentes_imobiliaria (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  imobiliaria_id uuid references public.imobiliarias(id) on delete set null,
  imobiliaria_nome text,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);
create index if not exists idx_gerimob_imob on public.gerentes_imobiliaria(imobiliaria_nome);
alter table public.gerentes_imobiliaria enable row level security;
drop policy if exists "logados leem gerimob" on public.gerentes_imobiliaria;
create policy "logados leem gerimob" on public.gerentes_imobiliaria for select using (auth.uid() is not null);
drop policy if exists "logados criam gerimob" on public.gerentes_imobiliaria;
create policy "logados criam gerimob" on public.gerentes_imobiliaria for insert with check (auth.uid() is not null);
drop policy if exists "admin edita gerimob" on public.gerentes_imobiliaria;
create policy "admin edita gerimob" on public.gerentes_imobiliaria for update using (public.is_admin());
drop policy if exists "admin deleta gerimob" on public.gerentes_imobiliaria;
create policy "admin deleta gerimob" on public.gerentes_imobiliaria for delete using (public.is_admin());

-- atividades: vínculo do gerente da imobiliária + proposta gerada por um atendimento
alter table public.atividades add column if not exists gerente_imob text;
alter table public.atividades add column if not exists gerente_imob_id uuid references public.gerentes_imobiliaria(id) on delete set null;
alter table public.atividades add column if not exists atendimento_id uuid references public.atividades(id) on delete set null;

-- ── (5) Carteira mensal: imobiliárias que cada gerente deve visitar no mês ─────
create table if not exists public.carteira_visitas (
  id uuid primary key default gen_random_uuid(),
  gerente_id uuid references auth.users(id) on delete cascade,
  imobiliaria_nome text not null,
  ano_mes text not null,            -- 'YYYY-MM'
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique (gerente_id, imobiliaria_nome, ano_mes)
);
create index if not exists idx_carteira_gm on public.carteira_visitas(gerente_id, ano_mes);
alter table public.carteira_visitas enable row level security;
drop policy if exists "le carteira" on public.carteira_visitas;
create policy "le carteira" on public.carteira_visitas for select using (public.is_admin() or gerente_id = auth.uid());
drop policy if exists "admin cria carteira" on public.carteira_visitas;
create policy "admin cria carteira" on public.carteira_visitas for insert with check (public.is_admin());
drop policy if exists "admin deleta carteira" on public.carteira_visitas;
create policy "admin deleta carteira" on public.carteira_visitas for delete using (public.is_admin());

-- ── (4) Agenda: hierarquia (super/regional/gestor/master) cria e edita
--       agendamentos para gerentes dentro do seu escopo geográfico ─────────────
drop policy if exists "hierarquia cria agendamento" on public.agendamentos;
create policy "hierarquia cria agendamento" on public.agendamentos for insert with check (
  (current_user_role() = any (array['gestor','master']))
  or (current_user_role() = 'superintendente' and exists (
      select 1 from public.profiles p where p.id = agendamentos.gerente_id and current_user_estados() ? coalesce(p.estado,'')))
  or (current_user_role() = 'gestor_regional' and exists (
      select 1 from public.profiles p where p.id = agendamentos.gerente_id and current_user_cidades() ? coalesce(p.cidade,'')))
);
drop policy if exists "hierarquia edita agendamento" on public.agendamentos;
create policy "hierarquia edita agendamento" on public.agendamentos for update using (
  (current_user_role() = any (array['gestor','master']))
  or (current_user_role() = 'superintendente' and exists (
      select 1 from public.profiles p where p.id = agendamentos.gerente_id and current_user_estados() ? coalesce(p.estado,'')))
  or (current_user_role() = 'gestor_regional' and exists (
      select 1 from public.profiles p where p.id = agendamentos.gerente_id and current_user_cidades() ? coalesce(p.cidade,'')))
);

select 'migration v29 OK' as status;
