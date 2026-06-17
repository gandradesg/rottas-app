-- v24: has_permission honra a flag permissoes para TODOS os roles (não só gestor)
-- Antes, Superintendente/Gestor Regional com a permissão marcada eram bloqueados
-- pela RLS das listas (empreendimentos, imobiliárias, etc). Agora: master/gestor
-- sempre; demais roles liberados se tiverem a flag em profiles.permissoes.
create or replace function public.has_permission(perm text)
returns boolean language sql stable security definer
set search_path to 'public','pg_catalog'
as $$
  select case
    when (select role from public.profiles where id = auth.uid()) in ('master','gestor') then true
    else coalesce(
      (select permissoes->>perm = 'true' from public.profiles where id = auth.uid()),
      false
    )
  end;
$$;
select 'migration v24 OK' as status;
