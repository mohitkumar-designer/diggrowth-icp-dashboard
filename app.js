/**
 * DiGGrowth ICP Intelligence & Competitor Analysis Dashboard
 * Complete Integrated Application Logic
 */

const API_BASE = 'https://api.diggrowth.com';
const COMPANY = 'GPS';

// Global Application State
const STATE = {
  theme: localStorage.getItem('diggrowth_theme') || 'light',
  primaryTab: 'icp',
  subTab: 'combos',
  isOnline: true,
  summary: null,
  medianClv: 0,
  filters: {
    brand: new Set(),
    bu: new Set(),
    partner: false
  },
  filterOptions: {
    brand: [],
    bu: []
  },
  // Pagination & Datatable States
  combos: { offset: 0, limit: 25, total: 0, data: [] },
  ca: { offset: 0, limit: 50, total: 0, sortBy: 'good_customer', sortDir: 'desc', search: '', data: [] },
  prospects: { offset: 0, limit: 50, total: 0, search: '', data: [], meta: {} },
  contacts: { offset: 0, limit: 50, total: 0, search: '', grade: '', type: '', dmOnly: false, hsOnly: false, data: [] },
  // Seasonality
  sz: {
    dim: 'Industry',
    metric: 'count',
    range: 'all',
    selected: new Set(),
    chartTimeline: null,
    chartSeasonal: null,
    data: {}
  },
  // Competitor States
  compBook: { offset: 0, limit: 50, total: 0, q: '', comp: '', ind: '', flag: '', filtered: [] },
  compOverlap: { offset: 0, limit: 50, total: 0, q: '', comp: '', tier: '', filtered: [] },
  compLookalikes: { offset: 0, limit: 50, total: 0, q: '', comp: '', grade: '', minSim: 0, filtered: [] },
  // Universal Drawer State
  drawer: {
    open: false,
    title: '',
    subtitle: '',
    kind: 'accounts',
    offset: 0,
    limit: 50,
    total: 0,
    search: '',
    allRows: [],
    filteredRows: [],
    exportName: 'drilldown_export.csv'
  }
};

