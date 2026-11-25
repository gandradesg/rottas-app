-- v67 (25/11/2026): GRUPOS DE AGENDA.
-- O Master monta grupos (ex.: "Curitiba" = Ricardo, Márcio, Saulo) e cada
-- integrante passa a poder ver, na Agenda, a agenda de TODOS do grupo juntos.
-- Aditiva: não altera dados existentes.

create table if not exists public.agenda_grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.agenda_grupo_membros (
  grupo_id uuid not null references public.agenda_grupos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (grupo_id, user_id)
);
create index if not exists idx_agenda_grupo_membros_user on public.agenda_grupo_membros(user_id);

-- Auxiliar sem recursão de RLS: "eu sou membro deste grupo?"
create or replace function public.sou_do_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from agenda_grupo_membros where grupo_id = p_grupo and user_id = auth.uid());
$$;

alter table public.agenda_grupos enable row level security;
alter table public.agenda_grupo_membros enable row level security;

-- Master gerencia tudo; cada um lê os grupos dos quais faz parte.
drop policy if exists "master gerencia grupos" on public.agenda_grupos;
create policy "master gerencia grupos" on public.agenda_grupos
  for all using (public.current_user_role() = 'master') with check (public.current_user_role() = 'master');
drop policy if exists "membro le seus grupos" on public.agenda_grupos;
create policy "membro le seus grupos" on public.agenda_grupos
  for select using (public.sou_do_grupo(id));

drop policy if exists "master gerencia membros" on public.agenda_grupo_membros;
create policy "master gerencia membros" on public.agenda_grupo_membros
  for all using (public.current_user_role() = 'master') with check (public.current_user_role() = 'master');
drop policy if exists "membro le membros dos seus grupos" on public.agenda_grupo_membros;
create policy "membro le membros dos seus grupos" on public.agenda_grupo_membros
  for select using (public.sou_do_grupo(grupo_id));


-- Meus grupos, com os integrantes (nome e cargo) — usado na Agenda.
create or replace function public.meus_grupos_agenda()
returns table(grupo_id uuid, grupo_nome text, membro_id uuid, membro_nome text, membro_role text)
language sql stable security definer set search_path to 'public' as $$
  select g.id, g.nome, p.id, p.nome, p.role
  from agenda_grupos g
  join agenda_grupo_membros eu on eu.grupo_id = g.id and eu.user_id = auth.uid()
  join agenda_grupo_membros m on m.grupo_id = g.id
  join profiles p on p.id = m.user_id and p.ativo = true
  order by g.nome, p.nome;
$$;

-- Ver a agenda de colegas: + quem está no mesmo grupo de agenda.
create or replace function public.pode_ver_agenda_peer(target uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select
    auth.uid() = target
    or exists (select 1 from profiles p where p.id = target and p.gerente_supervisor_id = auth.uid())
    or exists (select 1 from profiles me where me.id = auth.uid() and me.gerente_supervisor_id = target)
    or exists (
      select 1 from profiles me join profiles owner on owner.id = target
      where me.id = auth.uid()
        and me.role in ('gerente','supervisor') and owner.role in ('gerente','supervisor','gerente_produto')
        and coalesce(me.cidade,'') <> ''
        and (me.cidade = owner.cidade or coalesce(owner.cidades_acesso, '[]'::jsonb) ? me.cidade)
    )
    or exists (
      select 1 from agenda_grupo_membros a join agenda_grupo_membros b on b.grupo_id = a.grupo_id
      where a.user_id = auth.uid() and b.user_id = target
    );
$$;

grant execute on function public.sou_do_grupo(uuid) to authenticated;
grant execute on function public.meus_grupos_agenda() to authenticated;
revoke execute on function public.sou_do_grupo(uuid) from anon;
revoke execute on function public.meus_grupos_agenda() from anon;

-- Grupos iniciais pedidos pelo master (idempotente: só cria se não existir).
do $$
declare g uuid;
begin
  if not exists (select 1 from agenda_grupos where nome = 'Curitiba') then
    insert into agenda_grupos (nome) values ('Curitiba') returning id into g;
    insert into agenda_grupo_membros (grupo_id, user_id)
      select g, id from profiles where nome in ('Ricardo Cesar', 'Márcio Guimarães', 'Saulo Mello') and ativo;
  end if;
  if not exists (select 1 from agenda_grupos where nome = 'Londrina') then
    insert into agenda_grupos (nome) values ('Londrina') returning id into g;
    insert into agenda_grupo_membros (grupo_id, user_id)
      select g, id from profiles where nome in ('Marjorie Navarro', 'Bruno Vinicius') and ativo;
  end if;
end $$;

select 'migration v67 OK' as status;
