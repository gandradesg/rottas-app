-- v10: Fix definitivo do loop de "primeiro_acesso"
-- Trigger automatico que marca profile.primeiro_acesso = false quando o user
-- atualiza a senha. Defesa de servidor independente do frontend.
--
-- Como funciona:
--  1. User e convidado via admin.inviteUserByEmail (cria user em auth.users sem senha)
--  2. User clica no link -> Supabase processa token -> set email_confirmed_at e last_sign_in_at
--  3. User entra na tela /setup-password e define senha
--  4. updateUser({password}) atualiza auth.users.encrypted_password
--  5. ESTE TRIGGER detecta a mudanca e marca profile.primeiro_acesso = false automaticamente
--
-- Por que `old.last_sign_in_at is not null`:
--   Evita disparar na criacao inicial do user (quando admin define senha temporaria).
--   So dispara quando o user ja se autenticou pelo menos uma vez (clicou no link).

create or replace function public.handle_password_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and new.encrypted_password is not null
     and old.last_sign_in_at is not null
  then
    update public.profiles
    set primeiro_acesso = false
    where id = new.id
      and primeiro_acesso = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_handle_password_change on auth.users;
create trigger trg_handle_password_change
  after update of encrypted_password on auth.users
  for each row
  execute function public.handle_password_change();
