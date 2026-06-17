-- v26: permite admins excluírem clientes (leads) pela tela de Listas
drop policy if exists "admin deleta clientes" on public.clientes;
create policy "admin deleta clientes" on public.clientes for delete using (public.is_admin());
select 'migration v26 OK' as status;
