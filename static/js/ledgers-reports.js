// ==================== 总账 ====================
async function renderGeneralLedger(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML = `
    <div class="card card-fill">
      <div class="filter-bar" style="gap:8px;align-items:center;">
        <div id="gl-period-bar" style="display:flex;align-items:center;gap:4px"></div>
      </div>
      <div class="table-wrap" style="flex:1;overflow:auto;padding-bottom:4px" id="gl-table"></div>
    </div>
  `;
  _buildStandardPeriodBar('gl-', { onQuery: loadGeneralLedger, onClear: glClearFilters });
  loadGeneralLedger();
}

function glClearFilters() {
  _resetStandardPeriod('gl-');
  let el = document.getElementById('gl-table');
  if (el) el.innerHTML = '';
}

async function loadGeneralLedger() {
  const from = _getStandardPeriod('gl-', 'from');
  const to = _getStandardPeriod('gl-', 'to');
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
  el.innerHTML = '<div class="card card-fill">' +
      '<div class="filter-bar" style="gap:8px;align-items:center;flex-wrap:wrap;flex-shrink:0;">' +
        '<select class="form-control" id="dl-account" style="width:240px;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;">' +
          '<option value="">-- 选择科目 --</option>' + accountOptions +
        '</select>' +
        '<div id="dl-period-bar" style="display:flex;align-items:center;gap:4px"></div>' +
      '</div>' +
      '<div class="table-wrap" style="flex:1;overflow-y:auto;padding-bottom:4px;min-height:0" id="dl-table"></div>' +
    '</div>';
  _buildStandardPeriodBar('dl-', { onQuery: loadDetailLedger, onClear: dlClearFilters });
}

function dlClearFilters() {
  let acc = document.getElementById('dl-account');
  if (acc) acc.value = '';
  _resetStandardPeriod('dl-');
  let el = document.getElementById('dl-table');
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
  const from = _getStandardPeriod('dl-', 'from');
  const to = _getStandardPeriod('dl-', 'to');
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
        let balDir;
        if (r.balance === 0) {
          balDir = '平';
        } else if (dir === '借') {
          balDir = r.balance > 0 ? '借' : '贷';
        } else {
          balDir = r.balance > 0 ? '贷' : '借';
        }
        let balHtml = r.balance === 0 ? '¥0.00' : (r.balance > 0 ? '¥' + fmt(r.balance) : '<span style="color:var(--danger)">-¥' + fmt(-r.balance) + '</span>');
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
  let prefix = page;
  document.querySelectorAll('select[id^="' + prefix + '-"]').forEach(function(s) { s.value = ''; });
  let tableMap = { gl: 'gl-table', dl: 'dl-table', pl: 'pl-table', bs: 'bs-table', cf: 'cf-table', ec: 'ec-table', tb: 'tb-table' };
  let tbl = document.getElementById(tableMap[page] || '');
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
  let y = document.getElementById(prefix + '-y');
  let m = document.getElementById(prefix + '-m');
  if (!y || !m) return '';
  let yv = y.value, mv = m.value;
  return (yv && mv) ? yv + '-' + mv : '';
}