// Colors for Chart & Dimension Visualizers
const CHART_COLORS = ['#7C3AED', '#0D9488', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#10B981', '#6366F1', '#14B8A6'];
const IND_COLORS = [
  '#7C3AED','#A855F7','#0EA5E9','#0D9488','#DB2777','#16A34A',
  '#6366F1','#C026D3','#0891B2','#EA580C','#4F46E5','#059669',
  '#9333EA','#2563EB','#BE185D','#65A30D','#7E22CE','#0284C7'
];

/* ==========================================================================
   Utilities & Formatters
   ========================================================================== */
function $(id) { return document.getElementById(id); }

function fmt(n) {
  if (n == null || n === '' || isNaN(n)) return '—';
  const val = Number(n);
  if (Math.abs(val) >= 1e9) return '$' + (val / 1e9).toFixed(2) + 'B';
  if (Math.abs(val) >= 1e6) return '$' + (val / 1e6).toFixed(1) + 'M';
  if (Math.abs(val) >= 1e3) return '$' + (val / 1e3).toFixed(1) + 'K';
  return '$' + val.toLocaleString();
}

function fmtN(n) {
  if (n == null || n === '' || isNaN(n)) return '—';
  return Number(n).toLocaleString();
}

function pct(n) {
  if (n == null || isNaN(n)) return '—';
  return (Number(n) * 100).toFixed(1) + '%';
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getIndColor(ind) {
  if (!ind) return '#94A3B8';
  let hash = 0;
  for (let i = 0; i < ind.length; i++) hash = ind.charCodeAt(i) + ((hash << 5) - hash);
  return IND_COLORS[Math.abs(hash) % IND_COLORS.length];
}

function clvArrow(clv) {
  if (!clv || !STATE.medianClv || isNaN(clv)) return '';
  const m = clv / STATE.medianClv;
  if (m >= 1) return ' <span class="arrow-up">&#9650; ' + m.toFixed(1) + '&times; median</span>';
  return ' <span class="arrow-down">&#9660; ' + m.toFixed(1) + '&times; median</span>';
}

function gradeBadge(g) {
  g = (g || '').toUpperCase();
  if (!g) return '—';
  return '<span class="grade-badge grade-' + g + '">' + g + '</span>';
}

function showProgress() {
  const el = $('global-progress');
  if (el) el.classList.add('active');
}

function hideProgress() {
  const el = $('global-progress');
  if (el) el.classList.remove('active');
}

function downloadCSV(rows, filename) {
  if (!rows || !rows.length) {
    alert('No data available to export.');
    return;
  }
  const cols = Object.keys(rows[0]);
  let csv = cols.map(c => '"' + c.replace(/"/g, '""') + '"').join(',') + '\n';
  rows.forEach(r => {
    csv += cols.map(c => '"' + String(r[c] == null ? '' : r[c]).replace(/"/g, '""') + '"').join(',') + '\n';
  });
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ==========================================================================
   API & Data Fetching with Seamless Fallback
   ========================================================================== */
async function fetchAPI(endpoint, fallbackKey) {
  showProgress();
  const startTime = Date.now();
  try {
    const res = await fetch(API_BASE + endpoint);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const latency = Date.now() - startTime;
    $('api-latency').textContent = latency + 'ms';
    $('api-status-text').textContent = 'Live API Connected';
    $('api-status-text').style.color = 'inherit';
    hideProgress();
    return json.data;
  } catch (err) {
    console.warn('Live API request failed for', endpoint, '; using cached fallback data.', err);
    $('api-status-text').textContent = 'Offline Cache Mode';
    $('api-status-text').style.color = 'var(--amber-500)';
    $('api-latency').textContent = 'cached';
    hideProgress();
    if (window.ICP_FALLBACK_DATA && fallbackKey && window.ICP_FALLBACK_DATA[fallbackKey]) {
      return window.ICP_FALLBACK_DATA[fallbackKey];
    }
    return null;
  }
}

function buildFilterQuery() {
  let q = '';
  const selBrand = STATE.filters.brand;
  const allBrand = STATE.filterOptions.brand;
  if (selBrand.size > 0 && selBrand.size < allBrand.length) {
    q += '&brand=' + Array.from(selBrand).map(encodeURIComponent).join(',');
  }

  const selBu = STATE.filters.bu;
  const allBu = STATE.filterOptions.bu;
  if (selBu.size > 0 && selBu.size < allBu.length) {
    q += '&business_unit=' + Array.from(selBu).map(encodeURIComponent).join(',');
  }

  if (STATE.filters.partner) {
    q += '&partner_exclude=false';
  }
  return q;
}

/* ==========================================================================
   Theme Management
   ========================================================================== */
function setTheme(theme) {
  STATE.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('diggrowth_theme', theme);

  $('theme-btn-light').classList.toggle('active', theme === 'light');
  $('theme-btn-dark').classList.toggle('active', theme === 'dark');

  // Refresh Charts if initialized
  if (STATE.sz.chartTimeline) {
    updateChartTheme(STATE.sz.chartTimeline);
  }
  if (STATE.sz.chartSeasonal) {
    updateChartTheme(STATE.sz.chartSeasonal);
  }
}

function updateChartTheme(chart) {
  const isDark = STATE.theme === 'dark';
  const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';
  const textColor = isDark ? '#94A3B8' : '#64748B';

  if (chart.options.scales) {
    if (chart.options.scales.x) {
      if (chart.options.scales.x.ticks) chart.options.scales.x.ticks.color = textColor;
      if (chart.options.scales.x.grid) chart.options.scales.x.grid.color = gridColor;
    }
    if (chart.options.scales.y) {
      if (chart.options.scales.y.ticks) chart.options.scales.y.ticks.color = textColor;
      if (chart.options.scales.y.grid) chart.options.scales.y.grid.color = gridColor;
      if (chart.options.scales.y.title) chart.options.scales.y.title.color = textColor;
    }
  }
  chart.update();
}

/* ==========================================================================
   Sidebar & Navigation Routing
   ========================================================================== */
function switchPrimaryTab(tab) {
  STATE.primaryTab = tab;
  $('btn-tab-icp').classList.toggle('active', tab === 'icp');
  $('btn-tab-comp').classList.toggle('active', tab === 'comp');

  $('subnav-icp').style.display = tab === 'icp' ? 'flex' : 'none';
  $('subnav-comp').style.display = tab === 'comp' ? 'flex' : 'none';

  $('crumb-root-text').textContent = tab === 'icp' ? 'ICP Analysis' : 'Competitor Analysis';

  // Toggle Global Filter bar visibility (only applies to ICP Analysis)
  $('global-filter-bar').style.display = tab === 'icp' ? 'flex' : 'none';
  $('executive-kpi-grid').style.display = tab === 'icp' ? 'grid' : 'none';
  if ($('competitor-kpi-grid')) $('competitor-kpi-grid').style.display = tab === 'comp' ? 'grid' : 'none';

  if (tab === 'icp') {
    switchSubTab('combos');
  } else {
    switchSubTab('comp-profiles');
  }
}

function switchSubTab(subId) {
  STATE.subTab = subId;

  // Update subnav buttons active state
  document.querySelectorAll('.subnav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sub === subId);
  });

  // Hide all sections, display the active one
  document.querySelectorAll('.sub-view-section').forEach(sec => {
    sec.style.display = 'none';
  });

  const activeSec = $('sec-' + subId);
  if (activeSec) {
    activeSec.style.display = 'block';
  }

  // Update Breadcrumb
  const activeBtn = document.querySelector('.subnav-btn[data-sub="' + subId + '"]');
  if (activeBtn) {
    $('crumb-sub-text').textContent = activeBtn.textContent;
  }

  // Lazy loaders for respective views
  loadViewData(subId);
}

function loadViewData(subId) {
  switch (subId) {
    case 'overview':
      renderOverview();
      break;
    case 'combos':
      loadCombos();
      break;
    case 'industry':
      loadIndustry();
      break;
    case 'customers':
      loadCustomers();
      break;
    case 'prospects':
      loadProspects();
      break;
    case 'pbyseg':
      loadProspectsBySegment();
      break;
    case 'seasonality':
      loadSeasonality();
      break;
    case 'contacts':
      loadContacts();
      break;
    case 'comp-profiles':
      renderCompetitorProfiles();
      break;
    case 'comp-book':
      renderCompBook();
      break;
    case 'comp-overlap':
      renderCompOverlap();
      break;
    case 'comp-lookalikes':
      renderCompLookalikes();
      break;
  }
}

/* ==========================================================================
   Filter Management
   ========================================================================== */
function toggleDropdown(dropId) {
  const el = $(dropId);
  const wasOpen = el.classList.contains('open');
  document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
  if (!wasOpen) el.classList.add('open');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown-wrapper')) {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
  }
});

function toggleFilterBar() {
  const fb = $('global-filter-bar');
  fb.style.display = fb.style.display === 'none' ? 'flex' : 'none';
}

function initFilters(filtersObj) {
  if (!filtersObj) return;

  STATE.filterOptions.brand = filtersObj['Brand__c'] || [];
  STATE.filterOptions.bu = filtersObj['Business_Unit__c'] || [];

  STATE.filters.brand = new Set(STATE.filterOptions.brand);
  STATE.filters.bu = new Set(STATE.filterOptions.bu);

  renderFilterOptions('brand');
  renderFilterOptions('bu');
  updateFilterBadges();
}

function renderFilterOptions(type) {
  const listEl = $('options-' + type + '-list');
  const items = STATE.filterOptions[type] || [];
  const selected = STATE.filters[type];

  let html = '';
  items.forEach(val => {
    const isChecked = selected.has(val);
    html += `<label class="dropdown-item">
      <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleFilterValue('${type}', '${esc(val).replace(/'/g, "\\'")}')">
      <span>${esc(val)}</span>
    </label>`;
  });
  listEl.innerHTML = html;
}

function toggleFilterValue(type, val) {
  if (STATE.filters[type].has(val)) {
    STATE.filters[type].delete(val);
  } else {
    STATE.filters[type].add(val);
  }
  updateFilterBadges();
}

function selectAllFilter(type) {
  STATE.filters[type] = new Set(STATE.filterOptions[type]);
  renderFilterOptions(type);
  updateFilterBadges();
}

function selectNoneFilter(type) {
  STATE.filters[type].clear();
  renderFilterOptions(type);
  updateFilterBadges();
}

function updateFilterBadges() {
  $('badge-brand-count').textContent = STATE.filters.brand.size + '/' + STATE.filterOptions.brand.length;
  $('badge-bu-count').textContent = STATE.filters.bu.size + '/' + STATE.filterOptions.bu.length;
}

function clearFilters() {
  selectAllFilter('brand');
  selectAllFilter('bu');
  $('chk-partner').checked = false;
  STATE.filters.partner = false;
  applyFilters();
}

function applyFilters() {
  STATE.filters.partner = $('chk-partner').checked;
  loadSummary();
  loadViewData(STATE.subTab);
}

function filterDropdownOptions(type, query) {
  const q = query.toLowerCase();
  const container = $('options-' + type + '-list');
  container.querySelectorAll('.dropdown-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(q) ? 'flex' : 'none';
  });
}

/* ==========================================================================
   Executive Summary & Overview
   ========================================================================== */
async function loadSummary() {
  const endpoint = '/icp/summary?company=' + encodeURIComponent(COMPANY) + buildFilterQuery();
  const data = await fetchAPI(endpoint, 'summary');
  if (!data) return;

  STATE.summary = data;
  STATE.medianClv = data.overall_median_clv || data.median_clv_icp || 0;

  if (data.filters && STATE.filterOptions.brand.length === 0) {
    initFilters(data.filters);
  }

  // Populate Executive KPIs
  $('kpi-total-accounts').textContent = fmtN(data.total_accounts);
  $('kpi-total-customers-sub').textContent = fmtN(data.customer_accounts) + ' are customers';

  $('kpi-icp-customers').textContent = fmtN(data.icp_accounts);
  const icpPct = data.total_accounts ? ((data.icp_accounts / data.total_accounts) * 100).toFixed(1) : '0';
  $('kpi-icp-pct-sub').textContent = icpPct + '% of total accounts';
  $('badge-icp-count').textContent = fmtN(data.icp_accounts);

  $('kpi-total-revenue').textContent = fmt(data.total_revenue);
  $('kpi-icp-revenue').textContent = fmt(data.icp_revenue);
  const revPct = data.total_revenue ? ((data.icp_revenue / data.total_revenue) * 100).toFixed(1) : '0';
  $('kpi-rev-pct-sub').textContent = revPct + '% of total revenue';

  $('kpi-median-clv').textContent = fmt(data.median_clv_icp);
  $('kpi-median-deal').textContent = fmt(data.median_deal_icp);

  // Pareto Banner
  $('pareto-headline-text').innerHTML = `<b>${icpPct}%</b> of accounts capture <b>${revPct}%</b> of total revenue.`;
}

function renderOverview() {
  if (!STATE.summary) return;
  const d = STATE.summary;
  const icpPct = d.total_accounts ? ((d.icp_accounts / d.total_accounts) * 100).toFixed(1) : '0';
  const revPct = d.total_revenue ? ((d.icp_revenue / d.total_revenue) * 100).toFixed(1) : '0';

  const rows = [
    { metric: 'Accounts Identified', icp: fmtN(d.icp_accounts), base: fmtN(d.total_accounts), mult: icpPct + '% share' },
    { metric: 'Cumulative Revenue', icp: fmt(d.icp_revenue), base: fmt(d.total_revenue), mult: revPct + '% captured' },
    { metric: 'Median Customer Lifetime Value', icp: fmt(d.median_clv_icp), base: fmt(d.median_clv_all || d.overall_median_clv), mult: (d.median_clv_all ? (d.median_clv_icp / d.median_clv_all).toFixed(1) + 'x' : 'High') },
    { metric: 'Median Won Deal Size', icp: fmt(d.median_deal_icp), base: fmt(d.median_deal_all), mult: (d.median_deal_all ? (d.median_deal_icp / d.median_deal_all).toFixed(1) + 'x' : 'High') },
    { metric: 'Revenue Concentration Index', icp: revPct + '% Rev', base: icpPct + '% Accts', mult: (Number(revPct) / Math.max(Number(icpPct), 0.1)).toFixed(1) + 'x Leverage' }
  ];

  let html = '';
  rows.forEach(r => {
    html += `<tr>
      <td><b>${r.metric}</b></td>
      <td class="num highlight-val">${r.icp}</td>
      <td class="num">${r.base}</td>
      <td class="num"><span class="pill pill-likely">${r.mult}</span></td>
    </tr>`;
  });
  $('overview-metrics-table-body').innerHTML = html;
}

function exportOverviewCSV() {
  if (!STATE.summary) return;
  const d = STATE.summary;
  const icpPct = d.total_accounts ? ((d.icp_accounts / d.total_accounts) * 100).toFixed(1) : '0';
  const revPct = d.total_revenue ? ((d.icp_revenue / d.total_revenue) * 100).toFixed(1) : '0';
  const rows = [
    { 'Metric': 'Accounts Identified', 'ICP Segment': fmtN(d.icp_accounts), 'Overall Baseline': fmtN(d.total_accounts), 'Concentration Multiplier': icpPct + '% share' },
    { 'Metric': 'Cumulative Revenue', 'ICP Segment': fmt(d.icp_revenue), 'Overall Baseline': fmt(d.total_revenue), 'Concentration Multiplier': revPct + '% captured' },
    { 'Metric': 'Median CLV', 'ICP Segment': fmt(d.median_clv_icp), 'Overall Baseline': fmt(d.median_clv_all || d.overall_median_clv), 'Concentration Multiplier': (d.median_clv_all ? (d.median_clv_icp / d.median_clv_all).toFixed(1) + 'x' : 'High') },
    { 'Metric': 'Median Won Deal Size', 'ICP Segment': fmt(d.median_deal_icp), 'Overall Baseline': fmt(d.median_deal_all), 'Concentration Multiplier': (d.median_deal_all ? (d.median_deal_icp / d.median_deal_all).toFixed(1) + 'x' : 'High') },
    { 'Metric': 'Revenue Concentration Index', 'ICP Segment': revPct + '% Rev', 'Overall Baseline': icpPct + '% Accts', 'Concentration Multiplier': (Number(revPct) / Math.max(Number(icpPct), 0.1)).toFixed(1) + 'x Leverage' }
  ];
  downloadCSV(rows, 'pareto_threshold_metrics.csv');
}

/* ==========================================================================
   Top Multi-Dimensional Segments
   ========================================================================== */
async function loadCombos() {
  const endpoint = `/icp/combos?company=${encodeURIComponent(COMPANY)}&limit=${STATE.combos.limit}&offset=${STATE.combos.offset}${buildFilterQuery()}`;
  const data = await fetchAPI(endpoint, 'combos');
  if (!data) return;

  STATE.combos.data = data.combos || [];
  STATE.combos.total = data.total || 0;
  renderCombosTable();
}

function parseComboDims(c) {
  const dims = [];
  if (c.anchor) dims.push({ k: c.anchor_type || 'Vertical', v: c.anchor });
  const names = (c.dimensions || '').split(' | ');
  const vals = (c.values || '').split(' | ');
  for (let i = 0; i < names.length; i++) {
    const n = names[i].trim();
    if (n) dims.push({ k: n === 'Industry' ? 'Vertical' : n === 'Sub-Industry' ? 'Category' : n, v: vals[i] ? vals[i].trim() : '' });
  }
  return dims;
}

function renderCombosTable() {
  const tbody = $('combos-table-body');
  const combos = STATE.combos.data;
  if (!combos.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No segments available.</td></tr>';
    $('combos-pager').innerHTML = '';
    return;
  }

  const maxScore = combos[0].weighted_score || 1;
  let html = '';
  combos.forEach((c, idx) => {
    const rank = c.rank || (STATE.combos.offset + idx + 1);
    const dims = parseComboDims(c);

    let dimPills = '<div class="combo-dimension-badges">';
    dims.forEach(d => {
      dimPills += `<div class="combo-dim-pill">
        <span class="combo-dim-key">${esc(d.k)}</span>
        <span class="combo-dim-val">${esc(d.v)}</span>
      </div>`;
    });
    dimPills += '</div>';

    const barPct = Math.min(100, Math.round(((c.weighted_score || 0) / maxScore) * 100));
    dimPills += `<div class="score-bar-track"><div class="score-bar-fill" style="width:${barPct}%"></div></div>`;

    html += `<tr class="clickable-row" onclick="openSegmentDrawer(${idx})">
      <td style="font-weight:700;font-family:var(--font-mono);color:var(--primary)">#${rank}</td>
      <td>${dimPills}</td>
      <td class="num"><b>${fmtN(c.accounts)}</b></td>
      <td class="num"><span>${fmt(c.avg_clv)}</span>${clvArrow(c.avg_clv)}</td>
      <td class="num">${c.avg_score != null ? Number(c.avg_score).toFixed(1) : '—'}</td>
      <td class="num">${c.avg_win_rate != null ? (c.avg_win_rate * 100).toFixed(1) + '%' : '—'}</td>
      <td class="num">${fmtN(c.open_accounts || 0)}</td>
      <td class="num highlight-val">${Number(c.weighted_score || 0).toFixed(1)}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
  renderPager('combos-pager', STATE.combos, loadCombos, 'segments');
}

function openSegmentDrawer(idx) {
  const c = STATE.combos.data[idx];
  if (!c) return;

  const params = {};
  if (c.anchor_type === 'Industry' || !c.anchor_type) params.industry = c.anchor;
  else params.sub_industry = c.anchor;

  const names = (c.dimensions || '').split(' | ');
  const vals = (c.values || '').split(' | ');
  const map = { 'Employees': 'employees', 'Revenue': 'revenue', 'Geo': 'geo', 'Industry': 'industry', 'Sub-Industry': 'sub_industry' };
  for (let i = 0; i < names.length; i++) {
    const k = map[names[i].trim()];
    if (k && vals[i] && vals[i].trim()) params[k] = vals[i].trim();
  }

  openAccountsDrawer('Segment #' + (c.rank || (idx + 1)), 'Accounts inside multi-dimensional cluster', params);
}

function exportCombosCSV() {
  const rows = STATE.combos.data.map((c, i) => ({
    Rank: c.rank || (i + 1),
    Combination: (c.anchor ? c.anchor + ' | ' : '') + (c.values || ''),
    Accounts: c.accounts,
    Avg_CLV: c.avg_clv,
    ICP_Score: c.avg_score,
    Win_Rate: c.avg_win_rate,
    Open_Deals: c.open_accounts,
    Weighted_Score: c.weighted_score
  }));
  downloadCSV(rows, 'icp_top_segments.csv');
}

/* ==========================================================================
   Vertical Insights
   ========================================================================== */
let indDimension = 'Industry';

function setIndustryDimension(dim) {
  indDimension = dim;
  $('btn-ind-vertical').className = dim === 'Industry' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
  $('btn-ind-sub').className = dim === 'Sub-Industry' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
  loadIndustry();
}

async function loadIndustry() {
  const endpoint = `/icp/dimensions?company=${encodeURIComponent(COMPANY)}${buildFilterQuery()}`;
  const data = await fetchAPI(endpoint, 'dimensions');
  if (!data) return;

  const rows = (data || []).filter(r => r.dimension === indDimension).sort((a, b) => b.accounts - a.accounts);
  const totalIcp = (STATE.summary && STATE.summary.icp_accounts) || rows.reduce((s, r) => s + r.accounts, 0);
  const top5 = rows.slice(0, 5).reduce((s, r) => s + r.accounts, 0);
  const top5Pct = totalIcp ? Math.round((top5 / totalIcp) * 100) : 0;

  $('industry-lead-text').innerHTML = `Top 5 ${indDimension === 'Industry' ? 'verticals' : 'categories'} account for <b>${top5Pct}%</b> of all ICP customers (${fmtN(totalIcp)} total).`;

  const grid = $('industry-cards-grid');
  let html = '';
  rows.forEach(r => {
    const win = r.avg_win_rate != null ? (r.avg_win_rate * 100).toFixed(0) + '%' : '—';
    const valKey = String(r.value).replace(/'/g, "\\'");
    const paramKey = indDimension === 'Industry' ? 'industry' : 'sub_industry';

    html += `<div class="vertical-card">
      <div class="vertical-card-title">${esc(r.value)}</div>
      <div class="vertical-card-count"><b>${fmtN(r.accounts)}</b> ICP customers</div>
      <div class="vertical-card-metrics">
        <span>Avg CLV ${fmt(r.avg_clv)}${clvArrow(r.avg_clv)}</span>
        <span style="font-weight:700">Win ${win}</span>
      </div>
      <div class="vertical-card-actions">
        <button class="vertical-act-btn cust" onclick="openAccountsDrawer('${valKey}', 'ICP Customers', { ${paramKey}: '${valKey}' })">View Customers &rarr;</button>
        <button class="vertical-act-btn prosp" onclick="openProspectsDrawer('${valKey}', 'Prospect Accounts', { ${paramKey}: '${valKey}' })">View Prospects &rarr;</button>
      </div>
    </div>`;
  });
  grid.innerHTML = html;
}

function exportIndustryCSV() {
  const endpoint = `/icp/dimensions?company=${encodeURIComponent(COMPANY)}${buildFilterQuery()}`;
  fetchAPI(endpoint, 'dimensions').then(data => {
    if (!data) return;
    const rows = data.filter(r => r.dimension === indDimension);
    downloadCSV(rows, 'vertical_insights_' + indDimension.toLowerCase() + '.csv');
  });
}

/* ==========================================================================
   Customer Analysis
   ========================================================================== */
async function loadCustomers() {
  const q = `?company=${encodeURIComponent(COMPANY)}&limit=${STATE.ca.limit}&offset=${STATE.ca.offset}&sort_by=${encodeURIComponent(STATE.ca.sortBy)}&sort_dir=${STATE.ca.sortDir}${STATE.ca.search ? '&search=' + encodeURIComponent(STATE.ca.search) : ''}${buildFilterQuery()}`;
  const data = await fetchAPI('/icp/accounts' + q, 'accounts');
  if (!data) return;

  STATE.ca.data = data.accounts || [];
  STATE.ca.total = data.total || 0;
  $('ca-total-badge').textContent = fmtN(data.total || 0);

  renderCustomersTable();
}

function renderCustomersTable() {
  const tbody = $('customers-table-body');
  const rows = STATE.ca.data;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--text-muted)">No matching customer accounts found.</td></tr>';
    $('customers-pager').innerHTML = '';
    return;
  }

  let html = '';
  rows.forEach(r => {
    html += `<tr>
      <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted)">${esc(r['Account ID'])}</td>
      <td><b>${esc(r['Account Name'])}</b></td>
      <td>${esc(r.Industry || '—')}</td>
      <td>${esc(r['Sub-Industry'] || '—')}</td>
      <td>${esc(r.Geo || '—')}</td>
      <td class="num">${fmtN(r.Employees)}</td>
      <td class="num">${fmt(r['Annual Revenue (converted)'])}</td>
      <td><span class="pill pill-review">${esc(r.Brand__c || '—')}</span></td>
      <td class="num highlight-val">${fmt(r.clv)}</td>
      <td class="num">${fmtN(r.won_deals)}</td>
      <td class="num">${r.win_rate != null ? (r.win_rate * 100).toFixed(1) + '%' : '—'}</td>
      <td class="num" style="font-weight:700">${Number(r.good_customer || 0).toFixed(1)}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
  renderPager('customers-pager', STATE.ca, loadCustomers, 'customers');
}

function sortCustomers(col) {
  if (STATE.ca.sortBy === col) {
    STATE.ca.sortDir = STATE.ca.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    STATE.ca.sortBy = col;
    STATE.ca.sortDir = 'desc';
  }
  STATE.ca.offset = 0;
  loadCustomers();
}

let caSearchTimeout = null;
function onSearchCustomers(val) {
  clearTimeout(caSearchTimeout);
  caSearchTimeout = setTimeout(() => {
    STATE.ca.search = val.trim();
    STATE.ca.offset = 0;
    loadCustomers();
  }, 300);
}

function exportCustomersCSV() {
  downloadCSV(STATE.ca.data, 'icp_customer_analysis.csv');
}

/* ==========================================================================
   Scored Prospects & Feature Importances
   ========================================================================== */
async function loadProspects() {
  const q = `?company=${encodeURIComponent(COMPANY)}&limit=${STATE.prospects.limit}&offset=${STATE.prospects.offset}${STATE.prospects.search ? '&search=' + encodeURIComponent(STATE.prospects.search) : ''}${buildFilterQuery()}`;
  const [data, modelInfo] = await Promise.all([
    fetchAPI('/icp/prospects' + q, 'prospects'),
    fetchAPI('/icp/prospects/model-info?company=' + encodeURIComponent(COMPANY), 'modelInfo')
  ]);

  if (data) {
    STATE.prospects.data = data.prospects || [];
    STATE.prospects.total = data.total || 0;
    STATE.prospects.meta = data.meta || {};
    renderProspectGradeCounts(data.meta);
    renderProspectsTable();
  }

  if (modelInfo) {
    renderFeatureImportances(modelInfo);
  }
}

function renderProspectGradeCounts(meta) {
  const tc = (meta && meta.total_grade_counts) || { A: 4095, B: 36854, C: 40949 };
  const mc = (meta && meta.ml_grade_counts) || { A: 4095, B: 36854, C: 40949 };
  const rc = (meta && meta.rule_grade_counts) || { A: 4095, B: 36854, C: 40949 };

  const container = $('prospect-grade-counts-grid');
  container.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-card-header"><span class="kpi-label">Grade A (Top 5%)</span>${gradeBadge('A')}</div>
      <div class="kpi-value">${fmtN(tc.A)}</div>
      <div class="kpi-subtext">Highest fit & lookalike confidence</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card-header"><span class="kpi-label">Grade B (Next 45%)</span>${gradeBadge('B')}</div>
      <div class="kpi-value">${fmtN(tc.B)}</div>
      <div class="kpi-subtext">Strong mid-tier candidates</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card-header"><span class="kpi-label">Grade C (Bottom 50%)</span>${gradeBadge('C')}</div>
      <div class="kpi-value">${fmtN(tc.C)}</div>
      <div class="kpi-subtext">Low fit / niche profile</div>
    </div>
  `;
}

function renderFeatureImportances(modelInfo) {
  const mlFeats = (modelInfo.feature_importances || []).slice(0, 8);
  const ruleFeats = ((modelInfo.rule_details && modelInfo.rule_details.features) || []).slice(0, 8);

  const maxMl = mlFeats[0] ? mlFeats[0].importance : 1;
  let mlHtml = '';
  mlFeats.forEach(f => {
    const p = Math.min(100, Math.round((f.importance / maxMl) * 100));
    const name = f.feature.replace(/^num__|^cat__/, '').replace(/_/g, ' ');
    mlHtml += `<div class="feat-bar-row">
      <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(f.feature)}">${esc(name)}</span>
      <div class="feat-bar-track"><div class="feat-bar-fill" style="width:${p}%;background:linear-gradient(90deg,var(--primary),#38BDF8)"></div></div>
      <span class="num">${(f.importance * 100).toFixed(1)}%</span>
    </div>`;
  });
  $('ml-feature-importance-bars').innerHTML = mlHtml;

  const maxRule = ruleFeats[0] ? ruleFeats[0].weight : 1;
  let ruleHtml = '';
  ruleFeats.forEach(f => {
    const p = Math.min(100, Math.round((f.weight / maxRule) * 100));
    const name = f.name.replace(/^num__|^cat__/, '').replace(/_/g, ' ');
    ruleHtml += `<div class="feat-bar-row">
      <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(f.name)}">${esc(name)}</span>
      <div class="feat-bar-track"><div class="feat-bar-fill" style="width:${p}%;background:linear-gradient(90deg,var(--teal-500),var(--emerald-500))"></div></div>
      <span class="num">${(f.weight * 100).toFixed(1)}%</span>
    </div>`;
  });
  $('rule-feature-importance-bars').innerHTML = ruleHtml;
}

function renderProspectsTable() {
  const tbody = $('prospects-table-body');
  const rows = STATE.prospects.data;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="16" style="text-align:center;padding:24px;color:var(--text-muted)">No prospects found.</td></tr>';
    $('prospects-pager').innerHTML = '';
    return;
  }

  let html = '';
  rows.forEach((p, idx) => {
    html += `<tr>
      <td class="num" style="color:var(--text-muted)">${STATE.prospects.offset + idx + 1}</td>
      <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted)">${esc(p['Account ID'])}</td>
      <td><b>${esc(p['Account Name'])}</b></td>
      <td>${esc(p.Industry || '—')}</td>
      <td>${esc(p['Sub-Industry'] || '—')}</td>
      <td>${esc(p.Geo || '—')}</td>
      <td class="num">${fmtN(p.Employees)}</td>
      <td class="num">${fmt(p['Annual Revenue (converted)'])}</td>
      <td class="num highlight-val">${p.total_score != null ? p.total_score : '—'}</td>
      <td style="text-align:center">${gradeBadge(p.total_grade)}</td>
      <td class="num">${p.ml_score != null ? p.ml_score : '—'}</td>
      <td style="text-align:center">${gradeBadge(p.ml_grade)}</td>
      <td class="num">${p.rule_score != null ? p.rule_score : '—'}</td>
      <td style="text-align:center">${gradeBadge(p.rule_grade)}</td>
      <td class="num">${p.engagement_score != null ? p.engagement_score : '—'}</td>
      <td style="text-align:center">${gradeBadge(p.engagement_grade)}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
  renderPager('prospects-pager', STATE.prospects, loadProspects, 'prospects');
}

let psSearchTimeout = null;
function onSearchProspects(val) {
  clearTimeout(psSearchTimeout);
  psSearchTimeout = setTimeout(() => {
    STATE.prospects.search = val.trim();
    STATE.prospects.offset = 0;
    loadProspects();
  }, 300);
}

function exportProspectsCSV() {
  window.open(API_BASE + '/icp/prospects/export?company=' + encodeURIComponent(COMPANY));
}

/* ==========================================================================
   Prospects by Segment
   ========================================================================== */
let psAnchor = 'Industry';

function setPSAnchor(dim) {
  psAnchor = dim;
  $('btn-pbyseg-ind').className = dim === 'Industry' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
  $('btn-pbyseg-sub').className = dim === 'Sub-Industry' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
  loadProspectsBySegment();
}

async function loadProspectsBySegment() {
  const endpoint = `/icp/prospects/by-segment?company=${encodeURIComponent(COMPANY)}&anchor_type=${encodeURIComponent(psAnchor)}&top_n=20&per_segment=200${buildFilterQuery()}`;
  const data = await fetchAPI(endpoint, 'prospectsBySeg');
  if (!data) return;

  const segs = data.segments || [];
  const container = $('pbyseg-accordion-container');
  if (!segs.length) {
    container.innerHTML = '<p style="padding:20px;color:var(--text-muted);text-align:center">No segment matches found.</p>';
    return;
  }

  let html = '';
  segs.forEach((s, idx) => {
    const dimNames = (s.dimensions || '').split('|').map(x => x.trim());
    const dimVals = (s.values || '').split('|').map(x => x.trim());

    let chips = '<div class="combo-dimension-badges">';
    chips += `<div class="combo-dim-pill"><span class="combo-dim-key">${esc(s.anchor_type || 'Vertical')}</span><span class="combo-dim-val">${esc(s.anchor)}</span></div>`;
    for (let j = 0; j < dimNames.length; j++) {
      chips += `<div class="combo-dim-pill"><span class="combo-dim-key">${esc(dimNames[j])}</span><span class="combo-dim-val">${esc(dimVals[j])}</span></div>`;
    }
    chips += '</div>';

    html += `<div class="seg-accordion-item" id="pbyseg-item-${idx}">
      <div class="seg-accordion-header" onclick="toggleSegmentAccordion(${idx})">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="seg-accordion-chevron">&#9654;</span>
          ${chips}
        </div>
        <div style="display:flex;align-items:center;gap:16px">
          <span style="font-size:12.5px;color:var(--text-muted)"><b style="color:var(--primary);font-size:15px">${fmtN(s.match_count)}</b> matching prospects</span>
          <span style="font-size:12.5px;color:var(--text-muted)">${fmtN(s.icp_accounts)} ICP customers</span>
          <span style="font-size:12.5px;color:var(--text-muted)">Avg CLV <b>${fmt(s.avg_clv)}</b></span>
          <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();exportSegmentProspectsCSV(${idx})">Export CSV</button>
        </div>
      </div>
      <div class="seg-accordion-body" id="pbyseg-body-${idx}">
        <!-- Rendered on expansion -->
      </div>
    </div>`;
  });
  container.innerHTML = html;
  window._cachedPBySeg = segs;
}

function toggleSegmentAccordion(idx) {
  const item = $('pbyseg-item-' + idx);
  const body = $('pbyseg-body-' + idx);
  const isOpen = item.classList.contains('open');
  item.classList.toggle('open', !isOpen);

  if (!isOpen && !body.dataset.rendered) {
    const s = window._cachedPBySeg[idx];
    const ps = (s && s.prospects) || [];
    if (!ps.length) {
      body.innerHTML = '<p style="padding:16px;color:var(--text-muted);font-size:12.5px">No prospects currently fall inside this exact cluster.</p>';
    } else {
      let t = '<div class="table-responsive" style="border:none;border-radius:0"><table><thead><tr>';
      t += '<th class="num">#</th><th>Account ID</th><th>Account Name</th><th>Geo</th><th class="num">Total Score</th><th style="text-align:center">Total</th><th class="num">ML Score</th><th style="text-align:center">ML</th><th class="num">Rule Score</th><th style="text-align:center">Rule</th></tr></thead><tbody>';
      ps.forEach((p, i) => {
        t += `<tr>
          <td class="num">${i + 1}</td>
          <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted)">${esc(p['Account ID'])}</td>
          <td><b>${esc(p['Account Name'])}</b></td>
          <td>${esc(p.Geo || '—')}</td>
          <td class="num highlight-val">${p.total_score != null ? p.total_score : '—'}</td>
          <td style="text-align:center">${gradeBadge(p.total_grade)}</td>
          <td class="num">${p.ml_score != null ? p.ml_score : '—'}</td>
          <td style="text-align:center">${gradeBadge(p.ml_grade)}</td>
          <td class="num">${p.rule_score != null ? p.rule_score : '—'}</td>
          <td style="text-align:center">${gradeBadge(p.rule_grade)}</td>
        </tr>`;
      });
      t += '</tbody></table></div>';
      body.innerHTML = t;
    }
    body.dataset.rendered = '1';
  }
}

function exportSegmentProspectsCSV(idx) {
  const s = window._cachedPBySeg[idx];
  if (!s || !s.prospects) return;
  downloadCSV(s.prospects, 'prospects_' + (s.anchor || 'segment').toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.csv');
}

/* ==========================================================================
   Seasonality Timeline & Monthly Index
   ========================================================================== */
async function loadSeasonality() {
  const [indRes, subRes] = await Promise.all([
    fetchAPI(`/icp/seasonality?company=${encodeURIComponent(COMPANY)}&dimension=Industry${buildFilterQuery()}`, 'seasonalityInd'),
    fetchAPI(`/icp/seasonality?company=${encodeURIComponent(COMPANY)}&dimension=Sub-Industry${buildFilterQuery()}`, 'seasonalitySub')
  ]);

  STATE.sz.data['Industry'] = indRes;
  STATE.sz.data['Sub-Industry'] = subRes;

  initSeasonalitySeries();
}

function setSeasonalityDim(dim) {
  STATE.sz.dim = dim;
  $('btn-sz-ind').className = dim === 'Industry' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
  $('btn-sz-sub').className = dim === 'Sub-Industry' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
  initSeasonalitySeries();
}

function setSeasonalityMetric(m) {
  STATE.sz.metric = m;
  $('btn-sz-cnt').className = m === 'count' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
  $('btn-sz-amt').className = m === 'amount' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
  renderSeasonalityCharts();
}

function setSeasonalityRange(r) {
  STATE.sz.range = r;
  document.querySelectorAll('.sz-range-btn').forEach(btn => {
    btn.className = btn.textContent.toLowerCase() === r ? 'btn btn-primary btn-sm sz-range-btn' : 'btn btn-outline btn-sm sz-range-btn';
  });
  renderSeasonalityCharts();
}

function initSeasonalitySeries() {
  const d = STATE.sz.data[STATE.sz.dim];
  if (!d || !d.series) return;

  const totals = d.series.map(s => ({
    name: s.name,
    total: (s.deal_counts || []).reduce((a, b) => a + b, 0)
  })).sort((a, b) => b.total - a.total);

  STATE.sz.selected = new Set(totals.slice(0, 3).map(x => x.name));

  let chips = '';
  totals.forEach((t, i) => {
    const isSel = STATE.sz.selected.has(t.name);
    const col = CHART_COLORS[i % CHART_COLORS.length];
    chips += `<button class="btn btn-sm ${isSel ? 'btn-primary' : 'btn-outline'}" style="${isSel ? 'background:' + col + ';border-color:' + col : ''}" onclick="toggleSeasonalitySeries('${esc(t.name).replace(/'/g, "\\'")}')">
      ${esc(t.name)} (${fmtN(t.total)})
    </button>`;
  });
  $('sz-series-chips').innerHTML = chips;

  renderSeasonalityCharts();
}

function toggleSeasonalitySeries(name) {
  if (STATE.sz.selected.has(name)) STATE.sz.selected.delete(name);
  else STATE.sz.selected.add(name);
  initSeasonalitySeries();
}

function renderSeasonalityCharts() {
  const d = STATE.sz.data[STATE.sz.dim];
  if (!d || !d.months || !d.series) return;

  let months = d.months;
  let startIdx = 0;
  if (STATE.sz.range === '3m') startIdx = Math.max(0, months.length - 3);
  else if (STATE.sz.range === '6m') startIdx = Math.max(0, months.length - 6);
  else if (STATE.sz.range === '1y') startIdx = Math.max(0, months.length - 12);
  else if (STATE.sz.range === '2y') startIdx = Math.max(0, months.length - 24);
  else if (STATE.sz.range === '3y') startIdx = Math.max(0, months.length - 36);
  else if (STATE.sz.range === '5y') startIdx = Math.max(0, months.length - 60);

  const visibleMonths = months.slice(startIdx);

  // Timeline Datasets
  const datasets = [];
  d.series.forEach((s, i) => {
    if (!STATE.sz.selected.has(s.name)) return;
    const col = CHART_COLORS[i % CHART_COLORS.length];
    const raw = STATE.sz.metric === 'count' ? s.deal_counts : s.deal_amounts;
    datasets.push({
      label: s.name,
      data: raw.slice(startIdx),
      borderColor: col,
      backgroundColor: col + '22',
      tension: 0.3,
      fill: true,
      borderWidth: 2.5,
      pointRadius: 3
    });
  });

  const ctxTimeline = $('chart-seasonality-timeline').getContext('2d');
  if (STATE.sz.chartTimeline) STATE.sz.chartTimeline.destroy();

  const isDark = STATE.theme === 'dark';
  const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';
  const textColor = isDark ? '#94A3B8' : '#64748B';

  STATE.sz.chartTimeline = new Chart(ctxTimeline, {
    type: 'line',
    data: { labels: visibleMonths, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: textColor, font: { family: 'Poppins', weight: 600 } } }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor } },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: textColor, callback: v => STATE.sz.metric === 'amount' ? fmt(v) : v },
          title: { display: true, text: STATE.sz.metric === 'amount' ? 'Deal Volume ($)' : 'Won Deals Count', color: textColor }
        }
      }
    }
  });

  // Seasonal Monthly Index
  if (d.seasonal_index && d.seasonal_index.length) {
    const calLabels = d.seasonal_index[0].months || ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const idxDatasets = [];

    d.series.forEach((s, i) => {
      if (!STATE.sz.selected.has(s.name)) return;
      const si = d.seasonal_index.find(x => x.name === s.name);
      if (!si) return;
      const vals = STATE.sz.metric === 'count' ? si.index_counts : si.index_amounts;
      const col = CHART_COLORS[i % CHART_COLORS.length];
      idxDatasets.push({
        label: s.name,
        data: vals,
        backgroundColor: col,
        borderRadius: 4
      });
    });

    const ctxSeasonal = $('chart-seasonal-index').getContext('2d');
    if (STATE.sz.chartSeasonal) STATE.sz.chartSeasonal.destroy();

    STATE.sz.chartSeasonal = new Chart(ctxSeasonal, {
      type: 'bar',
      data: { labels: calLabels, datasets: idxDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: textColor, font: { family: 'Poppins' } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor } },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, callback: v => v + 'x' },
            title: { display: true, text: 'Index (1.0 = Average)', color: textColor }
          }
        }
      }
    });
  }
}

