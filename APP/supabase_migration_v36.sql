-- v36: supervisores e gerentes da mesma cidade podem se marcar em agendamentos
--
-- Regra (agenda compartilhada): ao criar/editar um agendamento, o usuário pode
-- definir como responsável: ele mesmo, seus supervisores, o gerente superior (do
-- supervisor) e qualquer gerente/supervisor da MESMA cidade.
create or replace function public.pode_agendar_para(target uuid)
returns boolean language sql stable security definer set search_path = public as $func$
  select
    auth.uid() = target
    or exists (select 1 from profiles p where p.id = target and p.gerente_supervisor_id = auth.uid())
    or exists (select 1 from profiles me where me.id = auth.uid() and me.gerente_supervisor_id = target)
    or exists (
      select 1 from profiles me join profiles t on t.id = target
      where me.id = auth.uid()
        and me.role in ('gerente','supervisor') and t.role in ('gerente','supervisor')
        and coalesce(me.cidade,'') <> '' and me.cidade = t.cidade
    );
$func$;
grant execute on function public.pode_agendar_para(uuid) to authenticated;

drop policy if exists "gerente cria agendamento" on public.agendamentos;
create policy "gerente cria agendamento" on public.agendamentos
  for insert with check (public.pode_agendar_para(gerente_id));

drop policy if exists "gerente edita agendamentos seus e dos supervisores" on public.agendamentos;
create policy "gerente edita agendamentos (equipe e praca)" on public.agendamentos
  for update using (public.pode_agendar_para(gerente_id)) with check (public.pode_agendar_para(gerente_id));

-- RPC que alimenta o dropdown de responsável no formulário de agendamento
create or replace function public.pessoas_agenda_mesma_praca()
returns table(id uuid, nome text, role text)
language sql stable security definer set search_path = public as $func$
  select distinct p.id, p.nome, p.role
  from profiles p
  join profiles me on me.id = auth.uid()
  where p.ativo = true
    and p.role in ('gerente','supervisor')
    and (
      p.id = auth.uid()
      or p.gerente_supervisor_id = auth.uid()
      or p.id = me.gerente_supervisor_id
      or (coalesce(me.cidade,'') <> '' and p.cidade = me.cidade)
    )
  order by p.nome;
$func$;
grant execute on function public.pessoas_agenda_mesma_praca() to authenticated;
