-- =====================================================================
-- ROTTAS APP — Migration v5
-- Número sequencial por tipo + soft delete + número de venda
-- Rode no SQL Editor do Supabase APÓS migration v4
-- =====================================================================

-- 1. Novas colunas
ALTER TABLE public.atividades
  ADD COLUMN IF NOT EXISTS numero_sequencial integer,
  ADD COLUMN IF NOT EXISTS numero_venda integer,
  ADD COLUMN IF NOT EXISTS cancelada boolean NOT NULL DEFAULT false;

-- 2. Sequences por tipo
CREATE SEQUENCE IF NOT EXISTS seq_checkin START 1;
CREATE SEQUENCE IF NOT EXISTS seq_atendimento START 1;
CREATE SEQUENCE IF NOT EXISTS seq_proposta START 1;
CREATE SEQUENCE IF NOT EXISTS seq_orulo START 1;
CREATE SEQUENCE IF NOT EXISTS seq_venda START 1;

-- 3. Numerar atividades existentes por ordem de criação
WITH numbered AS (
  SELECT id, tipo,
    ROW_NUMBER() OVER (PARTITION BY tipo ORDER BY created_at) as rn
  FROM public.atividades
)
UPDATE public.atividades a
SET numero_sequencial = n.rn
FROM numbered n
WHERE a.id = n.id;

-- 4. Numerar vendas existentes (propostas com reserva)
WITH numbered AS (
  SELECT id,
    ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM public.atividades
  WHERE tipo = 'proposta' AND reserva IS NOT NULL AND reserva != ''
)
UPDATE public.atividades a
SET numero_venda = n.rn
FROM numbered n
WHERE a.id = n.id;

-- 5. Ajustar sequences para continuar do último número
SELECT setval('seq_checkin', GREATEST(1, COALESCE((SELECT MAX(numero_sequencial) FROM public.atividades WHERE tipo = 'checkin'), 0)));
SELECT setval('seq_atendimento', GREATEST(1, COALESCE((SELECT MAX(numero_sequencial) FROM public.atividades WHERE tipo = 'atendimento'), 0)));
SELECT setval('seq_proposta', GREATEST(1, COALESCE((SELECT MAX(numero_sequencial) FROM public.atividades WHERE tipo = 'proposta'), 0)));
SELECT setval('seq_orulo', GREATEST(1, COALESCE((SELECT MAX(numero_sequencial) FROM public.atividades WHERE tipo = 'orulo'), 0)));
SELECT setval('seq_venda', GREATEST(1, COALESCE((SELECT MAX(numero_venda) FROM public.atividades WHERE tipo = 'proposta' AND numero_venda IS NOT NULL), 0)));

-- 6. Trigger: auto-numerar no INSERT
CREATE OR REPLACE FUNCTION public.assign_numero_sequencial()
RETURNS TRIGGER AS $$
BEGIN
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
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_numero_sequencial ON public.atividades;
CREATE TRIGGER trg_numero_sequencial
  BEFORE INSERT ON public.atividades
  FOR EACH ROW EXECUTE FUNCTION public.assign_numero_sequencial();

-- 7. Trigger: numerar venda quando reserva é adicionada via UPDATE
CREATE OR REPLACE FUNCTION public.assign_numero_venda()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'proposta'
    AND NEW.reserva IS NOT NULL AND NEW.reserva != ''
    AND (OLD.reserva IS NULL OR OLD.reserva = '')
    AND NEW.numero_venda IS NULL
  THEN
    NEW.numero_venda := nextval('seq_venda');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_numero_venda ON public.atividades;
CREATE TRIGGER trg_numero_venda
  BEFORE UPDATE ON public.atividades
  FOR EACH ROW EXECUTE FUNCTION public.assign_numero_venda();

-- 8. Atualizar policy UPDATE para permitir soft-delete por quem tem permissão de exclusão
DROP POLICY IF EXISTS "admin edita qualquer atividade" ON public.atividades;
CREATE POLICY "admin edita qualquer atividade" ON public.atividades
  FOR UPDATE USING (
    public.has_permission('editar_atividades')
    OR public.has_permission('excluir_atividades')
    OR auth.uid() = gerente_id
  );
