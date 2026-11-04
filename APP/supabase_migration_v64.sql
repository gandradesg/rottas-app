-- v64 (04/11/2026): resumo de visitas por imobiliária (Dashboard → Imobiliárias).
-- Última visita de TODOS OS TEMPOS e total de visitas (check-in + atendimento)
-- por imobiliária — base para "nunca visitadas" e "sem visita há X dias".
-- SECURITY INVOKER: cada perfil só enxerga o que já pode ver (RLS).
-- p_gerentes: restringe aos gerentes do escopo/filtro (inclui quando a pessoa
-- foi participante de uma agenda compartilhada).
create or replace function public.imob_resumo_visitas(p_gerentes uuid[] default null)
returns table(chave text, ultima timestamptz, total bigint)
language sql stable security invoker set search_path to 'public' as $$
  select upper(trim(a.imobiliaria)) as chave,
         max(coalesce(a.registrado_em, a.created_at)) as ultima,
         count(*) as total
  from atividades a
  where a.cancelada = false
    and a.imobiliaria is not null and trim(a.imobiliaria) <> ''
    and a.tipo in ('checkin', 'atendimento')
    and (p_gerentes is null or a.gerente_id = any(p_gerentes) or coalesce(a.participantes, '{}') && p_gerentes)
  group by 1;
$$;
grant execute on function public.imob_resumo_visitas(uuid[]) to authenticated;
revoke execute on function public.imob_resumo_visitas(uuid[]) from anon;

select 'migration v64 OK' as status;
