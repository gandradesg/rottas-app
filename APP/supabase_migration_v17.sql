-- v17: Tabela dashboard_snapshots para histórico de atualizações do Dashboard
-- ============================================================================
-- Cada "Atualizar" do dashboard salva um snapshot dos KPIs principais.
-- Mantemos os últimos 100 por user pra evitar inflar a tabela.
-- Formato JSON facilita migração futura pro BI (Power BI lê JSON direto).
-- ============================================================================

create table if not exists public.dashboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  -- Filtros aplicados no momento do snapshot
  filtros jsonb default '{}'::jsonb,
  -- KPIs principais (vgv vendas, vgv propostas, conversões, paces, contadores)
  kpis jsonb not null default '{}'::jsonb,
  -- Período coberto pelo snapshot (texto humano + intervalo ISO)
  periodo_label text,
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_dashboard_snapshots_user_created
  on public.dashboard_snapshots(user_id, created_at desc);

alter table public.dashboard_snapshots enable row level security;

drop policy if exists "user le proprios snapshots" on public.dashboard_snapshots;
create policy "user le proprios snapshots" on public.dashboard_snapshots
  for select using (auth.uid() = user_id);

drop policy if exists "user cria proprios snapshots" on public.dashboard_snapshots;
create policy "user cria proprios snapshots" on public.dashboard_snapshots
  for insert with check (auth.uid() = user_id);

drop policy if exists "user deleta proprios snapshots" on public.dashboard_snapshots;
create policy "user deleta proprios snapshots" on public.dashboard_snapshots
  for delete using (auth.uid() = user_id);

-- Trigger: mantém apenas os últimos 100 snapshots por user (limpa antigos automático)
create or replace function public.prune_dashboard_snapshots()
returns trigger language plpgsql as $$
begin
  delete from public.dashboard_snapshots
  where user_id = new.user_id
    and id not in (
      select id from public.dashboard_snapshots
      where user_id = new.user_id
      order by created_at desc
      limit 100
    );
  return new;
end;
$$;

drop trigger if exists trg_prune_dashboard_snapshots on public.dashboard_snapshots;
create trigger trg_prune_dashboard_snapshots
  after insert on public.dashboard_snapshots
  for each row execute function public.prune_dashboard_snapshots();

select 'migration v17 OK' as status;
