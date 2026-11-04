// Sincronização de agenda com Microsoft / Google / Apple Calendar via .ics (RFC 5545)
// Funciona em qualquer cliente de email/calendar (Outlook, Google Calendar, Apple Calendar)
// SEM OAuth, sem configuração - download direto do arquivo .ics
//
// Como o usuário usa:
//   1. Clica "Adicionar ao calendário" num agendamento
//   2. Browser baixa um arquivo .ics
//   3. Abre o arquivo → cliente do sistema (Outlook, Calendário do Mac, etc) abre o evento
//   4. Confirma → evento entra na agenda dele
//
// Alternativa "Google Calendar" (link direto, sem download):
//   buildGoogleCalendarUrl() retorna URL que abre o Google Calendar pré-preenchido.

import { TIPO_ATIVIDADE } from './config.js';

// ─── SINCRONIZAÇÃO AUTOMÁTICA COM O OUTLOOK ─────────────────────────────────
// Depois de criar/editar/remarcar/cancelar um agendamento, avisa o servidor
// (função agenda-outlook), que manda um CONVITE DE CALENDÁRIO por e-mail para
// quem ligou "Agenda no Outlook" no Perfil. O Outlook põe na agenda sozinho e
// atualiza/remove o mesmo evento a cada mudança (agenda repetida vai como série).
// "Dispare e esqueça": nunca trava nem atrasa a tela.
export function sincronizarOutlook(ids) {
  const lista = [...new Set((ids || []).filter(Boolean))];
  if (!lista.length) return;
  import('./supabase.js')
    .then(({ supabase }) => supabase.functions.invoke('agenda-outlook', { body: { ids: lista } }))
    .catch(() => {});
}

