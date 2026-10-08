// lembretes-agenda — Lembretes automáticos da agenda (e-mail + notificação do app)
//
// Disparado pelo agendador do banco (pg_cron), em horário de Brasília:
//   • todo dia às 18h → agenda do DIA SEGUINTE   (modo 'diario')
//   • segunda às 8h   → agenda da SEMANA         (modo 'semanal')
// Só envia para quem TEM atividade pendente no período.
//
// Quem recebe:
//   • o gerente/supervisor dono do agendamento → a agenda DELE (com botão do Outlook)
//   • gestor regional e superintendente → a agenda dos gerentes DELES, pela MESMA
//     regra de acesso do app (policy "hierarquia ve agendamentos"):
//       superintendente → gerentes dos estados em estados_acesso
//       gestor regional → gerentes das cidades em cidades_acesso
//     Gestor e master não recebem (por enquanto).
//
// Também serve o arquivo .ics do botão "Adicionar ao Outlook" (GET ?ics=...&sig=...),
// com lembrete do Outlook 15 minutos antes de cada atividade.
//
// Segurança: verify_jwt=false (o link do e-mail e o agendador não têm login), então
//   • envio (POST diario/semanal) exige o cabeçalho x-cron-secret OU um master logado;
//   • push-teste exige um usuário logado (manda só pros aparelhos dele);
//   • o .ics exige assinatura HMAC dos ids (o link não pode ser forjado).
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import nodemailer from 'npm:nodemailer@6.9.13';
import webpush from 'npm:web-push@3.6.7';

