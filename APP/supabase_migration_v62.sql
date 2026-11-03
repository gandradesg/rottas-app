-- v62 (03/11/2026): agenda — horário de término, edição/cancelamento da SÉRIE
-- recorrente, Gerente de Produto e supervisor com os mesmos direitos do gerente.

-- ── 1) Horário de término (opcional) ─────────────────────────────────────────
alter table public.agendamentos add column if not exists data_fim timestamptz;

-- ── 2) Novo perfil: Gerente de Produto ───────────────────────────────────────
-- Acesso pontual: só vê/realiza as agendas em que um gerente/supervisor da
-- regional dele (cidades_acesso) o marcou. As linhas da agenda compartilhada
-- já são criadas uma por pessoa (gerente_id = ele), então as políticas de
-- "dono da linha" cobrem leitura/edição sem regra nova.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role = any (array[
  'master','gestor','superintendente','gestor_regional','gerente','supervisor','recepcao_rottas','gerente_produto'
]));

-- Quem pode ser marcado na agenda por mim:
--   • eu; quem está ligado a mim (supervisor↔gerente); gerentes/supervisores da
--     minha cidade (como já era);
--   • Gerentes de Produto cuja regional (cidades_acesso) inclui a minha cidade.
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
    )
  order by p.nome;
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
    );
$$;

-- Ver a agenda de colegas da praça: antes só gerente↔gerente; agora o supervisor
-- tem o mesmo direito do gerente.
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
    );
$$;

create or replace function public.gerentes_mesma_praca()
returns table(id uuid, nome text)
language sql stable security definer set search_path to 'public' as $$
  select p.id, p.nome
  from profiles p
  join profiles me on me.id = auth.uid()
  where p.role in ('gerente','supervisor') and p.ativo = true
    and me.role in ('gerente','supervisor')
    and coalesce(me.cidade,'') <> '' and p.cidade = me.cidade
    and p.id <> auth.uid()
  order by p.nome;
$$;

-- ── 3) Editar / cancelar "esta e as seguintes" da série recorrente ───────────
-- SECURITY INVOKER: as regras de acesso (RLS) de cada linha continuam valendo.
-- Só mexe nas ocorrências AINDA ABERTAS (pendente) a partir da data escolhida;
-- as já realizadas/canceladas ficam como estão (são histórico).
-- p_delta_seg: quanto a data/hora andou (ex.: 9h → 14h = +18000s), aplicado a
-- cada ocorrência mantendo o "ritmo" da série.
create or replace function public.agenda_serie_editar(
  p_recorrencia_id uuid, p_desde timestamptz, p_delta_seg bigint,
  p_campos jsonb, p_duracao_seg bigint default null
) returns integer
language plpgsql security invoker set search_path to 'public' as $$
declare n integer;
begin
  update agendamentos a set
    data_prevista = a.data_prevista + make_interval(secs => coalesce(p_delta_seg, 0)),
    data_fim = case
      when p_duracao_seg is null then null
      else a.data_prevista + make_interval(secs => coalesce(p_delta_seg, 0)) + make_interval(secs => p_duracao_seg) end,
    remarcada = case when coalesce(p_delta_seg, 0) <> 0 then true else a.remarcada end,
    remarcacoes = case when coalesce(p_delta_seg, 0) <> 0 then coalesce(a.remarcacoes, 0) + 1 else a.remarcacoes end,
    data_prevista_original = case when coalesce(p_delta_seg, 0) <> 0
      then coalesce(a.data_prevista_original, a.data_prevista) else a.data_prevista_original end,
    tipo           = coalesce(p_campos->>'tipo', a.tipo),
    titulo         = case when p_campos ? 'titulo'         then nullif(p_campos->>'titulo', '')         else a.titulo end,
    observacoes    = case when p_campos ? 'observacoes'    then nullif(p_campos->>'observacoes', '')    else a.observacoes end,
    imobiliaria    = case when p_campos ? 'imobiliaria'    then nullif(p_campos->>'imobiliaria', '')    else a.imobiliaria end,
    local_visita   = case when p_campos ? 'local_visita'   then nullif(p_campos->>'local_visita', '')   else a.local_visita end,
    empreendimento = case when p_campos ? 'empreendimento' then nullif(p_campos->>'empreendimento', '') else a.empreendimento end,
    cliente        = case when p_campos ? 'cliente'        then nullif(p_campos->>'cliente', '')        else a.cliente end,
    corretor       = case when p_campos ? 'corretor'       then nullif(p_campos->>'corretor', '')       else a.corretor end,
    motivo_visita  = case when p_campos ? 'motivo_visita'  then nullif(p_campos->>'motivo_visita', '')  else a.motivo_visita end,
    updated_at = now()
  where a.recorrencia_id = p_recorrencia_id
    and a.data_prevista >= p_desde
    and a.status = 'pendente';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.agenda_serie_cancelar(
  p_recorrencia_id uuid, p_desde timestamptz, p_motivo text
) returns integer
language plpgsql security invoker set search_path to 'public' as $$
declare n integer;
begin
  update agendamentos set status = 'cancelado', motivo_cancelamento = p_motivo, updated_at = now()
  where recorrencia_id = p_recorrencia_id and data_prevista >= p_desde and status = 'pendente';
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.agenda_serie_editar(uuid, timestamptz, bigint, jsonb, bigint) to authenticated;
grant execute on function public.agenda_serie_cancelar(uuid, timestamptz, text) to authenticated;
revoke execute on function public.agenda_serie_editar(uuid, timestamptz, bigint, jsonb, bigint) from anon;
revoke execute on function public.agenda_serie_cancelar(uuid, timestamptz, text) from anon;

select 'migration v62 OK' as status;
