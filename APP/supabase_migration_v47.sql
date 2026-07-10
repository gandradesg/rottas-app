-- v47: marca quando a localização da atividade foi editada manualmente (busca),
-- em vez de capturada pelo GPS no local.
ALTER TABLE atividades ADD COLUMN IF NOT EXISTS localizacao_manual boolean DEFAULT false;
