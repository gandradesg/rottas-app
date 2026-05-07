// Edge Function: invite-user
// Convida ou reconvida um usuário (template INVITE).
// - Usuario novo: cria via auth.admin.inviteUserByEmail (Supabase manda email)
// - Usuario existente: gera link de recovery (NAO invalida senha) e manda email
//   custom via Brevo SMTP com mesmo visual do convite
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import nodemailer from 'npm:nodemailer@6.9.13';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
};

const LOGO_URL = 'https://lmzjlirzexyopnjxohez.supabase.co/storage/v1/object/public/public-assets/logo-rottas-hd.png';

function inviteEmailHtml(actionUrl: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f4f4f4"><tr><td align="center" style="padding:20px;"><table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="max-width:600px;border-radius:8px;overflow:hidden;"><tr><td bgcolor="#ffffff" align="center" style="padding:40px 20px 20px 20px;"><img src="${LOGO_URL}" width="280" alt="Rottas" style="display:block;border:0;width:280px;height:auto;max-width:80%;" /></td></tr><tr><td style="padding:20px 30px 20px 30px;color:#1a1a1a;"><h2 style="margin:0 0 20px 0;font-size:24px;color:#1a1a1a;text-align:center;">Bem-vindo(a) a Plataforma de Gerentes</h2><p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#333;">Olá! Você foi <strong>convidado(a)</strong> a fazer parte da Plataforma de Gerentes da <strong>Rottas Construtora e Incorporadora</strong>.</p><p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#333;">Para ativar seu acesso, clique no botão abaixo para <strong>cadastrar sua senha</strong>.</p><p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#666;">Se você já tinha uma senha cadastrada, ela continua válida — você só precisa cadastrar uma nova se quiser trocar.</p></td></tr><tr><td align="center" style="padding:0 30px 30px 30px;"><table role="presentation" border="0" cellspacing="0" cellpadding="0"><tr><td bgcolor="#F26B22" style="border-radius:6px;" align="center"><a href="${actionUrl}" target="_blank" style="display:inline-block;padding:16px 40px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;background-color:#F26B22;">Cadastrar minha senha</a></td></tr></table></td></tr><tr><td style="padding:0 30px 30px 30px;"><p style="margin:24px 0 8px 0;font-size:12px;color:#888;border-top:1px solid #e0e0e0;padding-top:16px;">Se o botão não funcionar, copie e cole este link no navegador:</p><p style="margin:0 0 16px 0;font-size:12px;color:#F26B22;word-break:break-all;">${actionUrl}</p><p style="margin:0;font-size:12px;color:#888;">Este link expira em 1 hora.</p></td></tr><tr><td bgcolor="#f4f4f4" align="center" style="padding:20px;"><p style="margin:0;font-size:11px;color:#999;">© 2026 Rottas Construtora e Incorporadora · Todos os direitos reservados</p></td></tr></table></td></tr></table></body></html>`;
}

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

    // Valida quem chamou
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nao autenticado' }), {
        status: 401, headers: corsHeaders,
      });
    }
    const { data: { user: caller } } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Token invalido' }), {
        status: 401, headers: corsHeaders,
      });
    }
    const { data: callerProfile } = await admin
      .from('profiles').select('role').eq('id', caller.id).single();
    if (!callerProfile || !['master', 'gestor'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Sem permissao' }), {
        status: 403, headers: corsHeaders,
      });
    }

    const origin = req.headers.get('origin') || 'https://rottas-app.vercel.app';
    const redirectTo = origin + '/';

    // Procura usuario existente
    const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = usersList?.users?.find(
      (u: any) => (u.email || '').toLowerCase() === email.toLowerCase()
    );

    let userId: string;

    if (existing) {
      // RECONVITE: usuario existe - NAO apaga, NAO altera senha. Gera link de recovery
      // (que permite cadastrar nova senha) e manda email custom com visual de invite
      userId = existing.id;

      // Upsert profile - INSERT se nao existe (caso de orfaos de deletes antigos), UPDATE se existe
      await admin.from('profiles').upsert({
        id: userId,
        email,
        nome,
        telefone: telefone || null,
        cidade: cidade || null,
        estado: estado || null,
        role,
        permissoes: permissoes || {},
        ativo: true,
        primeiro_acesso: true,
      }, { onConflict: 'id' });

      // Gera link de recovery - nao invalida senha atual
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      });
      if (linkErr || !linkData?.properties?.action_link) {
        return new Response(JSON.stringify({ error: 'Falha ao gerar link: ' + (linkErr?.message || 'sem link') }), {
          status: 500, headers: corsHeaders,
        });
      }

      // Manda email custom via Brevo SMTP com template INVITE
      try {
        const transporter = nodemailer.createTransport({
          host: 'smtp-relay.brevo.com',
          port: 587,
          secure: false,
          auth: {
            user: Deno.env.get('BREVO_SMTP_USER')!,
            pass: Deno.env.get('BREVO_SMTP_PASS')!,
          },
        });
        await transporter.sendMail({
          from: `"Imob Rottas" <${Deno.env.get('SENDER_EMAIL')}>`,
          to: email,
          subject: 'Você foi convidado - cadastre sua senha de acesso à Plataforma Rottas',
          html: inviteEmailHtml(linkData.properties.action_link),
        });
      } catch (mailErr) {
        return new Response(JSON.stringify({ error: 'Falha ao enviar email: ' + (mailErr as Error).message }), {
          status: 500, headers: corsHeaders,
        });
      }

      return new Response(JSON.stringify({ success: true, user_id: userId, mode: 'reinvite' }), {
        status: 200, headers: corsHeaders,
      });
    }

    // CONVITE NOVO: cria usuario via inviteUserByEmail (Supabase manda email com template INVITE)
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { nome, role, invited_pending: true },
      redirectTo,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: corsHeaders,
      });
    }

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

    return new Response(JSON.stringify({ success: true, user_id: data.user?.id, mode: 'new' }), {
      status: 200, headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message || 'Erro interno' }), {
      status: 500, headers: corsHeaders,
    });
  }
});
