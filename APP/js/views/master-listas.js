// Master: gerencia listas (imobiliárias, empreendimentos, motivos visita, motivos órulo)
import { el, icon, toast, confirmModal, modal, loadingBtn } from '../ui.js';
import { shell } from './shell.js';
import { supabase, loadLists, state } from '../supabase.js';
import { phoneInput, emailInput } from '../components/form-fields.js';

// Cada tab pode ter `extraFields` (lista de campos além do `nome`)
// e `displayExtra(item)` para mostrar metadado adicional na linha
const TABS = [
  {
    id: 'imobiliarias',    table: 'imobiliarias',    label: 'Imobiliárias',      stateKey: 'imobiliarias',
    extraFields: [
      { key: 'cidade', label: 'Cidade', type: 'text', placeholder: 'Ex: Curitiba', required: true },
      { key: 'estado', label: 'Estado', type: 'select', options: ['PR','SC'], required: true },
    ],
    // Import CSV: "Nome;Cidade;Estado"
    importColumns: ['nome', 'cidade', 'estado'],
    displayExtra: (item) => (item.cidade || item.estado)
      ? el('span', { class: 'text-xs text-fg-muted' },
          '📍 ' + [item.cidade, item.estado].filter(Boolean).join(' · '))
      : null,
  },
  { id: 'locais_visita',   table: 'locais_visita',   label: 'Locais de visita',  stateKey: 'locaisVisita' },
  {
    id: 'empreendimentos', table: 'empreendimentos', label: 'Empreendimentos',   stateKey: 'empreendimentos',
    extraFields: [
      { key: 'cidade', label: 'Cidade-sede', type: 'text', placeholder: 'Ex: Ponta Grossa' },
      { key: 'estado', label: 'Estado', type: 'select', options: ['PR','SC'] },
      { key: 'cidades_visiveis', label: 'Aparece também em (outras cidades)', type: 'cidades-multi',
        placeholder: 'Ex: Curitiba — adicionar cidade' },
      { key: 'link_url', label: 'Link do produto (opcional)', type: 'url', placeholder: 'https://...' }
    ],
    // Import aceita CSV de 3 colunas: "Nome;Cidade;Estado" (separadores ; , ou TAB)
    importColumns: ['nome', 'cidade', 'estado'],
    displayExtra: (item) => {
      const parts = [];
      if (item.cidade || item.estado) {
        const locStr = [item.cidade, item.estado].filter(Boolean).join(' · ');
        parts.push(el('span', { class: 'text-xs text-fg-muted' }, '📍 ' + locStr));
      }
      if (Array.isArray(item.cidades_visiveis) && item.cidades_visiveis.length) {
        parts.push(el('span', { class: 'text-xs text-blue-500' },
          '➕ também em: ' + item.cidades_visiveis.join(', ')));
      }
      if (item.link_url) parts.push(el('a', { href: item.link_url, target: '_blank', class: 'text-xs text-rottas-500 hover:underline truncate ml-2' }, '🔗 ' + item.link_url.replace(/^https?:\/\//, '').slice(0, 30)));
      return parts.length ? el('div', { class: 'flex items-center gap-2 flex-wrap mt-0.5' }, ...parts) : null;
    },
  },
  { id: 'motivos_visita',  table: 'motivos_visita',  label: 'Motivos de visita', stateKey: 'motivosVisita' },
  { id: 'motivos_orulo',   table: 'motivos_orulo',   label: 'Motivos Órulo/DWV', stateKey: 'motivosOrulo' },
  { id: 'gerentes_house',  table: 'gerentes_house',  label: 'Gerentes House',    stateKey: 'gerentesHouse' },
  {
    id: 'clientes', table: 'clientes', label: 'Clientes (leads)', stateKey: 'clientes',
    loadOnDemand: true,  // não vem no loadLists — carrega ao abrir a aba
    extraFields: [
      { key: 'telefone', label: 'Telefone', type: 'phone' },
      { key: 'email', label: 'E-mail', type: 'email', placeholder: 'email@exemplo.com' },
    ],
    displayExtra: (item) => {
      const parts = [item.telefone, item.email].filter(Boolean);
      return parts.length ? el('div', { class: 'text-xs text-fg-muted mt-0.5' }, '📞 ' + parts.join(' · ')) : null;
    },
  },
];

export async function masterListasView(_params, app) {
  let activeId = 'imobiliarias';

  const content = el('div', { class: 'flex flex-col gap-4' });

  content.appendChild(el('div', {},
    el('h1', { class: 'text-2xl font-extrabold' }, 'Listas'),
    el('p', { class: 'text-sm text-fg-muted' }, 'Cadastros usados nos formulários do app'),
  ));

  const tabBar = el('div', { class: 'flex flex-wrap gap-2' });
  const dash = el('div', { class: 'flex flex-col gap-3' });
  content.append(tabBar, dash);

  app.appendChild(shell(content, { title: 'Listas' }));

  function renderTabs() {
    tabBar.innerHTML = '';
    TABS.forEach(t => {
      tabBar.appendChild(el('button', {
        class: 'btn btn-sm flex-shrink-0 whitespace-nowrap ' + (activeId === t.id ? 'btn-primary' : 'btn-secondary'),
        onclick: () => { activeId = t.id; renderActive(); }
      }, t.label));
    });
  }

  async function renderActive() {
    renderTabs();
    const tab = TABS.find(t => t.id === activeId);
    dash.innerHTML = '';

    // Tabelas que não vêm no loadLists (ex.: clientes) são carregadas ao abrir a aba
    if (tab.loadOnDemand && !Array.isArray(state[tab.stateKey])) {
      dash.appendChild(el('div', { class: 'card p-6 text-center text-fg-muted' }, 'Carregando...'));
      const { data } = await supabase.from(tab.table).select('*').order('nome').limit(5000);
      state[tab.stateKey] = data || [];
      dash.innerHTML = '';
    }

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
      // Na aba Imobiliárias, botão pra ver/gerenciar corretores vinculados
      const corretoresBtn = (tab.id === 'imobiliarias') ? el('button', {
        class: 'p-1.5 rounded hover:bg-bg-elev transition flex items-center gap-1 text-xs text-rottas-600 font-semibold',
        title: 'Ver corretores desta imobiliária',
        onclick: () => openCorretoresModal(it),
      }, icon('users', 16), 'Corretores') : null;
      dash.appendChild(el('div', { class: 'card p-3 flex items-center gap-3' },
        el('div', { class: 'flex-1 min-w-0' },
          el('div', { class: 'font-medium' }, it.nome),
          extra,
        ),
        corretoresBtn,
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
            // .select() retorna o que foi deletado — se vazio, RLS bloqueou (sem permissão)
            const { data, error } = await supabase.from(tab.table).delete().eq('id', it.id).select();
            if (error) return toast(error.message, 'error', 6000);
            if (!data || !data.length) {
              return toast('Sem permissão para excluir. Peça ao Master a permissão "Gerenciar listas".', 'error', 6000);
            }
            await loadLists();
            renderActive();
            toast('Excluído', 'success');
          }
        }, icon('trash', 16, 'text-danger')),
      ));
    });
  }

  // Helper: renderiza um campo extra (input/select/cidade-select) e retorna {wrapper, getValue, getExtras}
  // cidade-select: dropdown puxando de state.cidades; ao selecionar, retorna {cidade, estado}
  function renderExtraField(extraDef, initial) {
    let inputEl;
    let extraGetter = null;
    if (extraDef.type === 'select') {
      inputEl = el('select', { class: 'select' },
        el('option', { value: '' }, '—'),
        ...extraDef.options.map(o => el('option', { value: o, selected: initial === o }, o))
      );
    } else if (extraDef.type === 'cidade-select') {
      // Input texto livre + autocomplete via datalist (HTML5).
      // - Sugere cidades de state.cidades (com indicador de UF)
      // - Aceita qualquer texto digitado (ex: "Ponta Grossa" mesmo se não cadastrada)
      // - Ao salvar, busca o estado da cidade em state.cidades; se não achar, estado=null
      const listId = 'cidades-dl-' + Math.random().toString(36).slice(2, 8);
      inputEl = el('input', {
        class: 'input',
        type: 'text',
        placeholder: extraDef.placeholder || 'Digite ou escolha uma cidade',
        value: initial || '',
        list: listId,
        autocomplete: 'off',
      });
      const dl = el('datalist', { id: listId },
        ...(state.cidades || []).map(c =>
          el('option', { value: c.nome }, `${c.nome} (${c.estado})`)
        )
      );
      // Função pra inferir estado pelo nome digitado
      extraGetter = () => {
        const v = (inputEl.value || '').trim();
        if (!v) return { estado: null };
        const match = (state.cidades || []).find(c =>
          c.nome.toLowerCase() === v.toLowerCase()
        );
        return { estado: match?.estado || null };
      };
      // Anexa o datalist depois do input
      const orig = el('div', {}, inputEl, dl);
      return {
        wrapper: el('div', {},
          el('label', { class: 'label ' + (extraDef.required ? 'label-required' : '') }, extraDef.label),
          orig,
        ),
        getValue: () => (inputEl.value || '').trim() || null,
        getExtras: extraGetter,
      };
    } else if (extraDef.type === 'cidades-multi') {
      // Editor de tags: lista de cidades extras onde o empreendimento aparece.
      // Sugestões = SÓ cidades onde já temos empreendimentos cadastrados
      // (cidade-sede de cada empreendimento). Você ainda pode digitar uma nova.
      const tags = Array.isArray(initial) ? [...initial] : [];
      const known = new Set();
      (state.empreendimentos || []).forEach(e => { if (e.cidade) known.add(e.cidade.trim()); });
      const listId = 'cidades-multi-' + Math.random().toString(36).slice(2, 8);
      const dl = el('datalist', { id: listId },
        ...[...known].sort().map(c => el('option', { value: c })));
      const chipsWrap = el('div', { class: 'flex flex-wrap gap-1.5 mb-2' });
      const addInput = el('input', {
        class: 'input flex-1', type: 'text', list: listId,
        placeholder: extraDef.placeholder || 'Adicionar cidade', autocomplete: 'off',
      });
      const addBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm flex-shrink-0' }, '+ Add');
      function renderChips() {
        chipsWrap.innerHTML = '';
        if (!tags.length) {
          chipsWrap.appendChild(el('span', { class: 'text-xs text-fg-subtle' }, 'Nenhuma cidade extra (só a cidade-sede).'));
          return;
        }
        tags.forEach((c, idx) => {
          chipsWrap.appendChild(el('span', {
            class: 'chip chip-blue flex items-center gap-1',
          }, c, el('button', {
            type: 'button', class: 'font-bold ml-1', title: 'Remover',
            onclick: () => { tags.splice(idx, 1); renderChips(); },
          }, '✕')));
        });
      }
      function addTag() {
        const v = (addInput.value || '').trim();
        if (!v) return;
        if (!tags.some(t => t.toLowerCase() === v.toLowerCase())) tags.push(v);
        addInput.value = '';
        renderChips();
      }
      addBtn.addEventListener('click', addTag);
      addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
      renderChips();
      return {
        wrapper: el('div', {},
          el('label', { class: 'label' }, extraDef.label),
          chipsWrap,
          el('div', { class: 'flex gap-2' }, addInput, addBtn, dl),
        ),
        getValue: () => tags.slice(),  // array (text[])
        getExtras: null,
      };
    } else if (extraDef.type === 'phone') {
      inputEl = phoneInput({ value: initial || '' });
    } else if (extraDef.type === 'email') {
      inputEl = emailInput({ value: initial || '', placeholder: extraDef.placeholder || 'email@exemplo.com' });
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
      getValue: () => {
        if (extraDef.type === 'cidade-select') {
          const v = inputEl.value;
          if (!v) return null;
          return v.split('|')[0]; // só o nome da cidade
        }
        return inputEl.value.trim() || null;
      },
      getExtras: extraGetter,
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
      // Coleta campos extras (+ extras implícitos como `estado` derivado da cidade)
      const extraData = {};
      (tab.extraFields || []).forEach((ef, i) => {
        const v = extras[i].getValue();
        if (ef.required && !v) {
          toast(`${ef.label} é obrigatório`, 'error');
          return;
        }
        extraData[ef.key] = v;
        // Cidade-select retorna `estado` automaticamente em getExtras()
        if (extras[i].getExtras) Object.assign(extraData, extras[i].getExtras());
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
        if (extras[i].getExtras) Object.assign(patch, extras[i].getExtras());
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
  // Modal: corretores vinculados a uma imobiliária (ver / adicionar / excluir)
  function openCorretoresModal(imob) {
    const listWrap = el('div', { class: 'flex flex-col gap-2 max-h-72 overflow-y-auto' });
    const nomeInp = el('input', { class: 'input', placeholder: 'Nome do corretor' });
    const telInp  = phoneInput({});
    const mailInp = emailInput({ placeholder: 'E-mail (opcional)' });
    const addBtn  = el('button', { class: 'btn btn-primary btn-sm' }, icon('plus', 14), 'Adicionar');
    const closeBtn = el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Fechar');

    function renderList() {
      listWrap.innerHTML = '';
      const lista = (state.corretores || []).filter(c => (c.imobiliaria_nome || '') === imob.nome);
      if (!lista.length) {
        listWrap.appendChild(el('div', { class: 'text-sm text-fg-muted text-center py-4' }, 'Nenhum corretor cadastrado nesta imobiliária.'));
        return;
      }
      lista.forEach(c => {
        listWrap.appendChild(el('div', { class: 'card p-2.5 flex items-center gap-2' },
          el('div', { class: 'flex-1 min-w-0' },
            el('div', { class: 'font-medium text-sm' }, c.nome),
            (c.telefone || c.email) ? el('div', { class: 'text-xs text-fg-muted' }, [c.telefone, c.email].filter(Boolean).join(' · ')) : null,
          ),
          el('button', {
            class: 'p-1.5 rounded hover:bg-bg-elev transition',
            title: 'Excluir corretor',
            onclick: async () => {
              const ok = await confirmModal({ title: 'Excluir corretor?', message: `Remover "${c.nome}"?`, confirmLabel: 'Excluir', danger: true });
              if (!ok) return;
              const { data, error } = await supabase.from('corretores').delete().eq('id', c.id).select();
              if (error) return toast(error.message, 'error', 6000);
              if (!data || !data.length) return toast('Sem permissão para excluir corretor.', 'error', 6000);
              state.corretores = (state.corretores || []).filter(x => x.id !== c.id);
              renderList();
              toast('Corretor removido', 'success');
            },
          }, icon('trash', 16, 'text-danger')),
        ));
      });
    }

    addBtn.addEventListener('click', async () => {
      const nome = nomeInp.value.trim();
      if (!nome) { toast('Nome é obrigatório', 'error'); return; }
      addBtn.disabled = true;
      try {
        const payload = {
          nome, telefone: telInp.value.trim() || null, email: mailInp.value.trim() || null,
          imobiliaria_id: imob.id || null, imobiliaria_nome: imob.nome,
          created_by: state.user?.id || null,
        };
        const { data, error } = await supabase.from('corretores').insert(payload).select().single();
        if (error) { toast('Erro: ' + error.message, 'error', 6000); addBtn.disabled = false; return; }
        if (!Array.isArray(state.corretores)) state.corretores = [];
        state.corretores.push(data);
        state.corretores.sort((a, b) => a.nome.localeCompare(b.nome));
        nomeInp.value = ''; telInp.value = ''; mailInp.value = '';
        renderList();
        toast('Corretor adicionado', 'success');
      } catch (e) {
        toast('Falha: ' + (e.message || e), 'error', 6000);
      } finally {
        addBtn.disabled = false;
      }
    });

    const m = modal({
      title: `👥 Corretores · ${imob.nome}`, size: 'sm',
      content: el('div', { class: 'flex flex-col gap-3' },
        listWrap,
        el('div', { class: 'border-t border-border pt-3 flex flex-col gap-2' },
          el('div', { class: 'text-xs font-bold text-fg-muted uppercase' }, 'Adicionar corretor'),
          nomeInp, telInp, mailInp,
          el('div', { class: 'flex justify-end' }, addBtn),
        ),
      ),
      footer: [closeBtn],
    });
    renderList();
  }

  function openImport(tab) {
    // Empreendimentos aceita multi-coluna: Nome;Cidade ou Nome,Cidade
    const isMultiCol = (tab.importColumns || []).length > 1;
    const placeholderTxt = isMultiCol
      ? `Cole aqui (separador ; ou , ou TAB):\n\nBarra Home Resort;Curitiba\nMeo Anita;Joinville\nVega Jaraguá;Jaraguá do Sul\n...\n\nFormato: ${tab.importColumns.join(' ; ')}`
      : 'Cole aqui a lista, um nome por linha:\n\nImobiliária ABC\nImobiliária XYZ\nLopes Imóveis\n...';
    const textArea = el('textarea', {
      class: 'input',
      rows: 8,
      placeholder: placeholderTxt,
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

    // Parser: cada linha vira um objeto baseado em tab.importColumns
    // - Single column: { nome: "Nome" }
    // - Multi column:  { nome, cidade, ... } - aceita ; , TAB como separadores
    // Bonus: pra empreendimentos, faz lookup da cidade em state.cidades pra pegar estado automaticamente
    function parseLines() {
      const lines = textArea.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const cols = tab.importColumns || ['nome'];
      return lines.map(line => {
        const parts = cols.length > 1
          ? line.split(/[;,\t]/).map(s => s.trim())
          : [line];
        const obj = {};
        cols.forEach((col, i) => { if (parts[i]) obj[col] = parts[i]; });
        // Normaliza estado pra maiúsculas (aceita "pr", "Pr", "PR")
        if (obj.estado) {
          const uf = obj.estado.toUpperCase();
          obj.estado = ['PR','SC'].includes(uf) ? uf : null;
        }
        return obj;
      }).filter(o => o.nome);
    }

    function updatePreview() {
      const parsed = parseLines();
      const unique = [];
      const seen = new Set();
      parsed.forEach(p => {
        const k = p.nome.toLowerCase();
        if (!seen.has(k)) { seen.add(k); unique.push(p); }
      });
      const existing = (state[tab.stateKey] || []).map(x => x.nome.toLowerCase());
      const novos = unique.filter(p => !existing.includes(p.nome.toLowerCase()));
      const dups = unique.length - novos.length;
      const extras = isMultiCol
        ? ` · ${novos.filter(p => p.cidade).length} c/ cidade`
        : '';
      previewEl.textContent = `Total: ${parsed.length} · Únicos: ${unique.length} · Novos: ${novos.length}${dups ? ` · Já existem: ${dups}` : ''}${extras}`;
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
      // novos ja vem como objetos {nome, cidade?, estado?, ...}
      const rows = novos.map(p => ({ ...p }));
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
