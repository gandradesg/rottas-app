-- v35: visibilidade de agenda + gerentes cadastram motivos livremente
--
-- 1) Agenda: além da própria e dos supervisores, o gerente vê a agenda dos
--    gerentes da MESMA PRAÇA (cidade); e o supervisor vê a agenda do seu gerente.
--    Feito via função SECURITY DEFINER para evitar recursão de RLS em profiles.
create or replace function public.pode_ver_agenda_peer(target uuid)
returns boolean language sql stable security definer set search_path = public as $func$
  select
    auth.uid() = target
    or exists (select 1 from profiles p where p.id = target and p.gerente_supervisor_id = auth.uid())
    or exists (select 1 from profiles me where me.id = auth.uid() and me.gerente_supervisor_id = target)
    or exists (
      select 1 from profiles me join profiles owner on owner.id = target
      where me.id = auth.uid()
        and me.role = 'gerente' and owner.role = 'gerente'
        and coalesce(me.cidade,'') <> '' and me.cidade = owner.cidade
    );
$func$;
grant execute on function public.pode_ver_agenda_peer(uuid) to authenticated;

drop policy if exists "gerente le agendamentos seus e dos supervisores" on public.agendamentos;
create policy "gerente le agendamentos (equipe e praca)" on public.agendamentos
  for select using (public.pode_ver_agenda_peer(gerente_id));

-- 2) RPC: gerentes da mesma praça (cidade) do usuário atual (para o filtro na agenda)
create or replace function public.gerentes_mesma_praca()
returns table(id uuid, nome text)
language sql stable security definer set search_path = public as $func$
  select p.id, p.nome
  from profiles p
  join profiles me on me.id = auth.uid()
  where p.role = 'gerente' and p.ativo = true
    and me.role = 'gerente'
    and coalesce(me.cidade,'') <> '' and p.cidade = me.cidade
    and p.id <> auth.uid()
  order by p.nome;
$func$;
grant execute on function public.gerentes_mesma_praca() to authenticated;

-- 3) Gerentes podem cadastrar motivos (visita/contato) para mapear necessidades de campo
drop policy if exists "autenticado adiciona motivos_visita" on public.motivos_visita;
create policy "autenticado adiciona motivos_visita" on public.motivos_visita
  for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "autenticado adiciona motivos_orulo" on public.motivos_orulo;
create policy "autenticado adiciona motivos_orulo" on public.motivos_orulo
  for insert to authenticated with check (auth.uid() is not null);
