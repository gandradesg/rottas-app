// Master: gerencia listas (imobiliárias, empreendimentos, motivos visita, motivos órulo)
import { el, icon, toast, confirmModal, modal, loadingBtn } from '../ui.js';
import { shell } from './shell.js';
import { supabase, loadLists, state } from '../supabase.js';

// Cada tab pode ter `extraFields` (lista de campos além do `nome`)
// e `displayExtra(item)` para mostrar metadado adicional na linha
const TABS = [
  { id: 'imobiliarias',    table: 'imobiliarias',    label: 'Imobiliárias',      stateKey: 'imobiliarias' },
  { id: 'locais_visita',   table: 'locais_visita',   label: 'Locais de visita',  stateKey: 'locaisVisita' },
  {
    id: 'empreendimentos', table: 'empreendimentos', label: 'Empreendimentos',   stateKey: 'empreendimentos',
    extraFields: [
      { key: 'link_url', label: 'Link do produto (opcional)', type: 'url', placeholder: 'https://...' }
    ],
    displayExtra: (item) => item.link_url
      ? el('a', { href: item.link_url, target: '_blank', class: 'text-xs text-rottas-500 hover:underline truncate' }, '🔗 ' + item.link_url.replace(/^https?:\/\//, '').slice(0, 40))
      : null,
  },
  { id: 'motivos_visita',  table: 'motivos_visita',  label: 'Motivos de visita', stateKey: 'motivosVisita' },
  { id: 'motivos_orulo',   table: 'motivos_orulo',   label: 'Motivos Órulo',     stateKey: 'motivosOrulo' },
  { id: 'motivos_dwv',     table: 'motivos_dwv',     label: 'Motivos DWV',       stateKey: 'motivosDwv' },
  {
    id: 'cidades',         table: 'cidades',         label: 'Cidades',           stateKey: 'cidades',
    extraFields: [
      { key: 'estado', label: 'Estado', type: 'select', options: ['PR','SC'], required: true }
    ],
    displayExtra: (item) => el('span', { class: 'text-xs text-fg-muted ml-2' }, item.estado || ''),
  },
];

export async function masterListasView(_params, app) {
  let activeId = 'imobiliarias';

  const content = el('div', { class: 'flex flex-col gap-4' });

  content.appendChild(el('div', {},
    el('h1', { class: 'text-2xl font-extrabold' }, 'Listas'),
    el('p', { class: 'text-sm text-fg-muted' }, 'Cadastros usados nos formulários do app'),
  ));

  const tabBar = el('div', { class: 'flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4' });
  const dash = el('div', { class: 'flex flex-col gap-3' });
  content.append(tabBar, dash);

  app.appendChild(shell(content, { title: 'Listas' }));

  function renderTabs() {
    tabBar.innerHTML = '';
    TABS.forEach(t => {
      tabBar.appendChild(el('button', {
        class: 'btn btn-sm flex-shrink-0 ' + (activeId === t.id ? 'btn-primary' : 'btn-secondary'),
        onclick: () => { activeId = t.id; renderActive(); }
      }, t.label));
    });
  }

  async function renderActive() {
    renderTabs();
    const tab = TABS.find(t => t.id === activeId);
    dash.innerHTML = '';
    const items = state[tab.stateKey] || [];

    const addBtn = el('button', {
      class: 'btn btn-primary flex-1',
      onclick: () => openCreate(tab)
    }, icon('plus', 16), 'Novo item');
    const importBtn = el('button', {
      class: 'btn btn-secondary flex-1',
      onclick: () => openImport(tab)
    }, icon('download', 16), 'Importar lista');
    dash.appendChild(el('div', { class: 'flex gap-2' }, addBtn, importBtn));

    if (!items.length) {
      dash.appendChild(el('div', { class: 'card p-8 text-center text-fg-muted' }, 'Nenhum item ainda. Adicione o primeiro.'));
      return;
    }

    items.forEach(it => {
      const extra = tab.displayExtra ? tab.displayExtra(it) : null;
      dash.appendChild(el('div', { class: 'card p-3 flex items-center gap-3' },
        el('div', { class: 'flex-1 min-w-0' },
          el('div', { class: 'font-medium' }, it.nome),
          extra,
        ),
        el('button', {
          class: 'p-1.5 rounded hover:bg-bg-elev transition',
          onclick: () => openEdit(tab, it)
        }, icon('edit', 16, 'text-fg-muted')),
        el('button', {
          class: 'p-1.5 rounded hover:bg-bg-elev transition',
          onclick: async () => {
            const ok = await confirmModal({
              title: 'Excluir item?',
              message: `Excluir "${it.nome}"? Atividades existentes não serão afetadas.`,
              confirmLabel: 'Excluir', danger: true,
            });
            if (!ok) return;
            const { error } = await supabase.from(tab.table).delete().eq('id', it.id);
            if (error) return toast(error.message, 'error');
            await loadLists();
            renderActive();
            toast('Excluído', 'success');
          }
        }, icon('trash', 16, 'text-danger')),
      ));
    });
  }

  // Helper: renderiza um campo extra (input ou select) e retorna {el, getValue}
  function renderExtraField(extraDef, initial) {
    let inputEl;
    if (extraDef.type === 'select') {
      inputEl = el('select', { class: 'select' },
        el('option', { value: '' }, '—'),
        ...extraDef.options.map(o => el('option', { value: o, selected: initial === o }, o))
      );
    } else {
      inputEl = el('input', {
        class: 'input', type: extraDef.type || 'text',
        placeholder: extraDef.placeholder || '',
        value: initial || '',
      });
    }
    return {
      wrapper: el('div', {},
        el('label', { class: 'label ' + (extraDef.required ? 'label-required' : '') }, extraDef.label),
        inputEl,
      ),
      getValue: () => inputEl.value.trim() || null,
    };
  }

  function openCreate(tab) {
    const input = el('input', { class: 'input', placeholder: `Nome (ex: Imobiliária ABC)`, required: true });
    const extras = (tab.extraFields || []).map(ef => renderExtraField(ef, null));
    const submit = el('button', { class: 'btn btn-primary' }, 'Adicionar');
    const cancel = el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancelar');
    const m = modal({
      title: `Novo: ${tab.label}`,
      size: 'sm',
      content: el('div', { class: 'flex flex-col gap-3' },
        el('div', {}, el('label', { class: 'label label-required' }, 'Nome'), input),
        ...extras.map(e => e.wrapper),
      ),
      footer: [cancel, submit],
    });
    setTimeout(() => input.focus(), 50);
    submit.addEventListener('click', () => {
      const nome = input.value.trim();
      if (!nome) return toast('Informe o nome', 'error');
      // Coleta campos extras
      const extraData = {};
      (tab.extraFields || []).forEach((ef, i) => {
        const v = extras[i].getValue();
        if (ef.required && !v) {
          toast(`${ef.label} é obrigatório`, 'error');
          return;
        }
        extraData[ef.key] = v;
      });
      const payload = { nome, ...extraData };
      // UI otimista
      m.close();
      const tempItem = { id: 'temp-' + Date.now(), ...payload };
      state[tab.stateKey].push(tempItem);
      state[tab.stateKey].sort((a,b) => a.nome.localeCompare(b.nome));
      renderActive();
      supabase.from(tab.table).insert(payload).select().then(({ data, error }) => {
        const idx = state[tab.stateKey].indexOf(tempItem);
        if (error) {
          console.error('[lista insert] erro:', error);
          toast('Erro: ' + error.message, 'error', 5000);
          if (idx >= 0) state[tab.stateKey].splice(idx, 1);
          renderActive();
          return;
        }
        if (!data || !data.length) {
          toast('❌ Sem permissão para criar (RLS rejeitou)', 'error', 6000);
          if (idx >= 0) state[tab.stateKey].splice(idx, 1);
          renderActive();
          return;
        }
        if (idx >= 0) state[tab.stateKey][idx] = data[0];
        renderActive();
        toast('✓ Adicionado', 'success', 2000);
      });
    });
  }

  function openEdit(tab, item) {
    const input = el('input', { class: 'input', value: item.nome });
    const extras = (tab.extraFields || []).map(ef => renderExtraField(ef, item[ef.key]));
    const submit = el('button', { class: 'btn btn-primary' }, 'Salvar');
    const cancel = el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancelar');
    const m = modal({
      title: `Editar: ${tab.label}`,
      size: 'sm',
      content: el('div', { class: 'flex flex-col gap-3' },
        el('div', {}, el('label', { class: 'label' }, 'Nome'), input),
        ...extras.map(e => e.wrapper),
      ),
      footer: [cancel, submit],
    });
    setTimeout(() => input.focus(), 60);
    submit.addEventListener('click', () => {
      const nome = input.value.trim();
      if (!nome) return;
      // Snapshot pra rollback se falhar
      const snapshot = { ...item };
      const patch = { nome };
      (tab.extraFields || []).forEach((ef, i) => {
        patch[ef.key] = extras[i].getValue();
      });
      // UI otimista
      m.close();
      Object.assign(item, patch);
      renderActive();
      supabase.from(tab.table).update(patch).eq('id', item.id).select().then(({ data, error }) => {
        if (error) {
          console.error('[lista update] erro:', error);
          Object.assign(item, snapshot); renderActive();
          toast('Erro: ' + error.message, 'error', 5000);
          return;
        }
        if (!data || !data.length) {
          Object.assign(item, snapshot); renderActive();
          toast('❌ Sem permissão para editar (RLS rejeitou)', 'error', 6000);
          return;
        }
        toast('✓ Atualizado', 'success', 2000);
      });
    });
  }

  // Importa lista em massa: aceita texto colado (1 nome por linha) ou arquivo .txt/.csv
  function openImport(tab) {
    const textArea = el('textarea', {
      class: 'input',
      rows: 8,
      placeholder: 'Cole aqui a lista, um nome por linha:\n\nImobiliária ABC\nImobiliária XYZ\nLopes Imóveis\n...',
      style: { resize: 'vertical', minHeight: '160px', fontFamily: 'monospace' },
    });
    const fileInput = el('input', {
      type: 'file',
      accept: '.txt,.csv',
      class: 'input',
      onchange: async () => {
        const f = fileInput.files?.[0];
        if (!f) return;
        const txt = await f.text();
        textArea.value = txt;
      },
    });
    const previewEl = el('div', { class: 'text-xs text-fg-muted' });
    function updatePreview() {
      const lines = textArea.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const unique = [...new Set(lines)];
      const existing = (state[tab.stateKey] || []).map(x => x.nome.toLowerCase());
      const novos = unique.filter(n => !existing.includes(n.toLowerCase()));
      const dups = unique.length - novos.length;
      previewEl.textContent = `Total: ${lines.length} · Únicos: ${unique.length} · Novos: ${novos.length}${dups ? ` · Já existem: ${dups}` : ''}`;
      return novos;
    }
    textArea.addEventListener('input', updatePreview);

    const submit = el('button', { class: 'btn btn-primary' }, 'Importar');
    const cancel = el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancelar');

    const m = modal({
      title: `Importar ${tab.label}`,
      size: 'md',
      content: el('div', { class: 'flex flex-col gap-3' },
        el('p', { class: 'text-sm text-fg-muted' },
          'Cole abaixo OU envie um arquivo .txt/.csv com um nome por linha. Itens duplicados (já existentes) são ignorados automaticamente.'),
        el('div', {},
          el('label', { class: 'label text-xs' }, 'Arquivo (opcional)'),
          fileInput,
        ),
        el('div', {},
          el('label', { class: 'label text-xs' }, 'Ou cole aqui'),
          textArea,
        ),
        previewEl,
      ),
      footer: [cancel, submit],
    });
    setTimeout(() => textArea.focus(), 80);
    updatePreview();

    submit.addEventListener('click', async () => {
      const novos = updatePreview();
      if (!novos.length) {
        toast('Nenhum item novo para importar', 'warning');
        return;
      }
      loadingBtn(submit, true);

      // 1 query rápida em vez de N sequenciais. upsert com ignoreDuplicates
      // pula linhas que violariam o UNIQUE(nome) sem quebrar o batch inteiro.
      // Para tabela `cidades` (UNIQUE composto nome+estado), so importa nome puro.
      const rows = novos.map(nome => ({ nome }));
      try {
        const { data, error } = await supabase
          .from(tab.table)
          .upsert(rows, { onConflict: 'nome', ignoreDuplicates: true })
          .select();

        if (error) throw error;

        const inseridos = data?.length || 0;
        const duplicados = novos.length - inseridos;

        loadingBtn(submit, false);
        await loadLists();
        m.close();
        renderActive();

        let msg = '';
        if (inseridos > 0) msg += `✓ ${inseridos} importado${inseridos!==1?'s':''}`;
        if (duplicados > 0) msg += (msg ? ' · ' : '') + `${duplicados} já existia${duplicados!==1?'m':''} (ignorado)`;
        toast(msg || 'Nada novo pra importar', inseridos > 0 ? 'success' : 'info', 5000);
      } catch (err) {
        loadingBtn(submit, false);
        console.error('[import] erro:', err);
        toast('Erro ao importar: ' + (err.message || err), 'error', 6000);
      }
    });
  }

  renderActive();
}
