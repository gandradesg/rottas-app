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

// Gera arquivo ICS de um agendamento
export function buildIcsForAgendamento(ag) {
  const tipo = TIPO_ATIVIDADE[ag.tipo];
  const start = new Date(ag.data_prevista);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // duração default 1h
  const uid = `${ag.id}@imobrottas.app`;
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

// URL pra abrir Google Calendar pré-preenchido (sem download)
export function buildGoogleCalendarUrl(ag) {
  const tipo = TIPO_ATIVIDADE[ag.tipo];
  const start = new Date(ag.data_prevista);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
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
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// URL para Outlook (suporta corporativo Office 365 E pessoal Outlook.com)
// outlook.office.com = corporativo (Microsoft 365 da empresa, ex: rottasconstrutora.com.br)
// outlook.live.com   = pessoal (Hotmail/Outlook.com)
export function buildOutlookCalendarUrl(ag, edition = 'office') {
  const tipo = TIPO_ATIVIDADE[ag.tipo];
  const start = new Date(ag.data_prevista);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
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
export function calendarButton(ag, { el, icon, toast }) {
  const showInfo = (msg) => {
    if (toast) toast(msg, 'info', 5000);
  };
  const dropdown = el('div', {
    class: 'absolute right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg p-1 z-20 hidden flex-col gap-0.5 min-w-[230px]',
  },
    el('div', { class: 'text-[10px] text-fg-muted uppercase tracking-wider font-bold px-3 pt-2 pb-1' }, 'Corporativo (Microsoft 365)'),
    el('a', {
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
    el('a', {
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
