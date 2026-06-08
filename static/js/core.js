// ==================== 全局状态 ====================
var currentPage = 'dashboard';
var currentPeriod = '';
var allAccounts = [];

// 多公司全局状态（供所有模块访问）
var currentCompanyId = 1;
var currentCompanyName = '';
var allCompanies = [];

// 文件导入全局状态
var _importFile = null;
var _importModule = '';
var _importBankConfigId = null;

// ==================== 全局工具函数 ====================
function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
var esc = escapeHtml;  // 简写别名，统一使用 core.js 的 escapeHtml，不再重复定义

const pages = {
  'chat': 'AI 助手',
  'dashboard': '数据看板',
  'company': '公司信息',
  'departments': '部门档案',
  'employees': '人员档案',
  'customers': '客户档案',
  'suppliers': '供应商档案',
  'general-ledger': '总账',
  'detail-ledger': '明细账',
  'employee-ledger': '人员明细账',
  'customer-ledger': '客户明细账',
  'supplier-ledger': '供应商明细账',
  'journal': '序时账',
  'profit-loss': '利润表',
  'balance-sheet': '资产负债表',
  'cash-flow': '现金流量表',
  'equity-changes': '所有者权益变动表',
  'account-balance': '科目余额表',
  'accounts': '会计科目',
  'periods': '期间管理',
  'fixed-assets': '固定资产',
  'intangible-assets': '无形资产',
  'inventory': '库存管理',
  'contracts': '合同管理',
  'payments': '付款管理',
  'sales-invoices': '开具发票',
  'purchase-invoices': '取得发票',
  'input-vat-deductions': '进项认证',
  'bank-transactions': '银行流水',
  'vat-declaration': '增值税',
  'salary': '工资薪金',
  'social-security': '社会保险费',
  'housing-fund': '住房公积金'
};

// ==================== 初始化（多公司版本） ====================
async function init() {
  const companies = await loadCompaniesRaw();
  window._companiesForPick = companies || [];

  // 如果刷新前在建档页，保持建档页
  if (sessionStorage.getItem('onRegistrationPage') === '1') {
    showRegistration();
    return;
  }

  if (!companies || companies.length === 0) {
    showRegistration();
    return;
  }
  // 记住上次选择的公司，刷新直接进入
  const lastCompanyId = localStorage.getItem('lastCompanyId');
  const lastCompanyName = localStorage.getItem('lastCompanyName');
  if (lastCompanyId && lastCompanyName) {
    const exists = companies.some(c => String(c.id) === String(lastCompanyId));
    if (exists) {
      await enterApp(parseInt(lastCompanyId), lastCompanyName);
      return;
    }
  }
  showCompanyPick(companies);
}

async function loadCompaniesRaw() {
  try {
    return await fetch('/api/companies').then(r => r.json());
  } catch (e) {
    return [];
  }
}

function showRegistration() {
  document.getElementById('registration-view').classList.remove('hidden');
  document.getElementById('company-pick-view').classList.add('hidden');
  document.getElementById('app-view').classList.add('hidden');
  // 标记用户在建档页，刷新时保留
  sessionStorage.setItem('onRegistrationPage', '1');
  // 如果有已有公司，显示"返回选择"链接
  const hasExisting = (window._companiesForPick && window._companiesForPick.length > 0);
  document.getElementById('reg-back-hint').style.display = hasExisting ? '' : 'none';
}

