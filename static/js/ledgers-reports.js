// ==================== 总账 ====================
async function renderGeneralLedger(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  const yearMonth = currentPeriod;
  el.innerHTML = `
    <div class="card card-fill">
      <div class="filter-bar" style="gap:8px;">
        <span style="font-size:13px;color:#6b7280">起始</span>${_periodSelectsHTML('gl-from', yearMonth)}
        <span style="color:#9ca3af">至</span>
        ${_periodSelectsHTML('gl-to', yearMonth)}<span style="font-size:13px;color:#6b7280">截止</span>
        <button class="btn btn-primary" onclick="loadGeneralLedger()">🔍 查询</button>
        <button onclick="glClearFilters()" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">清除筛选</button>
      </div>
      <div class="table-wrap" style="flex:1;overflow:auto;padding-bottom:4px" id="gl-table"></div>
    </div>
  `;
}

function glClearFilters() {
  document.querySelectorAll('select[id^="gl-"]').forEach(function(s) { s.value = ''; });
  var el = document.getElementById('gl-table');
  if (el) el.innerHTML = '';
}

async function loadGeneralLedger() {
  const from = _readPeriod('gl-from');
  const to = _readPeriod('gl-to');
  const el = document.getElementById('gl-table');
  el.innerHTML = '加载中...';
  try {
    const data = await api(`/api/ledger/general?period_from=${from}&period_to=${to}`);
    if (!data.length) { el.innerHTML = '<div class="empty-state"><p>该期间无发生额</p></div>'; return; }
    el.innerHTML = `
      <table>
        <thead><tr><th>科目编码</th><th>科目名称</th><th class="num">借方发生额</th><th class="num">贷方发生额</th><th style="text-align:center">期末方向</th><th class="num">期末余额</th></tr></thead>
        <tbody>
          ${data.map(r => {
            const lv = r.level || 1;
            const pad = (lv - 1) * 20;
            const prefix = lv > 1 ? '└ ' : '';
            const bold = lv <= 2 ? 'font-weight:600' : '';
            // 防御：方向
            let dir = r.end_direction;
            if (!dir || dir === 'undefined' || dir === 'null') {
              const acc = allAccounts.find(a => a.code === r.account_code);
              dir = acc && acc.balance_direction ? acc.balance_direction : '借';
            }
            // 防御：余额
            let bal = r.end_balance;
            if (bal === undefined || bal === null || isNaN(bal)) {
              bal = (dir === '借') ? ((r.total_debit || 0) - (r.total_credit || 0)) : ((r.total_credit || 0) - (r.total_debit || 0));
            }
            const endDir = bal == 0 ? '平' : dir;
            const endBalHtml = bal == 0 ? '¥0.00' : (bal > 0 ? '¥' + fmt(bal) : '<span style="color:var(--danger)">-¥' + fmt(-bal) + '</span>');
            return `
            <tr>
              <td><a href="#" onclick="goDetailLedger('${r.account_code}');return false" style="color:var(--primary)">${r.account_code}</a></td>
              <td style="padding-left:${pad}px;${bold}">${prefix}${r.account_name}</td>
              <td class="num">${r.total_debit > 0 ? '¥' + fmt(r.total_debit) : '-'}</td>
              <td class="num">${r.total_credit > 0 ? '¥' + fmt(r.total_credit) : '-'}</td>
              <td style="text-align:center">${endDir}</td>
              <td class="num" style="font-weight:600">${endBalHtml}</td>
            </tr>
            `}).join('')}
        </tbody>
      </table>
    `;
  } catch (e) { showError(el, e, '加载数据'); }
}

function goDetailLedger(code) {
  navigateTo('detail-ledger');
  setTimeout(() => {
    const el = document.getElementById('dl-account');
    if (el) { el.value = code; loadDetailLedger(); }
  }, 100);
}

// ==================== 明细账 ====================
async function renderDetailLedger(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  const accountOptions = allAccounts.map(a => '<option value="' + a.code + '">' + a.code + ' ' + a.name + '</option>').join('');
  el.innerHTML = '<div class="card" style="margin-bottom:0">' +
      '<div class="filter-bar" style="gap:8px;flex-wrap:wrap;">' +
        '<select class="form-control" id="dl-account" style="width:240px;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;">' +
          '<option value="">-- 选择科目 --</option>' + accountOptions +
        '</select>' +
        '<span style="font-size:13px;color:#6b7280">起始</span>' + _periodSelectsHTML('dl-from', currentPeriod) +
        '<span style="color:#9ca3af">至</span>' +
        _periodSelectsHTML('dl-to', currentPeriod) + '<span style="font-size:13px;color:#6b7280">截止</span>' +
        '<button class="btn btn-primary" onclick="loadDetailLedger()">🔍 查询</button>' +
        '<button onclick="dlClearFilters()" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">清除筛选</button>' +
      '</div>' +
      '<div class="table-wrap" style="flex:1;overflow:auto;padding-bottom:4px" id="dl-table"></div>' +
    '</div>';
}

