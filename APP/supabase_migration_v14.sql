-- v14: Unifica Órulo/DWV + Imobiliárias com cidade/estado obrigatórios (UPPER)
-- ============================================================================
-- Mudanças:
--  1) DWV vira só apelido visual de Órulo. Todas atividades tipo='dwv' migram pra 'orulo'.
--     Constraint passa a aceitar só os 4 tipos canônicos.
--  2) Motivos DWV são unificados em motivos_orulo (renomeado conceitualmente).
--  3) imobiliarias ganha cidade (text) + estado (PR/SC).
--  4) Trigger normaliza nome da imobiliária pra UPPERCASE no INSERT/UPDATE.
-- ============================================================================

-- ---- 1) Migra atividades DWV → Órulo ----
update public.atividades set tipo = 'orulo' where tipo = 'dwv';
update public.agendamentos set tipo = 'orulo' where tipo = 'dwv';

-- ---- 2) Restringe constraint de tipo ----
do $$
declare cname text;
begin
  select conname into cname from pg_constraint
    where conrelid='public.atividades'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%tipo%';
  if cname is not null then
    execute format('alter table public.atividades drop constraint %I', cname);
  end if;
end $$;
alter table public.atividades
  add constraint atividades_tipo_check
  check (tipo in ('checkin','atendimento','proposta','orulo'));

do $$
declare cname text;
begin
  select conname into cname from pg_constraint
    where conrelid='public.agendamentos'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%tipo%';
  if cname is not null then
    execute format('alter table public.agendamentos drop constraint %I', cname);
  end if;
end $$;
alter table public.agendamentos
  add constraint agendamentos_tipo_check
  check (tipo in ('checkin','atendimento','proposta','orulo','outro'));

-- ---- 3) Unifica motivos_dwv em motivos_orulo (mantém os de motivos_dwv que não existem em orulo) ----
insert into public.motivos_orulo (nome)
  select md.nome from public.motivos_dwv md
  where not exists (select 1 from public.motivos_orulo mo where lower(mo.nome) = lower(md.nome))
on conflict (nome) do nothing;

-- ---- 4) Imobiliárias: cidade + estado ----
alter table public.imobiliarias
  add column if not exists cidade text,
  add column if not exists estado text check (estado in ('PR','SC') or estado is null);

create index if not exists idx_imobiliarias_cidade on public.imobiliarias(cidade);
create index if not exists idx_imobiliarias_estado on public.imobiliarias(estado);

-- ---- 5) Trigger: nome da imobiliária sempre em UPPERCASE ----
-- Usa upper() de Postgres (respeita acentos em UTF-8, ex: "ação" → "AÇÃO")
create or replace function public.imobiliaria_nome_upper()
returns trigger language plpgsql as $$
begin
  if new.nome is not null then
    new.nome := upper(trim(new.nome));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_imobiliaria_nome_upper on public.imobiliarias;
create trigger trg_imobiliaria_nome_upper
  before insert or update of nome on public.imobiliarias
  for each row execute function public.imobiliaria_nome_upper();

-- ---- 6) Aplica UPPER nas imobiliárias existentes ----
update public.imobiliarias set nome = upper(trim(nome)) where nome <> upper(trim(nome));

select 'migration v14 OK' as status;
