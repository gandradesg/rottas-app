-- v51: recorrência em agendamentos.
-- Permite criar o mesmo agendamento repetido (diária/semanal/quinzenal/mensal) —
-- o app gera uma linha por ocorrência, todas com o MESMO recorrencia_id, e guarda
-- a frequência e o total pra montar o evento recorrente (RRULE) na sincronização
-- com o calendário.
alter table public.agendamentos
  add column if not exists recorrencia_id uuid,
  add column if not exists recorrencia_freq text,
  add column if not exists recorrencia_total int;

-- Índice pra agrupar/consultar uma série de recorrência rapidamente.
create index if not exists idx_agendamentos_recorrencia
  on public.agendamentos (recorrencia_id)
  where recorrencia_id is not null;

select 'migration v51 OK' as status;
