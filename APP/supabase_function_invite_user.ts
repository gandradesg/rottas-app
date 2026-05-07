// Edge Function: invite-user
// Convida ou reconvida um usuário (dispara template INVITE).
// Se o email já existe em auth.users mas ainda não confirmou (primeiro acesso),
// remove o registro antigo e reconvida limpo. Se já está ativo, retorna erro.
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, nome, telefone, cidade, estado, role, permissoes } = await req.json();

    if (!email || !nome || !role) {
      return new Response(JSON.stringify({ error: 'email, nome e role sao obrigatorios' }), {
        status: 400, headers: corsHeaders,
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Valida quem chamou: precisa ser master ou gestor
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nao autenticado' }), {
        status: 401, headers: corsHeaders,
      });
    }
    const { data: { user: caller } } = await admin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Token invalido' }), {
        status: 401, headers: corsHeaders,
      });
    }
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();
    if (!callerProfile || !['master', 'gestor'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Sem permissao' }), {
        status: 403, headers: corsHeaders,
      });
    }

    const origin = req.headers.get('origin') || 'https://rottas-app.vercel.app';
    const redirectTo = origin + '/';

    // Verifica se o email ja existe em auth.users
    const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = usersList?.users?.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());

    if (existing) {
      // Sempre permite reconvidar: apaga registro antigo (ativo, pendente ou orfao) e reconvida limpo
      const { error: delErr } = await admin.auth.admin.deleteUser(existing.id);
      if (delErr) {
        return new Response(JSON.stringify({ error: 'Falha ao limpar usuario antigo: ' + delErr.message }), {
          status: 500, headers: corsHeaders,
        });
      }
    }

    // Dispara o convite (usa template INVITE configurado no Supabase)
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { nome, role, invited_pending: true },
      redirectTo,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Atualiza profile com dados completos
    if (data.user) {
      await admin.from('profiles').update({
        nome,
        telefone: telefone || null,
        cidade: cidade || null,
        estado: estado || null,
        role,
        permissoes: permissoes || {},
        ativo: true,
        primeiro_acesso: true,
      }).eq('id', data.user.id);
    }

    return new Response(JSON.stringify({ success: true, user_id: data.user?.id }), {
      status: 200, headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message || 'Erro interno' }), {
      status: 500, headers: corsHeaders,
    });
  }
});
