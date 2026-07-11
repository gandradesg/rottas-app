-- v49: fecha a LISTAGEM ampla de arquivos no bucket 'fotos' (aviso do Security Advisor).
-- Problema: a política SELECT "todos leem fotos" (bucket_id='fotos', role public)
-- permitia que QUALQUER cliente — inclusive anônimo — LISTASSE todos os arquivos do
-- bucket (enumerar caminhos/nomes de fotos de todos os usuários).
-- Contexto: o bucket 'fotos' é PÚBLICO e o app exibe as fotos por URL PÚBLICA
-- (getPublicUrl). A exibição NÃO depende desta política SELECT — o download público
-- não passa por RLS. O app também nunca chama .list(). Logo, dá para restringir a
-- listagem ao DONO do arquivo sem quebrar nada, fechando a enumeração por terceiros.
drop policy if exists "todos leem fotos" on storage.objects;

create policy "dono lista suas fotos" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos' and owner = auth.uid());

select 'migration v49 OK' as status;
