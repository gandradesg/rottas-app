-- v43: conta de TESTE não consome numeração real (nem conta em nada)
--
-- Problema: atividades de teste pegavam número sequencial da fila real (#29 etc),
-- criando buracos na numeração dos registros reais.

-- 1) Trigger de numeração: pula quando é teste (numero_sequencial fica nulo)
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
  ELSIF NEW.tipo = 'visita' THEN
    NEW.numero_sequencial := nextval('seq_visita');
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Zera a numeração das atividades de teste já existentes
UPDATE atividades SET numero_sequencial = NULL, numero_venda = NULL WHERE teste = true;

-- 3) Recoloca cada sequência no último número REAL usado (numeração fica contígua).
--    Se não há registro real, deixa is_called=false pra próxima começar em 1.
DO $do$
DECLARE
  m bigint;
BEGIN
  SELECT max(numero_sequencial) INTO m FROM atividades WHERE tipo='checkin' AND teste IS NOT TRUE;
  PERFORM setval('seq_checkin', GREATEST(COALESCE(m,0),1), COALESCE(m,0) > 0);
  SELECT max(numero_sequencial) INTO m FROM atividades WHERE tipo='atendimento' AND teste IS NOT TRUE;
  PERFORM setval('seq_atendimento', GREATEST(COALESCE(m,0),1), COALESCE(m,0) > 0);
  SELECT max(numero_sequencial) INTO m FROM atividades WHERE tipo='proposta' AND teste IS NOT TRUE;
  PERFORM setval('seq_proposta', GREATEST(COALESCE(m,0),1), COALESCE(m,0) > 0);
  SELECT max(numero_sequencial) INTO m FROM atividades WHERE tipo='orulo' AND teste IS NOT TRUE;
  PERFORM setval('seq_orulo', GREATEST(COALESCE(m,0),1), COALESCE(m,0) > 0);
  SELECT max(numero_venda) INTO m FROM atividades WHERE numero_venda IS NOT NULL AND teste IS NOT TRUE;
  PERFORM setval('seq_venda', GREATEST(COALESCE(m,0),1), COALESCE(m,0) > 0);
END
$do$;
