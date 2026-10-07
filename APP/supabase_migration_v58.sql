-- v58: registrar/remover o aparelho para notificações.
-- SECURITY DEFINER porque o mesmo aparelho (endpoint) pode trocar de dono quando
-- outra pessoa faz login nele — a RLS sozinha não deixaria "transferir" a linha.
create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  insert into push_inscricoes (user_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_dispositivo, ''), 160))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        dispositivo = excluded.dispositivo, criado_em = now();
end $$;

create or replace function public.remover_push(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from push_inscricoes where endpoint = p_endpoint and user_id = auth.uid();
end $$;

revoke all on function public.registrar_push(text, text, text, text) from public, anon;
revoke all on function public.remover_push(text) from public, anon;
grant execute on function public.registrar_push(text, text, text, text) to authenticated;
grant execute on function public.remover_push(text) to authenticated;
