-- v65 (17/11/2026): convidar a LIDERANÇA para uma agenda.
-- Ex.: o Saulo (gerente, Curitiba/PR) marca a Crislaine (superintendente do PR)
-- numa agenda específica. Ela ganha a própria linha na agenda (como qualquer
-- presente) e recebe o convite de calendário no e-mail (função agenda-outlook).
-- Quem pode ser marcado por um gerente/supervisor:
--   • superintendente cujos estados_acesso incluem o estado dele;
--   • gestor regional cujas cidades_acesso incluem a cidade dele.

create or replace function public.pessoas_agenda_mesma_praca()
returns table(id uuid, nome text, role text)
language sql stable security definer set search_path to 'public' as $$
  select distinct p.id, p.nome, p.role
  from profiles p
  join profiles me on me.id = auth.uid()
  where p.ativo = true
    and (
      (p.role in ('gerente','supervisor') and (
          p.id = auth.uid()
          or p.gerente_supervisor_id = auth.uid()
          or p.id = me.gerente_supervisor_id
          or (coalesce(me.cidade,'') <> '' and p.cidade = me.cidade)))
      or (p.role = 'gerente_produto' and me.role in ('gerente','supervisor')
          and coalesce(me.cidade,'') <> ''
          and (p.cidade = me.cidade or coalesce(p.cidades_acesso, '[]'::jsonb) ? me.cidade))
      -- liderança da praça
      or (p.role = 'superintendente' and me.role in ('gerente','supervisor')
          and coalesce(me.estado,'') <> '' and coalesce(p.estados_acesso, '[]'::jsonb) ? me.estado)
      or (p.role = 'gestor_regional' and me.role in ('gerente','supervisor')
          and coalesce(me.cidade,'') <> '' and coalesce(p.cidades_acesso, '[]'::jsonb) ? me.cidade)
    )
  order by p.nome;
$$;

-- Liderança da praça de quem está logado (usado no criar/editar/confirmar).
create or replace function public.e_lideranca_da_minha_praca(target uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from profiles me join profiles t on t.id = target
    where me.id = auth.uid() and me.role in ('gerente','supervisor') and t.ativo = true
      and (
        (t.role = 'superintendente' and coalesce(me.estado,'') <> '' and coalesce(t.estados_acesso, '[]'::jsonb) ? me.estado)
        or (t.role = 'gestor_regional' and coalesce(me.cidade,'') <> '' and coalesce(t.cidades_acesso, '[]'::jsonb) ? me.cidade)
      )
  );
$$;

create or replace function public.pode_agendar_para(target uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select
    auth.uid() = target
    or exists (select 1 from profiles p where p.id = target and p.gerente_supervisor_id = auth.uid())
    or exists (select 1 from profiles me where me.id = auth.uid() and me.gerente_supervisor_id = target)
    or exists (
      select 1 from profiles me join profiles t on t.id = target
      where me.id = auth.uid()
        and me.role in ('gerente','supervisor') and t.role in ('gerente','supervisor')
        and coalesce(me.cidade,'') <> '' and me.cidade = t.cidade
    )
    or exists (
      select 1 from profiles me join profiles t on t.id = target
      where me.id = auth.uid()
        and me.role in ('gerente','supervisor') and t.role = 'gerente_produto'
        and coalesce(me.cidade,'') <> ''
        and (t.cidade = me.cidade or coalesce(t.cidades_acesso, '[]'::jsonb) ? me.cidade)
    )
    or public.e_lideranca_da_minha_praca(target);
$$;

-- Ver a linha da liderança: só a dos compromissos em que EU também estou
-- (agenda compartilhada) — o gerente não passa a ver a agenda inteira do líder.
drop policy if exists "participante ve agenda do grupo" on public.agendamentos;
create policy "participante ve agenda do grupo" on public.agendamentos
  for select using (auth.uid() = any(participantes));

grant execute on function public.e_lideranca_da_minha_praca(uuid) to authenticated;
revoke execute on function public.e_lideranca_da_minha_praca(uuid) from anon;

select 'migration v65 OK' as status;