// ===== 共享期间选择栏组件（带▲▼箭头） =====
function _buildStandardPeriodBar(prefix, options) {
  let bar = document.getElementById(prefix + 'period-bar');
  if (!bar) return;
  bar.innerHTML =
    '<div class="period-stepper">' +
      '<select id="' + prefix + 'from-y" class="period-selector-year">' + _yearOptions() + '</select>' +
      '<div class="stepper-arrows">' +
        '<button class="stepper-btn stepper-up" data-side="from" data-type="year" data-delta="1" title="下一年">▲</button>' +
        '<button class="stepper-btn stepper-down" data-side="from" data-type="year" data-delta="-1" title="上一年">▼</button>' +
      '</div>' +
    '</div>' +
    '<div class="period-stepper">' +
      '<select id="' + prefix + 'from-m" class="period-selector-month">' + _monthOptions() + '</select>' +
      '<div class="stepper-arrows">' +
        '<button class="stepper-btn stepper-up" data-side="from" data-type="month" data-delta="1" title="下一月">▲</button>' +
        '<button class="stepper-btn stepper-down" data-side="from" data-type="month" data-delta="-1" title="上一月">▼</button>' +
      '</div>' +
    '</div>' +
    '<span style="color:#9ca3af;font-size:13px;line-height:32px">至</span>' +
    '<div class="period-stepper">' +
      '<select id="' + prefix + 'to-y" class="period-selector-year">' + _yearOptions() + '</select>' +
      '<div class="stepper-arrows">' +
        '<button class="stepper-btn stepper-up" data-side="to" data-type="year" data-delta="1" title="下一年">▲</button>' +
        '<button class="stepper-btn stepper-down" data-side="to" data-type="year" data-delta="-1" title="上一年">▼</button>' +
      '</div>' +
    '</div>' +
    '<div class="period-stepper">' +
      '<select id="' + prefix + 'to-m" class="period-selector-month">' + _monthOptions() + '</select>' +
      '<div class="stepper-arrows">' +
        '<button class="stepper-btn stepper-up" data-side="to" data-type="month" data-delta="1" title="下一月">▲</button>' +
        '<button class="stepper-btn stepper-down" data-side="to" data-type="month" data-delta="-1" title="上一月">▼</button>' +
      '</div>' +
    '</div>' +
    '<button class="std-query-btn" style="padding:6px 12px;border:1px solid #2563eb;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;font-size:13px">查询</button>' +
    '<button class="std-clear-btn" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px">清除</button>';

  bar.querySelectorAll('.stepper-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var side = this.getAttribute('data-side');
      var type = this.getAttribute('data-type');
      var delta = parseInt(this.getAttribute('data-delta'));
      if (type === 'year') _stepStandardYear(prefix, side, delta);
      else _stepStandardMonth(prefix, side, delta);
      _enforcePeriodOrder(prefix, side);
      if (options.onQuery) options.onQuery();
    });
  });

  // 下拉变化时触发查询 + 约束检查
  bar.querySelectorAll('.period-selector-month, .period-selector-year').forEach(function(sel) {
    sel.addEventListener('change', function() {
      var side = sel.id.indexOf('-from-') > -1 ? 'from' : 'to';
      _enforcePeriodOrder(prefix, side);
      if (options.onQuery) options.onQuery();
    });
  });

  var queryBtn = bar.querySelector('.std-query-btn');
  if (queryBtn && options.onQuery) queryBtn.addEventListener('click', options.onQuery);

  var clearBtn = bar.querySelector('.std-clear-btn');
  if (clearBtn && options.onClear) clearBtn.addEventListener('click', options.onClear);

  _setStandardPeriod(prefix, 'from', currentPeriod);
  _setStandardPeriod(prefix, 'to', currentPeriod);
}

function _setStandardPeriod(prefix, side, period) {
  if (!period) return;
  let parts = period.split('-');
  if (parts.length < 2) return;
  let ySel = document.getElementById(prefix + side + '-y');
  let mSel = document.getElementById(prefix + side + '-m');
  if (ySel) ySel.value = parts[0];
  if (mSel) mSel.value = parts[1];
}

function _getStandardPeriod(prefix, side) {
  let y = document.getElementById(prefix + side + '-y');
  let m = document.getElementById(prefix + side + '-m');
  if (!y || !m) return '';
  let yv = y.value, mv = m.value;
  return (yv && mv) ? yv + '-' + mv : '';
}

function _stepStandardYear(prefix, side, delta) {
  let sel = document.getElementById(prefix + side + '-y');
  if (!sel || !sel.value) return;
  sel.value = parseInt(sel.value) + delta;
}

