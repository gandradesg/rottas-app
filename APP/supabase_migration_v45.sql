-- v45: "Outro" vira um tipo de atividade próprio (indicador separado) + lista dedicada
-- Aditivo e idempotente.

-- 1) Sequência de numeração para "outro"
CREATE SEQUENCE IF NOT EXISTS seq_outro START 1;

-- 2) Trigger de numeração passa a numerar 'outro' também
CREATE OR REPLACE FUNCTION public.assign_numero_sequencial()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF COALESCE(NEW.teste, false) THEN
    RETURN NEW; -- teste não consome numeração real
  END IF;
  IF NEW.tipo = 'checkin' THEN
    NEW.numero_sequencial := nextval('seq_checkin');
  ELSIF NEW.tipo = 'atendimento' THEN
    NEW.numero_sequencial := nextval('seq_atendimento');
  ELSIF NEW.tipo = 'proposta' THEN
    NEW.numero_sequencial := nextval('seq_proposta');
    IF NEW.reserva IS NOT NULL AND NEW.reserva != '' THEN
      NEW.numero_venda := nextval('seq_venda');
    END IF;
  ELSIF NEW.tipo = 'orulo' THEN
    NEW.numero_sequencial := nextval('seq_orulo');
  ELSIF NEW.tipo = 'outro' THEN
    NEW.numero_sequencial := nextval('seq_outro');
  ELSIF NEW.tipo = 'visita' THEN
    NEW.numero_sequencial := nextval('seq_visita');
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Lista dedicada de tipos de "Outro" (o gerente pode cadastrar novos)
CREATE TABLE IF NOT EXISTS outros_tipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE outros_tipos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "todos leem outros_tipos" ON outros_tipos;
CREATE POLICY "todos leem outros_tipos" ON outros_tipos FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "autenticado cria outros_tipos" ON outros_tipos;
CREATE POLICY "autenticado cria outros_tipos" ON outros_tipos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admin edita outros_tipos" ON outros_tipos;
CREATE POLICY "admin edita outros_tipos" ON outros_tipos FOR UPDATE USING (is_admin());
DROP POLICY IF EXISTS "admin apaga outros_tipos" ON outros_tipos;
CREATE POLICY "admin apaga outros_tipos" ON outros_tipos FOR DELETE USING (is_admin());

-- Alguns exemplos iniciais (idempotente)
INSERT INTO outros_tipos (nome)
SELECT v FROM (VALUES ('Treinamento'), ('Evento'), ('Reunião')) AS t(v)
WHERE NOT EXISTS (SELECT 1 FROM outros_tipos o WHERE lower(o.nome) = lower(t.v));