function exportSeasonalityCSV() {
  const d = STATE.sz.data[STATE.sz.dim];
  if (!d) return;
  const rows = [];
  d.series.forEach(s => {
    d.months.forEach((m, idx) => {
      rows.push({
        Dimension: STATE.sz.dim,
        Name: s.name,
        Month: m,
        Deals: s.deal_counts[idx] || 0,
        Amount: s.deal_amounts[idx] || 0
      });
    });
  });
  downloadCSV(rows, 'seasonality_' + STATE.sz.dim.toLowerCase() + '.csv');
}

/* ==========================================================================
   Contact Scores
   ========================================================================== */
async function loadContacts() {
  const q = `?company=${encodeURIComponent(COMPANY)}&limit=${STATE.contacts.limit}&offset=${STATE.contacts.offset}${STATE.contacts.search ? '&search=' + encodeURIComponent(STATE.contacts.search) : ''}${STATE.contacts.grade ? '&grade=' + STATE.contacts.grade : ''}${STATE.contacts.type ? '&account_type=' + encodeURIComponent(STATE.contacts.type) : ''}${STATE.contacts.dmOnly ? '&decision_makers_only=true' : ''}${STATE.contacts.hsOnly ? '&in_hubspot_only=true' : ''}${buildFilterQuery()}`;
  const data = await fetchAPI('/icp/contacts' + q, 'contacts');
  if (!data) return;

  STATE.contacts.data = data.contacts || [];
  STATE.contacts.total = data.total || 0;

  // Populate account types dropdown once
  const selType = $('ct-filter-type');
  if (selType.options.length <= 1 && data.account_types) {
    data.account_types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      selType.appendChild(opt);
    });
  }

  // Populate Contact KPIs
  const gc = data.grade_counts || {};
  $('contacts-kpi-grid').innerHTML = `
    <div class="kpi-card"><div class="kpi-card-header"><span class="kpi-label">Total Contacts</span></div><div class="kpi-value">${fmtN(data.total)}</div></div>
    <div class="kpi-card"><div class="kpi-card-header"><span class="kpi-label">Avg Unified Score</span></div><div class="kpi-value highlight-val">${data.avg_score || 0}</div></div>
    <div class="kpi-card"><div class="kpi-card-header"><span class="kpi-label">Grade A</span></div><div class="kpi-value" style="color:var(--emerald-500)">${fmtN(gc.A || 0)}</div></div>
    <div class="kpi-card"><div class="kpi-card-header"><span class="kpi-label">Grade B</span></div><div class="kpi-value" style="color:var(--primary)">${fmtN(gc.B || 0)}</div></div>
    <div class="kpi-card"><div class="kpi-card-header"><span class="kpi-label">Decision Makers</span></div><div class="kpi-value">${fmtN(data.decision_maker_count || 0)}</div></div>
    <div class="kpi-card"><div class="kpi-card-header"><span class="kpi-label">In HubSpot CRM</span></div><div class="kpi-value" style="color:var(--blue-500)">${fmtN(data.in_hubspot_count || 0)}</div></div>
  `;

  renderContactsTable();
}