function _stepStandardMonth(prefix, side, delta) {
  let ySel = document.getElementById(prefix + side + '-y');
  let mSel = document.getElementById(prefix + side + '-m');
  if (!ySel || !mSel || !mSel.value) return;
  let y = parseInt(ySel.value) || new Date().getFullYear();
  let m = parseInt(mSel.value) + delta;
  if (m > 12) { m = 1; y++; }
  else if (m < 1) { m = 12; y--; }
  ySel.value = y;
  mSel.value = String(m).padStart(2, '0');
}

function _resetStandardPeriod(prefix) {
  let fromY = document.getElementById(prefix + 'from-y');
  let fromM = document.getElementById(prefix + 'from-m');
  let toY = document.getElementById(prefix + 'to-y');
  let toM = document.getElementById(prefix + 'to-m');
  if (fromY) fromY.value = '';
  if (fromM) fromM.value = '';
  if (toY) toY.value = '';
  if (toM) toM.value = '';
}

// 期间前后约束：后时间不能早于前时间
function _enforcePeriodOrder(basePrefix, changedSide) {
  var fy = document.getElementById(basePrefix + 'from-y');
  var fm = document.getElementById(basePrefix + 'from-m');
  var ty = document.getElementById(basePrefix + 'to-y');
  var tm = document.getElementById(basePrefix + 'to-m');
  if (!fy || !fm || !ty || !tm) return;
  var fyv = fy.value, fmv = fm.value, tyv = ty.value, tmv = tm.value;
  if (!fyv || !fmv || !tyv || !tmv) return;
  var from = fyv + '-' + fmv;
  var to = tyv + '-' + tmv;
  if (from > to) {
    if (changedSide === 'from') {
      ty.value = fyv; tm.value = fmv;
    } else {
      fy.value = tyv; fm.value = tmv;
    }
  }
}

// ==================== 利润表 ====================
async function renderProfitLoss(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML =
    '<div class="card card-fill">' +
      '<div class="filter-bar" style="gap:8px;flex-wrap:wrap;align-items:center;">' +
        '<div id="pl-period-bar" style="display:flex;align-items:center;gap:4px"></div>' +
      '</div>' +
      '<div id="pl-table" style="flex:1;overflow:auto"></div>' +
    '</div>';
  _buildStandardPeriodBar('pl-', { onQuery: loadProfitLoss, onClear: () => clearFilters('pl') });
  loadProfitLoss();
}

function plFmt(v) { if (v === 0 || v === null || v === undefined) return '-'; return '¥' + fmt(Math.abs(v)); }