function dlClearFilters() {
  var acc = document.getElementById('dl-account');
  if (acc) acc.value = '';
  document.querySelectorAll('select[id^="dl-"]').forEach(function(s) { s.value = ''; });
  var el = document.getElementById('dl-table');
  if (el) el.innerHTML = '';
}

// 明细账期初行
function _dlOpenRow(data, ob) {
  const dir = data.balance_direction;
  // 期初余额方向：ob=0显示"平"，ob>0与科目方向一致，ob<0相反
  const obDir = ob === 0 ? '平' : (ob > 0 ? dir : (dir === '借' ? '贷' : '借'));
  const obFmt = ob === 0 ? '¥0.00' : (ob > 0 ? '¥' + fmt(ob) : '<span style="color:var(--danger)">-¥' + fmt(-ob) + '</span>');
  return '<tr style="background:#f8fafc">' +
    '<td></td><td></td><td style="color:#6b7280;font-style:italic">上期结转</td>' +
    '<td class="num"></td><td class="num"></td>' +
    '<td style="text-align:center">' + obDir + '</td>' +
    '<td class="num" style="font-weight:600">' + obFmt + '</td>' +
    '</tr>';
}

async function loadDetailLedger() {
  const code = document.getElementById('dl-account').value;
  const from = _readPeriod('dl-from');
  const to = _readPeriod('dl-to');
  if (!code) { toast('请选择科目', 'error'); return; }
  if (!from || !to) { toast('请选择起止期间', 'error'); return; }
  const el = document.getElementById('dl-table');
  el.innerHTML = '<div style="color:#999;padding:20px">加载中...</div>';
  try {
    const data = await api('/api/ledger/detail?account_code=' + code + '&period_from=' + from + '&period_to=' + to);
    const ob = data.opening_balance || 0;
    const dir = data.balance_direction;
    const obStr = ob === 0 ? '¥0.00' : (ob > 0 ? '¥' + fmt(ob) : '<span style="color:var(--danger)">-¥' + fmt(-ob) + '</span>');
    let html = '<div style="font-size:13px;margin-bottom:10px;padding:8px 4px;border-bottom:1px solid #e5e7eb">' +
      '<b>科目：</b>' + data.account_code + ' ' + data.account_name +
      ' &nbsp;&nbsp; <b>余额方向：</b>' + dir +
      ' &nbsp;&nbsp; <b>期初余额：</b>' + obStr + '</div>';
    html += '<table><thead><tr>' +
      '<th>日期</th><th>凭证号</th><th>摘要</th>' +
      '<th class="num">借方</th><th class="num">贷方</th>' +
      '<th style="text-align:center">余额方向</th><th class="num">余额</th>' +
      '</tr></thead><tbody>';
    html += _dlOpenRow(data, ob);
    if (data.rows.length === 0) {
      html += '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:30px">该期间无明细记录</td></tr>';
    } else {
      data.rows.forEach(function(r) {
        // 余额方向：根据科目余额方向和余额符号判断，余额=0显示"平"
        var balDir;
        if (r.balance === 0) {
          balDir = '平';
        } else if (dir === '借') {
          balDir = r.balance > 0 ? '借' : '贷';
        } else {
          balDir = r.balance > 0 ? '贷' : '借';
        }
        var balHtml = r.balance === 0 ? '¥0.00' : (r.balance > 0 ? '¥' + fmt(r.balance) : '<span style="color:var(--danger)">-¥' + fmt(-r.balance) + '</span>');
        html += '<tr>' +
          '<td>' + r.voucher_date + '</td>' +
          '<td>' + r.voucher_no + '</td>' +
          '<td>' + (r.summary || '') + '</td>' +
          '<td class="num">' + (r.debit_amount !== 0 ? '¥' + fmt(r.debit_amount) : '') + '</td>' +
          '<td class="num">' + (r.credit_amount !== 0 ? '¥' + fmt(r.credit_amount) : '') + '</td>' +
          '<td style="text-align:center">' + balDir + '</td>' +
          '<td class="num" style="font-weight:600">' + balHtml + '</td>' +
          '</tr>';
      });
    }
    html += '</tbody></table>';
    el.innerHTML = html;
  } catch (e) { showError(el, e, '加载数据'); }
}

