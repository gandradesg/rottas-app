// Edge Function: ver-como
// "Visualizar como" — o MASTER abre o app com a sessão REAL de outro usuário,
// para ver exatamente o que as regras do banco (RLS) mostram para ele.
// Gera um link mágico (sem enviar e-mail) e devolve só o token_hash, que o app
// troca por uma sessão daquele usuário. O app trava esse modo em SOMENTE
// LEITURA (js/supabase.js — nenhuma gravação sai do aparelho).
//
// Regras:
//  • só quem tem role 'master' pode usar;
//  • não dá para visualizar como outro master (nem como o master principal);
//  • usuário alvo precisa estar ativo;
//  • cada uso fica registrado em registro_logs (tipo 'ver-como').
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Content-Type': 'application/json',
};
const resp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const auth = req.headers.get('Authorization') || '';
    const { data: { user: quem } } = await admin.auth.getUser(auth.replace('Bearer ', ''));
    if (!quem) return resp({ error: 'Não autenticado' }, 401);

    const { data: eu } = await admin.from('profiles').select('role, nome, ativo').eq('id', quem.id).single();
    if (!eu || eu.role !== 'master' || eu.ativo === false) return resp({ error: 'Apenas o Master pode visualizar como outro usuário.' }, 403);

    const { user_id } = await req.json().catch(() => ({}));
    if (!user_id || typeof user_id !== 'string') return resp({ error: 'Informe o usuário.' }, 400);
    if (user_id === quem.id) return resp({ error: 'Você já está vendo como você mesmo.' }, 400);

    const { data: alvo } = await admin.from('profiles').select('id, nome, email, role, ativo').eq('id', user_id).single();
    if (!alvo || !alvo.email) return resp({ error: 'Usuário não encontrado.' }, 404);
    if (alvo.role === 'master') return resp({ error: 'Não é possível visualizar como outro Master.' }, 403);
    if (alvo.ativo === false) return resp({ error: 'Usuário inativo.' }, 400);

    // Link mágico SEM envio de e-mail: só usamos o token_hash.
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: alvo.email });
    if (error || !link?.properties?.hashed_token) return resp({ error: 'Falha ao gerar o acesso: ' + (error?.message || 'sem token') }, 500);

    // Auditoria: quem visualizou como quem, e quando.
    await admin.from('registro_logs').insert({
      user_id: quem.id, user_nome: eu.nome, tipo: 'ver-como', etapa: 'inicio', ok: true,
      erro: `Master visualizou como ${alvo.nome} (${alvo.role})`,
      contexto: { alvo_id: alvo.id, alvo_nome: alvo.nome, alvo_role: alvo.role },
    }).then(() => {}, () => {});

    return resp({ ok: true, token_hash: link.properties.hashed_token, alvo: { id: alvo.id, nome: alvo.nome, role: alvo.role } });
  } catch (e) {
    return resp({ error: (e as Error).message || 'Erro interno' }, 500);
  }
});
