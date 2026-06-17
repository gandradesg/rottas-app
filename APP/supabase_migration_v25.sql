-- v25: gerentes_house gerenciável por quem tem gerenciar_listas (igual às outras listas)
drop policy if exists "admin escreve gerentes_house" on public.gerentes_house;
create policy "admin escreve gerentes_house" on public.gerentes_house
  for all using (public.has_permission('gerenciar_listas'))
  with check (public.has_permission('gerenciar_listas'));
select 'migration v25 OK' as status;
