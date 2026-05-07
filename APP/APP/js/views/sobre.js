// Tela "Sobre" — versão e changelog
import { el, icon } from '../ui.js';
import { shell } from './shell.js';
import { APP_VERSION, APP_BUILD_DATE, CHANGELOG } from '../config.js';

export async function sobreView(_params, app) {
  const content = el('div', { class: 'flex flex-col gap-4' },
    // Cabeçalho
    el('div', { class: 'card p-6 text-center flex flex-col items-center gap-2' },
      el('img', { src: '/assets/logo-rottas.png', class: 'h-14' }),
      el('h1', { class: 'text-2xl font-extrabold mt-2' }, 'Plataforma de Gerentes'),
      el('div', { class: 'text-sm text-fg-muted' }, 'Rottas Construtora e Incorporadora'),
      el('div', { class: 'mt-3 flex items-center gap-2' },
        el('span', {
          class: 'chip chip-orange font-mono',
          style: { fontSize: '0.85rem', padding: '0.25rem 0.6rem' }
        }, 'v' + APP_VERSION),
        el('span', { class: 'text-xs text-fg-subtle' }, 'build ' + APP_BUILD_DATE),
      ),
    ),

    // Histórico de versões
    el('div', {},
      el('h2', { class: 'text-xs font-bold uppercase tracking-wider text-fg-subtle mb-2 px-1' },
        '📜 Histórico de versões (' + CHANGELOG.length + ')'),
      el('div', { class: 'flex flex-col gap-3' },
        ...CHANGELOG.map((c, i) => el('div', {
          class: 'card p-4 ' + (i === 0 ? 'border-rottas-300' : '')
        },
          el('div', { class: 'flex items-center justify-between mb-2' },
            el('div', { class: 'flex items-center gap-2' },
              el('span', {
                class: 'font-mono font-bold text-sm chip ' + (i === 0 ? 'chip-orange' : '')
              }, 'v' + c.version),
              i === 0 && el('span', { class: 'chip chip-green text-[10px]' }, 'Atual'),
            ),
            el('span', { class: 'text-xs text-fg-muted' }, c.date),
          ),
          el('ul', { class: 'list-disc list-inside text-sm space-y-1 text-fg-muted' },
            ...c.changes.map(ch => el('li', {}, ch))
          ),
        )),
      ),
    ),
  );

  app.appendChild(shell(content, { title: 'Sobre o app', back: true, hideBottomNav: true }));
}
