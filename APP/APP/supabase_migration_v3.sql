-- =====================================================================
-- ROTTAS APP — Migration v3
-- Adiciona permissões granulares para Gestores
-- Rode no SQL Editor do Supabase APÓS migration v2
-- =====================================================================

-- 1. Coluna `permissoes` JSONB em profiles
alter table public.profiles
  add column if not exists permissoes jsonb default '{}'::jsonb;

-- 2. Helper: usuário tem permissão específica?
create or replace function public.has_permission(perm text)
returns boolean language sql security definer stable as $$
  select case
    when (select role from public.profiles where id = auth.uid()) = 'master' then true
    when (select role from public.profiles where id = auth.uid()) = 'gestor'
      then coalesce(
        (select permissoes->>perm = 'true' from public.profiles where id = auth.uid()),
        false
      )
    else false
  end;
$$;

-- 3. Atualiza policies — gestores com permissão podem gerenciar listas
drop policy if exists "master gerencia imobiliarias" on public.imobiliarias;
create policy "admin gerencia imobiliarias" on public.imobiliarias
  for all using (public.has_permission('gerenciar_listas'))
  with check (public.has_permission('gerenciar_listas'));

drop policy if exists "master gerencia empreendimentos" on public.empreendimentos;
create policy "admin gerencia empreendimentos" on public.empreendimentos
  for all using (public.has_permission('gerenciar_listas'))
  with check (public.has_permission('gerenciar_listas'));

drop policy if exists "master gerencia motivos_visita" on public.motivos_visita;
create policy "admin gerencia motivos_visita" on public.motivos_visita
  for all using (public.has_permission('gerenciar_listas'))
  with check (public.has_permission('gerenciar_listas'));

drop policy if exists "master gerencia motivos_orulo" on public.motivos_orulo;
create policy "admin gerencia motivos_orulo" on public.motivos_orulo
  for all using (public.has_permission('gerenciar_listas'))
  with check (public.has_permission('gerenciar_listas'));

-- 4. Profiles: gestor com permissão pode criar/editar/deletar usuários
drop policy if exists "master cria profiles" on public.profiles;
create policy "admin cria profiles" on public.profiles
  for insert with check (public.has_permission('gerenciar_usuarios'));

drop policy if exists "master atualiza profiles" on public.profiles;
create policy "admin atualiza profiles" on public.profiles
  for update using (public.has_permission('gerenciar_usuarios'));

drop policy if exists "master deleta profiles" on public.profiles;
create policy "admin deleta profiles" on public.profiles
  for delete using (public.has_permission('gerenciar_usuarios'));

-- 5. Atividades: gestor com permissão pode editar/excluir
drop policy if exists "master edita qualquer atividade" on public.atividades;
create policy "admin edita qualquer atividade" on public.atividades
  for update using (public.has_permission('editar_atividades') or auth.uid() = gerente_id);

create policy "admin deleta atividades" on public.atividades
  for delete using (public.has_permission('excluir_atividades') or auth.uid() = gerente_id);

-- 6. Garante que master continue podendo gerenciar imobiliárias
-- (a policy 'admin gerencia' acima cobre isso porque has_permission retorna true para master)

-- 7. Permite gerentes seguirem criando imobiliárias on-the-fly
-- (policy 'gerente cria imobiliaria' já existe)
