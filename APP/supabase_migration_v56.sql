-- v56: contexto técnico do aparelho em cada log (token, tela aberta, último HTTP, rede)
alter table registro_logs add column if not exists contexto jsonb;
