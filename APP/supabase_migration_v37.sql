-- v37: motivo de cancelamento no agendamento + padroniza locais de visita em MAIÚSCULAS
-- Aditivo e idempotente.

-- 1) Campo livre para registrar por que o agendamento foi cancelado
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

-- 2) Padroniza os locais de visita já cadastrados para MAIÚSCULAS (uniformidade)
UPDATE locais_visita SET nome = upper(nome) WHERE nome IS DISTINCT FROM upper(nome);
