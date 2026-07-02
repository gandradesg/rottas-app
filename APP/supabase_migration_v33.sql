-- v33: indicador de performance da agenda (remarcação)
-- Adiciona rastreio de remarcação nos agendamentos:
--   remarcada               -> flag (true quando data/hora foi alterada numa edição)
--   remarcacoes             -> quantas vezes foi remarcado
--   data_prevista_original  -> primeira data/hora agendada (preservada na 1ª remarcação)
alter table public.agendamentos
  add column if not exists remarcada boolean not null default false,
  add column if not exists remarcacoes integer not null default 0,
  add column if not exists data_prevista_original timestamptz;