const URL_APP = 'https://plataformarottas.vercel.app';
const FN_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/lembretes-agenda`;
const LOGO_URL = 'https://lmzjlirzexyopnjxohez.supabase.co/storage/v1/object/public/public-assets/logo-rottas-hd.png';
const TZ = 'America/Sao_Paulo';
const BRT_MS = -3 * 3600 * 1000;   // Brasil sem horário de verão desde 2019
const LARANJA = '#F26B22', NAVY = '#0F1525', CINZA = '#6B7280', FUNDO = '#F7F3EF', BORDA = '#ECE6DF';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret, apikey, x-client-info',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const TIPOS: Record<string, { label: string; plural: string; emoji: string; cor: string; claro: string }> = {
  checkin:     { label: 'Check-in',    plural: 'Check-ins',    emoji: '📍', cor: '#3B82F6', claro: '#EFF6FF' },
  atendimento: { label: 'Atendimento', plural: 'Atendimentos', emoji: '👥', cor: '#8B5CF6', claro: '#F5F3FF' },
  outro:       { label: 'Outro',       plural: 'Outros',       emoji: '📅', cor: '#717784', claro: '#F3F4F6' },
};
const ORDEM_TIPOS = ['checkin', 'atendimento', 'outro'];
const REC: Record<string, string> = { diaria: 'Diária', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };
const CAMPOS = 'id, gerente_id, tipo, data_prevista, imobiliaria, empreendimento, cliente, corretor, titulo, observacoes, motivo_visita, local_visita, teste, recorrencia_freq, status';

// ─── Datas em Brasília ──────────────────────────────────────────────────────
function hojeBRT(refData?: string | null) {
  if (refData && /^\d{4}-\d{2}-\d{2}$/.test(refData)) {
    const [y, m, d] = refData.split('-').map(Number);
    const n = new Date(Date.UTC(y, m - 1, d));
    return { y, m: m - 1, d, dow: n.getUTCDay() };
  }
  const n = new Date(Date.now() + BRT_MS);
  return { y: n.getUTCFullYear(), m: n.getUTCMonth(), d: n.getUTCDate(), dow: n.getUTCDay() };
}
// 00:00 de Brasília do dia (y, m, d) — o Date.UTC normaliza estouro de mês
const inicioDiaBRT = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - BRT_MS);

const fmtHora = (d: Date) => d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const fmtDiaSemanaCurto = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'short' }).replace('.', '');
const fmtDiaMes = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const fmtDiaLongo = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const chaveDia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });   // YYYY-MM-DD
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function janela(modo: string, refData?: string | null) {
  const h = hojeBRT(refData);
  if (modo === 'diario') {
    const ini = inicioDiaBRT(h.y, h.m, h.d + 1);
    const fim = inicioDiaBRT(h.y, h.m, h.d + 2);
    return { ini, fim, dataRef: chaveDia(ini), rotulo: maiuscula(fmtDiaLongo(ini)) };
  }
  // semanal: de hoje até domingo (na segunda às 8h = a semana inteira)
  const ateProxSegunda = ((8 - h.dow) % 7) || 7;
  const ini = inicioDiaBRT(h.y, h.m, h.d);
  const fim = inicioDiaBRT(h.y, h.m, h.d + ateProxSegunda);
  const ultimo = new Date(fim.getTime() - 1);
  const mesmoMes = ini.toLocaleDateString('pt-BR', { timeZone: TZ, month: 'long' }) === ultimo.toLocaleDateString('pt-BR', { timeZone: TZ, month: 'long' });
  const rotulo = mesmoMes
    ? `${ini.toLocaleDateString('pt-BR', { timeZone: TZ, day: 'numeric' })} a ${ultimo.toLocaleDateString('pt-BR', { timeZone: TZ, day: 'numeric', month: 'long' })}`
    : `${ini.toLocaleDateString('pt-BR', { timeZone: TZ, day: 'numeric', month: 'long' })} a ${ultimo.toLocaleDateString('pt-BR', { timeZone: TZ, day: 'numeric', month: 'long' })}`;
  return { ini, fim, dataRef: chaveDia(ini), rotulo };
}

// ─── Utilitários ────────────────────────────────────────────────────────────
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const primeiroNome = (nome?: string | null) => String(nome || '').trim().split(/\s+/)[0] || '';
const iniciais = (nome?: string | null) => String(nome || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

function tituloDe(ag: any) {
  const t = TIPOS[ag.tipo] || TIPOS.outro;
  if (ag.tipo === 'outro') return ag.titulo || ag.imobiliaria || t.label;
  return ag.imobiliaria || ag.titulo || t.label;
}

function b64url(buf: ArrayBuffer) {
  let s = '';
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function assinar(txt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('ICS_SIGN_SECRET')!),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(txt))).slice(0, 32);
}
async function linkIcs(ids: string[]) {
  const lista = [...ids].sort().join(',');
  return `${FN_URL}?ics=${encodeURIComponent(lista)}&sig=${await assinar(lista)}`;
}

// ─── Arquivo de calendário (.ics) com lembrete de 15 minutos ───────────────
function icsData(d: Date) { return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'; }
function icsEsc(s: unknown) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function montarIcs(ags: any[]) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Imob Rottas//Lembretes//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const ag of ags) {
    const t = TIPOS[ag.tipo] || TIPOS.outro;
    const ini = new Date(ag.data_prevista);
    const fim = new Date(ini.getTime() + 60 * 60 * 1000);   // 1h, igual ao app
    const resumo = `${t.label} · ${tituloDe(ag)}`;
    const local = [ag.local_visita, ag.imobiliaria, ag.empreendimento].filter(Boolean).join(' - ');
    const desc = [
      `Tipo: ${t.label}`,
      ag.imobiliaria && `Imobiliária: ${ag.imobiliaria}`,
      ag.empreendimento && `Empreendimento: ${ag.empreendimento}`,
      ag.cliente && `Cliente: ${ag.cliente}`,
      ag.corretor && `Corretor: ${ag.corretor}`,
      ag.motivo_visita && `Motivo: ${ag.motivo_visita}`,
      ag.observacoes && `\nObs: ${ag.observacoes}`,
      `\nAbrir no app: ${URL_APP}`,
    ].filter(Boolean).join('\n');
    L.push(
      'BEGIN:VEVENT',
      `UID:${ag.id}@imobrottas.app`,          // mesmo UID do app → não duplica se já adicionado
      `DTSTAMP:${icsData(new Date())}`,
      `DTSTART:${icsData(ini)}`,
      `DTEND:${icsData(fim)}`,
      `SUMMARY:${icsEsc(resumo)}`,
      ...(local ? [`LOCATION:${icsEsc(local)}`] : []),
      `DESCRIPTION:${icsEsc(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc('Em 15 minutos: ' + resumo)}`, 'TRIGGER:-PT15M', 'END:VALARM',
      'END:VEVENT',
    );
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}

async function servirIcs(req: Request) {
  const u = new URL(req.url);
  const lista = u.searchParams.get('ics') || '';
  const ids = lista.split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 80);
  if (!ids.length || (u.searchParams.get('sig') || '') !== await assinar([...ids].sort().join(','))) {
    return new Response('Link inválido ou expirado.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const { data, error } = await admin.from('agendamentos').select(CAMPOS).in('id', ids).neq('status', 'cancelado').order('data_prevista');
  if (error) return new Response('Erro ao ler a agenda.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  if (!data || !data.length) {
    return new Response('Esta atividade foi cancelada ou não existe mais.', { status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const nome = data.length === 1 ? `${(TIPOS[data[0].tipo] || TIPOS.outro).label}-${chaveDia(new Date(data[0].data_prevista))}` : `agenda-${data.length}-atividades`;
  return new Response(montarIcs(data), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="imob-rottas-${nome}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}

// ─── HTML do e-mail (layout em tabelas = compatível com Outlook) ───────────
function pilula(texto: string, cor: string, claro: string) {
  return `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:999px;background:${claro};color:${cor};font:700 13px/1 Arial,Helvetica,sans-serif;white-space:nowrap;">${texto}</span>`;
}
function resumoPorTipo(ags: any[]) {
  return ORDEM_TIPOS.map((k) => {
    const n = ags.filter((a) => (TIPOS[a.tipo] ? a.tipo : 'outro') === k).length;
    if (!n) return '';
    const t = TIPOS[k];
    return pilula(`${t.emoji} ${n} ${n === 1 ? t.label : t.plural}`, t.cor, t.claro);
  }).join('');
}
function botaoPequeno(href: string, texto: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr>
    <td style="border:1px solid ${LARANJA};border-radius:8px;" bgcolor="#FFFFFF">
      <a href="${href}" target="_blank" style="display:inline-block;padding:8px 14px;font:700 13px/1 Arial,Helvetica,sans-serif;color:${LARANJA};text-decoration:none;">${texto}</a>
    </td></tr></table>`;
}

// Um card = uma linha. Faixa colorida do tipo à esquerda, hora em destaque,
// título, detalhes e (opcional) o botão do Outlook.
// Quanto tempo a atividade está atrasada, em dias de calendário (Brasília).
function rotuloAtraso(d: Date) {
  const dias = Math.round((Date.parse(chaveDia(new Date())) - Date.parse(chaveDia(d))) / 86400000);
  return dias <= 0 ? 'atrasada · hoje' : dias === 1 ? 'atrasada · ontem' : `atrasada há ${dias} dias`;
}
function botaoRegistrar(href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr>
    <td bgcolor="${LARANJA}" style="border-radius:8px;background:${LARANJA};">
      <a href="${href}" target="_blank" style="display:inline-block;padding:9px 16px;font:800 13px/1 Arial,Helvetica,sans-serif;color:#FFFFFF;text-decoration:none;">✅ Registrar agora</a>
    </td></tr></table>`;
}

