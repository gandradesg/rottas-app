-- v22: empreendimento multi-cidade
-- cidades_visiveis: cidades ADICIONAIS onde o empreendimento aparece, além da
-- cidade-sede (campo cidade). Ex.: empreendimento de Itapoá vendido em Curitiba.
alter table public.empreendimentos
  add column if not exists cidades_visiveis text[] default '{}'::text[];
select 'migration v22 OK' as status;
