-- v48: criar_cliente IDEMPOTENTE — aceita id gerado no cliente (p_id).
-- Motivo: em conexão instável (iOS suspende a conexão ao usar câmera/segundo
-- plano), a RESPOSTA do cadastro se perdia e o app dava "Tempo esgotado" —
-- perdendo o lead, OU (ao reenviar) criando cliente DUPLICADO.
-- Com p_id + ON CONFLICT DO NOTHING, reenviar é seguro: o mesmo id não duplica
-- e a função SEMPRE devolve o registro (recém-criado OU o que já existe).
-- Mantém a versão antiga de 3 args por retrocompatibilidade.
create or replace function public.criar_cliente(
  p_nome text,
  p_tel text default null,
  p_email text default null,
  p_id uuid default null
)
returns table(id uuid, nome text, telefone text, email text)
language plpgsql security definer set search_path = public, pg_catalog as $$
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

select 'migration v48 OK' as status;