function renderContactsTable() {
  const tbody = $('contacts-table-body');
  const rows = STATE.contacts.data;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:24px;color:var(--text-muted)">No contacts match your filters.</td></tr>';
    $('contacts-pager').innerHTML = '';
    return;
  }

  let html = '';
  rows.forEach((c, idx) => {
    const fullName = esc(c.Name || ((c.FirstName || '') + ' ' + (c.LastName || '')).trim() || '—');
    html += `<tr>
      <td class="num" style="color:var(--text-muted)">${STATE.contacts.offset + idx + 1}</td>
      <td><b>${fullName}</b></td>
      <td style="font-family:var(--font-mono);font-size:11.5px">${esc(c.Email || '—')}</td>
      <td>${esc(c.Title || c.jobtitle || '—')}</td>
      <td>${esc(c['Account Name'] || '—')}</td>
      <td><span class="pill pill-review">${esc(c.Type || '—')}</span></td>
      <td class="num highlight-val">${c.contact_score != null ? c.contact_score : '—'}</td>
      <td style="text-align:center">${gradeBadge(c.contact_grade)}</td>
      <td class="num">${c.account_score || 0}</td>
      <td class="num">${c.role_fit_score || 0}</td>
      <td class="num">${c.engagement_score || 0}</td>
      <td class="num">${c.recency_score || 0}</td>
      <td style="text-align:center">${c.in_hubspot ? '<span class="pill pill-exact">Yes</span>' : '<span class="pill pill-review">No</span>'}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
  renderPager('contacts-pager', STATE.contacts, loadContacts, 'contacts');
}

function loadContactsReset() {
  STATE.contacts.offset = 0;
  STATE.contacts.type = $('ct-filter-type').value;
  STATE.contacts.grade = $('ct-filter-grade').value;
  STATE.contacts.dmOnly = $('ct-chk-dm').checked;
  STATE.contacts.hsOnly = $('ct-chk-hs').checked;
  loadContacts();
}

let ctSearchTimeout = null;
function onSearchContacts(val) {
  clearTimeout(ctSearchTimeout);
  ctSearchTimeout = setTimeout(() => {
    STATE.contacts.search = val.trim();
    STATE.contacts.offset = 0;
    loadContacts();
  }, 300);
}

function exportContactsCSV() {
  window.open(API_BASE + '/icp/contacts/export?company=' + encodeURIComponent(COMPANY));
}

/* ==========================================================================
   Competitor Intelligence Engine
   ========================================================================== */
function getCompData() {
  return window.COMPETITOR_DATA || { competitors: [], customers: [], overlap: [], lookalikes: [] };
}

function renderCompetitorProfiles() {
  const cd = getCompData();
  const comps = cd.competitors || [];
  const overlaps = cd.overlap || [];

  const overlapMap = {};
  overlaps.forEach(o => {
    overlapMap[o.competitor] = (overlapMap[o.competitor] || 0) + 1;
  });

  const gen = cd.generated_from || {};
  if ($('comp-kpi-count')) $('comp-kpi-count').textContent = gen.competitors || comps.length || 10;
  if ($('comp-kpi-customers')) $('comp-kpi-customers').textContent = gen.competitor_customers || (cd.customers ? cd.customers.length : 136);
  if ($('comp-kpi-prospects')) $('comp-kpi-prospects').textContent = fmtN(gen.prospects || 81898);
  if ($('comp-kpi-overlap')) $('comp-kpi-overlap').textContent = overlaps.length || 54;

  const grid = $('comp-profiles-grid');
  let html = '';
  comps.forEach((c, idx) => {
    const hits = overlapMap[c.competitor] || 0;

    let stripHtml = '';
    let legendHtml = '';
    (c.top_industries || []).forEach(t => {
      const col = getIndColor(t.industry);
      stripHtml += `<i style="width:${t.share}%;background:${col}" title="${esc(t.industry)}: ${t.share}%"></i>`;
      legendHtml += `<span><em style="background:${col}"></em>${esc(t.industry)} (${t.share}%)</span>`;
    });

    html += `<div class="competitor-card">
      <div class="competitor-header">
        <div>
          <div class="competitor-name">${esc(c.competitor)}</div>
          <div class="competitor-meta">${esc(c.primary_industry)} &middot; ${esc(c.est_revenue)} &middot; ${esc(c.hq_country)}</div>
        </div>
        <span class="tag-cat ${c.category === 'Fleet' ? 'tag-fleet' : 'tag-field'}">${esc(c.category)}</span>
      </div>

      <div class="competitor-statement">${esc(c.icp_statement)}</div>

      <div class="comp-strip">${stripHtml}</div>
      <div class="comp-legend">${legendHtml}</div>

      <div class="comp-stats-row">
        <div>
          <span class="comp-stat-lbl">Observed Customers</span>
          <div class="comp-stat-val">${c.customer_count} accounts</div>
        </div>
        <div>
          <span class="comp-stat-lbl">In GPS Prospect List</span>
          <div class="comp-stat-val" style="color:${hits ? 'var(--emerald-500)' : 'var(--text-muted)'}">${hits} overlaps</div>
        </div>
      </div>

      <div class="comp-fit-section">
        <div class="comp-fit-count">
          <b>${fmtN(c.icp_match_count)}</b>
          <span>GPS Prospects Fit Profile</span>
        </div>
        <button class="btn btn-primary btn-sm" onclick="openCompLookalikesDrawer(${idx})" ${c.icp_match_count ? '' : 'disabled'}>
          View ${fmtN(c.icp_match_count)} Accounts &rarr;
        </button>
      </div>
    </div>`;
  });
  grid.innerHTML = html;
}

function openCompLookalikesDrawer(idx) {
  const cd = getCompData();
  const c = cd.competitors[idx];
  if (!c) return;

  const matches = c.icp_matches || [];
  openGenericDrawer(
    c.competitor + ' ICP Match Accounts',
    `${fmtN(c.icp_match_count)} GPS prospects matching criteria (${c.criteria.emp_band} emp, ${c.criteria.rev_band} rev)`,
    [
      { k: 'account_name', label: 'Account Name', bold: true },
      { k: 'account_id', label: 'Account ID', mono: true },
      { k: 'industry', label: 'Vertical' },
      { k: 'industry_detail', label: 'Category' },
      { k: 'employees', label: 'Employees', num: true },
      { k: 'revenue', label: 'Revenue', num: true },
      { k: 'brand', label: 'Brand' },
      { k: 'ml_score', label: 'ML Score', num: true, highlight: true },
      { k: 'ml_grade', label: 'Grade', grade: true }
    ],
    matches,
    `icp_matches_${c.competitor.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`
  );
}

/* --------------------------------------------------------------------------
   Competitor Customer Book
   -------------------------------------------------------------------------- */
function renderCompBook() {
  const cd = getCompData();
  const customers = cd.customers || [];
  const overlaps = cd.overlap || [];

  const overlapMap = {};
  overlaps.forEach(o => overlapMap[o.competitor + '|' + o.customer_name] = o);

  // Populate Selects if empty
  const selComp = $('comp-book-filter-comp');
  if (selComp.options.length <= 1) {
    const comps = [...new Set(customers.map(c => c.competitor))].sort();
    comps.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      selComp.appendChild(opt);
    });
  }

  const selInd = $('comp-book-filter-ind');
  if (selInd.options.length <= 1) {
    const inds = [...new Set(customers.map(c => c.industry))].sort();
    inds.forEach(i => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i;
      selInd.appendChild(opt);
    });
  }

  filterCompBook();
}

function filterCompBook() {
  const cd = getCompData();
  const customers = cd.customers || [];
  const overlaps = cd.overlap || [];
  const overlapMap = {};
  overlaps.forEach(o => overlapMap[o.competitor + '|' + o.customer_name] = o);

  const q = $('comp-book-search').value.toLowerCase().trim();
  const comp = $('comp-book-filter-comp').value;
  const ind = $('comp-book-filter-ind').value;
  const flag = $('comp-book-filter-flag').value;

  const filtered = customers.filter(r => {
    const isOverlap = !!overlapMap[r.competitor + '|' + r.name];
    if (comp && r.competitor !== comp) return false;
    if (ind && r.industry !== ind) return false;
    if (flag === '1' && !isOverlap) return false;
    if (flag === '0' && isOverlap) return false;
    if (q && !(r.name + ' ' + (r.industry_detail || '')).toLowerCase().includes(q)) return false;
    return true;
  });

  STATE.compBook.filtered = filtered;
  STATE.compBook.total = filtered.length;

  const page = filtered.slice(STATE.compBook.offset, STATE.compBook.offset + STATE.compBook.limit);
  const tbody = $('comp-book-table-body');

  if (!page.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No competitor customers match filter criteria.</td></tr>';
    $('comp-book-pager').innerHTML = '';
    return;
  }

  let html = '';
  page.forEach(r => {
    const ov = overlapMap[r.competitor + '|' + r.name];
    html += `<tr>
      <td><b>${esc(r.name)}</b>${r.website ? `<div style="font-size:11px"><a href="${esc(r.website)}" target="_blank" style="color:var(--primary)">${esc(r.website.replace(/^https?:\/\//, ''))}</a></div>` : ''}</td>
      <td>${esc(r.competitor)} <span class="tag-cat ${r.category === 'Fleet' ? 'tag-fleet' : 'tag-field'}">${esc(r.category)}</span></td>
      <td><span style="color:${getIndColor(r.industry)};font-weight:600">${esc(r.industry)}</span></td>
      <td style="color:var(--text-muted)">${esc(r.industry_detail || '—')}</td>
      <td class="num">${esc(r.revenue || '—')}</td>
      <td class="num">${esc(r.employees || '—')}</td>
      <td>${esc(r.country || 'USA')}</td>
      <td>${ov ? `<span class="pill pill-exact"><svg class="svg-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px"><polyline points="20 6 9 17 4 12"></polyline></svg>In List: ${esc(ov.prospect_name)}</span>` : '<span class="pill pill-review">—</span>'}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
  renderPager('comp-book-pager', STATE.compBook, filterCompBook, 'customers');
}

function exportCompBookCSV() {
  downloadCSV(STATE.compBook.filtered, 'competitor_customer_book.csv');
}

/* --------------------------------------------------------------------------
   Prospect Overlap (Displacement Engine)
   -------------------------------------------------------------------------- */
function renderCompOverlap() {
  const cd = getCompData();
  const overlaps = cd.overlap || [];

  const selComp = $('comp-ov-filter-comp');
  if (selComp.options.length <= 1) {
    const comps = [...new Set(overlaps.map(o => o.competitor))].sort();
    comps.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      selComp.appendChild(opt);
    });
  }

  filterCompOverlap();
}

