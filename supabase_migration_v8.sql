-- =====================================================================
-- ROTTAS APP — Migration v8
-- Adiciona motivo_visita aos agendamentos (para Check-in pré-planejado)
-- Restringe tipos a Check-in, Atendimento e Outro (Proposta/Órulo não fazem sentido planejar)
-- =====================================================================

alter table public.agendamentos
  add column if not exists motivo_visita text;

-- Atualiza constraint de tipo (drop + add)
alter table public.agendamentos
  drop constraint if exists agendamentos_tipo_check;

alter table public.agendamentos
  add constraint agendamentos_tipo_check
  check (tipo in ('checkin','atendimento','outro'));

-- Migrar quaisquer agendamentos antigos com tipo proposta/orulo para 'outro'
update public.agendamentos
  set tipo = 'outro'
  where tipo in ('proposta','orulo');

select count(*) as total, tipo from public.agendamentos group by tipo;
