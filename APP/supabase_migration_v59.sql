-- v59: AGENDADOR dos lembretes (horários em UTC; Brasília = UTC-3, sem horário de verão)
--   18:00 de Brasília = 21:00 UTC, todo dia            → agenda do dia seguinte
--   08:00 de Brasília = 11:00 UTC, toda segunda-feira  → agenda da semana
-- O segredo vem do cofre (vault), não fica escrito aqui.
select cron.unschedule(jobname) from cron.job where jobname in ('lembretes-diario-18h', 'lembretes-semanal-seg-8h');

select cron.schedule('lembretes-diario-18h', '0 21 * * *', $job$
  select net.http_post(
    url := 'https://lmzjlirzexyopnjxohez.supabase.co/functions/v1/lembretes-agenda',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lembretes_cron_secret')),
    body := '{"modo":"diario"}'::jsonb,
    timeout_milliseconds := 120000);
$job$);

select cron.schedule('lembretes-semanal-seg-8h', '0 11 * * 1', $job$
  select net.http_post(
    url := 'https://lmzjlirzexyopnjxohez.supabase.co/functions/v1/lembretes-agenda',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lembretes_cron_secret')),
    body := '{"modo":"semanal"}'::jsonb,
    timeout_milliseconds := 120000);
$job$);