function card(ag: any, o: { mostrarData?: boolean; mostrarTipo?: boolean; ics?: string | null; realizar?: string | null; atraso?: string | null }) {
  const t = TIPOS[ag.tipo] || TIPOS.outro;
  const d = new Date(ag.data_prevista);
  const metas: [string, string][] = [];
  if (ag.tipo === 'outro' && ag.imobiliaria) metas.push(['🏢', ag.imobiliaria]);
  if (ag.empreendimento) metas.push(['🏗️', ag.empreendimento]);
  if (ag.cliente) metas.push(['👤', ag.cliente]);
  if (ag.corretor) metas.push(['🤝', ag.corretor]);
  if (ag.local_visita) metas.push(['📌', ag.local_visita]);
  if (ag.motivo_visita) metas.push(['🎯', ag.motivo_visita]);
  const etiquetas = [
    o.mostrarTipo !== false ? `<span style="display:inline-block;padding:4px 9px;border-radius:999px;background:${t.claro};color:${t.cor};font:700 11px/1 Arial,Helvetica,sans-serif;">${t.emoji} ${t.label}</span>` : '',
    ag.recorrencia_freq && REC[ag.recorrencia_freq] ? `<span style="display:inline-block;margin-left:4px;padding:4px 9px;border-radius:999px;background:#FFF4EC;color:${LARANJA};font:700 11px/1 Arial,Helvetica,sans-serif;">🔁 ${REC[ag.recorrencia_freq]}</span>` : '',
    o.atraso ? `<span style="display:inline-block;margin-left:4px;padding:4px 9px;border-radius:999px;background:#FEE2E2;color:#B91C1C;font:700 11px/1 Arial,Helvetica,sans-serif;">⏳ ${esc(o.atraso)}</span>` : '',
  ].join('');
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;border-collapse:separate;">
    <tr>
      <td width="6" bgcolor="${t.cor}" style="width:6px;background:${t.cor};border-radius:12px 0 0 12px;font-size:0;line-height:0;">&nbsp;</td>
      <td bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid ${BORDA};border-left:0;border-radius:0 12px 12px 0;padding:16px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="top" width="72" style="width:72px;padding-right:14px;border-right:1px solid #F1ECE6;">
            <div style="font:800 22px/1 Arial,Helvetica,sans-serif;color:${NAVY};">${fmtHora(d)}</div>
            ${o.mostrarData ? `<div style="margin-top:6px;font:700 11px/1.2 Arial,Helvetica,sans-serif;color:${LARANJA};text-transform:uppercase;letter-spacing:.4px;">${esc(fmtDiaSemanaCurto(d))}<br>${fmtDiaMes(d)}</div>` : ''}
          </td>
          <td valign="top" style="padding-left:16px;">
            ${etiquetas ? `<div style="margin-bottom:8px;">${etiquetas}</div>` : ''}
            <div style="font:700 17px/1.3 Arial,Helvetica,sans-serif;color:${NAVY};">${esc(tituloDe(ag))}</div>
            ${ag.tipo !== 'outro' && ag.titulo && ag.titulo !== tituloDe(ag) ? `<div style="font:14px/1.4 Arial,Helvetica,sans-serif;color:${CINZA};margin-top:2px;">${esc(ag.titulo)}</div>` : ''}
            ${metas.length ? `<div style="margin-top:8px;font:13px/1.7 Arial,Helvetica,sans-serif;color:#4B5563;">${metas.map(([i, v]) => `<span style="white-space:nowrap;">${i} ${esc(v)}</span>`).join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</div>` : ''}
            ${ag.observacoes ? `<div style="margin-top:10px;padding:10px 12px;background:${FUNDO};border-radius:8px;font:italic 13px/1.5 Arial,Helvetica,sans-serif;color:#57534E;">“${esc(ag.observacoes)}”</div>` : ''}
            ${o.realizar ? botaoRegistrar(o.realizar) : ''}
            ${o.ics ? botaoPequeno(o.ics, '📅 Adicionar ao Outlook') : ''}
          </td>
        </tr></table>
      </td>
    </tr>
  </table>`;
}

function tituloSecao(texto: string, cor: string, contagem: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 12px 0;"><tr>
    <td style="font:800 15px/1.2 Arial,Helvetica,sans-serif;color:${NAVY};">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${cor};margin-right:8px;vertical-align:middle;"></span>${texto}
      <span style="font:600 13px Arial,Helvetica,sans-serif;color:${CINZA};margin-left:6px;">${contagem}</span>
    </td></tr></table>`;
}

function blocoGerente(nome: string, n: number) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 12px 0;"><tr>
    <td width="40" valign="middle" style="width:40px;">
      <div style="width:36px;height:36px;border-radius:50%;background:${LARANJA};color:#FFFFFF;font:800 14px/36px Arial,Helvetica,sans-serif;text-align:center;">${esc(iniciais(nome))}</div>
    </td>
    <td valign="middle" style="padding-left:10px;font:800 16px/1.2 Arial,Helvetica,sans-serif;color:${NAVY};">${esc(nome)}
      <div style="font:600 12px Arial,Helvetica,sans-serif;color:${CINZA};margin-top:2px;">${plural(n, 'atividade', 'atividades')}</div>
    </td></tr></table>`;
}

function emailHtml(p: { preheader: string; etiqueta: string; titulo: string; subtitulo: string; resumo: string; corpo: string; cta?: string; nota: string }) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(p.titulo)}</title></head>
<body style="margin:0;padding:0;background:${FUNDO};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(p.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${FUNDO}"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    <tr><td align="center" style="padding:6px 0 18px 0;">
      <img src="${LOGO_URL}" width="170" alt="Rottas" style="display:block;border:0;width:170px;height:auto;">
    </td></tr>
    <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:18px;border-top:5px solid ${LARANJA};padding:26px 24px 8px 24px;">
      <div style="font:800 12px/1 Arial,Helvetica,sans-serif;color:${LARANJA};text-transform:uppercase;letter-spacing:1.2px;">${esc(p.etiqueta)}</div>
      <div style="margin-top:10px;font:800 24px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};">${esc(p.titulo)}</div>
      <div style="margin-top:6px;font:15px/1.5 Arial,Helvetica,sans-serif;color:${CINZA};">${esc(p.subtitulo)}</div>
      <div style="margin-top:16px;">${p.resumo}</div>
    </td></tr>
    <tr><td style="padding:4px 0 0 0;">${p.corpo}</td></tr>
    ${p.cta ? `<tr><td align="center" style="padding:14px 0 6px 0;">${p.cta}</td></tr>` : ''}
    <tr><td align="center" style="padding:14px 0 0 0;">
      <a href="${URL_APP}" target="_blank" style="font:700 14px Arial,Helvetica,sans-serif;color:${LARANJA};text-decoration:none;">Abrir o Imob Rottas →</a>
    </td></tr>
    <tr><td align="center" style="padding:22px 20px 0 20px;font:12px/1.6 Arial,Helvetica,sans-serif;color:#9CA3AF;">
      ${p.nota}<br>© ${new Date().getFullYear()} Rottas Construtora e Incorporadora
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function botaoGrande(href: string, texto: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="${LARANJA}" style="border-radius:10px;background:${LARANJA};">
      <a href="${href}" target="_blank" style="display:inline-block;padding:15px 28px;font:800 15px/1 Arial,Helvetica,sans-serif;color:#FFFFFF;text-decoration:none;">${texto}</a>
    </td></tr></table>
    <div style="margin-top:8px;font:12px Arial,Helvetica,sans-serif;color:${CINZA};">O Outlook avisa 15 minutos antes de cada atividade.</div>`;
}

