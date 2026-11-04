-- v63 (04/11/2026): sincronização automática da agenda com o Outlook.
-- Cada pessoa liga/desliga no Perfil. Desligado por padrão: ninguém passa a
-- receber convites de calendário sem ter escolhido.
alter table public.profiles add column if not exists agenda_outlook boolean not null default false;

select 'migration v63 OK' as status;
