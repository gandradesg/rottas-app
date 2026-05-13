-- v12: Empreendimentos linkados a uma cidade
-- Adiciona cidade (text) e estado (text) - sem FK pra manter flexivel
-- (cidade pode existir como texto livre mesmo nao cadastrada)

alter table public.empreendimentos
  add column if not exists cidade text,
  add column if not exists estado text check (estado in ('PR','SC') or estado is null);

create index if not exists idx_empreendimentos_cidade on public.empreendimentos(cidade);
create index if not exists idx_empreendimentos_estado on public.empreendimentos(estado);

select 'migration v12 OK' as status;
