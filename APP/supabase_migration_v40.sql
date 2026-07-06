-- v40: agendamento com MÚLTIPLOS responsáveis presentes.
--
-- Cenário: vários gerentes na mesma imobiliária no mesmo horário. Ao agendar,
-- marca-se quem estará presente. Cria-se UMA linha de agenda por gerente
-- (compartilhando grupo_id), então cada um vê na SUA agenda. Ao realizar, gera
-- UMA atividade só (não infla o total da empresa), mas com "participantes" =
-- todos os presentes — assim o check-in conta no contador individual dos 3.

-- Créditados na atividade além do gerente_id (cada um soma +1 no seu contador)
ALTER TABLE atividades   ADD COLUMN IF NOT EXISTS participantes uuid[] DEFAULT '{}';
-- Quem estará presente (inclui o dono da linha) + vínculo do grupo de agendas
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS participantes uuid[] DEFAULT '{}';
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS grupo_id uuid;
CREATE INDEX IF NOT EXISTS idx_agendamentos_grupo ON agendamentos (grupo_id);
CREATE INDEX IF NOT EXISTS idx_atividades_participantes ON atividades USING gin (participantes);

-- Realiza TODAS as agendas do grupo de uma vez (SECURITY DEFINER pra poder
-- marcar a linha dos colegas presentes, contornando o RLS com segurança:
-- só executa se quem chama é um dos participantes do grupo, ou admin).
CREATE OR REPLACE FUNCTION realizar_agendamento_grupo(p_grupo_id uuid, p_atividade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_grupo_id IS NULL THEN RETURN; END IF;
  IF NOT (
    is_admin() OR EXISTS (
      SELECT 1 FROM agendamentos a
      WHERE a.grupo_id = p_grupo_id AND auth.uid() = ANY(a.participantes)
    )
  ) THEN
    RETURN; -- sem vínculo com o grupo: não faz nada
  END IF;
  UPDATE agendamentos
     SET status = 'realizado',
         atividade_id = p_atividade_id,
         realizado_em = now()
   WHERE grupo_id = p_grupo_id
     AND status <> 'realizado';
END;
$fn$;

GRANT EXECUTE ON FUNCTION realizar_agendamento_grupo(uuid, uuid) TO authenticated;
