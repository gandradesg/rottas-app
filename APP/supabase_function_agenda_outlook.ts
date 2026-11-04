// Edge Function: agenda-outlook
// Mantém a agenda do app SINCRONIZADA com o Outlook (365, desktop e celular)
// sem nenhuma configuração da TI: manda um CONVITE DE CALENDÁRIO por e-mail
// (iMIP, RFC 6047) — o mesmo mecanismo de quando alguém marca uma reunião.
// O Exchange/Outlook coloca o compromisso na agenda sozinho e, como o
// identificador (UID) é sempre o mesmo, cada novo envio ATUALIZA o evento
// (horário, local, sequência) ou o REMOVE (cancelamento). Nada de duplicar.
//
// Agenda repetida = UM evento recorrente no Outlook (RRULE), com as exceções:
//   • data remarcada só nela → ocorrência alterada (RECURRENCE-ID);
//   • data cancelada → excluída da série (EXDATE).
//
// Só envia para quem LIGOU a sincronização no Perfil (profiles.agenda_outlook).
//
// POST { ids: uuid[] }            → sincroniza os agendamentos (e a série de cada um)
// POST { teste: true }            → manda um evento de teste para quem chamou
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.13';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Content-Type': 'application/json',
};
const resp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: cors });

const TIPOS: Record<string, string> = { checkin: 'Check-in', atendimento: 'Atendimento', outro: 'Outro' };
const UMA_HORA = 60 * 60 * 1000;

const icsData = (d: Date | string) => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
const esc = (s: unknown) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Linhas de até 75 octetos (RFC 5545) — o Outlook é exigente com isso.
function dobrar(linha: string): string {
  const enc = new TextEncoder();
  if (enc.encode(linha).length <= 75) return linha;
  const partes: string[] = []; let atual = '';
  for (const ch of linha) {
    if (enc.encode(atual + ch).length > (partes.length ? 74 : 75)) { partes.push(atual); atual = ch; }
    else atual += ch;
  }
  partes.push(atual);
  return partes.join('\r\n ');
}

function tituloDe(a: any) {
  const t = TIPOS[a.tipo] || 'Agenda';
  const alvo = a.tipo === 'outro' ? (a.titulo || a.imobiliaria) : (a.imobiliaria || a.titulo);
  return alvo ? `${t} · ${alvo}` : t;
}
function descricaoDe(a: any) {
  return [
    a.imobiliaria && `Imobiliária: ${a.imobiliaria}`,
    a.empreendimento && `Empreendimento: ${a.empreendimento}`,
    a.cliente && `Cliente: ${a.cliente}`,
    a.corretor && `Corretor: ${a.corretor}`,
    a.motivo_visita && `Motivo: ${a.motivo_visita}`,
    a.observacoes && `Obs.: ${a.observacoes}`,
    '',
    `Registrar no app: https://plataformarottas.vercel.app/#/agenda/${a.id}/realizar`,
  ].filter((x) => x !== null && x !== undefined && x !== false).join('\n');
}
const localDe = (a: any) => [a.local_visita, a.imobiliaria].filter(Boolean).join(' - ');
const fimDe = (a: any) => a.data_fim ? new Date(a.data_fim) : new Date(new Date(a.data_prevista).getTime() + UMA_HORA);

const RRULE: Record<string, string> = {
  diaria: 'FREQ=DAILY', semanal: 'FREQ=WEEKLY', quinzenal: 'FREQ=WEEKLY;INTERVAL=2', mensal: 'FREQ=MONTHLY',
};