function showCompanyPick(companies) {
  sessionStorage.removeItem('onRegistrationPage');
  // 没有公司时直接跳建档页
  if (!companies || companies.length === 0) {
    showRegistration();
    return;
  }
  const list = document.getElementById('pick-list');
  list.innerHTML = companies.map(c => {
    const initial = c.name ? c.name.charAt(0) : '公';
    return '<li onclick="enterApp(' + c.id + ', \'' + escapeHtml(c.name) + '\')">'
      + '<div class="av">' + initial + '</div>'
      + '<div class="info"><div class="cn">' + escapeHtml(c.name) + '</div>'
      + (c.uscc ? '<div class="us">' + escapeHtml(c.uscc) + '</div>' : '')
      + '</div><div class="arr">→</div>'
      + '<button class="pick-del-btn" onclick="event.stopPropagation();deleteCompanyFromPick(' + c.id + ',\'' + escapeHtml(c.name) + '\')" title="删除此账套">🗑</button>'
      + '</li>';
  }).join('');
  document.getElementById('registration-view').classList.add('hidden');
  document.getElementById('company-pick-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

async function deleteCompanyFromPick(companyId, companyName) {
  if (!confirm('确定要删除账套「' + companyName + '」吗？\n\n⚠️ 此操作不可逆，该账套下的所有数据（凭证、发票、报表等）将一并删除。')) return;
  try {
    // 如果删除的是当前已登录的公司，先清除记录
    if (currentCompanyId === companyId) {
      localStorage.removeItem('lastCompanyId');
      localStorage.removeItem('lastCompanyName');
      currentCompanyId = 1;
      currentCompanyName = '';
    }
    await fetch('/api/companies/' + companyId, { method: 'DELETE' });
    toast('账套「' + companyName + '」已删除', 'success');
    // 刷新选择列表
    const companies = await loadCompaniesRaw();
    window._companiesForPick = companies || [];
    if (!companies || companies.length === 0) {
      localStorage.removeItem('lastCompanyId');
      localStorage.removeItem('lastCompanyName');
      showRegistration();
    } else {
      showCompanyPick(companies);
    }
  } catch (e) {
    toast('删除失败：' + e.message, 'error');
  }
}

async function enterApp(companyId, companyName) {
  sessionStorage.removeItem('onRegistrationPage');
  currentCompanyId = companyId;
  currentCompanyName = companyName;
  localStorage.setItem('lastCompanyId', companyId);
  localStorage.setItem('lastCompanyName', companyName);
  document.getElementById('registration-view').classList.add('hidden');
  document.getElementById('company-pick-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');
  await loadCompanies();
  await loadCurrentPeriod();
  await loadAllAccounts();
  const lastPage = localStorage.getItem('lastPage') || 'dashboard';
  navigateTo(lastPage);
}

async function exitCompany() {
  // 清除记录的账套信息，返回公司选择页
  localStorage.removeItem('lastCompanyId');
  localStorage.removeItem('lastCompanyName');
  localStorage.removeItem('lastPage');
  currentCompanyId = 1;
  currentCompanyName = '';
  const companies = await loadCompaniesRaw();
  window._companiesForPick = companies || [];
  showCompanyPick(companies);
}

async function handleCompanyRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('reg-submit-btn');
  btn.disabled = true;
  btn.textContent = '⏳ 正在创建...';

  const name = document.getElementById('reg-name').value.trim();
  if (!name) { toast('请输入公司全称', 'error'); btn.disabled = false; btn.textContent = '✅ 创建账套，进入系统'; return; }

  const body = {
    name: name,
    uscc: document.getElementById('reg-uscc').value.trim() || null
  };

  try {
    const data = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => { if (!r.ok) return r.json().then(err => { throw new Error(err.detail || '创建失败'); }); return r.json(); });
    toast('公司「' + data.name + '」创建成功，正在进入系统...', 'success');
    setTimeout(() => enterApp(data.id, data.name), 600);
  } catch (err) {
    toast('创建失败：' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = '✅ 创建账套，进入系统';
  }
}


async function loadCurrentPeriod() {
  const yearSel = document.getElementById('period-year');
  if (!yearSel) return;
  let ops = '<option value="">年</option>';
  let now = new Date();
  let curY = now.getFullYear();
  for (let y = curY - 5; y <= curY + 5; y++) ops += `<option value="${y}">${y}年</option>`;
  yearSel.innerHTML = ops;

  const saved = localStorage.getItem('currentPeriod');
  if (saved && /^\d{4}-\d{2}$/.test(saved)) {
    const [y, m] = saved.split('-');
    yearSel.value = y;
    const monthSel = document.getElementById('period-month');
    if (monthSel) monthSel.value = m;
    currentPeriod = saved;
  }
}

function periodToDateRange(period) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return { from: '', to: '' };
  const [y, m] = period.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: period + '-01', to: period + '-' + String(lastDay).padStart(2, '0') };
}

