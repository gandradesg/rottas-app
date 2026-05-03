-- =====================================================================
-- ROTTAS APP — Migration v4
-- Adiciona colunas para fluxo de solicitação de exclusão
-- + corrige política DELETE para forçar workflow de aprovação
-- Rode no SQL Editor do Supabase APÓS migration v3
-- =====================================================================

-- 1. Colunas para o fluxo "gerente solicita, gestor aprova"
ALTER TABLE public.atividades
  ADD COLUMN IF NOT EXISTS solicita_exclusao boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclusao_solicitada_em timestamptz,
  ADD COLUMN IF NOT EXISTS exclusao_solicitada_por uuid REFERENCES public.profiles(id);

-- 2. Corrige a política de DELETE:
--    ANTES: qualquer gerente podia deletar direto via API (contornava a aprovação)
--    AGORA: só admin com permissão 'excluir_atividades' pode deletar
DROP POLICY IF EXISTS "admin deleta atividades" ON public.atividades;
CREATE POLICY "admin deleta atividades" ON public.atividades
  FOR DELETE USING (public.has_permission('excluir_atividades'));

-- 3. Garante que gerente pode atualizar os campos de solicitação na própria atividade
-- (a policy "gerente edita propria atividade" já cobre isso: auth.uid() = gerente_id)
-- Nenhuma alteração necessária aqui.
