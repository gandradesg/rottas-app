-- v41: participante lê a atividade em grupo
--
-- Na agenda em grupo, o check-in gera UMA atividade com participantes = todos os
-- presentes, mas gerente_id = só quem realizou. Os demais precisam LER essa
-- atividade (pra contar no KPI e abrir "ver atividade"). As policies atuais só
-- deixam o dono (gerente_id) ou a hierarquia admin lerem — então adicionamos:

DROP POLICY IF EXISTS "participante le atividade em grupo" ON atividades;
CREATE POLICY "participante le atividade em grupo" ON atividades
  FOR SELECT USING (auth.uid() = ANY(participantes));
