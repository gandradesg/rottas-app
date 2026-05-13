-- v13: Gerente pode atribuir agendamentos aos seus supervisores
-- ============================================================================
-- Caso de uso:
--   - Gerente cadastra um agendamento na Agenda
--   - Pode escolher se vai cumprir ele mesmo OU um dos supervisores dele
--   - Agendamento.gerente_id aponta pra quem é "responsável" pela atividade
--   - Supervisor vê o agendamento na agenda dele e pode realizar
-- ============================================================================

-- ---- 1) Profiles: gerente vê e edita seus supervisores ----
drop policy if exists "gerente le seus supervisores" on public.profiles;
create policy "gerente le seus supervisores" on public.profiles
  for select using (gerente_supervisor_id = auth.uid());

drop policy if exists "gerente edita seus supervisores" on public.profiles;
create policy "gerente edita seus supervisores" on public.profiles
  for update using (gerente_supervisor_id = auth.uid())
  with check (gerente_supervisor_id = auth.uid());

-- ---- 2) Agendamentos: gerente lê/cria/edita os seus E dos seus supervisores ----
drop policy if exists "gerente cria agendamento" on public.agendamentos;
create policy "gerente cria agendamento" on public.agendamentos
  for insert with check (
    auth.uid() = gerente_id
    or exists (
      select 1 from public.profiles p
      where p.id = gerente_id
        and p.gerente_supervisor_id = auth.uid()
    )
  );

drop policy if exists "gerente edita proprio agendamento" on public.agendamentos;
drop policy if exists "gerente edita agendamentos seus e dos supervisores" on public.agendamentos;
create policy "gerente edita agendamentos seus e dos supervisores" on public.agendamentos
  for update using (
    auth.uid() = gerente_id
    or exists (
      select 1 from public.profiles p
      where p.id = gerente_id
        and p.gerente_supervisor_id = auth.uid()
    )
  ) with check (
    auth.uid() = gerente_id
    or exists (
      select 1 from public.profiles p
      where p.id = gerente_id
        and p.gerente_supervisor_id = auth.uid()
    )
  );

drop policy if exists "gerente le proprios agendamentos" on public.agendamentos;
drop policy if exists "gerente le agendamentos seus e dos supervisores" on public.agendamentos;
create policy "gerente le agendamentos seus e dos supervisores" on public.agendamentos
  for select using (
    auth.uid() = gerente_id
    or exists (
      select 1 from public.profiles p
      where p.id = gerente_id
        and p.gerente_supervisor_id = auth.uid()
    )
  );

select 'migration v13 OK' as status;