// ─── Montagem: e-mail do GERENTE ────────────────────────────────────────────
// Faixa curta no TOPO: avisa das pendências sem empurrar a agenda de amanhã pra baixo.
function faixaPendencias(a: number) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 4px 0;"><tr>
    <td bgcolor="#FEF2F2" style="background:#FEF2F2;border:1px solid #FECACA;border-left:5px solid #DC2626;border-radius:12px;padding:14px 16px;">
      <div style="font:800 15px/1.3 Arial,Helvetica,sans-serif;color:#991B1B;">⚠️ ${plural(a, 'atividade aguardando registro', 'atividades aguardando registro')}</div>
      <div style="margin-top:4px;font:13px/1.5 Arial,Helvetica,sans-serif;color:#7F1D1D;">Existem atividades não registradas. Elas estão no final deste e-mail, com o botão para registrar agora.</div>
    </td></tr></table>`;
}

// Seção do FINAL: lista completa das pendências, cada uma com "Registrar agora".
function secaoPendencias(atrasados: any[], antigas: number) {
  let s = tituloSecao('⏳ Aguardando registro', '#DC2626', `(${atrasados.length})`);
  s += `<div style="margin:-4px 0 12px 0;font:13px/1.5 Arial,Helvetica,sans-serif;color:${CINZA};">Registre o que foi feito. Se não aconteceu, remarque ou cancele no app — assim sua agenda fica em dia.</div>`;
  s += atrasados.map((ag) => card(ag, {
    mostrarData: true,
    atraso: rotuloAtraso(new Date(ag.data_prevista)),
    realizar: `${URL_APP}/#/agenda/${ag.id}/realizar`,
  })).join('');
  if (antigas > 0) {
    s += `<div style="margin:4px 0 0 0;font:12px/1.5 Arial,Helvetica,sans-serif;color:${CINZA};">+ ${plural(antigas, 'pendência mais antiga', 'pendências mais antigas')} (mais de 30 dias) — veja na Agenda do app.</div>`;
  }
  return s;
}

async function montarGerente(modo: string, p: any, ags: any[], rotulo: string, atrasados: any[] = [], antigas = 0) {
  const n = ags.length;
  const a = atrasados.length;
  const icsPorId = new Map<string, string>();
  for (const ag of ags) icsPorId.set(ag.id, await linkIcs([ag.id]));
  let corpo = '';
  // Pendências: faixa curta no topo (o número aparece logo de cara)…
  if (a > 0 && n > 0) corpo += faixaPendencias(a);
  if (modo === 'diario' && n === 0 && a > 0) {
    corpo += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0 0;"><tr>
      <td bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid ${BORDA};border-radius:12px;padding:14px 16px;font:14px/1.5 Arial,Helvetica,sans-serif;color:${CINZA};">
        📅 Você não tem atividades agendadas para amanhã (${esc(rotulo)}).</td></tr></table>`;
  }
  if (modo === 'diario') {
    // Segmentado por TIPO de atividade
    for (const k of ORDEM_TIPOS) {
      const doTipo = ags.filter((a) => (TIPOS[a.tipo] ? a.tipo : 'outro') === k);
      if (!doTipo.length) continue;
      const t = TIPOS[k];
      corpo += tituloSecao(`${t.emoji} ${t.plural}`, t.cor, `(${doTipo.length})`);
      corpo += doTipo.map((ag) => card(ag, { mostrarTipo: false, ics: icsPorId.get(ag.id) })).join('');
    }
  } else {
    // Segmentado por DIA, e cada card mostra o tipo
    const porDia = new Map<string, any[]>();
    for (const ag of ags) {
      const k = chaveDia(new Date(ag.data_prevista));
      if (!porDia.has(k)) porDia.set(k, []);
      porDia.get(k)!.push(ag);
    }
    for (const [, doDia] of porDia) {
      const d = new Date(doDia[0].data_prevista);
      corpo += tituloSecao(maiuscula(fmtDiaLongo(d)), LARANJA, `· ${plural(doDia.length, 'atividade', 'atividades')}`);
      corpo += doDia.map((ag) => card(ag, { ics: icsPorId.get(ag.id) })).join('');
    }
  }
  // …e a lista completa no FINAL, depois da agenda de amanhã.
  if (a > 0) corpo += secaoPendencias(atrasados, antigas);

  const nome = primeiroNome(p.nome);
  const diario = modo === 'diario';
  const soPendencias = diario && n === 0 && a > 0;
  const seloPend = a > 0 ? pilula(`⚠️ ${a} sem registro`, '#B91C1C', '#FEE2E2') : '';
  const assunto = soPendencias
    ? `⚠️ ${plural(a, 'atividade aguardando registro', 'atividades aguardando registro')}`
    : diario
      ? `📅 Sua agenda de amanhã · ${plural(n, 'atividade', 'atividades')}${a > 0 ? ` · ⚠️ ${a} sem registro` : ''}`
      : `🗓️ Sua semana · ${plural(n, 'atividade', 'atividades')}`;
  const html = emailHtml({
    preheader: soPendencias
      ? `Existem atividades não registradas na sua agenda. Registre agora.`
      : diario ? `Amanhã você tem ${plural(n, 'atividade', 'atividades')}${a > 0 ? ` e ${a} aguardando registro` : ''}.` : `${plural(n, 'atividade', 'atividades')} nesta semana.`,
    etiqueta: soPendencias ? 'Pendências da agenda' : diario ? 'Agenda de amanhã' : 'Agenda da semana',
    titulo: soPendencias ? `Olá, ${nome}! Você tem atividades sem registro` : `Olá, ${nome}! ${diario ? 'Sua agenda de amanhã' : 'Sua semana'}`,
    subtitulo: soPendencias
      ? `Existem atividades não registradas na sua agenda`
      : `${rotulo} · ${plural(n, 'atividade agendada', 'atividades agendadas')}`,
    resumo: resumoPorTipo(ags) + seloPend,
    corpo,
    cta: n > 0 ? botaoGrande(await linkIcs(ags.map((x) => x.id)), n === 1 ? '📅 Adicionar ao Outlook' : `📅 Adicionar todas ao Outlook (${n})`) : undefined,
    nota: 'Você recebe este lembrete porque tem atividades agendadas no Imob Rottas.',
  });
  const linhas = ags.slice(0, 4).map((x) => `${diario ? '' : maiuscula(fmtDiaSemanaCurto(new Date(x.data_prevista))) + ' '}${fmtHora(new Date(x.data_prevista))} ${(TIPOS[x.tipo] || TIPOS.outro).label} · ${tituloDe(x)}`);
  if (n > 4) linhas.push(`+${n - 4} mais`);
  if (a > 0 && n > 0) linhas.push(`⚠️ ${plural(a, 'atividade aguardando registro', 'atividades aguardando registro')}`);
  if (soPendencias) linhas.push('Toque para abrir a agenda e registrar.');
  const push = {
    title: soPendencias
      ? `⚠️ ${plural(a, 'atividade sem registro', 'atividades sem registro')}`
      : diario ? `📅 Amanhã: ${plural(n, 'atividade', 'atividades')}` : `🗓️ Sua semana: ${plural(n, 'atividade', 'atividades')}`,
    body: linhas.join('\n'),
    url: `${URL_APP}/#/`,
    tag: `lembrete-${modo}`,
  };
  return { assunto, html, push, qtd: n + a };
}