// 清除筛选：只清下拉和表格，不重新渲染整个页面（避免 DOM 污染）
async function clearFilters(page) {
  var prefix = page;
  document.querySelectorAll('select[id^="' + prefix + '-"]').forEach(function(s) { s.value = ''; });
  var tableMap = { gl: 'gl-table', dl: 'dl-table', pl: 'pl-table', bs: 'bs-table', cf: 'cf-table', ec: 'ec-table', tb: 'tb-table' };
  var tbl = document.getElementById(tableMap[page] || '');
  if (tbl) tbl.innerHTML = '';
}

// ===== 期间下拉辅助（年+月分开） =====
function _yearOptions(sel) {
  const now = new Date();
  let y = now.getFullYear();
  let opts = '';
  for (let yy = 2024; yy <= y; yy++) {
    opts += '<option value="' + yy + '"' + (yy == sel ? ' selected' : '') + '>' + yy + '年</option>';
  }
  return opts;
}
function _monthOptions(sel) {
  let opts = '';
  for (let mm = 1; mm <= 12; mm++) {
    const v = String(mm).padStart(2, '0');
    opts += '<option value="' + v + '"' + (v == sel ? ' selected' : '') + '>' + mm + '月</option>';
  }
  return opts;
}
function _periodSelectsHTML(prefix, value) {
  let y = '', m = '';
  if (value && value.includes('-')) { var parts = value.split('-'); y = parts[0]; m = parts[1]; }
  return '<select id="' + prefix + '-y" style="padding:6px 6px;border:1px solid #d1d5db;border-radius:6px;width:72px"><option value="">年</option>' + _yearOptions(y) + '</select>' +
    '<select id="' + prefix + '-m" style="padding:6px 6px;border:1px solid #d1d5db;border-radius:6px;width:62px"><option value="">月</option>' + _monthOptions(m) + '</select>';
}
function _readPeriod(prefix) {
  var y = document.getElementById(prefix + '-y');
  var m = document.getElementById(prefix + '-m');
  if (!y || !m) return '';
  var yv = y.value, mv = m.value;
  return (yv && mv) ? yv + '-' + mv : '';
}

// ==================== 利润表 ====================
async function renderProfitLoss(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML =
    '<div class="card card-fill">' +
      '<div class="filter-bar" style="gap:8px;flex-wrap:wrap;">' +
        '<span style="font-size:13px;color:#6b7280">起始</span>' + _periodSelectsHTML('pl-from', currentPeriod) +
        '<span style="color:#9ca3af">至</span>' +
        _periodSelectsHTML('pl-to', currentPeriod) + '<span style="font-size:13px;color:#6b7280">截止</span>' +
        '<button class="btn btn-primary" onclick="loadProfitLoss()">生成报表</button>' +
        '<button onclick="clearFilters(\'pl\')" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">清除筛选</button>' +
      '</div>' +
      '<div id="pl-table" style="flex:1;overflow:auto"></div>' +
    '</div>';
}

function plFmt(v) { if (v === 0 || v === null || v === undefined) return '-'; return '¥' + fmt(Math.abs(v)); }

