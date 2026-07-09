-- v44: limpar dados de teste (só Master), via função segura
CREATE OR REPLACE FUNCTION public.limpar_dados_teste()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  n_at int; n_ag int;
BEGIN
  IF current_user_role() <> 'master' THEN
    RAISE EXCEPTION 'Apenas o Master pode limpar dados de teste';
  END IF;
  DELETE FROM atividades   WHERE teste = true; GET DIAGNOSTICS n_at = ROW_COUNT;
  DELETE FROM agendamentos WHERE teste = true; GET DIAGNOSTICS n_ag = ROW_COUNT;
  RETURN jsonb_build_object('atividades', n_at, 'agendamentos', n_ag);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.limpar_dados_teste() TO authenticated;
