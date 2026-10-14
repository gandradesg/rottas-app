-- v50: corrige a função criar_cliente (dois problemas encontrados no teste em massa).
--
-- (1) AMBIGUIDADE "id": a versão de 4 args (migration v48) declara RETURNS TABLE(id ...),
--     o que cria uma variável de saída chamada "id". No "insert ... on conflict (id)"
--     o Postgres não sabia se "id" era a variável ou a coluna → erro
--     'column reference "id" is ambiguous' a CADA chamada. Corrigido com
--     #variable_conflict use_column (nome sem qualificação resolve para a COLUNA).
--
-- (2) SOBRECARGA AMBÍGUA: existiam criar_cliente(text,text,text) e
--     criar_cliente(text,text,text,uuid) (com p_id default). Chamar com 3 args ficava
--     indefinido entre as duas ('function ... is not unique'). Removemos a de 3 args;
--     a de 4 args (com p_id default) cobre todos os casos.
--
-- Observação: o cadastro de cliente está DESATIVADO no app hoje, então isto não afeta
-- os usuários agora — deixa a função pronta e correta para quando for reativado.

drop function if exists public.criar_cliente(text, text, text);

create or replace function public.criar_cliente(
  p_nome text,
  p_tel text default null,
  p_email text default null,
  p_id uuid default null
)
returns table(id uuid, nome text, telefone text, email text)
language plpgsql security definer set search_path = public, pg_catalog as $$
#variable_conflict use_column
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'nome é obrigatório'; end if;
  v_id := coalesce(p_id, gen_random_uuid());
  insert into public.clientes (id, nome, telefone, email, created_by)
  values (v_id, trim(p_nome), nullif(trim(p_tel), ''), nullif(trim(p_email), ''), auth.uid())
  on conflict (id) do nothing;
  return query
    select c.id, c.nome, c.telefone, c.email
    from public.clientes c
    where c.id = v_id;
end; $$;

revoke all on function public.criar_cliente(text, text, text, uuid) from public;
grant execute on function public.criar_cliente(text, text, text, uuid) to authenticated;

select 'migration v50 OK' as status;
