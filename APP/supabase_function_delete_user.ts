// Edge Function: delete-user
// Apaga um usuario por completo: auth.users (cascateia profile + dependencias).
// Bloqueia exclusao do master principal (defense-in-depth alem do trigger).
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
};

const PRINCIPAL_EMAIL = 'gabriel.galvao@rottasconstrutora.com.br';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id e obrigatorio' }), {
        status: 400, headers: corsHeaders,
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Valida quem chamou: precisa ser master
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
    if (!callerProfile || callerProfile.role !== 'master') {
      return new Response(JSON.stringify({ error: 'Apenas master pode excluir usuarios' }), {
        status: 403, headers: corsHeaders,
      });
    }

    // Bloqueia excluir master principal
    const { data: target } = await admin.auth.admin.getUserById(user_id);
    if (!target?.user) {
      return new Response(JSON.stringify({ error: 'Usuario nao encontrado' }), {
        status: 404, headers: corsHeaders,
      });
    }
    if ((target.user.email || '').toLowerCase() === PRINCIPAL_EMAIL) {
      return new Response(JSON.stringify({ error: 'O master principal nao pode ser excluido' }), {
        status: 403, headers: corsHeaders,
      });
    }

    // Apaga via admin.deleteUser - cascateia para profiles e atividades por FK
    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message || 'Erro interno' }), {
      status: 500, headers: corsHeaders,
    });
  }
});