// ─── Montagem: e-mail do LÍDER (só os gerentes dele) ───────────────────────
function montarLider(modo: string, lider: any, equipe: { gerente: any; ags: any[] }[], rotulo: string) {
  const todas = equipe.flatMap((e) => e.ags);
  const n = todas.length;
  const diario = modo === 'diario';
  equipe.sort((a, b) => b.ags.length - a.ags.length || String(a.gerente.nome).localeCompare(String(b.gerente.nome)));
  let corpo = '';
  for (const { gerente, ags } of equipe) {
    corpo += blocoGerente(gerente.nome, ags.length);
    corpo += ags.map((ag) => card(ag, { mostrarData: !diario })).join('');
  }
  const assunto = diario
    ? `👥 Agenda de amanhã da sua equipe · ${plural(n, 'atividade', 'atividades')}`
    : `👥 Semana da sua equipe · ${plural(n, 'atividade', 'atividades')}`;
  const html = emailHtml({
    preheader: `${plural(n, 'atividade', 'atividades')} de ${plural(equipe.length, 'gerente', 'gerentes')} da sua equipe.`,
    etiqueta: diario ? 'Equipe · amanhã' : 'Equipe · semana',
    titulo: `Olá, ${primeiroNome(lider.nome)}! ${diario ? 'A agenda de amanhã da sua equipe' : 'A semana da sua equipe'}`,
    subtitulo: `${rotulo} · ${plural(n, 'atividade', 'atividades')} de ${plural(equipe.length, 'gerente', 'gerentes')}`,
    resumo: resumoPorTipo(todas),
    corpo,
    nota: 'Você recebe este resumo porque é responsável por estes gerentes no Imob Rottas.',
  });
  const push = {
    title: diario ? `👥 Equipe amanhã: ${plural(n, 'atividade', 'atividades')}` : `👥 Semana da equipe: ${plural(n, 'atividade', 'atividades')}`,
    body: equipe.slice(0, 5).map((e) => `${primeiroNome(e.gerente.nome)}: ${e.ags.length}`).join(' · '),
    url: `${URL_APP}/#/`,
    tag: `lembrete-equipe-${modo}`,
  };
  return { assunto, html, push, qtd: n };
}

// Espelha a policy "hierarquia ve agendamentos" do banco.
function naEquipe(lider: any, g: any) {
  const arr = (x: unknown) => (Array.isArray(x) ? x : []) as string[];
  if (lider.role === 'superintendente') return arr(lider.estados_acesso).includes(g.estado || '');
  if (lider.role === 'gestor_regional') return arr(lider.cidades_acesso).includes(g.cidade || '');
  return false;
}

// ─── Envio ──────────────────────────────────────────────────────────────────
let _transp: any = null;
function transporte() {
  if (!_transp) {
    _transp = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com', port: 587, secure: false,
      auth: { user: Deno.env.get('BREVO_SMTP_USER')!, pass: Deno.env.get('BREVO_SMTP_PASS')! },
    });
  }
  return _transp;
}
async function enviarEmail(para: string, assunto: string, html: string) {
  await transporte().sendMail({ from: `"Imob Rottas" <${Deno.env.get('SENDER_EMAIL')}>`, to: para, subject: assunto, html });
}

let _vapidOk = false;
async function enviarPush(userId: string, payload: unknown) {
  if (!_vapidOk) {
    webpush.setVapidDetails('mailto:gabriel.galvao@rottasconstrutora.com.br',
      Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
    _vapidOk = true;
  }
  const { data: subs } = await admin.from('push_inscricoes').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  const r = { aparelhos: (subs || []).length, enviados: 0, removidos: 0, falhas: [] as string[] };
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload), { TTL: 12 * 3600, urgency: 'normal' });
      r.enviados++;
      await admin.from('push_inscricoes').update({ ultimo_uso: new Date().toISOString() }).eq('id', s.id);
    } catch (e: any) {
      // 404/410 = o aparelho cancelou a inscrição (desinstalou, limpou dados): remove
      if (e?.statusCode === 404 || e?.statusCode === 410) { r.removidos++; await admin.from('push_inscricoes').delete().eq('id', s.id); }
      else r.falhas.push(String(e?.statusCode || e?.message || e).slice(0, 120));
    }
  }
  return r;
}

// Anti-duplicidade: reserva a chave ANTES de enviar. Se já existe, não envia de novo.
async function reservar(chave: string, extra: Record<string, unknown>) {
  const { error } = await admin.from('lembretes_enviados').insert({ chave, ...extra });
  if (!error) return true;
  if ((error as any).code === '23505') return false;
  throw error;
}
async function concluir(chave: string, ok: boolean, erro?: string) {
  if (ok) await admin.from('lembretes_enviados').update({ ok: true }).eq('chave', chave);
  else await admin.from('lembretes_enviados').delete().eq('chave', chave);   // libera pra tentar de novo
}

