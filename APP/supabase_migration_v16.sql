-- v16: Performance - funções STABLE pra RLS (evita N subqueries por linha)
-- ============================================================================
-- Antes da v16, cada policy fazia (select role from profiles where id = auth.uid())
-- diretamente. Isso roda 1x por linha checada, multiplicando custo.
-- Agora usamos funções STABLE/SECURITY DEFINER que o Postgres cacheia dentro
-- da mesma query (1 vez por query, não por linha).
-- ============================================================================

-- ---- 1) Helper functions cacheadas ----
create or replace function public.current_user_role()
returns text
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_estados()
returns jsonb
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select coalesce(estados_acesso, '[]'::jsonb) from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_cidades()
returns jsonb
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select coalesce(cidades_acesso, '[]'::jsonb) from public.profiles where id = auth.uid();
$$;

-- ---- 2) Reescreve is_admin() usando current_user_role() ----
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select public.current_user_role() in ('master','gestor','superintendente','gestor_regional');
$$;

-- ---- 3) Reescreve policies de agendamentos com funções cached ----
drop policy if exists "hierarquia ve agendamentos" on public.agendamentos;
create policy "hierarquia ve agendamentos" on public.agendamentos
  for select using (
    public.current_user_role() in ('gestor', 'master')
    or (
      public.current_user_role() = 'superintendente'
      and exists (
        select 1 from public.profiles p
        where p.id = public.agendamentos.gerente_id
          and public.current_user_estados() ? coalesce(p.estado, '')
      )
    )
    or (
      public.current_user_role() = 'gestor_regional'
      and exists (
        select 1 from public.profiles p
        where p.id = public.agendamentos.gerente_id
          and public.current_user_cidades() ? coalesce(p.cidade, '')
      )
    )
  );

-- ---- 4) Reescreve policies de atividades ----
drop policy if exists "hierarquia ve atividades" on public.atividades;
create policy "hierarquia ve atividades" on public.atividades
  for select using (
    public.current_user_role() in ('gestor', 'master')
    or (
      public.current_user_role() = 'superintendente'
      and exists (
        select 1 from public.profiles p
        where p.id = public.atividades.gerente_id
          and public.current_user_estados() ? coalesce(p.estado, '')
      )
    )
    or (
      public.current_user_role() = 'gestor_regional'
      and exists (
        select 1 from public.profiles p
        where p.id = public.atividades.gerente_id
          and public.current_user_cidades() ? coalesce(p.cidade, '')
      )
    )
  );

-- ---- 5) Reescreve policies de profiles ----
drop policy if exists "hierarquia ve profiles" on public.profiles;
create policy "hierarquia ve profiles" on public.profiles
  for select using (
    public.current_user_role() in ('gestor', 'master')
    or (
      public.current_user_role() = 'superintendente'
      and role in ('gerente', 'supervisor', 'gestor_regional')
      and public.current_user_estados() ? coalesce(estado, '')
    )
    or (
      public.current_user_role() = 'gestor_regional'
      and role in ('gerente', 'supervisor')
      and public.current_user_cidades() ? coalesce(cidade, '')
    )
  );

drop policy if exists "hierarquia edita profiles" on public.profiles;
create policy "hierarquia edita profiles" on public.profiles
  for update using (
    public.current_user_role() in ('gestor', 'master')
    or (
      public.current_user_role() = 'superintendente'
      and role in ('gerente', 'supervisor', 'gestor_regional')
      and public.current_user_estados() ? coalesce(estado, '')
    )
    or (
      public.current_user_role() = 'gestor_regional'
      and role in ('gerente', 'supervisor')
      and public.current_user_cidades() ? coalesce(cidade, '')
    )
  ) with check (
    public.current_user_role() in ('gestor', 'master')
    or (
      public.current_user_role() = 'superintendente'
      and role in ('gerente', 'supervisor', 'gestor_regional')
      and public.current_user_estados() ? coalesce(estado, '')
    )
    or (
      public.current_user_role() = 'gestor_regional'
      and role in ('gerente', 'supervisor')
      and public.current_user_cidades() ? coalesce(cidade, '')
    )
  );

-- ---- 6) Indexes pra acelerar lookups frequentes ----
create index if not exists idx_profiles_role on public.profiles(role) where ativo = true;
create index if not exists idx_atividades_gerente_id on public.atividades(gerente_id);
create index if not exists idx_agendamentos_gerente_id on public.agendamentos(gerente_id);

select 'migration v16 OK' as status;
