-- v21: RLS de atividades — escopo correto para hierarquia (itens 1 e 2)
-- ============================================================================
-- PROBLEMA 1: rejeitar/aprovar exclusão funcionava só às vezes — o UPDATE/DELETE
--   dependia de has_permission(), que superintendente/gestor_regional nem sempre
--   têm, então a query afetava 0 linhas SEM erro (falso sucesso).
-- PROBLEMA 2: superintendente não via histórico da equipe do seu estado.
--   A policy "admin le todas atividades" (is_admin) dava acesso amplo demais
--   (todos os estados) — substituída por escopo correto via "hierarquia ve".
-- ============================================================================

-- 1) Remove SELECT amplo (is_admin). "hierarquia ve atividades" já cobre:
--    gestor/master = tudo; superintendente = seus estados; gestor_regional = cidades.
drop policy if exists "admin le todas atividades" on public.atividades;

-- 2) UPDATE escopado (aprovar/rejeitar exclusão = editar a atividade)
drop policy if exists "hierarquia edita atividades" on public.atividades;
create policy "hierarquia edita atividades" on public.atividades
  for update
  using (
    (current_user_role() = any (array['gestor','master']))
    or (current_user_role() = 'superintendente' and exists (
        select 1 from public.profiles p
        where p.id = atividades.gerente_id and current_user_estados() ? coalesce(p.estado,'')))
    or (current_user_role() = 'gestor_regional' and exists (
        select 1 from public.profiles p
        where p.id = atividades.gerente_id and current_user_cidades() ? coalesce(p.cidade,'')))
  )
  with check (
    (current_user_role() = any (array['gestor','master']))
    or (current_user_role() = 'superintendente' and exists (
        select 1 from public.profiles p
        where p.id = atividades.gerente_id and current_user_estados() ? coalesce(p.estado,'')))
    or (current_user_role() = 'gestor_regional' and exists (
        select 1 from public.profiles p
        where p.id = atividades.gerente_id and current_user_cidades() ? coalesce(p.cidade,'')))
  );

-- 3) DELETE escopado (aprovar exclusão remove a atividade)
drop policy if exists "hierarquia deleta atividades" on public.atividades;
create policy "hierarquia deleta atividades" on public.atividades
  for delete
  using (
    (current_user_role() = any (array['gestor','master']))
    or (current_user_role() = 'superintendente' and exists (
        select 1 from public.profiles p
        where p.id = atividades.gerente_id and current_user_estados() ? coalesce(p.estado,'')))
    or (current_user_role() = 'gestor_regional' and exists (
        select 1 from public.profiles p
        where p.id = atividades.gerente_id and current_user_cidades() ? coalesce(p.cidade,'')))
  );

select 'migration v21 OK' as status;
