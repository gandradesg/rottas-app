-- v31: clientes deixam de ser LISTÁVEIS por usuários comuns (privacidade em teste).
-- Só admin (master/gestor/superintendente/gestor_regional) lê a lista.
-- Mas o aviso de "cliente já cadastrado" ao criar continua funcionando para todos,
-- via funções SECURITY DEFINER que só respondem a um contato específico
-- (não permitem navegar/listar a base).

-- Leitura da tabela: só admin
drop policy if exists "logados leem clientes" on public.clientes;
drop policy if exists "admin le clientes" on public.clientes;
create policy "admin le clientes" on public.clientes
  for select using (public.is_admin());
-- (mantém "logados criam clientes" e "admin edita clientes" como estão)

-- Duplicado por contato: retorna só quem casa com o telefone/e-mail informado
create or replace function public.cliente_por_contato(p_tel text default null, p_email text default null)
returns table(id uuid, nome text, telefone text, email text)
language sql stable security definer set search_path = public, pg_catalog as $$
  select c.id, c.nome, c.telefone, c.email
  from public.clientes c
  where (nullif(regexp_replace(coalesce(p_tel,''), '\D', '', 'g'), '') is not null
         and regexp_replace(coalesce(c.telefone,''), '\D', '', 'g') = regexp_replace(p_tel, '\D', '', 'g'))
     or (nullif(trim(coalesce(p_email,'')), '') is not null
         and lower(coalesce(c.email,'')) = lower(trim(p_email)))
  limit 5;
$$;

-- Checa se um cliente (por id) tem telefone/e-mail — para o aviso de contato incompleto
create or replace function public.cliente_tem_contato(p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_catalog as $$
  select exists(
    select 1 from public.clientes c
    where c.id = p_id and (coalesce(c.telefone,'') <> '' or coalesce(c.email,'') <> '')
  );
$$;

revoke all on function public.cliente_por_contato(text, text) from public;
revoke all on function public.cliente_tem_contato(uuid) from public;
grant execute on function public.cliente_por_contato(text, text) to authenticated;
grant execute on function public.cliente_tem_contato(uuid) to authenticated;

select 'migration v31 OK' as status;
