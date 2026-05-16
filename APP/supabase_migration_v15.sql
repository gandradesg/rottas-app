-- v15: Plataforma (Órulo/DWV) + atualiza RLS pra hierarquia ver subordinados
-- ============================================================================

-- ---- 1) Coluna plataforma em atividades ----
-- Quando tipo='orulo', distingue se veio do Órulo (PR) ou DWV (SC).
-- Valor texto livre, valida no app pra Órulo/DWV.
alter table public.atividades
  add column if not exists plataforma text check (plataforma in ('Órulo','DWV') or plataforma is null);

-- ---- 2) RLS agendamentos: hierarquia vê tudo dos subordinados ----
-- Gestor Regional vê agendamentos de gerentes/supervisores das suas cidades
-- Superintendente vê agendamentos de gerentes/supervisores dos seus estados
-- Gestor/Master vê tudo
drop policy if exists "hierarquia ve agendamentos" on public.agendamentos;
create policy "hierarquia ve agendamentos" on public.agendamentos
  for select using (
    -- gestor e master vêem tudo (sem restrição)
    (select role from public.profiles where id = auth.uid()) in ('gestor', 'master')
    -- superintendente vê dos seus estados
    or (
      (select role from public.profiles where id = auth.uid()) = 'superintendente'
      and exists (
        select 1 from public.profiles p
        join public.profiles caller on caller.id = auth.uid()
        where p.id = public.agendamentos.gerente_id
          and caller.estados_acesso ? coalesce(p.estado, '')
      )
    )
    -- gestor regional vê das suas cidades
    or (
      (select role from public.profiles where id = auth.uid()) = 'gestor_regional'
      and exists (
        select 1 from public.profiles p
        join public.profiles caller on caller.id = auth.uid()
        where p.id = public.agendamentos.gerente_id
          and caller.cidades_acesso ? coalesce(p.cidade, '')
      )
    )
  );

-- ---- 3) RLS atividades: mesma lógica hierárquica ----
drop policy if exists "hierarquia ve atividades" on public.atividades;
create policy "hierarquia ve atividades" on public.atividades
  for select using (
    (select role from public.profiles where id = auth.uid()) in ('gestor', 'master')
    or (
      (select role from public.profiles where id = auth.uid()) = 'superintendente'
      and exists (
        select 1 from public.profiles p
        join public.profiles caller on caller.id = auth.uid()
        where p.id = public.atividades.gerente_id
          and caller.estados_acesso ? coalesce(p.estado, '')
      )
    )
    or (
      (select role from public.profiles where id = auth.uid()) = 'gestor_regional'
      and exists (
        select 1 from public.profiles p
        join public.profiles caller on caller.id = auth.uid()
        where p.id = public.atividades.gerente_id
          and caller.cidades_acesso ? coalesce(p.cidade, '')
      )
    )
  );

-- ---- 4) RLS profiles: gestor_regional/superintendente leem subordinados ----
drop policy if exists "hierarquia ve profiles" on public.profiles;
create policy "hierarquia ve profiles" on public.profiles
  for select using (
    -- master e gestor: tudo
    (select role from public.profiles where id = auth.uid()) in ('gestor', 'master')
    -- superintendente: gerentes/supervisores dos estados dele
    or (
      (select role from public.profiles where id = auth.uid()) = 'superintendente'
      and public.profiles.role in ('gerente', 'supervisor', 'gestor_regional')
      and exists (
        select 1 from public.profiles caller
        where caller.id = auth.uid()
          and caller.estados_acesso ? coalesce(public.profiles.estado, '')
      )
    )
    -- gestor regional: gerentes/supervisores das cidades dele
    or (
      (select role from public.profiles where id = auth.uid()) = 'gestor_regional'
      and public.profiles.role in ('gerente', 'supervisor')
      and exists (
        select 1 from public.profiles caller
        where caller.id = auth.uid()
          and caller.cidades_acesso ? coalesce(public.profiles.cidade, '')
      )
    )
  );

-- ---- 5) RLS profiles: gestor_regional/superintendente editam subordinados ----
drop policy if exists "hierarquia edita profiles" on public.profiles;
create policy "hierarquia edita profiles" on public.profiles
  for update using (
    (select role from public.profiles where id = auth.uid()) in ('gestor', 'master')
    or (
      (select role from public.profiles where id = auth.uid()) = 'superintendente'
      and public.profiles.role in ('gerente', 'supervisor', 'gestor_regional')
      and exists (
        select 1 from public.profiles caller
        where caller.id = auth.uid()
          and caller.estados_acesso ? coalesce(public.profiles.estado, '')
      )
    )
    or (
      (select role from public.profiles where id = auth.uid()) = 'gestor_regional'
      and public.profiles.role in ('gerente', 'supervisor')
      and exists (
        select 1 from public.profiles caller
        where caller.id = auth.uid()
          and caller.cidades_acesso ? coalesce(public.profiles.cidade, '')
      )
    )
  ) with check (
    (select role from public.profiles where id = auth.uid()) in ('gestor', 'master')
    or (
      (select role from public.profiles where id = auth.uid()) = 'superintendente'
      and public.profiles.role in ('gerente', 'supervisor', 'gestor_regional')
      and exists (
        select 1 from public.profiles caller
        where caller.id = auth.uid()
          and caller.estados_acesso ? coalesce(public.profiles.estado, '')
      )
    )
    or (
      (select role from public.profiles where id = auth.uid()) = 'gestor_regional'
      and public.profiles.role in ('gerente', 'supervisor')
      and exists (
        select 1 from public.profiles caller
        where caller.id = auth.uid()
          and caller.cidades_acesso ? coalesce(public.profiles.cidade, '')
      )
    )
  );

select 'migration v15 OK' as status;