// Monta o calendário (REQUEST = criar/atualizar; CANCEL = remover) de UMA unidade:
// um agendamento avulso, ou a série inteira de uma pessoa.
function montarIcs(unidade: { uid: string; linhas: any[]; serie: boolean }, para: { email: string; nome: string }, remetente: string) {
  const seq = Math.floor(Date.now() / 1000) - 1_790_000_000;   // sempre maior que o anterior
  const ativos = unidade.linhas.filter((l) => l.status !== 'cancelado');
  const metodo = ativos.length ? 'REQUEST' : 'CANCEL';
  const L: string[] = ['BEGIN:VCALENDAR', 'PRODID:-//Imob Rottas//Agenda//PT-BR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', `METHOD:${metodo}`];
  const cabecalho = (a: any, status = 'CONFIRMED') => [
    `UID:${unidade.uid}`,
    `SEQUENCE:${seq}`,
    `DTSTAMP:${icsData(new Date())}`,
    `ORGANIZER;CN=Imob Rottas:mailto:${remetente}`,
    `ATTENDEE;CN=${esc(para.nome)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${para.email}`,
    `SUMMARY:${esc(tituloDe(a))}`,
    localDe(a) ? `LOCATION:${esc(localDe(a))}` : '',
    `DESCRIPTION:${esc(descricaoDe(a))}`,
    `STATUS:${status}`,
    'TRANSP:OPAQUE',
  ].filter(Boolean);
  const alarme = ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Lembrete', 'TRIGGER:-PT15M', 'END:VALARM'];

  if (!unidade.serie) {
    const a = unidade.linhas[0];
    L.push('BEGIN:VEVENT', ...cabecalho(a, metodo === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'),
      `DTSTART:${icsData(a.data_prevista)}`, `DTEND:${icsData(fimDe(a))}`, ...alarme, 'END:VEVENT');
  } else {
    // Série: a regra parte da 1ª data ORIGINAL; cada linha tem sua data "de nascença".
    const linhas = [...unidade.linhas].sort((x, y) =>
      new Date(x.data_prevista_original || x.data_prevista).getTime() - new Date(y.data_prevista_original || y.data_prevista).getTime());
    const origem = (l: any) => new Date(l.data_prevista_original || l.data_prevista);
    const base = linhas[0];
    const dur = fimDe(base).getTime() - new Date(base.data_prevista).getTime();
    const freq = RRULE[base.recorrencia_freq] || 'FREQ=WEEKLY';
    const mestre = ['BEGIN:VEVENT', ...cabecalho(base, metodo === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'),
      `DTSTART:${icsData(origem(base))}`, `DTEND:${icsData(new Date(origem(base).getTime() + dur))}`,
      `RRULE:${freq};COUNT=${linhas.length}`];
    const canceladas = linhas.filter((l) => l.status === 'cancelado');
    if (metodo === 'REQUEST' && canceladas.length) mestre.push(`EXDATE:${canceladas.map((l) => icsData(origem(l))).join(',')}`);
    mestre.push(...alarme, 'END:VEVENT');
    L.push(...mestre);
    if (metodo === 'REQUEST') {
      // Ocorrências que saíram do "ritmo" (remarcadas, outro término, outro conteúdo)
      for (const l of linhas) {
        if (l.status === 'cancelado') continue;
        const mudouHora = new Date(l.data_prevista).getTime() !== origem(l).getTime();
        const mudouFim = (fimDe(l).getTime() - new Date(l.data_prevista).getTime()) !== dur;
        if (!mudouHora && !mudouFim) continue;
        L.push('BEGIN:VEVENT', ...cabecalho(l), `RECURRENCE-ID:${icsData(origem(l))}`,
          `DTSTART:${icsData(l.data_prevista)}`, `DTEND:${icsData(fimDe(l))}`, ...alarme, 'END:VEVENT');
      }
    }
  }
  L.push('END:VCALENDAR');
  return { metodo, ics: L.map(dobrar).join('\r\n') + '\r\n' };
}

let _transp: any = null;
function transporte() {
  if (!_transp) _transp = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com', port: 587, secure: false,
    auth: { user: Deno.env.get('BREVO_SMTP_USER')!, pass: Deno.env.get('BREVO_SMTP_PASS')! },
  });
  return _transp;
}

