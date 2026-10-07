-- v60: notificações do app no COMEÇO DO DIA (7h30) e 15 MINUTOS ANTES de cada atividade.
--
-- "Porteiro" do aviso de 15 min: o agendador roda a cada minuto, mas só chama a
-- função quando existe atividade começando nos próximos 16 min, de alguém com
-- notificação ativada, que ainda não foi avisada. Na maior parte dos minutos não
-- chama nada (evita ~1.440 chamadas inúteis por dia).
-- A chave tem o mesmo formato da função: antes15:<id>:<horário ISO em UTC>.
create or replace function public.ha_lembrete_15min()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from agendamentos a
    join push_inscricoes s on s.user_id = a.gerente_id
    where a.status = 'pendente'
      and a.data_prevista > now()
      and a.data_prevista <= now() + interval '16 minutes'
      and not exists (
        select 1 from lembretes_enviados l
        where l.chave = 'antes15:' || a.id || ':' || to_char(a.data_prevista at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
  );
$$;
revoke all on function public.ha_lembrete_15min() from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job where jobname in ('lembretes-manha-7h30', 'lembretes-15min-antes');

-- 07:30 de Brasília = 10:30 UTC, todo dia
select cron.schedule('lembretes-manha-7h30', '30 10 * * *', $job$
  select net.http_post(
    url := 'https://lmzjlirzexyopnjxohez.supabase.co/functions/v1/lembretes-agenda',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lembretes_cron_secret')),
    body := '{"modo":"manha"}'::jsonb,
    timeout_milliseconds := 120000);
$job$);

-- A cada minuto, mas só dispara se o porteiro disser que há aviso a dar
select cron.schedule('lembretes-15min-antes', '* * * * *', $job$
  select net.http_post(
    url := 'https://lmzjlirzexyopnjxohez.supabase.co/functions/v1/lembretes-agenda',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lembretes_cron_secret')),
    body := '{"modo":"antes15"}'::jsonb,
    timeout_milliseconds := 60000)
  where public.ha_lembrete_15min();
$job$);
