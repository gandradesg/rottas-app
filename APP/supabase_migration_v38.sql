-- v38: corrige escopo de agendamentos para superintendente/gestor_regional
--
-- Problema: a policy "admin le todos agendamentos" usava is_admin() (que é true
-- para superintendente e gestor_regional). Como políticas RLS são OR, ela dava
-- acesso a TODOS os agendamentos, furando o escopo por estado/cidade — um
-- superintendente de PR via agendamentos de SC.
--
-- A policy "hierarquia ve agendamentos" já trata todos os casos corretamente:
--   - gestor / master  → todos
--   - superintendente  → só gerentes dos seus estados (current_user_estados)
--   - gestor_regional  → só gerentes das suas cidades (current_user_cidades)
-- Então basta remover a permissiva.

DROP POLICY IF EXISTS "admin le todos agendamentos" ON agendamentos;