function onPeriodSelectChange() {
  const y = document.getElementById('period-year')?.value;
  const m = document.getElementById('period-month')?.value;
  if (!y || !m) return;
  const newPeriod = y + '-' + m;
  if (newPeriod === currentPeriod) return;
  currentPeriod = newPeriod;
  localStorage.setItem('currentPeriod', currentPeriod);
  // 同步所有已渲染页面的期间筛选框到新期间
  ['gl-from','gl-to','dl-from','dl-to','pl-from','pl-to','bs-from','bs-to','cf-from','cf-to','ec-from','tb-from','tb-to','je-from','je-to'].forEach(function(prefix) {
    let ey = document.getElementById(prefix + '-y');
    let em = document.getElementById(prefix + '-m');
    if (ey) ey.value = y;
    if (em) em.value = m;
  });
  // 同步工资薪金
  try { currentSalaryPeriod = newPeriod; } catch(e) {}
  let sy = document.getElementById('salary-y');
  let sm = document.getElementById('salary-m');
  if (sy) sy.value = y;
  if (sm) sm.value = m;
  // 同步往来明细账（人员/客户/供应商）
  ['employee','customer','supplier'].forEach(function(type) {
    ['from','to'].forEach(function(side) {
      let ey = document.getElementById(type + '-' + side + '-y');
      let em = document.getElementById(type + '-' + side + '-m');
      if (ey) ey.value = y;
      if (em) em.value = m;
    });
  });
  try { siFilter.dateFrom = ''; siFilter.dateTo = ''; } catch(e) {}
  try { piFilter.dateFrom = ''; piFilter.dateTo = ''; } catch(e) {}
  try { ivdFilter.dateFrom = ''; ivdFilter.dateTo = ''; } catch(e) {}
  navigateTo(currentPage);
}

// 全局期间确认：所有模块时间栏同步到顶格栏期间，并刷新当前页面数据
function globalPeriodConfirm() {
  const y = document.getElementById('period-year')?.value;
  const m = document.getElementById('period-month')?.value;
  if (!y || !m) { toast('请先在顶格栏选择年份和月份', 'warning'); return; }
  const newPeriod = y + '-' + m;
  currentPeriod = newPeriod;
  localStorage.setItem('currentPeriod', currentPeriod);

  // ===== 状态变量（影响 re-render/下次渲染时的默认值）必须在 navigateTo 之前设置 =====
  try { currentSalaryPeriod = newPeriod; } catch(e) {}
  try { vatFilterPeriod = newPeriod; vatSelectedId = null; vatCurrentData = null; } catch(e) {}
  try { ssFilterPeriod = newPeriod; } catch(e) {}

  // ===== DOM 直接同步（已渲染但当前未激活的页面，下次切换过去时生效） =====
  // 1. 序时账/总账/明细账/报表 (from-to)
  ['gl','dl','pl','bs','cf','ec','tb','je'].forEach(function(prefix) {
    ['from','to'].forEach(function(side) {
      let ey = document.getElementById(prefix + '-' + side + '-y');
      let em = document.getElementById(prefix + '-' + side + '-m');
      if (ey) ey.value = y;
      if (em) em.value = m;
    });
  });

  // 2. 往来明细账（人员/客户/供应商）
  ['employee','customer','supplier'].forEach(function(type) {
    ['from','to'].forEach(function(side) {
      let ey = document.getElementById(type + '-' + side + '-y');
      let em = document.getElementById(type + '-' + side + '-m');
      if (ey) ey.value = y;
      if (em) em.value = m;
    });
  });

  // 3. 工资薪金 DOM
  let sy = document.getElementById('salary-y');
  let sm = document.getElementById('salary-m');
  if (sy) sy.value = y;
  if (sm) sm.value = m;

  // 4. 住房公积金 DOM
  let hy = document.getElementById('hf-year');
  let hm = document.getElementById('hf-month');
  if (hy) hy.value = y;
  if (hm) hm.value = m;

  // 5. 社会保险费 DOM
  let ssPeriod = document.getElementById('ss-filter-period');
  if (ssPeriod) ssPeriod.value = newPeriod;

  // 6. 发票/抵扣筛选器
  try { siFilter.dateFrom = ''; siFilter.dateTo = ''; } catch(e) {}
  try { piFilter.dateFrom = ''; piFilter.dateTo = ''; } catch(e) {}
  try { ivdFilter.dateFrom = ''; ivdFilter.dateTo = ''; } catch(e) {}

  // ===== 刷新当前页面（re-render 会读状态变量决定默认期间） =====
  navigateTo(currentPage);
  toast('已同步所有模块到 ' + newPeriod, 'success');
}

function stepPeriodYear(delta) {
  const sel = document.getElementById('period-year');
  if (!sel || !sel.value) return;
  sel.value = parseInt(sel.value) + delta;
  onPeriodSelectChange();
}

