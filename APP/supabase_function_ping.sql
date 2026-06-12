-- Função de keep-alive do Supabase (plano gratuito)
-- ============================================================================
-- O plano gratuito pausa o projeto após 7 dias sem atividade no banco.
-- Esta função é chamada diariamente por um GitHub Action
-- (.github/workflows/supabase-keepalive.yml) para manter o projeto ativo.
--
-- SECURITY DEFINER + grant para anon = executável sem login, garantindo
-- que o ping externo gere atividade real no banco (reseta o timer de pausa).
-- ============================================================================

create or replace function public.ping()
returns timestamptz
language sql
security definer
set search_path = public, pg_catalog
as $$ select now(); $$;

grant execute on function public.ping() to anon;
grant execute on function public.ping() to authenticated;

-- Teste:
-- select public.ping();
-- ou via REST:
-- curl -X POST https://<ref>.supabase.co/rest/v1/rpc/ping \
--   -H "apikey: <anon_key>" -H "Authorization: Bearer <anon_key>" \
--   -H "Content-Type: application/json" -d '{}'