async function loadProfitLoss() {
  const from = _readPeriod('pl-from'); const to = _readPeriod('pl-to');
  const el = document.getElementById('pl-table');
  el.innerHTML = '加载中...';
  try {
    const data = await api('/api/reports/profit-loss?period_from=' + from + '&period_to=' + to);
    let rows = '';
    for (var i = 0; i < data.items.length; i++) {
      let it = data.items[i];
      let cls = (it.bold ? 'report-bold' : '') + ' ' + (it.highlight ? 'report-highlight' : '');
      let indent = (it.indent || 0) * 16;
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
      '<div class="filter-bar" style="gap:8px;flex-wrap:wrap;align-items:center;">' +
        '<div id="bs-period-bar" style="display:flex;align-items:center;gap:4px"></div>' +
      '</div>' +
      '<div id="bs-table" style="flex:1;overflow:auto"></div>' +
    '</div>';
  _buildStandardPeriodBar('bs-', { onQuery: loadBalanceSheet, onClear: () => clearFilters('bs') });
  loadBalanceSheet();
}

function bsFmt(v) { if (v === 0 || v === null || v === undefined) return '-'; return '¥' + fmt(Math.abs(v)); }

function bsRenderRows(rows, showHeader) {
  let h = showHeader ? '<thead><tr><th>项目</th><th class="num">期末余额</th><th class="num">年初余额</th></tr></thead>' : '';
  let r = '';
  for (var i = 0; i < rows.length; i++) {
    let it = rows[i];
    let cls = (it.bold ? 'report-bold' : '') + ' ' + (it.highlight ? 'report-highlight' : '');
    let indent = (it.indent || 0) * 16;
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
  let el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML =
    '<div class="card card-fill">' +
      '<div class="filter-bar" style="gap:8px;flex-wrap:wrap;align-items:center;">' +
        '<div id="cf-period-bar" style="display:flex;align-items:center;gap:4px"></div>' +
      '</div>' +
      '<div id="cf-table" style="flex:1;overflow:auto"></div>' +
    '</div>';
  _buildStandardPeriodBar('cf-', { onQuery: loadCashFlow, onClear: () => clearFilters('cf') });
  loadCashFlow();
}

async function loadCashFlow() {
  let from = _readPeriod('cf-from'); var to = _readPeriod('cf-to');
  let el = document.getElementById('cf-table');
  el.innerHTML = '加载中...';
  try {
    let data = await api('/api/reports/cash-flow?period_from=' + from + '&period_to=' + to);
    let rows = '';
    for (var i = 0; i < data.items.length; i++) {
      let it = data.items[i];
      let cls = (it.bold ? 'report-bold' : '') + ' ' + (it.highlight ? 'report-highlight' : '');
      let indent = (it.indent || 0) * 16;
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
  let el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML =
    '<div class="card card-fill">' +
      '<div class="filter-bar" style="gap:8px;flex-wrap:wrap;align-items:center;">' +
        '<div id="ec-period-bar" style="display:flex;align-items:center;gap:4px"></div>' +
      '</div>' +
      '<div id="ec-table" style="flex:1;overflow:auto"></div>' +
    '</div>';
  _buildStandardPeriodBar('ec-', { onQuery: loadEquityChanges, onClear: () => clearFilters('ec') });
  loadEquityChanges();
}

async function loadEquityChanges() {
  let period = _readPeriod('ec-from');
  let el = document.getElementById('ec-table');
  el.innerHTML = '加载中...';
  try {
    let data = await api('/api/reports/equity-changes?period=' + period);
    let cols = data.columns;
    let th = '<th>项目</th>';
    for (var c = 0; c < cols.length; c++) { th += '<th class="num">' + cols[c] + '</th>'; }
    let rows = '';
    for (var i = 0; i < data.items.length; i++) {
      let it = data.items[i];
      let cls = (it.bold ? 'report-bold' : '') + (it.highlight ? ' report-highlight' : '');
      let indent = (it.indent || 0) * 16;
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
      <div class="filter-bar" style="gap:8px;flex-wrap:wrap;align-items:center;">
        <div id="tb-period-bar" style="display:flex;align-items:center;gap:4px"></div>
      </div>
      <div id="tb-table"></div>
    </div>
  `;
  _buildStandardPeriodBar('tb-', { onQuery: loadAccountBalance, onClear: () => clearFilters('tb') });
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

    let html = '';
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

let _contactCache = {}; // 缓存往来列表

function _contactPageHTML(title, apiPrefix) {
  return '<div class="card card-fill">' +
    '<div id="' + apiPrefix + '-period-bar" class="period-selector-bar" style="margin-bottom:12px;flex-shrink:0"></div>' +
    '<div style="display:flex;flex:1;gap:12px;overflow:hidden;min-height:0">' +
      '<div id="' + apiPrefix + '-list" style="width:260px;min-width:200px;overflow-y:auto;border-right:1px solid var(--gray-200);padding-right:8px"></div>' +
      '<div id="' + apiPrefix + '-table" style="flex:1;overflow-y:auto;padding-bottom:4px;min-height:0"></div>' +
    '</div>' +
  '</div>';
}

function _buildContactPeriodBar(apiPrefix) {
  let bar = document.getElementById(apiPrefix + '-period-bar');
  if (!bar) return;
  bar.innerHTML =
    '<div class="period-stepper">' +
      '<select id="' + apiPrefix + '-from-y" class="period-selector-year">' + _yearOptions() + '</select>' +
      '<div class="stepper-arrows">' +
        '<button class="stepper-btn stepper-up" data-side="from" data-type="year" data-delta="1" title="下一年">▲</button>' +
        '<button class="stepper-btn stepper-down" data-side="from" data-type="year" data-delta="-1" title="上一年">▼</button>' +
      '</div>' +
    '</div>' +
    '<div class="period-stepper">' +
      '<select id="' + apiPrefix + '-from-m" class="period-selector-month">' + _monthOptions() + '</select>' +
      '<div class="stepper-arrows">' +
        '<button class="stepper-btn stepper-up" data-side="from" data-type="month" data-delta="1" title="下一月">▲</button>' +
        '<button class="stepper-btn stepper-down" data-side="from" data-type="month" data-delta="-1" title="上一月">▼</button>' +
      '</div>' +
    '</div>' +
    '<span style="color:#9ca3af;font-size:13px;line-height:32px">至</span>' +
    '<div class="period-stepper">' +
      '<select id="' + apiPrefix + '-to-y" class="period-selector-year">' + _yearOptions() + '</select>' +
      '<div class="stepper-arrows">' +
        '<button class="stepper-btn stepper-up" data-side="to" data-type="year" data-delta="1" title="下一年">▲</button>' +
        '<button class="stepper-btn stepper-down" data-side="to" data-type="year" data-delta="-1" title="上一年">▼</button>' +
      '</div>' +
    '</div>' +
    '<div class="period-stepper">' +
      '<select id="' + apiPrefix + '-to-m" class="period-selector-month">' + _monthOptions() + '</select>' +
      '<div class="stepper-arrows">' +
        '<button class="stepper-btn stepper-up" data-side="to" data-type="month" data-delta="1" title="下一月">▲</button>' +
        '<button class="stepper-btn stepper-down" data-side="to" data-type="month" data-delta="-1" title="上一月">▼</button>' +
      '</div>' +
    '</div>' +
    '<button class="contact-query-btn" style="padding:6px 12px;border:1px solid #2563eb;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;font-size:13px">查询</button>' +
    '<button class="contact-clear-btn" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px">清除</button>';

  // 为所有 stepper 按钮绑定点击事件
  bar.querySelectorAll('.stepper-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var side = this.getAttribute('data-side');
      var type = this.getAttribute('data-type');
      var delta = parseInt(this.getAttribute('data-delta'));
      if (type === 'year') _stepContactYear(apiPrefix, side, delta);
      else _stepContactMonth(apiPrefix, side, delta);
      _enforcePeriodOrder(apiPrefix + '-', side);
    });
  });

  // 下拉变化时触发
  bar.querySelectorAll('.period-selector-month, .period-selector-year').forEach(function(sel) {
    sel.addEventListener('change', function() {
      var side = sel.id.indexOf('-from-') > -1 ? 'from' : 'to';
      _enforcePeriodOrder(apiPrefix + '-', side);
      _onContactPeriodChange(apiPrefix);
    });
  });

  // 查询按钮
  var queryBtn = bar.querySelector('.contact-query-btn');
  if (queryBtn) queryBtn.addEventListener('click', function() { _onContactPeriodChange(apiPrefix); });

  // 清除按钮
  var clearBtn = bar.querySelector('.contact-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', function() { _clearContactDetail(apiPrefix); });

  // 默认设置当前期间
  _setContactPeriod(apiPrefix, 'from', currentPeriod);
  _setContactPeriod(apiPrefix, 'to', currentPeriod);
}

function _yearOptions() {
  let now = new Date(), y = now.getFullYear(), ops = '<option value="">年</option>';
  for (let i = y - 5; i <= y + 5; i++) ops += '<option value="' + i + '">' + i + '年</option>';
  return ops;
}
function _monthOptions() {
  return '<option value="">月</option><option value="01">01月</option><option value="02">02月</option><option value="03">03月</option><option value="04">04月</option><option value="05">05月</option><option value="06">06月</option><option value="07">07月</option><option value="08">08月</option><option value="09">09月</option><option value="10">10月</option><option value="11">11月</option><option value="12">12月</option>';
}

function _setContactPeriod(apiPrefix, side, period) {
  if (!period) return;
  let parts = period.split('-');
  if (parts.length < 2) return;
  let ySel = document.getElementById(apiPrefix + '-' + side + '-y');
  let mSel = document.getElementById(apiPrefix + '-' + side + '-m');
  if (ySel) ySel.value = parts[0];
  if (mSel) mSel.value = parts[1];
}

function _getContactPeriod(apiPrefix, side) {
  let y = document.getElementById(apiPrefix + '-' + side + '-y')?.value;
  let m = document.getElementById(apiPrefix + '-' + side + '-m')?.value;
  if (!y || !m) return '';
  return y + '-' + m;
}

function _stepContactYear(apiPrefix, side, delta) {
  let sel = document.getElementById(apiPrefix + '-' + side + '-y');
  if (!sel || !sel.value) return;
  sel.value = parseInt(sel.value) + delta;
  _onContactPeriodChange(apiPrefix);
}
function _stepContactMonth(apiPrefix, side, delta) {
  let ySel = document.getElementById(apiPrefix + '-' + side + '-y');
  let mSel = document.getElementById(apiPrefix + '-' + side + '-m');
  if (!ySel || !mSel || !mSel.value) return;
  let y = parseInt(ySel.value) || new Date().getFullYear();
  let m = parseInt(mSel.value) + delta;
  if (m > 12) { m = 1; y++; }
  else if (m < 1) { m = 12; y--; }
  ySel.value = y;
  mSel.value = String(m).padStart(2, '0');
  _onContactPeriodChange(apiPrefix);
}

function _onContactPeriodChange(apiPrefix) {
  let name = '';
  let activeEl = document.querySelector('#' + apiPrefix + '-list .contact-item.active');
  if (activeEl) name = activeEl.dataset.name;
  if (name) _loadContactDetail(apiPrefix, name);
}

async function _loadContactList(apiPrefix) {
  let listEl = document.getElementById(apiPrefix + '-list');
  listEl.innerHTML = '<div style="color:#999;padding:12px;font-size:13px">加载中...</div>';
  try {
    let data = await api('/api/ledger/' + apiPrefix + '-contacts');
    _contactCache[apiPrefix] = data;
    if (data.length === 0) {
      listEl.innerHTML = '<div style="color:#9ca3af;padding:24px 12px;text-align:center;font-size:13px">暂无往来数据<br><span style="font-size:11px">序时账中录入往来项目后自动生成</span></div>';
      return;
    }
    let html = '<div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#374151">往来项目（' + data.length + '）</div>';
    data.forEach(function(c, i) {
      html += '<div class="contact-item" data-name="' + escapeHtml(c.name) + '" onclick="_onContactClick(\'' + apiPrefix + '\', \'' + escJs(c.name) + '\')" style="padding:10px 8px;cursor:pointer;border-radius:6px;margin-bottom:4px;border:1px solid transparent">' +
        '<div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(c.name) + '</div>' +
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
  let listEl = document.getElementById(apiPrefix + '-list');
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
    let activeEl = document.querySelector('#' + apiPrefix + '-list .contact-item.active');
    if (activeEl) name = activeEl.dataset.name;
  }
  let tableEl = document.getElementById(apiPrefix + '-table');
  if (!name) {
    tableEl.innerHTML = '<div style="color:#9ca3af;padding:40px;text-align:center;font-size:13px">请从左侧选择一个往来项目</div>';
    return;
  }
  let from = _getContactPeriod(apiPrefix, 'from') || currentPeriod || '';
  let to = _getContactPeriod(apiPrefix, 'to') || currentPeriod || '';
  if (!from || !to) {
    tableEl.innerHTML = '<div style="color:#9ca3af;padding:40px;text-align:center;font-size:13px">请先选择期间</div>';
    return;
  }
  tableEl.innerHTML = '<div style="color:#999;padding:20px;font-size:13px">加载中...</div>';
  try {
    let data = await api('/api/ledger/' + apiPrefix + '-detail?contact_name=' + encodeURIComponent(name) + '&period_from=' + from + '&period_to=' + to);
    let ob = data.opening_balance || 0;
    let obFmt = ob === 0 ? '¥0.00' : (ob >= 0 ? '¥' + fmt(ob) : '<span style="color:var(--danger)">-¥' + fmt(-ob) + '</span>');
    let html = '<div class="period-selector-bar" style="padding:6px 12px;margin-bottom:10px;display:flex;align-items:center;gap:16px">' +
      '<span style="font-size:13px;color:var(--gray-800);font-weight:600">' + escapeHtml(name) + '</span>' +
      '<span style="font-size:13px;color:#6b7280">期初余额：' + obFmt + '</span>' +
      '<span style="font-size:13px;color:#6b7280">期间：<b style="color:var(--gray-800)">' + from + ' ~ ' + to + '</b></span>' +
      '</div>';
    html += '<table><thead><tr>' +
      '<th>日期</th><th>凭证号</th><th>摘要</th><th>科目</th>' +
      '<th class="num">借方</th><th class="num">贷方</th>' +
      '<th class="num">余额</th>' +
      '</tr></thead><tbody>';
    // 期初行
    let obDir = ob === 0 ? '平' : (ob > 0 ? '借' : '贷');
    html += '<tr style="background:#f8fafc">' +
      '<td></td><td></td><td style="color:#6b7280;font-style:italic">上期结转</td><td></td>' +
      '<td class="num"></td><td class="num"></td>' +
      '<td class="num" style="font-weight:600">' + obDir + ' ' + obFmt + '</td>' +
      '</tr>';
    if (data.rows.length === 0) {
      html += '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:30px">该期间无往来明细记录</td></tr>';
    } else {
      let totalDr = 0, totalCr = 0;
      data.rows.forEach(function(r) {
        totalDr += r.debit_amount || 0;
        totalCr += r.credit_amount || 0;
        let balDir = r.balance === 0 ? '平' : (r.balance > 0 ? '借' : '贷');
        let balHtml = r.balance === 0 ? '¥0.00' : (r.balance >= 0 ? '¥' + fmt(r.balance) : '<span style="color:var(--danger)">-¥' + fmt(-r.balance) + '</span>');
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
      let endBal = ob + totalDr - totalCr;
      let endDir = endBal === 0 ? '平' : (endBal > 0 ? '借' : '贷');
      let endFmt = endBal === 0 ? '¥0.00' : (endBal >= 0 ? '¥' + fmt(endBal) : '<span style="color:var(--danger)">-¥' + fmt(-endBal) + '</span>');
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
  let tableEl = document.getElementById(apiPrefix + '-table');
  if (tableEl) tableEl.innerHTML = '';
  let listEl = document.getElementById(apiPrefix + '-list');
  if (listEl) {
    listEl.querySelectorAll('.contact-item').forEach(function(el) {
      el.classList.remove('active');
      el.style.background = '';
      el.style.borderColor = 'transparent';
    });
  }
}

// 转义函数
function escJs(s) { return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n'); }

// ==================== 人员明细账 ====================
async function renderEmployeeLedger(container) {
  let el = container || document.getElementById('page-employee-ledger') || document.getElementById('content-area');
  el.innerHTML = _contactPageHTML('人员明细账', 'employee');
  _buildContactPeriodBar('employee');
  _loadContactList('employee');
}

// ==================== 客户明细账 ====================
async function renderCustomerLedger(container) {
  let el = container || document.getElementById('page-customer-ledger') || document.getElementById('content-area');
  el.innerHTML = _contactPageHTML('客户明细账', 'customer');
  _buildContactPeriodBar('customer');
  _loadContactList('customer');
}

// ==================== 供应商明细账 ====================
async function renderSupplierLedger(container) {
  let el = container || document.getElementById('page-supplier-ledger') || document.getElementById('content-area');
  el.innerHTML = _contactPageHTML('供应商明细账', 'supplier');
  _buildContactPeriodBar('supplier');
  _loadContactList('supplier');
}