function stepPeriodMonth(delta) {
  const sel = document.getElementById('period-month');
  if (!sel || !sel.value) return;
  let m = parseInt(sel.value) + delta;
  if (m > 12) { m = 1; stepPeriodYear(1); }
  else if (m < 1) { m = 12; stepPeriodYear(-1); }
  sel.value = String(m).padStart(2, '0');
  onPeriodSelectChange();
}

async function loadAllAccounts() {
  try {
    allAccounts = await api('/api/accounts');
  } catch (e) {}
}

// ==================== 路由 ====================
// 每页独立容器，切换只 show/hide，不清空 DOM
const _pageContainers = {};
function _ensureContainer(page) {
  if (_pageContainers[page]) return _pageContainers[page];
  let el = document.getElementById('page-' + page);
  if (!el) {
    el = document.createElement('div');
    el.id = 'page-' + page;
    el.style.display = 'none';
    document.getElementById('content-area').appendChild(el);
  }
  _pageContainers[page] = el;
  return el;
}

function navigateTo(page) {
  currentPage = page;
  console.log('[navigateTo] 切换到：' + page);
  localStorage.setItem('lastPage', page);
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.getElementById('page-title').textContent = pages[page] || page;

  // 隐藏所有页面容器，只显示当前页
  document.querySelectorAll('#content-area > [id^="page-"]').forEach(el => el.style.display = 'none');
  const container = _ensureContainer(page);
  container.style.display = '';

  // 每次切换都自动刷新页面
  switch (page) {
    case 'chat': renderChat(container); break;
    case 'dashboard': renderDashboard(container); break;
    case 'journal': renderJournal(container); break;
    case 'general-ledger': renderGeneralLedger(container); break;
    case 'detail-ledger': renderDetailLedger(container); break;
    case 'employee-ledger': renderEmployeeLedger(container); break;
    case 'customer-ledger': renderCustomerLedger(container); break;
    case 'supplier-ledger': renderSupplierLedger(container); break;
    case 'profit-loss': renderProfitLoss(container); break;
    case 'balance-sheet': renderBalanceSheet(container); break;
    case 'cash-flow': renderCashFlow(container); break;
    case 'equity-changes': renderEquityChanges(container); break;
    case 'account-balance': renderAccountBalance(container); break;
    case 'accounts': renderAccounts(container); break;
    case 'periods': renderPeriods(container); break;
    case 'company': showCompanyManager(container); break;
    case 'departments': renderDepartments(container); break;
    case 'employees': renderEmployees(container); break;
    case 'customers': renderCustomers(container); break;
    case 'suppliers': renderSuppliers(container); break;
    case 'fixed-assets': renderFixedAssets(container); break;
    case 'intangible-assets': renderIntangibleAssets(container); break;
    case 'inventory': renderInventory(container); break;
    case 'contracts': renderContracts(container); break;
    case 'payments': renderPayments(container); break;
    case 'sales-invoices': renderSalesInvoices(container); break;
    case 'purchase-invoices': renderPurchaseInvoices(container); break;
    case 'input-vat-deductions': renderInputVATDeductions(container); break;
    case 'bank-transactions': renderBankTransactions(container); break;
    case 'vat-declaration': renderVATDeclaration(container); break;
    case 'salary': showSalaryPage(container); break;
    case 'social-security': renderSocialSecurity(container); break;
    case 'housing-fund': renderHousingFund(container); break;
    case 'cultural-construction-fee': renderCulturalConstructionFee(container); break;
  }
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => navigateTo(el.dataset.page));
});