async function enviar(para: { email: string; nome: string }, unidade: { uid: string; linhas: any[]; serie: boolean }) {
  const remetente = Deno.env.get('SENDER_EMAIL')!;
  const { metodo, ics } = montarIcs(unidade, para, remetente);
  const a = unidade.linhas.find((l) => l.status !== 'cancelado') || unidade.linhas[0];
  const quando = new Date(a.data_prevista).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const assunto = metodo === 'CANCEL'
    ? `Cancelado: ${tituloDe(a)}`
    : `${tituloDe(a)} — ${quando}${unidade.serie ? ' (repete)' : ''}`;
  await transporte().sendMail({
    from: `"Imob Rottas" <${remetente}>`,
    to: para.email,
    subject: assunto,
    text: `${assunto}\n\nEste compromisso foi sincronizado automaticamente pelo app Imob Rottas.`,
    icalEvent: { method: metodo, filename: 'agenda.ics', content: ics },
  });
  return metodo;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get('Authorization') || '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: { user } } = await admin.auth.getUser(auth.replace('Bearer ', ''));
    if (!user) return resp({ error: 'Não autenticado' }, 401);
    const corpo = await req.json().catch(() => ({}));

    // Teste: um evento daqui a 1h para quem chamou (mesmo com a opção desligada).
    if (corpo.teste) {
      const { data: eu } = await admin.from('profiles').select('nome, email').eq('id', user.id).single();
      if (!eu?.email) return resp({ error: 'Seu perfil está sem e-mail.' }, 400);
      const ini = new Date(Date.now() + UMA_HORA); ini.setMinutes(0, 0, 0);
      await enviar({ email: eu.email, nome: eu.nome }, {
        uid: `teste-${user.id}@imobrottas.app`, serie: false,
        linhas: [{ id: 'teste', tipo: 'outro', titulo: 'Teste de sincronização', data_prevista: ini.toISOString(), status: 'pendente',
          observacoes: 'Se este compromisso apareceu na sua agenda do Outlook, a sincronização está funcionando. Pode apagar.' }],
      });
      return resp({ ok: true, para: eu.email });
    }

    const ids: string[] = Array.isArray(corpo.ids) ? corpo.ids.filter((x: unknown) => typeof x === 'string').slice(0, 500) : [];
    if (!ids.length) return resp({ ok: true, enviados: 0 });

    // Só o que QUEM CHAMOU pode ver (as regras de acesso do banco valem aqui).
    const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    });
    const { data: vistos, error } = await comoUsuario.from('agendamentos').select('id, gerente_id, recorrencia_id').in('id', ids);
    if (error) return resp({ error: error.message }, 400);
    if (!vistos?.length) return resp({ ok: true, enviados: 0 });

    // Quem recebe: só quem ligou a sincronização com o Outlook.
    const pessoasIds = [...new Set(vistos.map((v) => v.gerente_id))];
    const { data: pessoas } = await admin.from('profiles').select('id, nome, email, agenda_outlook, ativo').in('id', pessoasIds);
    const recebe = new Map((pessoas || []).filter((p) => p.agenda_outlook && p.ativo !== false && p.email).map((p) => [p.id, p]));
    if (!recebe.size) return resp({ ok: true, enviados: 0, motivo: 'ninguém com a sincronização ligada' });

    const colunas = 'id, gerente_id, tipo, data_prevista, data_fim, data_prevista_original, imobiliaria, empreendimento, cliente, corretor, titulo, observacoes, status, motivo_visita, local_visita, recorrencia_id, recorrencia_freq';
    const unidades = new Map<string, { uid: string; linhas: any[]; serie: boolean; pessoa: string }>();
    for (const v of vistos) {
      if (!recebe.has(v.gerente_id)) continue;
      if (v.recorrencia_id) {
        const chave = `${v.recorrencia_id}|${v.gerente_id}`;
        if (!unidades.has(chave)) unidades.set(chave, { uid: `serie-${v.recorrencia_id}-${v.gerente_id.slice(0, 8)}@imobrottas.app`, linhas: [], serie: true, pessoa: v.gerente_id });
      } else {
        unidades.set(v.id, { uid: `${v.id}@imobrottas.app`, linhas: [], serie: false, pessoa: v.gerente_id });
      }
    }
    for (const [chave, u] of unidades) {
      if (u.serie) {
        const [rec] = chave.split('|');
        const { data } = await admin.from('agendamentos').select(colunas).eq('recorrencia_id', rec).eq('gerente_id', u.pessoa);
        u.linhas = data || [];
      } else {
        const { data } = await admin.from('agendamentos').select(colunas).eq('id', chave);
        u.linhas = data || [];
      }
    }
    const resultado: unknown[] = [];
    for (const u of unidades.values()) {
      if (!u.linhas.length) continue;
      const p = recebe.get(u.pessoa)!;
      try { resultado.push({ para: p.nome, acao: await enviar({ email: p.email, nome: p.nome }, u) }); }
      catch (e) { resultado.push({ para: p.nome, erro: (e as Error).message }); }
    }
    return resp({ ok: true, enviados: resultado.length, resultado });
  } catch (e) {
    return resp({ error: (e as Error).message || 'Erro interno' }, 500);
  }
});
