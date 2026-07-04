-- v39: escopo de usuários (profiles) para superintendente/gestor_regional
--
-- Mesma brecha da v38, agora em profiles. Duas policies permissivas furavam o
-- escopo por estado/cidade:
--   - SELECT "admin le todos profiles"  → is_admin()                       (superintendente via SC)
--   - UPDATE "admin atualiza profiles"  → has_permission('gerenciar_usuarios')(superintendente edita SC)
--
-- As policies "hierarquia ve/edita profiles" já cobrem todos os casos corretamente:
--   - gestor / master        → todos
--   - superintendente        → gerente/supervisor/gestor_regional dos SEUS estados
--   - gestor_regional        → gerente/supervisor das SUAS cidades
-- e "ler/atualiza proprio profile" cobre o próprio usuário.
-- Então basta remover as permissivas.

DROP POLICY IF EXISTS "admin le todos profiles" ON profiles;
DROP POLICY IF EXISTS "admin atualiza profiles" ON profiles;
