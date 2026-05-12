-- v11: Hierarquia ampliada + workflow de aprovação de propostas + DWV/Órulo + treinamento
-- ============================================================================
-- HIERARQUIA NOVA:
--   supervisor -> gerente -> gestor_regional -> superintendente -> gestor -> master
-- ============================================================================

-- ---- 1) Novos roles permitidos ----
-- Drop check constraint antigo (se existir) e recriar com nova lista
do $$
declare
  cname text;
begin
  select conname into cname from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%';
  if cname is not null then
    execute format('alter table public.profiles drop constraint %I', cname);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('supervisor','gerente','gestor_regional','superintendente','gestor','master'));

-- ---- 2) Multi-estado / multi-cidade ----
-- estados_acesso: array de UFs onde o usuário tem permissão (superintendente)
-- cidades_acesso: array de cidades (gestor_regional)
alter table public.profiles
  add column if not exists estados_acesso jsonb default '[]'::jsonb,
  add column if not exists cidades_acesso jsonb default '[]'::jsonb;

-- ---- 3) Vínculo supervisor -> gerente ----
-- Cada supervisor é subordinado a UM gerente. Um gerente pode ter vários supervisores.
alter table public.profiles
  add column if not exists gerente_supervisor_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_profiles_gerente_supervisor on public.profiles(gerente_supervisor_id);

-- ---- 4) Cidades cadastráveis (lista) ----
create table if not exists public.cidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  estado text not null check (estado in ('PR','SC')),
  created_at timestamptz default now(),
  unique (nome, estado)
);

alter table public.cidades enable row level security;
drop policy if exists "todos leem cidades" on public.cidades;
drop policy if exists "admin gerencia cidades" on public.cidades;
create policy "todos leem cidades" on public.cidades for select using (auth.uid() is not null);
create policy "admin gerencia cidades" on public.cidades for all
  using (public.has_permission('gerenciar_listas') or
         (select role from public.profiles where id = auth.uid()) in ('master','gestor','superintendente'))
  with check (public.has_permission('gerenciar_listas') or
              (select role from public.profiles where id = auth.uid()) in ('master','gestor','superintendente'));

-- Cidades iniciais
insert into public.cidades (nome, estado) values
  ('Curitiba','PR'),('São José dos Pinhais','PR'),('Pinhais','PR'),('Araucária','PR'),
  ('Florianópolis','SC'),('Joinville','SC'),('Itajaí','SC'),('Balneário Camboriú','SC')
on conflict do nothing;

-- ---- 5) Link em empreendimentos (preparado, pode ser usado depois) ----
alter table public.empreendimentos
  add column if not exists link_url text;

-- ---- 6) Tipo DWV em atividades ----
-- Drop check constraint antigo e recriar com 'dwv' incluído
do $$
declare
  cname text;
begin
  select conname into cname from pg_constraint
    where conrelid = 'public.atividades'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo%';
  if cname is not null then
    execute format('alter table public.atividades drop constraint %I', cname);
  end if;
end $$;

alter table public.atividades
  add constraint atividades_tipo_check
  check (tipo in ('checkin','atendimento','proposta','orulo','dwv'));

-- Tipo na agenda também
do $$
declare
  cname text;
begin
  select conname into cname from pg_constraint
    where conrelid = 'public.agendamentos'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo%';
  if cname is not null then
    execute format('alter table public.agendamentos drop constraint %I', cname);
  end if;
end $$;

alter table public.agendamentos
  add constraint agendamentos_tipo_check
  check (tipo in ('checkin','atendimento','proposta','orulo','dwv','outro'));

-- Motivos DWV (espelha motivos_orulo). Reaproveita estrutura.
create table if not exists public.motivos_dwv (
  id uuid primary key default gen_random_uuid(),
  nome text unique not null,
  created_at timestamptz default now()
);
alter table public.motivos_dwv enable row level security;
drop policy if exists "todos leem motivos_dwv" on public.motivos_dwv;
drop policy if exists "admin gerencia motivos_dwv" on public.motivos_dwv;
create policy "todos leem motivos_dwv" on public.motivos_dwv for select using (auth.uid() is not null);
create policy "admin gerencia motivos_dwv" on public.motivos_dwv for all
  using (public.has_permission('gerenciar_listas'))
  with check (public.has_permission('gerenciar_listas'));

