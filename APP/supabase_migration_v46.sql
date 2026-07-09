-- v46: permite atividade tipo 'outro' + consolida a lista outros_tipos
-- (A restrição atividades_tipo_check não tinha 'outro' — por isso registrar dava erro.)

-- 1) Permite 'outro' (e mantém os demais) na tabela de atividades
ALTER TABLE atividades DROP CONSTRAINT IF EXISTS atividades_tipo_check;
ALTER TABLE atividades ADD CONSTRAINT atividades_tipo_check
  CHECK (tipo = ANY (ARRAY['checkin','atendimento','proposta','orulo','visita','outro']));

-- 2) Remove duplicados da lista outros_tipos (mantém o primeiro de cada nome)
DELETE FROM outros_tipos a USING outros_tipos b
 WHERE lower(a.nome) = lower(b.nome) AND a.ctid > b.ctid;

-- 3) Traz os tipos dos "Outros" já agendados para a lista (sem duplicar)
INSERT INTO outros_tipos (nome)
SELECT nome FROM (
  SELECT DISTINCT ON (lower(trim(titulo))) trim(titulo) AS nome
  FROM agendamentos
  WHERE tipo = 'outro' AND titulo IS NOT NULL AND trim(titulo) <> ''
  ORDER BY lower(trim(titulo))
) src
WHERE NOT EXISTS (SELECT 1 FROM outros_tipos o WHERE lower(o.nome) = lower(src.nome));

-- 4) Impede duplicados futuros (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS ux_outros_tipos_nome ON outros_tipos (lower(nome));
