-- v34: atendimentos adicionais dentro do mesmo atendimento
-- Guarda registros extras (mesmo cliente, outra visita/local) DENTRO da própria
-- atividade de atendimento, como um array JSONB. Não gera nova atividade, então
-- NÃO é contado no funil — é só um registro complementar.
alter table public.atividades
  add column if not exists atendimentos_extras jsonb not null default '[]'::jsonb;