async function loadProfitLoss() {
  const from = _readPeriod('pl-from'); const to = _readPeriod('pl-to');
  const el = document.getElementById('pl-table');
  el.innerHTML = '加载中...';
  try {
    const data = await api('/api/reports/profit-loss?period_from=' + from + '&period_to=' + to);
    var rows = '';
    for (var i = 0; i < data.items.length; i++) {
      var it = data.items[i];
      var cls = (it.bold ? 'report-bold' : '') + ' ' + (it.highlight ? 'report-highlight' : '');
      var indent = (it.indent || 0) * 16;
      rows += '<tr class="' + cls.trim() + '"><td style="padding-left:' + (8 + indent) + 'px">' + it.label + '</td>' +
        '<td class="num">' + plFmt(it.current) + '</td>' +
        '<td class="num">' + plFmt(it.prior) + '</td></tr>';
    }
    el.innerHTML =
      '<div style="font-size:12px;color:#6b7280;margin-bottom:12px">会企02号 | 报告期间：' + data.period_from + ' 至 ' + data.period_to + '</div>' +
      '<table class="report-table"><thead><tr><th>项目</th><th class="num">本期金额</th><th class="num">上期金额</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  } catch (e) { showError(el, e, '加载数据'); }
}

// ==================== 资产负债表 ====================
async function renderBalanceSheet(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML =
    '<div class="card card-fill">' +
      '<div class="filter-bar" style="gap:8px;flex-wrap:wrap;">' +
        '<span style="font-size:13px;color:#6b7280">截止</span>' + _periodSelectsHTML('bs-from', currentPeriod) +
        '<button class="btn btn-primary" onclick="loadBalanceSheet()">生成报表</button>' +
        '<button onclick="clearFilters(\'bs\')" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">清除筛选</button>' +
      '</div>' +
      '<div id="bs-table" style="flex:1;overflow:auto"></div>' +
    '</div>';
}

function bsFmt(v) { if (v === 0 || v === null || v === undefined) return '-'; return '¥' + fmt(Math.abs(v)); }

function bsRenderRows(rows, showHeader) {
  var h = showHeader ? '<thead><tr><th>项目</th><th class="num">期末余额</th><th class="num">年初余额</th></tr></thead>' : '';
  var r = '';
  for (var i = 0; i < rows.length; i++) {
    var it = rows[i];
    var cls = (it.bold ? 'report-bold' : '') + ' ' + (it.highlight ? 'report-highlight' : '');
    var indent = (it.indent || 0) * 16;
    r += '<tr class="' + cls.trim() + '"><td style="padding-left:' + (8 + indent) + 'px">' + it.label + '</td>' +
      '<td class="num">' + bsFmt(it.end) + '</td>' +
      '<td class="num">' + bsFmt(it.begin) + '</td></tr>';
  }
  return '<table class="report-table" style="width:100%">' + h + '<tbody>' + r + '</tbody></table>';
}

async function loadBalanceSheet() {
  const period = _readPeriod('bs-from');
  const el = document.getElementById('bs-table');
  el.innerHTML = '加载中...';
  try {
    const data = await api('/api/reports/balance-sheet?period=' + period);
    el.innerHTML =
      '<div style="font-size:12px;color:#6b7280;margin-bottom:12px">会企01号 | 截止期间：' + data.period + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">' +
        '<div><div style="font-weight:700;margin-bottom:8px;font-size:14px">资产</div>' + bsRenderRows(data.assets, true) + '</div>' +
        '<div><div style="font-weight:700;margin-bottom:8px;font-size:14px">负债及所有者权益</div>' + bsRenderRows(data.liabilities_equity, true) + '</div>' +
      '</div>';
  } catch (e) { showError(el, e, '加载数据'); }
}

// ==================== 现金流量表 ====================
async function renderCashFlow(container) {
  var el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML =
    '<div class="card card-fill">' +
      '<div class="filter-bar" style="gap:8px;flex-wrap:wrap;">' +
        '<span style="font-size:13px;color:#6b7280">起始</span>' + _periodSelectsHTML('cf-from', currentPeriod) +
        '<span style="color:#9ca3af">至</span>' +
        _periodSelectsHTML('cf-to', currentPeriod) + '<span style="font-size:13px;color:#6b7280">截止</span>' +
        '<button class="btn btn-primary" onclick="loadCashFlow()">生成报表</button>' +
        '<button onclick="clearFilters(\'cf\')" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">清除筛选</button>' +
      '</div>' +
      '<div id="cf-table" style="flex:1;overflow:auto"></div>' +
    '</div>';
}

async function loadCashFlow() {
  var from = _readPeriod('cf-from'); var to = _readPeriod('cf-to');
  var el = document.getElementById('cf-table');
  el.innerHTML = '加载中...';
  try {
    var data = await api('/api/reports/cash-flow?period_from=' + from + '&period_to=' + to);
    var rows = '';
    for (var i = 0; i < data.items.length; i++) {
      var it = data.items[i];
      var cls = (it.bold ? 'report-bold' : '') + ' ' + (it.highlight ? 'report-highlight' : '');
      var indent = (it.indent || 0) * 16;
      rows += '<tr class="' + cls.trim() + '"><td style="padding-left:' + (8 + indent) + 'px">' + it.label + '</td>' +
        '<td class="num">' + plFmt(it.current) + '</td>' +
        '<td class="num">' + plFmt(it.prior) + '</td></tr>';
    }
    el.innerHTML =
      '<div style="font-size:12px;color:#6b7280;margin-bottom:12px">会企03号 | 报告期间：' + data.period_from + ' 至 ' + data.period_to + '</div>' +
      '<table class="report-table"><thead><tr><th>项目</th><th class="num">本期金额</th><th class="num">上期金额</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  } catch (e) { showError(el, e, '加载数据'); }
}

// ==================== 所有者权益变动表 ====================
async function renderEquityChanges(container) {
  var el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML =
    '<div class="card card-fill">' +
      '<div class="filter-bar" style="gap:8px;flex-wrap:wrap;">' +
        '<span style="font-size:13px;color:#6b7280">截止</span>' + _periodSelectsHTML('ec-from', currentPeriod) +
        '<button class="btn btn-primary" onclick="loadEquityChanges()">生成报表</button>' +
        '<button onclick="clearFilters(\'ec\')" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">清除筛选</button>' +
      '</div>' +
      '<div id="ec-table" style="flex:1;overflow:auto"></div>' +
    '</div>';
}

async function loadEquityChanges() {
  var period = _readPeriod('ec-from');
  var el = document.getElementById('ec-table');
  el.innerHTML = '加载中...';
  try {
    var data = await api('/api/reports/equity-changes?period=' + period);
    var cols = data.columns;
    var th = '<th>项目</th>';
    for (var c = 0; c < cols.length; c++) { th += '<th class="num">' + cols[c] + '</th>'; }
    var rows = '';
    for (var i = 0; i < data.items.length; i++) {
      var it = data.items[i];
      var cls = (it.bold ? 'report-bold' : '') + (it.highlight ? ' report-highlight' : '');
      var indent = (it.indent || 0) * 16;
      rows += '<tr class="' + cls.trim() + '"><td style="padding-left:' + (8 + indent) + 'px">' + it.label + '</td>';
      for (var j = 0; j < it.vals.length; j++) { rows += '<td class="num">' + plFmt(it.vals[j]) + '</td>'; }
      rows += '</tr>';
    }
    el.innerHTML =
      '<div style="font-size:12px;color:#6b7280;margin-bottom:12px">会企04号 | 截止期间：' + data.period + '</div>' +
      '<table class="report-table" style="min-width:900px"><thead><tr>' + th + '</tr></thead><tbody>' + rows + '</tbody></table>';
  } catch (e) { showError(el, e, '加载数据'); }
}

// ==================== 科目余额表 ====================
async function renderAccountBalance(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML = `
    <div class="card card-fill">
      <div class="filter-bar" style="gap:8px;flex-wrap:wrap;">
        <span style="font-size:13px;color:#6b7280">起始</span>${_periodSelectsHTML('tb-from', currentPeriod)}
        <span style="color:#9ca3af">至</span>
        ${_periodSelectsHTML('tb-to', currentPeriod)}<span style="font-size:13px;color:#6b7280">截止</span>
        <button class="btn btn-primary" onclick="loadAccountBalance()">🔍 生成报表</button>
        <button onclick="clearFilters('tb')" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">清除筛选</button>
      </div>
      <div id="tb-table"></div>
    </div>
  `;
  loadAccountBalance();
}

async function loadAccountBalance() {
  const from = _readPeriod('tb-from');
  const to = _readPeriod('tb-to');
  const el = document.getElementById('tb-table');
  el.innerHTML = '加载中...';
  try {
    const data = await api(`/api/trial-balance?period=${to}`);
    
    // 合计只统计一级科目（避免子级重复计入）
    const l1 = data.filter(r => r.level === 1);
    const totalPeriodDebit = l1.reduce((s, r) => s + r.period_debit, 0);
    const totalPeriodCredit = l1.reduce((s, r) => s + r.period_credit, 0);
    const totalCumDebit = l1.reduce((s, r) => s + r.cumulative_debit, 0);
    const totalCumCredit = l1.reduce((s, r) => s + r.cumulative_credit, 0);
    const totalEndDebit = l1.reduce((s, r) => s + r.end_debit, 0);
    const totalEndCredit = l1.reduce((s, r) => s + r.end_credit, 0);

    let html = `<div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">报告期间：${to}</div>`;
    html += '<div class="table-wrap" style="flex:1;overflow:auto;padding-bottom:4px"><table>';
    html += '<thead><tr>';
    html += '<th>科目编码</th><th>科目名称</th><th style="text-align:center">方向</th>';
    html += '<th class="num">期初借方</th><th class="num">期初贷方</th>';
    html += '<th class="num">本期借方</th><th class="num">本期贷方</th>';
    html += '<th class="num" style="color:var(--primary)">累计借方</th><th class="num" style="color:var(--success)">累计贷方</th>';
    html += '<th class="num">期末借方</th><th class="num">期末贷方</th>';
    html += '</tr></thead><tbody>';

    if (data.length === 0) {
      html += '<tr><td colspan="11" style="text-align:center;color:var(--gray-400);padding:24px">该期间无发生额</td></tr>';
    } else {
      const indent = {1: 0, 2: 16, 3: 32, 4: 48};
      data.forEach(r => {
        const lv = r.level || 1;
        const pad = indent[lv] || 0;
        const isParent = data.some(c => c.parent_code === r.account_code);
        const rowStyle = isParent ? 'font-weight:600;background:var(--gray-25)' : '';
        const nameStyle = pad > 0 ? `padding-left:${pad}px` : '';
        html += `<tr style="${rowStyle}">`;
        html += `<td>${r.account_code}</td>`;
        html += `<td style="${nameStyle}">${lv > 1 ? '└ ' : ''}${r.account_name}</td>`;
        html += `<td style="text-align:center">${r.balance_direction}</td>`;
        html += `<td class="num">${r.begin_debit !== 0 ? '¥' + fmt(r.begin_debit) : ''}</td>`;
        html += `<td class="num">${r.begin_credit !== 0 ? '¥' + fmt(r.begin_credit) : ''}</td>`;
        html += `<td class="num">${r.period_debit !== 0 ? '¥' + fmt(r.period_debit) : ''}</td>`;
        html += `<td class="num">${r.period_credit !== 0 ? '¥' + fmt(r.period_credit) : ''}</td>`;
        html += `<td class="num" style="color:var(--primary)">${r.cumulative_debit !== 0 ? '¥' + fmt(r.cumulative_debit) : ''}</td>`;
        html += `<td class="num" style="color:var(--success)">${r.cumulative_credit !== 0 ? '¥' + fmt(r.cumulative_credit) : ''}</td>`;
        html += `<td class="num">${r.end_debit !== 0 ? '¥' + fmt(r.end_debit) : ''}</td>`;
        html += `<td class="num">${r.end_credit !== 0 ? '¥' + fmt(r.end_credit) : ''}</td>`;
        html += '</tr>';
      });

      // 合计行（仅统计一级科目）
      html += '<tr style="font-weight:700;background:var(--gray-50);border-top:2px solid var(--gray-200)">';
      html += '<td colspan="3" style="text-align:center">合计</td>';
      html += `<td class="num">¥${fmt(l1.reduce((s, r) => s + r.begin_debit, 0))}</td>`;
      html += `<td class="num">¥${fmt(l1.reduce((s, r) => s + r.begin_credit, 0))}</td>`;
      html += `<td class="num">¥${fmt(totalPeriodDebit)}</td>`;
      html += `<td class="num">¥${fmt(totalPeriodCredit)}</td>`;
      html += `<td class="num" style="color:var(--primary)">¥${fmt(totalCumDebit)}</td>`;
      html += `<td class="num" style="color:var(--success)">¥${fmt(totalCumCredit)}</td>`;
      html += `<td class="num">¥${fmt(totalEndDebit)}</td>`;
      html += `<td class="num">¥${fmt(totalEndCredit)}</td>`;
      html += '</tr>';
    }

    html += '</tbody></table></div>';
    el.innerHTML = html;
  } catch (e) { showError(el, e, '加载数据'); }
}


// ==================== 往来明细账（人员/客户/供应商） ====================
// 三模块共用：从序时账往来项目自动填制，序时账有数据就自动显示

var _contactCache = {}; // 缓存往来列表

function _contactPageHTML(title, apiPrefix) {
  return '<div class="card" style="margin-bottom:0;display:flex;flex-direction:column">' +
    '<div class="filter-bar" style="gap:8px;flex-wrap:wrap;align-items:center">' +
      '<b style="font-size:14px;min-width:90px">' + title + '</b>' +
      '<span style="font-size:13px;color:#6b7280">起始</span>' + _periodSelectsHTML(apiPrefix + '-from', currentPeriod) +
      '<span style="color:#9ca3af">至</span>' +
      _periodSelectsHTML(apiPrefix + '-to', currentPeriod) + '<span style="font-size:13px;color:#6b7280">截止</span>' +
      '<button class="btn btn-primary" onclick="_loadContactDetail(\'' + apiPrefix + '\')">🔍 查询</button>' +
      '<button onclick="_clearContactDetail(\'' + apiPrefix + '\')" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px">清除</button>' +
    '</div>' +
    '<div style="display:flex;flex:1;gap:12px;overflow:hidden;margin-top:12px">' +
      '<div id="' + apiPrefix + '-list" style="width:260px;min-width:200px;overflow-y:auto;border-right:1px solid var(--gray-200);padding-right:8px"></div>' +
      '<div id="' + apiPrefix + '-table" style="flex:1;overflow:auto;padding-bottom:4px"></div>' +
    '</div>' +
  '</div>';
}

async function _loadContactList(apiPrefix) {
  var listEl = document.getElementById(apiPrefix + '-list');
  listEl.innerHTML = '<div style="color:#999;padding:12px;font-size:13px">加载中...</div>';
  try {
    var data = await api('/api/ledger/' + apiPrefix + '-contacts');
    _contactCache[apiPrefix] = data;
    if (data.length === 0) {
      listEl.innerHTML = '<div style="color:#9ca3af;padding:24px 12px;text-align:center;font-size:13px">暂无往来数据<br><span style="font-size:11px">序时账中录入往来项目后自动生成</span></div>';
      return;
    }
    var html = '<div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#374151">往来项目（' + data.length + '）</div>';
    data.forEach(function(c, i) {
      var netStr = c.net >= 0 ? ('¥' + fmt(Math.abs(c.net))) : ('<span style="color:var(--danger)">-¥' + fmt(Math.abs(c.net)) + '</span>');
      html += '<div class="contact-item" data-name="' + escHtml(c.name) + '" onclick="_onContactClick(\'' + apiPrefix + '\', \'' + escJs(c.name) + '\')" style="padding:10px 8px;cursor:pointer;border-radius:6px;margin-bottom:4px;border:1px solid transparent">' +
        '<div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(c.name) + '</div>' +
        '<div style="font-size:11px;color:#6b7280;margin-top:4px;display:flex;justify-content:space-between">' +
          '<span>借 ¥' + fmt(c.total_debit) + '</span>' +
          '<span>贷 ¥' + fmt(c.total_credit) + '</span>' +
          '<span style="font-weight:600">净 ' + netStr + '</span>' +
        '</div>' +
      '</div>';
    });
    listEl.innerHTML = html;
    // 默认加载第一个往来项目
    if (data.length > 0) {
      _onContactClick(apiPrefix, data[0].name);
    }
  } catch (e) {
    listEl.innerHTML = '<div style="color:var(--danger);padding:12px;font-size:13px">加载失败</div>';
  }
}

function _onContactClick(apiPrefix, name) {
  // 高亮选中
  var listEl = document.getElementById(apiPrefix + '-list');
  listEl.querySelectorAll('.contact-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.name === name);
    el.style.background = el.dataset.name === name ? 'var(--gray-100)' : '';
    el.style.borderColor = el.dataset.name === name ? 'var(--primary)' : 'transparent';
  });
  // 加载明细
  _loadContactDetail(apiPrefix, name);
}

async function _loadContactDetail(apiPrefix, name) {
  if (!name) {
    // 尝试从当前激活的获取
    var activeEl = document.querySelector('#' + apiPrefix + '-list .contact-item.active');
    if (activeEl) name = activeEl.dataset.name;
  }
  var tableEl = document.getElementById(apiPrefix + '-table');
  if (!name) {
    tableEl.innerHTML = '<div style="color:#9ca3af;padding:40px;text-align:center;font-size:13px">请从左侧选择一个往来项目</div>';
    return;
  }
  var from = _readPeriod(apiPrefix + '-from');
  var to = _readPeriod(apiPrefix + '-to');
  if (!from || !to) {
    tableEl.innerHTML = '<div style="color:#9ca3af;padding:40px;text-align:center;font-size:13px">请选择起止期间</div>';
    return;
  }
  tableEl.innerHTML = '<div style="color:#999;padding:20px;font-size:13px">加载中...</div>';
  try {
    var data = await api('/api/ledger/' + apiPrefix + '-detail?contact_name=' + encodeURIComponent(name) + '&period_from=' + from + '&period_to=' + to);
    var ob = data.opening_balance || 0;
    var obFmt = ob === 0 ? '¥0.00' : (ob >= 0 ? '¥' + fmt(ob) : '<span style="color:var(--danger)">-¥' + fmt(-ob) + '</span>');
    var html = '<div style="font-size:13px;margin-bottom:10px;padding:8px 4px;border-bottom:1px solid #e5e7eb">' +
      '<b>往来单位：</b>' + escHtml(name) +
      ' &nbsp;&nbsp; <b>期初余额：</b>' + obFmt +
      ' &nbsp;&nbsp; <b>期间：</b>' + from + ' ~ ' + to + '</div>';
    html += '<table><thead><tr>' +
      '<th>日期</th><th>凭证号</th><th>摘要</th><th>科目</th>' +
      '<th class="num">借方</th><th class="num">贷方</th>' +
      '<th class="num">余额</th>' +
      '</tr></thead><tbody>';
    // 期初行
    var obDir = ob === 0 ? '平' : (ob > 0 ? '借' : '贷');
    html += '<tr style="background:#f8fafc">' +
      '<td></td><td></td><td style="color:#6b7280;font-style:italic">上期结转</td><td></td>' +
      '<td class="num"></td><td class="num"></td>' +
      '<td class="num" style="font-weight:600">' + obDir + ' ' + obFmt + '</td>' +
      '</tr>';
    if (data.rows.length === 0) {
      html += '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:30px">该期间无往来明细记录</td></tr>';
    } else {
      var totalDr = 0, totalCr = 0;
      data.rows.forEach(function(r) {
        totalDr += r.debit_amount || 0;
        totalCr += r.credit_amount || 0;
        var balDir = r.balance === 0 ? '平' : (r.balance > 0 ? '借' : '贷');
        var balHtml = r.balance === 0 ? '¥0.00' : (r.balance >= 0 ? '¥' + fmt(r.balance) : '<span style="color:var(--danger)">-¥' + fmt(-r.balance) + '</span>');
        html += '<tr>' +
          '<td>' + r.voucher_date + '</td>' +
          '<td>' + r.voucher_no + '</td>' +
          '<td>' + (r.summary || '') + '</td>' +
          '<td>' + r.account_code + ' ' + r.account_name + '</td>' +
          '<td class="num">' + (r.debit_amount !== 0 ? '¥' + fmt(r.debit_amount) : '') + '</td>' +
          '<td class="num">' + (r.credit_amount !== 0 ? '¥' + fmt(r.credit_amount) : '') + '</td>' +
          '<td class="num" style="font-weight:600">' + balDir + ' ' + balHtml + '</td>' +
          '</tr>';
      });
      // 本页合计行
      var endBal = ob + totalDr - totalCr;
      var endDir = endBal === 0 ? '平' : (endBal > 0 ? '借' : '贷');
      var endFmt = endBal === 0 ? '¥0.00' : (endBal >= 0 ? '¥' + fmt(endBal) : '<span style="color:var(--danger)">-¥' + fmt(-endBal) + '</span>');
      html += '<tr style="background:#f0f9ff;font-weight:600">' +
        '<td colspan="4" style="text-align:right;color:#6b7280">本页合计</td>' +
        '<td class="num">¥' + fmt(totalDr) + '</td>' +
        '<td class="num">¥' + fmt(totalCr) + '</td>' +
        '<td class="num">' + endDir + ' ' + endFmt + '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
    tableEl.innerHTML = html;
  } catch (e) { showError(tableEl, e, '加载数据'); }
}

function _clearContactDetail(apiPrefix) {
  var tableEl = document.getElementById(apiPrefix + '-table');
  if (tableEl) tableEl.innerHTML = '';
  var listEl = document.getElementById(apiPrefix + '-list');
  if (listEl) {
    listEl.querySelectorAll('.contact-item').forEach(function(el) {
      el.classList.remove('active');
      el.style.background = '';
      el.style.borderColor = 'transparent';
    });
  }
}

// 转义函数
function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function escJs(s) { return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n'); }

// ==================== 人员明细账 ====================
async function renderEmployeeLedger(container) {
  var el = container || document.getElementById('page-employee-ledger') || document.getElementById('content-area');
  el.innerHTML = _contactPageHTML('人员明细账', 'employee');
  _loadContactList('employee');
}

// ==================== 客户明细账 ====================
async function renderCustomerLedger(container) {
  var el = container || document.getElementById('page-customer-ledger') || document.getElementById('content-area');
  el.innerHTML = _contactPageHTML('客户明细账', 'customer');
  _loadContactList('customer');
}

// ==================== 供应商明细账 ====================
async function renderSupplierLedger(container) {
  var el = container || document.getElementById('page-supplier-ledger') || document.getElementById('content-area');
  el.innerHTML = _contactPageHTML('供应商明细账', 'supplier');
  _loadContactList('supplier');
}