async function executar(modo: string, o: { teste?: { email: string } | null; dryRun?: boolean; refData?: string | null }) {
  const { ini, fim, dataRef, rotulo } = janela(modo, o.refData);
  const { data: ags, error } = await admin.from('agendamentos').select(CAMPOS)
    .eq('status', 'pendente').gte('data_prevista', ini.toISOString()).lt('data_prevista', fim.toISOString())
    .order('data_prevista');
  if (error) throw error;
  const { data: perfis, error: e2 } = await admin.from('profiles')
    .select('id, nome, email, role, ativo, conta_teste, cidade, estado, cidades_acesso, estados_acesso').eq('ativo', true);
  if (e2) throw e2;
  const porId = new Map((perfis || []).map((p: any) => [p.id, p]));

  // Agenda de cada gerente/supervisor (conta de teste só vê as próprias de teste)
  const porDono = new Map<string, any[]>();
  for (const ag of ags || []) {
    const dono: any = porId.get(ag.gerente_id);
    if (!dono || !['gerente', 'supervisor'].includes(dono.role)) continue;
    if (ag.teste && !dono.conta_teste) continue;
    if (!ag.teste && dono.conta_teste) continue;
    if (!porDono.has(dono.id)) porDono.set(dono.id, []);
    porDono.get(dono.id)!.push(ag);
  }

  // PENDÊNCIAS (só no lembrete das 18h): agendamentos ainda "pendente" cujo horário
  // já passou — nem registrados, nem cancelados. Lista os dos últimos 30 dias;
  // os mais antigos entram só na contagem (senão uma pendência esquecida ficaria
  // no e-mail pra sempre).
  const pendPorDono = new Map<string, any[]>();
  const antigasPorDono = new Map<string, number>();
  let totalPend = 0;
  if (modo === 'diario') {
    const agora = new Date();
    const limite = new Date(agora.getTime() - 30 * 86400000);
    const { data: atr, error: e3 } = await admin.from('agendamentos').select(CAMPOS)
      .eq('status', 'pendente').lt('data_prevista', agora.toISOString())
      .order('data_prevista', { ascending: false }).limit(3000);
    if (e3) throw e3;
    for (const ag of atr || []) {
      const dono: any = porId.get(ag.gerente_id);
      if (!dono || !['gerente', 'supervisor'].includes(dono.role)) continue;
      if (!!ag.teste !== !!dono.conta_teste) continue;
      totalPend++;
      if (new Date(ag.data_prevista) < limite) { antigasPorDono.set(dono.id, (antigasPorDono.get(dono.id) || 0) + 1); continue; }
      if (!pendPorDono.has(dono.id)) pendPorDono.set(dono.id, []);
      pendPorDono.get(dono.id)!.push(ag);
    }
  }

  // Recebe quem tem agenda amanhã OU pendências (o objetivo é fazer registrar).
  const envios: any[] = [];
  const donos = new Set([...porDono.keys(), ...pendPorDono.keys()]);
  for (const uid of donos) {
    const p = porId.get(uid);
    envios.push({ papel: 'gerente', perfil: p, ...(await montarGerente(modo, p, porDono.get(uid) || [], rotulo, pendPorDono.get(uid) || [], antigasPorDono.get(uid) || 0)) });
  }
  for (const lider of (perfis || []).filter((p: any) => ['gestor_regional', 'superintendente'].includes(p.role))) {
    const equipe = [...porDono.keys()].map((id) => porId.get(id)).filter((g: any) => !g.conta_teste && naEquipe(lider, g))
      .map((g: any) => ({ gerente: g, ags: porDono.get(g.id)! }));
    if (!equipe.length) continue;
    envios.push({ papel: 'lider', perfil: lider, ...montarLider(modo, lider, equipe, rotulo) });
  }

  const base = { modo, janela: { de: ini.toISOString(), ate: fim.toISOString(), rotulo }, atividades: (ags || []).length, pendencias: totalPend };

  // MANUAL (botão do master no cadastro da pessoa): só aquela pessoa, só e-mail,
  // sem trava anti-duplicidade (é um reenvio pedido explicitamente).
  if ((o as any).apenas) {
    const alvo: any = porId.get((o as any).apenas);
    if (!alvo) return { ...base, manual: true, ok: false, motivo: 'Usuário inativo ou não encontrado.' };
    if (!alvo.email) return { ...base, manual: true, ok: false, motivo: 'Este usuário não tem e-mail cadastrado.' };
    const meus = envios.filter((e) => e.perfil.id === alvo.id);
    if (!meus.length) {
      const sem = ['gestor_regional', 'superintendente'].includes(alvo.role)
        ? 'Nenhum gerente da equipe tem atividade pendente neste período.'
        : (['gerente', 'supervisor'].includes(alvo.role) ? 'Não há atividade pendente neste período.' : 'Este perfil não recebe lembretes.');
      return { ...base, manual: true, ok: false, motivo: sem };
    }
    // Em teste (agendador + teste.email) o e-mail vai para o endereço de teste, nunca para a pessoa.
    const para = o.teste ? o.teste.email : alvo.email;
    const out = [];
    for (const e of meus) {
      const assunto = o.teste ? `[TESTE · manual: ${alvo.nome}] ${e.assunto}` : e.assunto;
      try { await enviarEmail(para, assunto, e.html); out.push({ papel: e.papel, qtd: e.qtd, email: 'enviado' }); }
      catch (err: any) { out.push({ papel: e.papel, qtd: e.qtd, email: 'falhou: ' + String(err?.message || err).slice(0, 160) }); }
    }
    return { ...base, manual: true, ok: out.every((x) => x.email === 'enviado'), para, enviados: out };
  }

  // TESTE: manda uma amostra para o e-mail de teste (até 3 gerentes + 2 líderes),
  // sem gravar anti-duplicidade e sem notificar ninguém além do dono do e-mail de teste.
  if (o.teste) {
    const amostra = [
      ...envios.filter((e) => e.papel === 'gerente').sort((a, b) => b.qtd - a.qtd).slice(0, 3),
      ...envios.filter((e) => e.papel === 'lider').sort((a, b) => b.qtd - a.qtd).slice(0, 2),
    ];
    // Pré-visualização: devolve o HTML pronto, sem enviar (pra conferir o visual).
    if ((o as any).preview) return { ...base, preview: amostra.map((e) => ({ papel: e.papel, nome: e.perfil.nome, assunto: e.assunto, html: e.html })) };
    const out = [];
    for (const e of amostra) {
      const assunto = `[TESTE · ${e.papel === 'lider' ? 'líder' : 'gerente'}: ${e.perfil.nome}] ${e.assunto}`;
      if (o.dryRun) { out.push({ papel: e.papel, nome: e.perfil.nome, assunto, qtd: e.qtd }); continue; }
      try { await enviarEmail(o.teste.email, assunto, e.html); out.push({ papel: e.papel, nome: e.perfil.nome, assunto, email: 'enviado' }); }
      catch (err: any) { out.push({ papel: e.papel, nome: e.perfil.nome, email: 'falhou: ' + String(err?.message || err) }); }
    }
    let push = null;
    const dono: any = (perfis || []).find((p: any) => (p.email || '').toLowerCase() === o.teste!.email.toLowerCase());
    if (dono && amostra[0] && !o.dryRun) push = await enviarPush(dono.id, { ...amostra[0].push, title: '[TESTE] ' + amostra[0].push.title });
    return { ...base, teste: true, para: o.teste.email, enviados: out, push_para_dono_do_email: push, total_que_receberiam: envios.map((e) => ({ papel: e.papel, nome: e.perfil.nome, qtd: e.qtd })) };
  }

  const resultado = [];
  for (const e of envios) {
    const r: any = { papel: e.papel, nome: e.perfil.nome, qtd: e.qtd };
    if (o.dryRun) { r.email = e.perfil.email ? 'receberia' : 'sem e-mail'; resultado.push(r); continue; }
    if (e.perfil.email) {
      const chave = `${modo}:${dataRef}:${e.papel}:${e.perfil.id}:email`;
      if (await reservar(chave, { user_id: e.perfil.id, modo, canal: 'email', qtd: e.qtd })) {
        try { await enviarEmail(e.perfil.email, e.assunto, e.html); r.email = 'enviado'; await concluir(chave, true); }
        catch (err: any) { r.email = 'falhou: ' + String(err?.message || err).slice(0, 160); await concluir(chave, false); }
      } else r.email = 'já enviado antes';
    } else r.email = 'sem e-mail';
    const chaveP = `${modo}:${dataRef}:${e.papel}:${e.perfil.id}:push`;
    if (await reservar(chaveP, { user_id: e.perfil.id, modo, canal: 'push', qtd: e.qtd })) {
      try {
        r.push = await enviarPush(e.perfil.id, e.push);
        await concluir(chaveP, r.push.falhas.length === 0 || r.push.enviados > 0);
      } catch (err: any) { r.push = 'falhou: ' + String(err?.message || err).slice(0, 160); await concluir(chaveP, false); }
    } else r.push = 'já enviado antes';
    resultado.push(r);
  }
  return { ...base, dryRun: !!o.dryRun, resultado };
}

