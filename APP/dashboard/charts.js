// ═════════════════════════════════════════════════════════════════════════
// Imob Rottas · Dashboard · charts.js
// Wrappers Chart.js (linha) + ECharts (funil), com lazy load via CDN
// ═════════════════════════════════════════════════════════════════════════

// ─── LAZY LOADERS ────────────────────────────────────────────────────────
let _chartJsPromise = null;
async function loadChartJS() {
  if (window.Chart) return window.Chart;
  if (_chartJsPromise) return _chartJsPromise;
  _chartJsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
    s.onload = () => resolve(window.Chart);
    s.onerror = () => { _chartJsPromise = null; reject(new Error('Chart.js CDN falhou')); };
    document.head.appendChild(s);
  });
  return _chartJsPromise;
}

let _echartsPromise = null;
async function loadECharts() {
  if (window.echarts) return window.echarts;
  if (_echartsPromise) return _echartsPromise;
  _echartsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js';
    s.onload = () => resolve(window.echarts);
    s.onerror = () => { _echartsPromise = null; reject(new Error('ECharts CDN falhou')); };
    document.head.appendChild(s);
  });
  return _echartsPromise;
}

// ─── THEME HELPERS ───────────────────────────────────────────────────────
function getThemeColors() {
  const isDark = document.documentElement.classList.contains('dark');
  return {
    isDark,
    grid:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    tick:    isDark ? '#94a3b8' : '#64748b',
    fg:      isDark ? '#e2e8f0' : '#0f172a',
    bg:      isDark ? '#161e33' : '#ffffff',
    bgElev:  isDark ? '#1d2640' : '#f1f3f8',
    accent:  '#F26B22',
    blue:    '#3B82F6',
    purple:  '#A855F7',
    green:   '#10B981',
    border:  isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,21,37,0.08)',
  };
}

// ─── LINE CHART (3 séries: visitas, atendimentos, propostas) ─────────────
let _lineChartInst = null;

export async function renderLineChart(wrapEl, atividades, periodo) {
  await loadChartJS();
  wrapEl.innerHTML = '<canvas></canvas>';
  const canvas = wrapEl.querySelector('canvas');

  // Agrupa por dia (ou semana se período > 90d)
  const groupByWeek = (periodo === '12m' || periodo === 'tudo');
  const groups = {};
  atividades.forEach(r => {
    if (!['checkin', 'atendimento', 'proposta'].includes(r.tipo)) return;
    let key;
    if (groupByWeek) {
      const d = new Date(r.created_at);
      const monday = new Date(d);
      monday.setDate(d.getDate() - d.getDay() + 1);
      monday.setHours(0,0,0,0);
      key = monday.toISOString().slice(0, 10);
    } else {
      key = r.created_at.slice(0, 10);
    }
    if (!groups[key]) groups[key] = { checkin: 0, atendimento: 0, proposta: 0 };
    if (r.tipo === 'checkin')      groups[key].checkin++;
    else if (r.tipo === 'atendimento') groups[key].atendimento++;
    else if (r.tipo === 'proposta')    groups[key].proposta++;
  });

  const sorted = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  const labels = sorted.map(([d]) => {
    const dt = new Date(d + 'T00:00:00');
    if (groupByWeek) return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
    return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
  });
  const sCheckin = sorted.map(([, v]) => v.checkin);
  const sAtend   = sorted.map(([, v]) => v.atendimento);
  const sProp    = sorted.map(([, v]) => v.proposta);
  const sVisitas = sorted.map(([, v]) => v.checkin + v.atendimento);

  const c = getThemeColors();
  if (_lineChartInst) { _lineChartInst.destroy(); _lineChartInst = null; }

  if (!sorted.length) {
    wrapEl.innerHTML = `<p style="text-align:center;padding:80px;color:var(--fg-muted);font-size:13px;">Sem atividades no período.</p>`;
    return;
  }

  _lineChartInst = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Visitas',     data: sVisitas, borderColor: c.blue,   backgroundColor: 'rgba(59,130,246,0.10)', tension: 0.35, fill: true,  pointRadius: labels.length > 30 ? 0 : 3, borderWidth: 2 },
        { label: 'Atendimentos',data: sAtend,   borderColor: c.purple, backgroundColor: 'rgba(168,85,247,0.08)', tension: 0.35, fill: false, pointRadius: labels.length > 30 ? 0 : 3, borderWidth: 2 },
        { label: 'Propostas',   data: sProp,    borderColor: c.accent, backgroundColor: 'rgba(242,107,34,0.10)', tension: 0.35, fill: false, pointRadius: labels.length > 30 ? 0 : 3, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end',
                  labels: { color: c.tick, font: { size: 11, weight: '600' }, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
        tooltip: { backgroundColor: c.bg, titleColor: c.fg, bodyColor: c.fg,
                   borderColor: c.border, borderWidth: 1, padding: 10, cornerRadius: 8 },
      },
      scales: {
        x: { grid: { color: c.grid, drawBorder: false }, ticks: { color: c.tick, font: { size: 10 }, maxTicksLimit: 10, autoSkip: true } },
        y: { beginAtZero: true, grid: { color: c.grid, drawBorder: false }, ticks: { color: c.tick, font: { size: 10 }, precision: 0 } },
      },
    },
  });
}

