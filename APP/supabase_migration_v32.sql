-- v32: corrige cadastro de cliente por usuário comum.
-- Na v31 o SELECT de clientes virou admin-only; mas o cadastro fazia insert().select()
-- (para obter o id do novo cliente), o que exige SELECT e passou a falhar por RLS.
-- Solução: criar via função SECURITY DEFINER que insere e devolve o id/nome —
-- o usuário cadastra sem precisar de permissão de leitura na tabela.
create or replace function public.criar_cliente(p_nome text, p_tel text default null, p_email text default null)
returns table(id uuid, nome text, telefone text, email text)
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'nome é obrigatório'; end if;
  return query
    insert into public.clientes (nome, telefone, email, created_by)
    values (trim(p_nome), nullif(trim(p_tel), ''), nullif(trim(p_email), ''), auth.uid())
    returning clientes.id, clientes.nome, clientes.telefone, clientes.email;
end; $$;

revoke all on function public.criar_cliente(text, text, text) from public;
grant execute on function public.criar_cliente(text, text, text) to authenticated;

select 'migration v32 OK' as status;