// ─── Avisos SÓ no app (notificação): começo do dia e 15 minutos antes ──────
const PAPEIS_DONO = ['gerente', 'supervisor'];
function donoValido(dono: any, ag: any) {
  if (!dono || dono.ativo === false || !PAPEIS_DONO.includes(dono.role)) return false;
  return !!ag.teste === !!dono.conta_teste;   // conta de teste só com as de teste
}
function linhaAtividade(a: any) {
  return `${fmtHora(new Date(a.data_prevista))} ${(TIPOS[a.tipo] || TIPOS.outro).label} · ${tituloDe(a)}`;
}
function payloadManha(nome: string, lista: any[]) {
  const n = lista.length;
  const linhas = lista.slice(0, 5).map(linhaAtividade);
  if (n > 5) linhas.push(`+${n - 5} mais`);
  return {
    title: `☀️ Bom dia, ${primeiroNome(nome)}! Hoje: ${plural(n, 'atividade', 'atividades')}`,
    body: linhas.join('\n'), url: `${URL_APP}/#/`, tag: 'lembrete-manha',
  };
}
function payload15(ag: any) {
  const ini = new Date(ag.data_prevista);
  const min = Math.max(1, Math.round((ini.getTime() - Date.now()) / 60000));
  const t = TIPOS[ag.tipo] || TIPOS.outro;
  const extra = [ag.local_visita, ag.cliente && `Cliente: ${ag.cliente}`].filter(Boolean).join(' · ');
  return {
    title: `⏰ Em ${min} min: ${t.label}`,
    body: `${fmtHora(ini)} · ${tituloDe(ag)}${extra ? '\n' + extra : ''}`,
    url: `${URL_APP}/#/`, tag: `antes15-${ag.id}`,
  };
}
async function enviarComChave(chave: string, userId: string, payload: unknown, extra: Record<string, unknown>) {
  if (!(await reservar(chave, { user_id: userId, canal: 'push', ...extra }))) return 'já enviado antes';
  try {
    const r = await enviarPush(userId, payload);
    await concluir(chave, r.falhas.length === 0 || r.enviados > 0);
    return r;
  } catch (err: any) {
    await concluir(chave, false);
    return 'falhou: ' + String(err?.message || err).slice(0, 160);
  }
}
async function perfisDosDonos(ags: any[]) {
  const ids = [...new Set(ags.map((a) => a.gerente_id))];
  if (!ids.length) return new Map();
  const { data } = await admin.from('profiles').select('id, nome, role, ativo, conta_teste').in('id', ids);
  return new Map((data || []).map((p: any) => [p.id, p]));
}

// ☀️ Começo do dia (8h): "Hoje: X atividades" para cada dono de agenda.
// Na SEGUNDA não envia: às 8h já sai o lembrete da semana (evita 2 avisos no mesmo minuto).
async function executarManha(o: { dryRun?: boolean; refData?: string | null }) {
  const h = hojeBRT(o.refData);
  if (h.dow === 1) return { modo: "manha", pulado: "segunda-feira: o lembrete da semana das 8h já cobre o dia", resultado: [] };
  const ini = inicioDiaBRT(h.y, h.m, h.d), fim = inicioDiaBRT(h.y, h.m, h.d + 1);
  const dataRef = chaveDia(ini);
  const { data: ags, error } = await admin.from('agendamentos').select(CAMPOS)
    .eq('status', 'pendente').gte('data_prevista', ini.toISOString()).lt('data_prevista', fim.toISOString())
    .order('data_prevista');
  if (error) throw error;
  const porId = await perfisDosDonos(ags || []);
  const porDono = new Map<string, any[]>();
  for (const ag of ags || []) {
    if (!donoValido(porId.get(ag.gerente_id), ag)) continue;
    if (!porDono.has(ag.gerente_id)) porDono.set(ag.gerente_id, []);
    porDono.get(ag.gerente_id)!.push(ag);
  }
  const resultado = [];
  for (const [uid, lista] of porDono) {
    const p: any = porId.get(uid);
    resultado.push({
      nome: p.nome, qtd: lista.length,
      push: o.dryRun ? 'receberia'
        : await enviarComChave(`manha:${dataRef}:${uid}:push`, uid, payloadManha(p.nome, lista), { modo: 'manha', qtd: lista.length }),
    });
  }
  return { modo: 'manha', dataRef, atividades: (ags || []).length, dryRun: !!o.dryRun, resultado };
}