// ─── FUNNEL CHART (ECharts) ──────────────────────────────────────────────
let _funnelChartInst = null;

export async function renderFunnel(wrapEl, kpis) {
  await loadECharts();
  wrapEl.innerHTML = '';
  const div = document.createElement('div');
  div.style.cssText = 'width:100%;height:100%;';
  wrapEl.appendChild(div);

  const c = getThemeColors();

  const totalAtend = kpis.atendimentos;
  const totalProp = kpis.propostas;
  const totalVend = kpis.vendas;
  const totalVis = kpis.visitas;

  if (!totalVis && !totalProp) {
    wrapEl.innerHTML = `<p style="text-align:center;padding:80px;color:var(--fg-muted);font-size:13px;">Sem dados para o funil.</p>`;
    return;
  }

  // Conversões inter-estágio
  const convVisAt = totalVis > 0 ? (totalAtend / totalVis * 100).toFixed(1) : '0';
  const convAtPr  = totalAtend > 0 ? (totalProp / totalAtend * 100).toFixed(1) : '0';
  const convPrVd  = totalProp > 0 ? (totalVend / totalProp * 100).toFixed(1) : '0';

  if (_funnelChartInst) { _funnelChartInst.dispose(); _funnelChartInst = null; }
  _funnelChartInst = window.echarts.init(div, c.isDark ? 'dark' : null, { renderer: 'canvas' });
  _funnelChartInst.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: c.bg, borderColor: c.border, textStyle: { color: c.fg },
      formatter: (params) => {
        const extras = {
          'Visitas': '',
          'Atendimentos': ` (${convVisAt}% das visitas)`,
          'Propostas': ` (${convAtPr}% dos atend.)`,
          'Vendas': ` (${convPrVd}% das propostas)`,
        };
        return `<b>${params.name}</b><br>${params.value.toLocaleString('pt-BR')}${extras[params.name] || ''}`;
      },
    },
    series: [{
      type: 'funnel',
      left: '5%', right: '5%', top: 15, bottom: 15,
      width: '90%',
      min: 0,
      max: Math.max(totalVis, totalProp, 1),
      sort: 'descending',
      gap: 4,
      label: {
        show: true,
        position: 'inside',
        color: '#fff',
        fontSize: 12,
        fontWeight: 700,
        formatter: (params) => {
          return `${params.name}\n${params.value.toLocaleString('pt-BR')}`;
        },
      },
      labelLine: { show: false },
      itemStyle: { borderColor: c.bg, borderWidth: 2 },
      emphasis: { label: { fontSize: 13 } },
      data: [
        { value: totalVis,   name: 'Visitas',      itemStyle: { color: c.blue } },
        { value: totalAtend, name: 'Atendimentos', itemStyle: { color: c.purple } },
        { value: totalProp,  name: 'Propostas',    itemStyle: { color: c.accent } },
        { value: totalVend,  name: 'Vendas',       itemStyle: { color: c.green } },
      ],
    }],
  });

  // Resize handler
  if (!wrapEl._resizeBound) {
    const ro = new ResizeObserver(() => { _funnelChartInst?.resize(); });
    ro.observe(wrapEl);
    wrapEl._resizeBound = true;
  }
}

export function destroyAllCharts() {
  if (_lineChartInst)   { _lineChartInst.destroy();   _lineChartInst = null; }
  if (_funnelChartInst) { _funnelChartInst.dispose(); _funnelChartInst = null; }
}
