-- v53: HORA REAL DO REGISTRO (hora do aparelho).
-- Problema: `created_at` é carimbado pelo BANCO, ou seja, na hora em que a linha
-- chega no servidor. Com a fila offline, um registro feito às 16h40 e enviado
-- só às 19h ficava com 19h — hora errada.
-- Solução: `registrado_em` guarda o instante em que o gerente REALMENTE registrou,
-- medido no aparelho dele, e viaja junto com o registro (inclusive pela fila).
alter table public.atividades
  add column if not exists registrado_em timestamptz;

alter table public.agendamentos
  add column if not exists registrado_em timestamptz;

-- Consultas por data real do registro
create index if not exists idx_atividades_registrado_em
  on public.atividades (registrado_em desc) where registrado_em is not null;

-- Nos registros antigos (antes desta versão) não havia essa informação:
-- assume a hora de criação no servidor, que era o melhor dado disponível.
update public.atividades   set registrado_em = created_at where registrado_em is null;
update public.agendamentos set registrado_em = created_at where registrado_em is null;

select 'migration v53 OK' as status;