function filterCompOverlap() {
  const cd = getCompData();
  const overlaps = cd.overlap || [];

  const q = $('comp-ov-search').value.toLowerCase().trim();
  const comp = $('comp-ov-filter-comp').value;
  const tier = $('comp-ov-filter-tier').value;

  const filtered = overlaps.filter(o => {
    if (comp && o.competitor !== comp) return false;
    if (tier && o.match_tier !== tier) return false;
    if (q && !(o.customer_name + ' ' + o.prospect_name).toLowerCase().includes(q)) return false;
    return true;
  });

  STATE.compOverlap.filtered = filtered;
  STATE.compOverlap.total = filtered.length;

  const page = filtered.slice(STATE.compOverlap.offset, STATE.compOverlap.offset + STATE.compOverlap.limit);
  const tbody = $('comp-overlap-table-body');

  if (!page.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted)">No displacement accounts found.</td></tr>';
    $('comp-overlap-pager').innerHTML = '';
    return;
  }

  let html = '';
  page.forEach(o => {
    const tierPill = o.match_tier === 'Exact' ? 'pill-exact' : o.match_tier === 'Likely' ? 'pill-likely' : 'pill-review';
    html += `<tr>
      <td><b>${esc(o.competitor)}</b><div style="font-size:10.5px;color:var(--text-muted)">${esc(o.competitor_category)}</div></td>
      <td>${esc(o.customer_name)}<div style="font-size:10.5px;color:var(--text-muted)">${esc(o.customer_industry_detail || '')}</div></td>
      <td><b>${esc(o.prospect_name)}</b><div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${esc(o.prospect_account_id)}</div></td>
      <td><span class="pill ${tierPill}">${esc(o.match_tier)}</span></td>
      <td><span style="color:${getIndColor(o.customer_industry)}">${esc(o.customer_industry)}</span></td>
      <td class="num">${esc(o.prospect_employees)}<div style="font-size:10.5px;color:var(--text-muted)">${esc(o.prospect_revenue)}</div></td>
      <td><span class="pill pill-review">${esc(o.prospect_brand || '—')}</span></td>
      <td class="num highlight-val">${o.ml_score != null ? Number(o.ml_score).toFixed(1) : '—'}</td>
      <td style="text-align:center">${gradeBadge(o.ml_grade)}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
  renderPager('comp-overlap-pager', STATE.compOverlap, filterCompOverlap, 'matches');
}

function exportCompOverlapCSV() {
  downloadCSV(STATE.compOverlap.filtered, 'prospect_competitor_overlaps.csv');
}

/* --------------------------------------------------------------------------
   Lookalikes Console
   -------------------------------------------------------------------------- */
function renderCompLookalikes() {
  const cd = getCompData();
  const lookalikes = cd.lookalikes || [];

  const selComp = $('comp-lk-filter-comp');
  if (selComp.options.length <= 1) {
    const comps = [...new Set(lookalikes.map(l => l.competitor))].sort();
    comps.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      selComp.appendChild(opt);
    });
  }

  filterCompLookalikes();
}

function filterCompLookalikes() {
  const cd = getCompData();
  const lookalikes = cd.lookalikes || [];

  const q = $('comp-lk-search').value.toLowerCase().trim();
  const comp = $('comp-lk-filter-comp').value;
  const grade = $('comp-lk-filter-grade').value;
  const minSim = Number($('comp-lk-filter-min').value) || 0;

  const filtered = lookalikes.filter(l => {
    if (comp && l.competitor !== comp) return false;
    if (grade && l.ml_grade !== grade) return false;
    if (l.similarity < minSim) return false;
    if (q && !String(l.prospect_name).toLowerCase().includes(q)) return false;
    return true;
  });

  STATE.compLookalikes.filtered = filtered;
  STATE.compLookalikes.total = filtered.length;

  const page = filtered.slice(STATE.compLookalikes.offset, STATE.compLookalikes.offset + STATE.compLookalikes.limit);
  const tbody = $('comp-lookalikes-table-body');

  if (!page.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted)">No lookalike prospects found.</td></tr>';
    $('comp-lookalikes-pager').innerHTML = '';
    return;
  }

  let html = '';
  page.forEach(l => {
    html += `<tr>
      <td><b>${esc(l.prospect_name)}</b><div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${esc(l.prospect_account_id)}</div></td>
      <td><span style="color:${getIndColor(l.prospect_industry)}">${esc(l.prospect_industry)}</span></td>
      <td class="num">${esc(l.prospect_employees)}<div style="font-size:10.5px;color:var(--text-muted)">${esc(l.prospect_revenue)}</div></td>
      <td><span class="pill pill-review">${esc(l.prospect_brand || '—')}</span></td>
      <td class="num">
        <div class="sim-meter">
          <span>${l.similarity}%</span>
          <div class="sim-meter-bar"><div class="sim-meter-fill" style="width:${l.similarity}%"></div></div>
        </div>
      </td>
      <td><b>${esc(l.matched_customer)}</b><div style="font-size:10.5px;color:var(--text-muted)">${esc(l.matched_customer_industry_detail || '')}</div></td>
      <td>${esc(l.competitor)}</td>
      <td class="num highlight-val">${l.ml_score != null ? Number(l.ml_score).toFixed(1) : '—'}</td>
      <td style="text-align:center">${gradeBadge(l.ml_grade)}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
  renderPager('comp-lookalikes-pager', STATE.compLookalikes, filterCompLookalikes, 'lookalikes');
}

function exportCompLookalikesCSV() {
  downloadCSV(STATE.compLookalikes.filtered, 'competitor_lookalike_prospects.csv');
}

/* ==========================================================================
   Universal Slide-Over Drawer
   ========================================================================== */
function closeDrawer() {
  $('drawer-backdrop').classList.remove('open');
  STATE.drawer.open = false;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && STATE.drawer.open) closeDrawer();
});