-- ---- 7) Campos extras para Check-in com motivo=Treinamento ----
-- Quando motivo_visita='Treinamento', preencher esses campos extras
alter table public.atividades
  add column if not exists local_treinamento text,
  add column if not exists qtd_pessoas integer,
  add column if not exists imobiliarias_participantes jsonb default '[]'::jsonb;

-- ---- 8) Workflow de aprovação de propostas ----
-- pendente -> aprovada_regional -> aprovada_super -> aprovada_master
-- A qualquer momento pode ser rejeitada. Quando "escalada", aprovador atual NÃO aprovou
-- e mandou pro nivel superior decidir.
alter table public.atividades
  add column if not exists status_aprovacao text
    check (status_aprovacao in ('pendente','aprovada_regional','aprovada_super','aprovada_master','rejeitada')),
  add column if not exists aprovador_id uuid references public.profiles(id) on delete set null,
  add column if not exists aprovado_em timestamptz,
  add column if not exists escalada_para text
    check (escalada_para in ('gestor_regional','superintendente','gestor','master')),
  add column if not exists motivo_rejeicao text,
  add column if not exists historico_aprovacao jsonb default '[]'::jsonb;

create index if not exists idx_atividades_status_aprovacao on public.atividades(status_aprovacao)
  where tipo = 'proposta';

-- Default 'pendente' para propostas novas
create or replace function public.set_default_proposta_status()
returns trigger language plpgsql as $$
begin
  if new.tipo = 'proposta' and new.status_aprovacao is null then
    new.status_aprovacao := 'pendente';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_default_proposta_status on public.atividades;
create trigger trg_default_proposta_status
  before insert on public.atividades
  for each row execute function public.set_default_proposta_status();

-- ---- 9) Helpers de permissão na nova hierarquia ----
-- is_admin agora inclui novos roles
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public, pg_catalog as $$
  select (select role from public.profiles where id = auth.uid())
         in ('master','gestor','superintendente','gestor_regional');
$$;

-- can_approve_proposta(level): valida se o user atual pode aprovar no nível indicado
create or replace function public.can_approve_proposta(level text)
returns boolean language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  caller_role text;
  allowed text[];
begin
  select role into caller_role from public.profiles where id = auth.uid();
  allowed := case level
    when 'gestor_regional' then array['gestor_regional','superintendente','gestor','master']
    when 'superintendente' then array['superintendente','gestor','master']
    when 'gestor' then array['gestor','master']
    when 'master' then array['master']
    else array[]::text[]
  end;
  return caller_role = any(allowed);
end;
$$;

-- ---- 10) Permissão pra editar profile de subordinado ----
-- Supervisor pode ser editado por gerente dele. Gerente por gestor_regional (mesma cidade), etc.
create or replace function public.pode_editar_profile(target_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  caller_role text; caller_estados jsonb; caller_cidades jsonb;
  target_role text; target_estado text; target_cidade text; target_supervisor uuid;
begin
  select role, estados_acesso, cidades_acesso into caller_role, caller_estados, caller_cidades
    from public.profiles where id = auth.uid();
  select role, estado, cidade, gerente_supervisor_id into target_role, target_estado, target_cidade, target_supervisor
    from public.profiles where id = target_id;

  -- Master edita qualquer um
  if caller_role = 'master' then return true; end if;
  -- Gestor edita qualquer um exceto master
  if caller_role = 'gestor' and target_role <> 'master' then return true; end if;
  -- Superintendente edita do(s) seu(s) estado(s), exceto master/gestor
  if caller_role = 'superintendente' and target_role not in ('master','gestor','superintendente') then
    if caller_estados ? target_estado then return true; end if;
  end if;
  -- Gestor regional edita das suas cidades, exceto níveis superiores
  if caller_role = 'gestor_regional' and target_role in ('gerente','supervisor') then
    if caller_cidades ? target_cidade then return true; end if;
  end if;
  -- Gerente edita os próprios supervisores
  if caller_role = 'gerente' and target_role = 'supervisor' and target_supervisor = auth.uid() then
    return true;
  end if;
  -- O próprio user edita o próprio profile (info pessoal)
  if target_id = auth.uid() then return true; end if;
  return false;
end;
$$;

-- ---- DONE ----
select 'migration v11 OK' as status;
