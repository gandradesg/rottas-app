-- v66 (18/11/2026): SEGURANÇA — trava de cargos, perfil do master principal,
-- cadastro só por convite e chave da IA fora do alcance dos usuários comuns.
-- Encontrado na auditoria do handover técnico. Não altera nenhum dado existente.
--
-- Regras (definidas pelo master principal):
--  1. SÓ O MASTER muda cargo (role), permissões e estados de acesso de alguém.
--     Ninguém muda o próprio acesso (exceto o master).
--  2. O perfil do MASTER PRINCIPAL só pode ser alterado por ele mesmo
--     (nem outro master). O servidor (service_role) segue podendo — é o que
--     envia convites/reconvites.
--  3. Conta nova nasce SEMPRE como 'gerente'; o cargo real é definido pelo
--     convite (função invite-user, com as regras de escopo) ou pelo master.
--     O cadastro público do Supabase Auth é desligado à parte (configuração).
--  4. A chave da IA (app_settings) só é lida pelos perfis administrativos.

-- e-mail do master principal: o mesmo das funções protect_principal_master*
create or replace function public.email_master_principal()
returns text language sql immutable as $$ select 'gabriel.galvao@rottasconstrutora.com.br'::text $$;

create or replace function public.bloquear_escalada_perfil()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_catalog' as $$
declare
  quem uuid := auth.uid();
  papel text;
begin
  -- Servidor (service_role: convites, funções) e SQL administrativo: livre.
  if quem is null then return new; end if;

  -- (2) Perfil do master principal: só ele mesmo altera.
  if tg_op = 'UPDATE' and lower(coalesce(old.email, '')) = public.email_master_principal() and quem <> old.id then
    raise exception 'O perfil do master principal só pode ser alterado por ele mesmo.' using errcode = '42501';
  end if;

  papel := public.current_user_role();
  if papel = 'master' then return new; end if;

  if tg_op = 'INSERT' then
    -- Quem não é master só cria Gerente/Supervisor, sem permissões extras.
    if new.role not in ('gerente', 'supervisor') or coalesce(new.permissoes, '{}'::jsonb) <> '{}'::jsonb
       or coalesce(new.estados_acesso, '[]'::jsonb) <> '[]'::jsonb then
      raise exception 'Sem permissão para criar este perfil de acesso.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- (1) Cargo, permissões e estados: só o master (para si ou para outros).
  if new.role is distinct from old.role then
    raise exception 'Apenas o Master pode alterar cargos.' using errcode = '42501';
  end if;
  if new.permissoes is distinct from old.permissoes then
    raise exception 'Apenas o Master pode alterar permissões.' using errcode = '42501';
  end if;
  if new.estados_acesso is distinct from old.estados_acesso then
    raise exception 'Apenas o Master pode alterar os estados de acesso.' using errcode = '42501';
  end if;

  if new.id = quem then
    -- O próprio usuário também não muda: ativo, conta de teste, vínculo de
    -- supervisor. Cidades: só gerente/supervisor/GP (o app vincula a cidade
    -- ao cadastrar uma imobiliária nova).
    if new.ativo is distinct from old.ativo
       or new.conta_teste is distinct from old.conta_teste
       or new.gerente_supervisor_id is distinct from old.gerente_supervisor_id
       or (new.cidades_acesso is distinct from old.cidades_acesso
           and papel not in ('gerente', 'supervisor', 'gerente_produto')) then
      raise exception 'Você não pode alterar o próprio perfil de acesso.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_bloquear_escalada_perfil on public.profiles;
create trigger trg_bloquear_escalada_perfil
  before insert or update on public.profiles
  for each row execute function public.bloquear_escalada_perfil();

-- (3) Conta nova nasce como 'gerente' — antes o cargo vinha do que a própria
-- pessoa informava no cadastro (raw_user_meta_data->>'role').
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    'gerente'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- (4) Chave da IA: só perfis administrativos leem (antes: qualquer logado).
drop policy if exists "logados leem settings" on public.app_settings;
drop policy if exists "admins leem settings" on public.app_settings;
create policy "admins leem settings" on public.app_settings
  for select using (public.is_admin());

select 'migration v66 OK' as status;