// ==================== API 工具（多公司版本） ====================
async function api(method, url, body) {
  // 支持三种调用方式：api(url) / api(url, options) / api(method, url, body)
  var extraHeaders = {};  // 旧式调用传递的自定义 headers
  var extraQuery = {};    // 旧式调用传递的 URL 查询参数（skip/limit 等）
  if (arguments.length === 1) {
    // api(url) → GET 请求
    body = undefined;
    url = method;
    method = 'GET';
  } else if (arguments.length === 2 && typeof method === 'string' && !['GET','POST','PUT','DELETE','PATCH'].includes(method)) {
    // 旧式调用 api(url, options) — 提取 method/body/headers，其余视为查询参数
    let options = url;
    url = method;
    method = (options && options.method) || 'GET';
    body = (options && options.body) || undefined;
    if (options && options.headers) extraHeaders = options.headers;
    // 其余非 method/headers/body 的属性 → URL 查询参数
    if (options) {
      for (var k in options) {
        if (options.hasOwnProperty(k) && k !== 'method' && k !== 'headers' && k !== 'body') {
          extraQuery[k] = options[k];
        }
      }
    }
  }
  // 强制附加 company_id 参数（/api/companies 自身除外）
  if (url.includes('/api/') && !url.startsWith('/api/companies')) {
    const [base, query] = url.split('?');
    const params = new URLSearchParams(query || '');
    // 合并旧式调用的查询参数
    for (var k in extraQuery) {
      if (extraQuery.hasOwnProperty(k)) params.set(k, extraQuery[k]);
    }
    params.set('company_id', currentCompanyId || 1);
    url = base + '?' + params.toString();
  }
  const isFormData = body instanceof FormData;
  const fetchOptions = {
    method: method,
  };
  if (body !== undefined && body !== null) {
    if (isFormData) {
      fetchOptions.body = body;
      // 不设置 Content-Type，让浏览器自动设置（含 boundary）
    } else if (typeof body === 'object') {
      fetchOptions.headers = Object.assign({}, extraHeaders, { 'Content-Type': 'application/json' });
      fetchOptions.body = JSON.stringify(body);
    } else {
      fetchOptions.body = body;
      // 字符串 body（通常已是 JSON.stringify 结果）：设置 Content-Type
      fetchOptions.headers = Object.assign({}, extraHeaders, { 'Content-Type': 'application/json' });
    }
  }
  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '请求失败' }));
    throw new Error(err.detail || '请求失败');
  }
  return res.json();
}

function toast(msg, type = 'default') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ==================== 分页工具 ====================
var _paginationState = {};

function setPageState(key, skip, limit) {
  _paginationState[key] = { skip: skip || 0, limit: limit || 50 };
}

function getPageState(key) {
  return _paginationState[key] || { skip: 0, limit: 50 };
}

function renderPagination(container, total, key, onPageChange) {
  const state = getPageState(key);
  const currentPage = Math.floor(state.skip / state.limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / state.limit));
  if (totalPages <= 1) return;

  const html = `
    <div class="pagination">
      <button class="pag-btn" ${currentPage <= 1 ? 'disabled' : ''} onclick="event.stopPropagation();this.onclick=function(){${onPageChange}(0)}">
        « 首页
      </button>
      <button class="pag-btn" ${currentPage <= 1 ? 'disabled' : ''} onclick="event.stopPropagation();this.onclick=function(){${onPageChange}(${(currentPage-2)*state.limit})}">
        ‹ 上一页
      </button>
      <span class="pag-info">第 ${currentPage} / ${totalPages} 页</span>
      <button class="pag-btn" ${currentPage >= totalPages ? 'disabled' : ''} onclick="event.stopPropagation();this.onclick=function(){${onPageChange}(${currentPage*state.limit})}">
        下一页 ›
      </button>
      <button class="pag-btn" ${currentPage >= totalPages ? 'disabled' : ''} onclick="event.stopPropagation();this.onclick=function(){${onPageChange}(${(totalPages-1)*state.limit})}">
        末页 »
      </button>
    </div>`;
  container.insertAdjacentHTML('beforeend', html);
}

// 统一的 Modal 关闭函数：无参时移除 #modal-overlay（兼容 chat.js），有参时移除指定 id 元素（salary.js）
function closeModal(id) {
    if (id) { const el = document.getElementById(id); if (el) el.remove(); return; }
    document.getElementById('modal-overlay')?.remove();
}

function fmt(n) {
  if (n === null || n === undefined) return '-';
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ==================== 统一错误处理 ====================
function handleError(err, context) {
  const msg = context ? (context + '失败：' + err.message) : err.message;
  console.error('[' + (context || 'error') + ']', err);
  toast(msg, 'error');
}

function showError(el, err, context) {
  const msg = context ? (context + '失败：' + err.message) : err.message;
  console.error('[' + (context || 'error') + ']', err);
  el.innerHTML = '<div class="empty-state"><p style="color:var(--danger)">' + msg + '</p></div>';
}

// ==================== 启动 ====================
document.addEventListener('DOMContentLoaded', function () {
  init().catch(function (e) {
    console.error('初始化失败', e);
  });
});

