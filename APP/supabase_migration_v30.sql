-- v30: agendamento de atendimento passa a ter "Local da visita" e "Imobiliária"
-- como campos SEPARADOS. Antes o local era gravado na coluna imobiliaria (reuso).
alter table public.agendamentos add column if not exists local_visita text;

select 'migration v30 OK' as status;
