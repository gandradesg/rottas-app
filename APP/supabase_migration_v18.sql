-- v18: app_settings (configuracoes compartilhadas entre usuarios)
-- ============================================================================
-- Tabela key-value para configuracoes globais. Primeiro uso:
-- chave da API Gemini compartilhada entre todos os admins (em vez de cada
-- usuario ter que cadastrar a propria chave em localStorage).
-- ============================================================================

create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

alter table public.app_settings enable row level security;

-- Master + Gestor podem escrever
drop policy if exists "admin escreve settings" on public.app_settings;
create policy "admin escreve settings" on public.app_settings
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('master', 'gestor')
    )
  );

-- Qualquer usuario logado pode ler (necessario para o dashboard usar a chave)
drop policy if exists "logados leem settings" on public.app_settings;
create policy "logados leem settings" on public.app_settings
  for select using (auth.uid() is not null);

-- Trigger: updated_at automatico
create or replace function public.app_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_app_settings_updated on public.app_settings;
create trigger trg_app_settings_updated
  before update on public.app_settings
  for each row execute function public.app_settings_updated_at();

select 'migration v18 OK' as status;
