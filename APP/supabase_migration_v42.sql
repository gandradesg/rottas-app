-- v42: contas de TESTE
--
-- O Master pode marcar um usuário como "conta de teste". Tudo que essa conta
-- registrar (atividades e agendamentos) é marcado como teste e NÃO entra nos
-- contadores/relatórios gerais (Painel, Histórico da equipe) — assim dá para
-- testar sem poluir os números reais nem afetar os outros gerentes.

ALTER TABLE profiles     ADD COLUMN IF NOT EXISTS conta_teste boolean DEFAULT false;
ALTER TABLE atividades   ADD COLUMN IF NOT EXISTS teste boolean DEFAULT false;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS teste boolean DEFAULT false;

-- Marca as contas de teste do Gabriel (Gerente e Supervisor)
UPDATE profiles SET conta_teste = true
 WHERE lower(email) IN ('razerkaku@gmail.com', 'kakurazer@gmail.com');

-- Reclassifica como teste o histórico já criado por essas contas (limpa os reais)
UPDATE atividades   SET teste = true WHERE gerente_id IN (SELECT id FROM profiles WHERE conta_teste);
UPDATE agendamentos SET teste = true WHERE gerente_id IN (SELECT id FROM profiles WHERE conta_teste);
