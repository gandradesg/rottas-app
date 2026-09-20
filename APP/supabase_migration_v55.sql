-- v55: logs de registro mais úteis para diagnóstico.
--
-- (1) registro_id: liga TODAS as etapas de um mesmo registro (início → fotos →
--     gravação → confirmação → sucesso/falha). Sem isso, as etapas apareciam
--     soltas e não dava pra seguir a história de um registro específico nem ver
--     exatamente em qual passo ele parou.
-- (2) erro_codigo / erro_detalhe: o Postgres/Supabase devolve `code`, `details` e
--     `hint` além da mensagem — é isso que diz a causa técnica real
--     (ex.: 23505 = chave duplicada, 42501 = bloqueado por permissão/RLS).
alter table public.registro_logs
  add column if not exists registro_id   text,
  add column if not exists erro_codigo   text,
  add column if not exists erro_detalhe  text;

create index if not exists idx_registro_logs_registro_id
  on public.registro_logs (registro_id) where registro_id is not null;

select 'migration v55 OK' as status;
