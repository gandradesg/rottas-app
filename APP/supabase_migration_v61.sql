-- v61: aviso do começo do dia passa de 7h30 para 8h (08:00 de Brasília = 11:00 UTC).
-- Na segunda a função não envia o "bom dia" (o lembrete da semana sai no mesmo horário).
select cron.unschedule(jobname) from cron.job where jobname in ('lembretes-manha-7h30', 'lembretes-manha-8h');
select cron.schedule('lembretes-manha-8h', '0 11 * * *', $job$
  select net.http_post(
    url := 'https://lmzjlirzexyopnjxohez.supabase.co/functions/v1/lembretes-agenda',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lembretes_cron_secret')),
    body := '{"modo":"manha"}'::jsonb,
    timeout_milliseconds := 120000);
$job$);