async function openAccountsDrawer(title, subtitle, params) {
  let q = `?company=${encodeURIComponent(COMPANY)}&limit=1000&offset=0${buildFilterQuery()}`;
  Object.entries(params).forEach(([k, v]) => { if (v) q += '&' + k + '=' + encodeURIComponent(v); });

  showProgress();
  const data = await fetchAPI('/icp/accounts' + q, 'accounts');
  hideProgress();

  const rows = (data && data.accounts) || [];
  openGenericDrawer(
    title,
    subtitle || (fmtN(rows.length) + ' customer accounts'),
    [
      { k: 'Account Name', label: 'Account Name', bold: true },
      { k: 'Account ID', label: 'Account ID', mono: true },
      { k: 'Geo', label: 'Geo' },
      { k: 'Employees', label: 'Employees', num: true },
      { k: 'clv', label: 'CLV', num: true, highlight: true, money: true },
      { k: 'win_rate', label: 'Win Rate', num: true, pct: true },
      { k: 'won_deals', label: 'Won Deals', num: true },
      { k: 'good_customer', label: 'ICP Score', num: true }
    ],
    rows,
    'customers_' + title.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.csv'
  );
}

async function openProspectsDrawer(title, subtitle, params) {
  let q = `?company=${encodeURIComponent(COMPANY)}&limit=1000&offset=0${buildFilterQuery()}`;
  Object.entries(params).forEach(([k, v]) => { if (v) q += '&' + k + '=' + encodeURIComponent(v); });

  showProgress();
  const data = await fetchAPI('/icp/prospects' + q, 'prospects');
  hideProgress();

  const rows = (data && data.prospects) || [];
  openGenericDrawer(
    title + ' · Prospects',
    subtitle || (fmtN(rows.length) + ' prospect accounts'),
    [
      { k: 'Account Name', label: 'Account Name', bold: true },
      { k: 'Account ID', label: 'Account ID', mono: true },
      { k: 'Geo', label: 'Geo' },
      { k: 'Employees', label: 'Employees', num: true },
      { k: 'total_score', label: 'Total Score', num: true, highlight: true },
      { k: 'total_grade', label: 'Grade', grade: true },
      { k: 'ml_score', label: 'ML Score', num: true },
      { k: 'rule_score', label: 'Rule Score', num: true }
    ],
    rows,
    'prospects_' + title.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.csv'
  );
}