// ⏰ 15 minutos antes: roda a cada minuto (o banco só chama quando há o que avisar).
// Janela: atividades que começam nos próximos 16 min e ainda não foram avisadas.
// A chave inclui o horário: se a atividade for remarcada, avisa de novo no novo horário.
async function executarAntes15(o: { dryRun?: boolean }) {
  const agora = new Date();
  const limite = new Date(agora.getTime() + 16 * 60 * 1000);
  const { data: ags, error } = await admin.from('agendamentos').select(CAMPOS)
    .eq('status', 'pendente').gt('data_prevista', agora.toISOString()).lte('data_prevista', limite.toISOString())
    .order('data_prevista');
  if (error) throw error;
  const porId = await perfisDosDonos(ags || []);
  const resultado = [];
  for (const ag of ags || []) {
    const dono: any = porId.get(ag.gerente_id);
    if (!donoValido(dono, ag)) continue;
    const chave = `antes15:${ag.id}:${new Date(ag.data_prevista).toISOString()}`;
    resultado.push({
      nome: dono.nome, atividade: linhaAtividade(ag),
      push: o.dryRun ? 'receberia' : await enviarComChave(chave, dono.id, payload15(ag), { modo: 'antes15', qtd: 1 }),
    });
  }
  return { modo: 'antes15', janela: { de: agora.toISOString(), ate: limite.toISOString() }, dryRun: !!o.dryRun, resultado };
}

// Exemplos para o próprio usuário testar no aparelho dele (Perfil → Notificações).
async function exemploParaUsuario(userId: string, variante: string) {
  const { data: p } = await admin.from('profiles').select('nome').eq('id', userId).single();
  const nome = (p && p.nome) || '';
  if (variante === 'manha') {
    const h = hojeBRT();
    const { data: ags } = await admin.from('agendamentos').select(CAMPOS).eq('gerente_id', userId).eq('status', 'pendente')
      .gte('data_prevista', inicioDiaBRT(h.y, h.m, h.d).toISOString())
      .lt('data_prevista', inicioDiaBRT(h.y, h.m, h.d + 1).toISOString()).order('data_prevista');
    const pl = (ags && ags.length) ? payloadManha(nome, ags) : {
      title: `☀️ Bom dia, ${primeiroNome(nome)}!`,
      body: 'Exemplo: hoje você não tem atividades agendadas. Nos dias com agenda, a lista aparece aqui às 8h.',
      url: `${URL_APP}/#/`, tag: 'teste-manha',
    };
    return enviarPush(userId, { ...pl, title: '[TESTE] ' + pl.title });
  }
  // 15 min antes: usa a próxima atividade real dele (ou um exemplo), como se fosse daqui a 15 min
  const { data: prox } = await admin.from('agendamentos').select(CAMPOS).eq('gerente_id', userId).eq('status', 'pendente')
    .gt('data_prevista', new Date().toISOString()).order('data_prevista').limit(1);
  const base = (prox && prox[0]) || { id: 'exemplo', tipo: 'checkin', imobiliaria: 'Imobiliária Exemplo' };
  const pl = payload15({ ...base, data_prevista: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
  return enviarPush(userId, { ...pl, title: '[TESTE] ' + pl.title, tag: 'teste-15' });
}

async function usuarioDoToken(req: Request) {
  const h = req.headers.get('Authorization') || '';
  const tok = h.replace(/^Bearer\s+/i, '');
  if (!tok || tok.split('.').length !== 3) return null;
  try { const { data } = await admin.auth.getUser(tok); return data?.user || null; } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    if (req.method === 'GET') return await servirIcs(req);
    const body = await req.json().catch(() => ({}));
    const modo = String(body.modo || '');
    const cronOk = !!Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET');
    const chamador = cronOk ? null : await usuarioDoToken(req);

    // Notificação de teste: cada usuário testa nos PRÓPRIOS aparelhos.
    // variante 'manha' / 'antes15' → manda um exemplo de cada aviso, com a agenda real dele.
    if (modo === 'push-teste') {
      if (!chamador) return json({ error: 'Faça login para testar.' }, 401);
      if (body.variante === 'manha' || body.variante === 'antes15') return json(await exemploParaUsuario(chamador.id, body.variante));
      const r = await enviarPush(chamador.id, {
        title: '🔔 Notificações ativadas!',
        body: 'Você vai receber aqui: às 8h as atividades do dia (na segunda, a semana), 15 min antes de cada uma, e às 18h a agenda de amanhã.',
        url: `${URL_APP}/#/`, tag: 'teste',
      });
      return json(r);
    }

    if (!['diario', 'semanal', 'manha', 'antes15'].includes(modo)) {
      return json({ error: 'modo inválido (use diario, semanal, manha, antes15 ou push-teste)' }, 400);
    }
    if (!cronOk) {
      if (!chamador) return json({ error: 'não autorizado' }, 401);
      const { data: p } = await admin.from('profiles').select('role').eq('id', chamador.id).single();
      if (p?.role !== 'master') return json({ error: 'sem permissão' }, 403);
    }
    if (modo === 'manha') return json(await executarManha({ dryRun: !!body.dryRun, refData: body.refData || null }));
    if (modo === 'antes15') return json(await executarAntes15({ dryRun: !!body.dryRun }));
    const teste = body.teste && typeof body.teste.email === 'string' ? { email: body.teste.email } : null;
    // Envio manual pelo master: { modo: 'diario'|'semanal', apenas: <user_id> } — exige master (não vale o segredo do agendador)
    if (body.apenas && !chamador && !(cronOk && teste)) return json({ error: 'envio manual exige um master logado' }, 403);
    return json(await executar(modo, { teste, dryRun: !!body.dryRun, refData: body.refData || null, preview: !!body.preview, apenas: body.apenas || null } as any));
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
