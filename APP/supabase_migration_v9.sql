-- v9: Proteção do master principal contra exclusão (defense-in-depth no banco)
-- Mesmo que alguém burle a UI ou chame a API direto, o trigger impede DELETE
-- ou UPDATE que tire o role 'master' do email gabriel.galvao@rottasconstrutora.com.br

create or replace function public.protect_principal_master()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  principal_email constant text := 'gabriel.galvao@rottasconstrutora.com.br';
begin
  if tg_op = 'DELETE' then
    if lower(coalesce(old.email, '')) = principal_email then
      raise exception 'O master principal (%) nao pode ser excluido.', principal_email
        using errcode = 'check_violation';
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    -- Se o registro do master principal está sendo atualizado, garante que role continua master
    if lower(coalesce(old.email, '')) = principal_email and new.role is distinct from 'master' then
      raise exception 'O role do master principal (%) nao pode ser alterado.', principal_email
        using errcode = 'check_violation';
    end if;
    -- Também impede alterar o email do master principal
    if lower(coalesce(old.email, '')) = principal_email and lower(coalesce(new.email, '')) <> principal_email then
      raise exception 'O email do master principal nao pode ser alterado.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_protect_principal_master on public.profiles;
create trigger trg_protect_principal_master
  before delete or update on public.profiles
  for each row
  execute function public.protect_principal_master();

-- Também protege na tabela auth.users (impede admin.deleteUser via API)
create or replace function public.protect_principal_master_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  principal_email constant text := 'gabriel.galvao@rottasconstrutora.com.br';
begin
  if lower(coalesce(old.email, '')) = principal_email then
    raise exception 'O master principal (%) nao pode ser excluido do auth.users.', principal_email
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_protect_principal_master_auth on auth.users;
create trigger trg_protect_principal_master_auth
  before delete on auth.users
  for each row
  execute function public.protect_principal_master_auth();