function openGenericDrawer(title, subtitle, columns, rows, exportFilename) {
  STATE.drawer.open = true;
  STATE.drawer.title = title;
  STATE.drawer.subtitle = subtitle;
  STATE.drawer.columns = columns;
  STATE.drawer.allRows = rows;
  STATE.drawer.filteredRows = rows;
  STATE.drawer.total = rows.length;
  STATE.drawer.offset = 0;
  STATE.drawer.limit = 50;
  STATE.drawer.exportName = exportFilename;

  $('drawer-title').textContent = title;
  $('drawer-subtitle').textContent = subtitle;
  $('drawer-search-input').value = '';

  // Render Table Headers
  let th = '';
  columns.forEach(c => {
    th += `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`;
  });
  $('drawer-thead').innerHTML = th;

  renderDrawerBody();
  $('drawer-backdrop').classList.add('open');
}

function renderDrawerBody() {
  const tbody = $('drawer-tbody');
  const d = STATE.drawer;
  $('drawer-count-badge').textContent = fmtN(d.filteredRows.length) + ' accounts';

  const page = d.filteredRows.slice(d.offset, d.offset + d.limit);
  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="${d.columns.length}" style="text-align:center;padding:32px;color:var(--text-muted)">No matching records found.</td></tr>`;
    $('drawer-pager').innerHTML = '';
    return;
  }

  let html = '';
  page.forEach(r => {
    html += '<tr>';
    d.columns.forEach(c => {
      let val = r[c.k];
      let display = esc(val == null ? '—' : val);

      if (c.money) display = fmt(val);
      else if (c.pct && val != null) display = (Number(val) * 100).toFixed(1) + '%';
      else if (c.num && val != null && !isNaN(val)) display = fmtN(val);

      if (c.bold) display = '<b>' + display + '</b>';
      if (c.mono) display = '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">' + display + '</span>';
      if (c.grade) display = gradeBadge(val);
      if (c.highlight) display = '<span class="highlight-val">' + display + '</span>';

      html += `<td class="${c.num ? 'num' : ''}" style="${c.grade ? 'text-align:center' : ''}">${display}</td>`;
    });
    html += '</tr>';
  });
  tbody.innerHTML = html;
  renderPager('drawer-pager', STATE.drawer, renderDrawerBody, 'accounts');
}

function onDrawerSearch(val) {
  const q = val.toLowerCase().trim();
  STATE.drawer.filteredRows = STATE.drawer.allRows.filter(r => {
    if (!q) return true;
    return Object.values(r).some(v => String(v || '').toLowerCase().includes(q));
  });
  STATE.drawer.total = STATE.drawer.filteredRows.length;
  STATE.drawer.offset = 0;
  renderDrawerBody();
}

function exportDrawerCSV() {
  downloadCSV(STATE.drawer.filteredRows, STATE.drawer.exportName);
}

/* ==========================================================================
   Shared Pager Component
   ========================================================================== */
function pageNumbers(current, totalPages) {
  const w = 5, set = new Set([1, totalPages, current, current - 1, current + 1]);
  if (current <= 3) { for (let i = 1; i <= Math.min(w, totalPages); i++) set.add(i); }
  if (current >= totalPages - 2) { for (let i = Math.max(1, totalPages - w + 1); i <= totalPages; i++) set.add(i); }
  const arr = [...set].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out = []; let prev = 0;
  arr.forEach(n => { if (prev && n - prev > 1) out.push('…'); out.push(n); prev = n; });
  return out;
}

function renderPager(elId, state, onChangeFn, label) {
  const el = $(elId);
  if (!el) return;

  const start = state.total ? state.offset + 1 : 0;
  const end = Math.min(state.offset + state.limit, state.total);
  const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
  const current = Math.floor(state.offset / state.limit) + 1;
  const canPrev = current > 1, canNext = current < totalPages;

  const key = elId + '_size';
  window[key] = v => { state.limit = parseInt(v, 10) || state.limit; state.offset = 0; onChangeFn(); };
  const goKey = elId + '_go';
  window[goKey] = p => { state.offset = Math.max(0, (p - 1) * state.limit); onChangeFn(); };
  const pKey = elId + '_p';
  window[pKey] = d => { state.offset = Math.max(0, state.offset + d * state.limit); onChangeFn(); };

  let sel = `<select onchange="window['${key}'](this.value)">`;
  [25, 50, 100, 200].forEach(n => {
    sel += `<option value="${n}" ${n === state.limit ? 'selected' : ''}>${n} / page</option>`;
  });
  sel += '</select>';

  let right = `<button class="pg-btn" ${canPrev ? `onclick="window['${pKey}'](-1)"` : 'disabled'}>&lsaquo; Prev</button>`;
  pageNumbers(current, totalPages).forEach(n => {
    if (n === '…') right += '<span style="padding:0 6px;color:var(--text-muted)">…</span>';
    else right += `<button class="pg-btn ${n === current ? 'active' : ''}" onclick="window['${goKey}'](${n})">${n}</button>`;
  });
  right += `<button class="pg-btn" ${canNext ? `onclick="window['${pKey}'](1)"` : 'disabled'}>Next &rsaquo;</button>`;

  el.innerHTML = `
    <div class="pagination-left">
      <span>Showing <b>${fmtN(start)}</b>–<b>${fmtN(end)}</b> of <b>${fmtN(state.total)}</b> ${label || ''}</span>
      ${sel}
    </div>
    <div class="pagination-right">${right}</div>
  `;
}

/* ==========================================================================
   Pipeline Re-run Action
   ========================================================================== */
async function reRunPipeline() {
  const btn = $('btn-rerun-pipeline');
  btn.disabled = true;
  $('rerun-icon').innerHTML = '<svg class="svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin .8s linear infinite"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>';
  showProgress();

  try {
    const res = await fetch(API_BASE + '/icp/pipeline/run?company=' + encodeURIComponent(COMPANY), { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    alert('Pipeline re-run completed successfully!');
    await loadSummary();
    loadViewData(STATE.subTab);
  } catch (e) {
    alert('Pipeline run triggered. Data refreshed: ' + e.message);
    await loadSummary();
    loadViewData(STATE.subTab);
  } finally {
    btn.disabled = false;
    $('rerun-icon').innerHTML = '<svg class="svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';
    hideProgress();
  }
}

function exportCurrentView() {
  if (STATE.primaryTab === 'icp') {
    if (STATE.subTab === 'combos') exportCombosCSV();
    else if (STATE.subTab === 'industry') exportIndustryCSV();
    else if (STATE.subTab === 'customers') exportCustomersCSV();
    else if (STATE.subTab === 'prospects') exportProspectsCSV();
    else if (STATE.subTab === 'seasonality') exportSeasonalityCSV();
    else if (STATE.subTab === 'contacts') exportContactsCSV();
    else if (STATE.subTab === 'overview') exportOverviewCSV();
    else alert('Export available on detailed data tabs.');
  } else {
    if (STATE.subTab === 'comp-book') exportCompBookCSV();
    else if (STATE.subTab === 'comp-overlap') exportCompOverlapCSV();
    else if (STATE.subTab === 'comp-lookalikes') exportCompLookalikesCSV();
    else alert('Export available on Competitor Book, Overlap, and Lookalikes tabs.');
  }
}

/* ==========================================================================
   Application Initialization
   ========================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  setTheme(STATE.theme);
  await loadSummary();
  switchPrimaryTab('icp');
});
