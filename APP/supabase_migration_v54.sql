-- v54: garante que `registrado_em` NUNCA fique vazio.
-- O app manda a hora do aparelho em toda criação; este gatilho é a rede de
-- segurança: se algum caminho esquecer de mandar, o banco usa a hora de chegada.
-- Assim `registrado_em` sempre tem valor e pode ser usado com segurança em
-- relatórios e filtros por data.
create or replace function public.set_registrado_em()
returns trigger language plpgsql as $$
begin
  if new.registrado_em is null then
    new.registrado_em := coalesce(new.created_at, now());
  end if;
  return new;
end; $$;

drop trigger if exists trg_atividades_registrado_em on public.atividades;
create trigger trg_atividades_registrado_em
  before insert on public.atividades
  for each row execute function public.set_registrado_em();

drop trigger if exists trg_agendamentos_registrado_em on public.agendamentos;
create trigger trg_agendamentos_registrado_em
  before insert on public.agendamentos
  for each row execute function public.set_registrado_em();

select 'migration v54 OK' as status;
