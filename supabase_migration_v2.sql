-- =====================================================================
-- ROTTAS APP — Migration v2
-- Adiciona role 'gestor' (separado de master)
-- Rode este script no SQL Editor do Supabase APÓS o schema inicial
-- =====================================================================

-- 1. Atualiza o constraint de role para aceitar 'gestor'
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('master','gestor','gerente'));

-- 2. Helper: usuário tem visão administrativa (master OU gestor)?
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('master','gestor')
  );
$$;

-- 3. Atualiza policies que dependiam só de is_master() para read-only de gestor

-- Profiles: gestor pode ler todos os profiles, mas não escrever
drop policy if exists "master le todos profiles" on public.profiles;
create policy "admin le todos profiles" on public.profiles
  for select using (public.is_admin());

-- Atividades: gestor pode ler todas
drop policy if exists "master le todas atividades" on public.atividades;
create policy "admin le todas atividades" on public.atividades
  for select using (public.is_admin());

-- Listas (imobiliárias, empreendimentos, motivos): admin pode ler;
-- somente master modifica.
-- (já estavam OK — todos autenticados leem; master gerencia)

-- 4. Garante que Gabriel continua como master
update public.profiles
set role = 'master'
where email = 'gabriel.galvao@rottasconstrutora.com.br';