// Formata Date para ICS (UTC, formato YYYYMMDDTHHMMSSZ)
function icsDate(d) {
  const dt = new Date(d);
  return dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// Escapa caracteres especiais segundo RFC 5545
function icsEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Constrói a regra de recorrência (RRULE, RFC 5545) a partir dos campos do
// agendamento. Retorna null quando não é recorrente.
export function recorrenciaRule(ag) {
  if (!ag || !ag.recorrencia_freq) return null;
  const n = Math.max(parseInt(ag.recorrencia_total, 10) || 0, 1);
  const map = {
    diaria: 'FREQ=DAILY',
    semanal: 'FREQ=WEEKLY',
    quinzenal: 'FREQ=WEEKLY;INTERVAL=2',
    mensal: 'FREQ=MONTHLY',
  };
  const base = map[ag.recorrencia_freq];
  return base ? `${base};COUNT=${n}` : null;
}

// Gera arquivo ICS de um agendamento
export function buildIcsForAgendamento(ag) {
  const tipo = TIPO_ATIVIDADE[ag.tipo];
  const start = new Date(ag.data_prevista);
  const end = ag.data_fim ? new Date(ag.data_fim) : new Date(start.getTime() + 60 * 60 * 1000); // sem término: 1h
  // Série recorrente: mesmo UID pra todas as ocorrências → o calendário trata
  // como UM evento recorrente (não duplica se importar de ocorrências diferentes).
  const rrule = recorrenciaRule(ag);
  const uid = (rrule && ag.recorrencia_id) ? `${ag.recorrencia_id}@imobrottas.app` : `${ag.id}@imobrottas.app`;
  const summary = (tipo?.label || ag.tipo) + (ag.titulo ? ` - ${ag.titulo}` : '');
  const locationParts = [ag.local_visita, ag.imobiliaria, ag.empreendimento].filter(Boolean);
  const description = [
    tipo?.label && `Tipo: ${tipo.label}`,
    ag.imobiliaria && `Imobiliária: ${ag.imobiliaria}`,
    ag.empreendimento && `Empreendimento: ${ag.empreendimento}`,
    ag.cliente && `Cliente: ${ag.cliente}`,
    ag.corretor && `Corretor: ${ag.corretor}`,
    ag.motivo_visita && `Motivo: ${ag.motivo_visita}`,
    ag.observacoes && `\nObs: ${ag.observacoes}`,
    '\nRegistrado pelo app Imob Rottas',
  ].filter(Boolean).join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Imob Rottas//Agenda//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    rrule && `RRULE:${rrule}`,
    `SUMMARY:${icsEscape(summary)}`,
    locationParts.length && `LOCATION:${icsEscape(locationParts.join(' - '))}`,
    `DESCRIPTION:${icsEscape(description)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Lembrete: ' + icsEscape(summary),
    'TRIGGER:-PT30M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.join('\r\n');
}

// Trigger download do arquivo .ics
export function downloadIcs(ag) {
  const content = buildIcsForAgendamento(ag);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agenda-${ag.id.slice(0, 8)}.ics`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

// Agenda REPETIDA → arquivo com a SEQUÊNCIA a partir desta data, montada com o
// que está no banco: quantidade certa de datas (antes o total da série inteira
// era contado a partir de qualquer data), datas canceladas fora e datas
// remarcadas só nelas no horário novo. O Outlook/iPhone importa como série.
export async function downloadIcsSerie(ag) {
  const { supabase } = await import('./supabase.js');
  const { data, error } = await supabase.from('agendamentos')
    .select('id, data_prevista, data_fim, data_prevista_original, status')
    .eq('recorrencia_id', ag.recorrencia_id).eq('gerente_id', ag.gerente_id);
  if (error || !data || !data.length) { downloadIcs(ag); return; }
  const origem = (l) => new Date(l.data_prevista_original || l.data_prevista);
  const minhaOrigem = origem(ag).getTime();
  const linhas = data.filter(l => origem(l).getTime() >= minhaOrigem - 60000)
    .sort((x, y) => origem(x) - origem(y));
  if (!linhas.length) { downloadIcs(ag); return; }
  const fim = (l) => l.data_fim ? new Date(l.data_fim) : new Date(new Date(l.data_prevista).getTime() + 3600000);
  const primeira = linhas[0];
  const dur = fim(primeira) - new Date(primeira.data_prevista);
  const tipo = TIPO_ATIVIDADE[ag.tipo];
  const summary = (tipo?.label || ag.tipo) + (ag.titulo ? ` - ${ag.titulo}` : (ag.imobiliaria ? ` - ${ag.imobiliaria}` : ''));
  const loc = [ag.local_visita, ag.imobiliaria, ag.empreendimento].filter(Boolean).join(' - ');
  const freq = { diaria: 'FREQ=DAILY', semanal: 'FREQ=WEEKLY', quinzenal: 'FREQ=WEEKLY;INTERVAL=2', mensal: 'FREQ=MONTHLY' }[ag.recorrencia_freq] || 'FREQ=WEEKLY';
  const uid = `serie-${ag.recorrencia_id}-${String(ag.gerente_id).slice(0, 8)}@imobrottas.app`;
  const comuns = [`UID:${uid}`, `DTSTAMP:${icsDate(new Date())}`, `SUMMARY:${icsEscape(summary)}`,
    loc && `LOCATION:${icsEscape(loc)}`, ag.observacoes && `DESCRIPTION:${icsEscape(ag.observacoes)}`].filter(Boolean);
  const alarme = ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Lembrete', 'TRIGGER:-PT15M', 'END:VALARM'];
  const canceladas = linhas.filter(l => l.status === 'cancelado');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Imob Rottas//Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', ...comuns,
    `DTSTART:${icsDate(origem(primeira))}`, `DTEND:${icsDate(new Date(origem(primeira).getTime() + dur))}`,
    `RRULE:${freq};COUNT=${linhas.length}`,
    canceladas.length && `EXDATE:${canceladas.map(l => icsDate(origem(l))).join(',')}`,
    ...alarme, 'END:VEVENT'].filter(Boolean);
  for (const l of linhas) {
    if (l.status === 'cancelado') continue;
    const mudou = new Date(l.data_prevista).getTime() !== origem(l).getTime() || (fim(l) - new Date(l.data_prevista)) !== dur;
    if (!mudou) continue;
    L.push('BEGIN:VEVENT', ...comuns, `RECURRENCE-ID:${icsDate(origem(l))}`,
      `DTSTART:${icsDate(l.data_prevista)}`, `DTEND:${icsDate(fim(l))}`, ...alarme, 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  const blob = new Blob([L.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `sequencia-${String(ag.recorrencia_id).slice(0, 8)}.ics`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  return linhas.length - canceladas.length;
}

// URL pra abrir Google Calendar pré-preenchido (sem download)
export function buildGoogleCalendarUrl(ag) {
  const tipo = TIPO_ATIVIDADE[ag.tipo];
  const start = new Date(ag.data_prevista);
  const end = ag.data_fim ? new Date(ag.data_fim) : new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const summary = (tipo?.label || ag.tipo) + (ag.titulo ? ` - ${ag.titulo}` : '');
  const details = [
    ag.imobiliaria && `Imobiliária: ${ag.imobiliaria}`,
    ag.empreendimento && `Empreendimento: ${ag.empreendimento}`,
    ag.cliente && `Cliente: ${ag.cliente}`,
    ag.motivo_visita && `Motivo: ${ag.motivo_visita}`,
    ag.observacoes,
  ].filter(Boolean).join('\n');
  const location = [ag.local_visita, ag.imobiliaria].filter(Boolean).join(' - ');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: details,
    location: location,
  });
  const rrule = recorrenciaRule(ag);
  if (rrule) params.set('recur', 'RRULE:' + rrule); // evento recorrente no Google
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// URL para Outlook (suporta corporativo Office 365 E pessoal Outlook.com)
// outlook.office.com = corporativo (Microsoft 365 da empresa, ex: rottasconstrutora.com.br)
// outlook.live.com   = pessoal (Hotmail/Outlook.com)
export function buildOutlookCalendarUrl(ag, edition = 'office') {
  const tipo = TIPO_ATIVIDADE[ag.tipo];
  const start = new Date(ag.data_prevista);
  const end = ag.data_fim ? new Date(ag.data_fim) : new Date(start.getTime() + 60 * 60 * 1000);
  const summary = (tipo?.label || ag.tipo) + (ag.titulo ? ` - ${ag.titulo}` : '');
  const body = [
    ag.imobiliaria && `Imobiliária: ${ag.imobiliaria}`,
    ag.empreendimento && `Empreendimento: ${ag.empreendimento}`,
    ag.cliente && `Cliente: ${ag.cliente}`,
    ag.motivo_visita && `Motivo: ${ag.motivo_visita}`,
    ag.observacoes,
  ].filter(Boolean).join('\n');
  const location = [ag.local_visita, ag.imobiliaria].filter(Boolean).join(' - ');
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: summary,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: body,
    location: location,
  });
  const domain = edition === 'live' ? 'outlook.live.com' : 'outlook.office.com';
  return `https://${domain}/calendar/0/deeplink/compose?${params.toString()}`;
}

// Helper UI: cria um botão "Adicionar ao calendário" com menu de escolha
export function calendarButton(ag, { el, icon, toast, state }) {
  const showInfo = (msg) => {
    if (toast) toast(msg, 'info', 5000);
  };
  // O link do Outlook na web só sabe criar UM evento — numa agenda repetida ia
  // só a primeira data. Para repetidas, o caminho é o arquivo (série completa)
  // ou, melhor, a sincronização automática do Perfil.
  const repetida = !!recorrenciaRule(ag);
  const automatico = !!(state && state.profile && state.profile.agenda_outlook);
  // A sincronização automática só aparece quando o banco já tem a opção (coluna).
  const recursoAuto = !!(state && state.profile && ('agenda_outlook' in state.profile));
  const dropdown = el('div', {
    class: 'absolute right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg p-1 z-20 hidden flex-col gap-0.5 min-w-[250px] max-w-[290px]',
  },
    !recursoAuto ? null : automatico
      ? el('div', { class: 'text-xs px-3 py-2 rounded bg-bg-elev text-success font-semibold' },
          '✓ Sincronização automática ligada: este compromisso já vai (e se atualiza) sozinho no seu Outlook.')
      : el('a', { class: 'text-xs px-3 py-2 rounded hover:bg-bg-elev block text-rottas-500 font-semibold', href: '#/perfil',
          onclick: () => dropdown.classList.add('hidden') },
          '⚡ Ligar a sincronização automática com o Outlook (Perfil)'),
    el('div', { class: 'text-[10px] text-fg-muted uppercase tracking-wider font-bold px-3 pt-2 pb-1' }, 'Corporativo (Microsoft 365)'),
    repetida
      ? el('button', {
          class: 'text-left text-sm px-3 py-2 rounded hover:bg-bg-elev w-full transition',
          onclick: async (e) => {
            e.stopPropagation(); dropdown.classList.add('hidden');
            const n = await downloadIcsSerie(ag);
            showInfo(`📥 Abra o arquivo baixado: o Outlook adiciona a sequência${n ? ` (${n} datas a partir desta)` : ''} de uma vez.`);
          },
        }, '📨 Outlook 365 — sequência completa (arquivo)')
      : el('a', {
          class: 'text-sm px-3 py-2 rounded hover:bg-bg-elev block transition',
          href: buildOutlookCalendarUrl(ag, 'office'), target: '_blank',
          onclick: () => { dropdown.classList.add('hidden'); showInfo('⚠ Clique SALVAR na aba do Outlook que abriu para confirmar o evento na sua agenda.'); },
        }, '📨 Outlook 365 (corporativo)'),
    el('div', { class: 'text-[10px] text-fg-muted uppercase tracking-wider font-bold px-3 pt-2 pb-1' }, 'Outras opções'),
    el('button', {
      class: 'text-left text-sm px-3 py-2 rounded hover:bg-bg-elev w-full transition',
      onclick: (e) => { e.stopPropagation(); downloadIcs(ag); dropdown.classList.add('hidden'); showInfo('📥 Arquivo .ics baixado. Abra-o para importar para qualquer calendário (Outlook desktop, Apple Calendar, etc).'); }
    }, '📥 Baixar arquivo .ics'),
    el('a', {
      class: 'text-sm px-3 py-2 rounded hover:bg-bg-elev block transition',
      href: buildGoogleCalendarUrl(ag), target: '_blank',
      onclick: () => { dropdown.classList.add('hidden'); showInfo('Clique SALVAR no Google Calendar que abriu para confirmar.'); },
    }, '📅 Google Calendar'),
    repetida ? null : el('a', {
      class: 'text-sm px-3 py-2 rounded hover:bg-bg-elev block transition',
      href: buildOutlookCalendarUrl(ag, 'live'), target: '_blank',
      onclick: () => { dropdown.classList.add('hidden'); showInfo('Clique SALVAR na aba do Outlook.com.'); },
    }, '👤 Outlook.com (pessoal)'),
  );
  const wrapper = el('div', { class: 'relative inline-block' },
    el('button', {
      class: 'btn btn-ghost btn-sm flex items-center gap-1 group',
      title: 'Sincronizar com calendário',
      'aria-label': 'Sincronizar com calendário',
      onclick: (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
        dropdown.classList.toggle('flex');
      },
    }, icon('calendar', 14), el('span', { class: 'hidden group-hover:inline text-xs font-semibold' }, 'Calendário')),
    dropdown,
  );
  document.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    dropdown.classList.remove('flex');
  }, { once: false });
  return wrapper;
}
