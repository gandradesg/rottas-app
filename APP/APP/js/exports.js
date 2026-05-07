// Exportação Excel (SheetJS) e PNG (html2canvas)
import { fmt } from './ui.js';

let SheetJS = null;
async function loadSheetJS() {
  if (SheetJS) return SheetJS;
  await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  SheetJS = window.XLSX;
  return SheetJS;
}

let html2canvas = null;
async function loadHtml2Canvas() {
  if (html2canvas) return html2canvas;
  await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
  html2canvas = window.html2canvas;
  return html2canvas;
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some(s => s.src === src)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

export async function exportAtividadesExcel(atividades, filename = null) {
  const XLSX = await loadSheetJS();
  // Aba consolidada
  const all = atividades.map(a => ({
    'Nº':              a.numero_sequencial || '',
    'Nº Venda':        a.numero_venda || '',
    'Data':            fmt.dateTime(a.created_at),
    'Tipo':            a.tipo,
    'Gerente':         a.profiles?.nome || '',
    'Imobiliária':     a.imobiliaria || a.local_visita || '',
    'Empreendimento':  a.empreendimento || a.produto || '',
    'Cliente':         a.cliente || '',
    'Corretor':        a.corretor || '',
    'Motivo visita':   a.motivo_visita || '',
    'Motivo contato':  a.motivo_contato || '',
    'Termômetro':      a.termometro || '',
    'Unidade':         a.unidade || '',
    'Valor (R$)':      a.valor || '',
    'Reserva':         a.reserva || '',
    'Reserva data':    a.reserva_data ? fmt.dateTime(a.reserva_data) : '',
    'Latitude':        a.latitude || '',
    'Longitude':       a.longitude || '',
    'Observações':     a.observacoes || '',
    'Fotos (urls)':    (a.fotos || []).join(' | '),
  }));

  // Ordenar do mais antigo para o mais recente
  all.reverse();

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(all);
  // Ajusta largura
  ws['!cols'] = Object.keys(all[0] || {}).map(k => ({ wch: Math.max(k.length, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Atividades');

  // Aba por tipo
  ['checkin','atendimento','proposta','orulo'].forEach(tipo => {
    const filtered = all.filter(r => r['Tipo'] === tipo);
    if (filtered.length) {
      const w = XLSX.utils.json_to_sheet(filtered);
      w['!cols'] = ws['!cols'];
      XLSX.utils.book_append_sheet(wb, w, tipo[0].toUpperCase() + tipo.slice(1));
    }
  });

  const name = filename || `rottas-atividades-${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, name);
}

export async function exportElementPNG(element, filename = 'export.png') {
  const h2c = await loadHtml2Canvas();
  const isDark = document.documentElement.classList.contains('dark');
  const canvas = await h2c(element, {
    backgroundColor: isDark ? '#0D1320' : '#FFF8F0',
    scale: 2,
    useCORS: true,
    logging: false,
  });
  return new Promise((res) => {
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      res();
    }, 'image/png');
  });
}
