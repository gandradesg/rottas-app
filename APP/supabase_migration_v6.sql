-- =====================================================================
-- ROTTAS APP — Migration v6
-- Módulo de Agenda: tabela `agendamentos` + vínculo com atividades
-- Aplicar APÓS migrations v2..v5
-- =====================================================================

-- 1. Tabela de agendamentos (visitas/atendimentos planejados)
create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  gerente_id uuid references public.profiles(id) on delete cascade not null,
  tipo text check (tipo in ('checkin','atendimento','proposta','orulo','outro')) not null,
  data_prevista timestamptz not null,
  -- Campos descritivos (depende do tipo)
  imobiliaria text,
  empreendimento text,
  cliente text,
  corretor text,
  titulo text,
  observacoes text,
  -- Status e vínculos
  status text check (status in ('pendente','realizado','cancelado','adiado')) default 'pendente',
  atividade_id uuid references public.atividades(id) on delete set null,
  realizado_em timestamptz,
  cancelado_motivo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_agendamentos_gerente_data
  on public.agendamentos(gerente_id, data_prevista);
create index if not exists idx_agendamentos_status
  on public.agendamentos(status);
create index if not exists idx_agendamentos_data
  on public.agendamentos(data_prevista);

-- 2. Vínculo bidirecional na atividade (referência ao agendamento que originou)
alter table public.atividades
  add column if not exists agendamento_id uuid references public.agendamentos(id) on delete set null;

-- 3. RLS — espelha o padrão de `atividades`
alter table public.agendamentos enable row level security;

drop policy if exists "gerente le proprios agendamentos" on public.agendamentos;
create policy "gerente le proprios agendamentos" on public.agendamentos
  for select using (auth.uid() = gerente_id);

drop policy if exists "admin le todos agendamentos" on public.agendamentos;
create policy "admin le todos agendamentos" on public.agendamentos
  for select using (public.is_admin());

drop policy if exists "gerente cria agendamento" on public.agendamentos;
create policy "gerente cria agendamento" on public.agendamentos
  for insert with check (auth.uid() = gerente_id);

drop policy if exists "gerente edita proprio agendamento" on public.agendamentos;
create policy "gerente edita proprio agendamento" on public.agendamentos
  for update using (auth.uid() = gerente_id) with check (auth.uid() = gerente_id);

drop policy if exists "admin edita qualquer agendamento" on public.agendamentos;
create policy "admin edita qualquer agendamento" on public.agendamentos
  for update using (public.has_permission('editar_atividades') or auth.uid() = gerente_id)
  with check (public.has_permission('editar_atividades') or auth.uid() = gerente_id);

drop policy if exists "gerente deleta proprio agendamento" on public.agendamentos;
create policy "gerente deleta proprio agendamento" on public.agendamentos
  for delete using (auth.uid() = gerente_id);

drop policy if exists "admin deleta agendamento" on public.agendamentos;
create policy "admin deleta agendamento" on public.agendamentos
  for delete using (public.has_permission('excluir_atividades'));

-- 4. Verificações finais
select 'agendamentos' as tabela, count(*) as registros from public.agendamentos
union all
select 'atividades.agendamento_id existe',
  case when exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='atividades' and column_name='agendamento_id'
  ) then 1 else 0 end;
