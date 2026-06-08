// ==================== 社会保险费页面（按Excel模板设计）====================
var ssDeclarations = [];
var ssFilterPeriod = '';
var ssImportData = null;  // 导入预览数据
var ssCurrentDeclaration = null;  // 当前查看的申报表


// 险种定义（按Excel模板顺序：1-15个险种，每个险种含缴费工资+费率+应缴费额）
const SS_INSURANCE_LIST = [
  { code: 'PENSION_UNIT', name: '基本养老保险（单位）', type: 'unit' },
  { code: 'PENSION_PERS', name: '基本养老保险（个人）', type: 'personal' },
  { code: 'MEDICAL_UNIT', name: '基本医疗保险（单位）', type: 'unit' },
  { code: 'MEDICAL_LS_UNIT', name: '地方补充医疗（单位）', type: 'unit' },
  { code: 'MEDICAL_PERS', name: '基本医疗保险（个人）', type: 'personal' },
  { code: 'MATERNITY', name: '生育保险', type: 'unit' },
  { code: 'ANNUITY_UNIT', name: '职业年金（单位）', type: 'unit' },
  { code: 'ANNUITY_PERS', name: '职业年金（个人）', type: 'personal' },
  { code: 'INJURY', name: '工伤保险（单位）', type: 'unit' },
  { code: 'CIVIL_MEDICAL', name: '公务员医疗补助', type: 'unit' },
  { code: 'FAMILY_UNIT', name: '家属统筹医疗（单位）', type: 'unit' },
  { code: 'FAMILY_PERS', name: '家属统筹医疗（个人）', type: 'personal' },
  { code: 'UNEMP_UNIT', name: '失业保险（单位）', type: 'unit' },
  { code: 'UNEMP_PERS', name: '失业保险（个人）', type: 'personal' },
  { code: 'PENSION_LS_UNIT', name: '地方补充养老（单位）', type: 'unit' },
];

// ==================== 主渲染（列表页）====================
async function renderSocialSecurity(container) {
  const el = container || document.getElementById('content-area');
  if (!el) { console.error('renderSocialSecurity: el is null'); return; }
  try {
  // 自动同步顶格栏期间
  if (currentPeriod && currentPeriod !== ssFilterPeriod) ssFilterPeriod = currentPeriod;
  const [fy, fm] = (ssFilterPeriod || currentPeriod || '2025-01').split('-');
  const selYear = fy || '2025';
  const selMonth = fm || '01';

  el.innerHTML = '<div id="ss-stats-row" style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px"></div>'
    + '<div class="toolbar" style="display:flex;align-items:center;gap:0;margin-bottom:16px;flex-wrap:wrap">'
      + '<div class="period-selector-bar">'
        + '<div class="period-stepper">'
          + '<select id="ss-filter-year" class="period-selector-year" onchange="onSSPeriodChange()">' + _buildSSYearOptions(selYear) + '</select>'
          + '<div class="stepper-arrows">'
            + '<button class="stepper-btn stepper-up" onclick="stepSSPeriodYear(1)" title="下一年">▲</button>'
            + '<button class="stepper-btn stepper-down" onclick="stepSSPeriodYear(-1)" title="上一年">▼</button>'
          + '</div>'
        + '</div>'
        + '<div class="period-stepper">'
          + '<select id="ss-filter-month" class="period-selector-month" onchange="onSSPeriodChange()">' + _buildSSMonthOptions(selMonth) + '</select>'
          + '<div class="stepper-arrows">'
            + '<button class="stepper-btn stepper-up" onclick="stepSSPeriodMonth(1)" title="下一月">▲</button>'
            + '<button class="stepper-btn stepper-down" onclick="stepSSPeriodMonth(-1)" title="上一月">▼</button>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'
    + '<div id="ss-list-table"></div>'
    + '<div id="ss-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeSSModal()"><div class="modal modal-xl" id="ss-modal-inner" style="max-width:1500px"></div></div>';
  await loadSSDeclarationList();
  } catch(e) {
    if (el) el.innerHTML = '<div style="color:red;padding:20px"><h3>❌ 社保页面错误</h3><pre>' + (e.stack || e.message || String(e)) + '</pre></div>';
    console.error('renderSocialSecurity error:', e);
  }
}

// ==================== 时间栏辅助函数 ====================
function _buildSSYearOptions(selected) {
  let html = '<option value="">年</option>';
  const thisYear = new Date().getFullYear();
  for (let y = thisYear + 1; y >= thisYear - 10; y--) {
    const v = String(y);
    html += '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + v + '年</option>';
  }
  return html;
}

function _buildSSMonthOptions(selected) {
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  let html = '<option value="">月</option>';
  months.forEach(m => {
    html += '<option value="' + m + '"' + (m === selected ? ' selected' : '') + '>' + m + '月</option>';
  });
  return html;
}

function onSSPeriodChange() {
  const y = document.getElementById('ss-filter-year')?.value || '';
  const m = document.getElementById('ss-filter-month')?.value || '';
  if (y && m) {
    ssFilterPeriod = y + '-' + m;
  } else if (y) {
    ssFilterPeriod = y + '-01';
  } else {
    ssFilterPeriod = '';
  }
}

function stepSSPeriodYear(dir) {
  const sel = document.getElementById('ss-filter-year');
  if (!sel) return;
  const cur = parseInt(sel.value) || new Date().getFullYear();
  const next = cur + dir;
  if (next >= 2000 && next <= 2100) {
    sel.value = String(next);
    onSSPeriodChange();
  }
}

function stepSSPeriodMonth(dir) {
  const yearSel = document.getElementById('ss-filter-year');
  const monthSel = document.getElementById('ss-filter-month');
  if (!yearSel || !monthSel) return;
  let y = parseInt(yearSel.value) || new Date().getFullYear();
  let m = parseInt(monthSel.value) || 1;
  m += dir;
  if (m > 12) { m = 1; y++; }
  if (m < 1) { m = 12; y--; }
  yearSel.value = String(y);
  monthSel.value = String(m).padStart(2, '0');
  onSSPeriodChange();
}

function clearSSFilter() {
  ssFilterPeriod = '';
  const yearSel = document.getElementById('ss-filter-year');
  const monthSel = document.getElementById('ss-filter-month');
  if (yearSel) yearSel.value = '';
  if (monthSel) monthSel.value = '';
  loadSSDeclarationList();
}

// ==================== 导入文件 ====================
function triggerSSImport() {
  document.getElementById('ss-import-file')?.click();
}

async function handleSSImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const period = ssFilterPeriod || currentPeriod || '2025-10';
  // 找到当前选中的申报记录ID（如有）
  let declId = null;
  try {
    const list = await api('/api/social-security/declarations?period=' + encodeURIComponent(period));
    if (list && list.length > 0) declId = list[0].id;
  } catch(e) {}
  const fd = new FormData();
  fd.append('file', file);
  fd.append('company_id', currentCompanyId);
  fd.append('period', period);
  if (declId) fd.append('declaration_id', declId);
  try {
    const res = await fetch('/api/social-security/import', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || '导入失败');
    toast('导入成功：' + (data.message || ''), 'success');
    await loadSSDeclarationList();
  } catch (e) { handleError(e, '导入社保Excel'); }
  event.target.value = '';
}

// ==================== 生成凭证 ====================
async function generateSSVoucher() {
  if (!currentCompanyId) { toast('请先选择公司', 'error'); return; }
  const period = ssFilterPeriod || currentPeriod || '2025-10';
  try {
    // 先尝试生成计提凭证
    const decls = await api('/api/social-security/declarations?period=' + encodeURIComponent(period));
    if (!decls || decls.length === 0) { toast('当前期间暂无申报记录', 'warning'); return; }
    // 生成缴纳凭证
    const payRes = await api('/api/social-security/generate-payment-journals?company_id=' + currentCompanyId, { method: 'POST' });
    toast('凭证生成成功：' + (payRes.message || JSON.stringify(payRes)), 'success');
    await loadSSDeclarationList();
  } catch (e) { handleError(e, '生成社保凭证'); }
}

// ==================== 删除报表 ====================
async function deleteSSDeclaration() {
  if (!ssFilterPeriod) { toast('请先选择期间', 'error'); return; }
  if (!confirm('确定删除 ' + ssFilterPeriod + ' 期间的社保申报记录吗？此操作不可恢复！')) return;
  try {
    const list = await api('/api/social-security/declarations?period=' + encodeURIComponent(ssFilterPeriod));
    if (!list || list.length === 0) { toast('该期间无申报记录', 'warning'); return; }
    for (const decl of list) {
      await api('/api/social-security/declarations/' + decl.id + '?company_id=' + currentCompanyId, { method: 'DELETE' });
    }
    toast('删除成功', 'success');
    ssFilterPeriod = '';
    const yearSel = document.getElementById('ss-filter-year');
    const monthSel = document.getElementById('ss-filter-month');
    if (yearSel) yearSel.value = '';
    if (monthSel) monthSel.value = '';
    await loadSSDeclarationList();
  } catch (e) { handleError(e, '删除社保申报'); }
}

// ==================== 列表加载 ====================
async function loadSSDeclarationList() {
  try {
    let url = '/api/social-security/declarations';
    if (ssFilterPeriod) url += '?period=' + encodeURIComponent(ssFilterPeriod);
    const res = await api(url);
    ssDeclarations = res.items || [];
  } catch (e) { ssDeclarations = []; handleError(e, '加载社会保险费'); }
  renderSSStats();
  renderSSDeclarationTable();
}

// ==================== 统计卡片 ====================
async function renderSSStats() {
  const el = document.getElementById('ss-stats-row'); if (!el) return;
  let stats = { total_declarations: ssDeclarations.length, total_details: 0, total_company_amount: 0, total_personal_amount: 0, total_amount: 0 };
  try {
    const url = '/api/social-security/stats' + (ssFilterPeriod ? '?period=' + encodeURIComponent(ssFilterPeriod) : '');
    const res = await api(url);
    stats = res;
  } catch (e) { /* use defaults */ }
  el.innerHTML = '<div class="stat-card"><div class="stat-label">申报记录</div><div class="stat-value">' + stats.total_declarations + '</div><div class="stat-sub">份申报表</div></div>'
    + '<div class="stat-card"><div class="stat-label">参保人数</div><div class="stat-value">' + stats.total_details + '</div><div class="stat-sub">人次</div></div>'
    + '<div class="stat-card"><div class="stat-label">单位缴纳</div><div class="stat-value" style="color:#db2777">' + fmt(stats.total_company_amount) + '</div><div class="stat-sub">合计</div></div>'
    + '<div class="stat-card"><div class="stat-label">个人缴纳</div><div class="stat-value" style="color:#d97706">' + fmt(stats.total_personal_amount) + '</div><div class="stat-sub">合计</div></div>'
    + '<div class="stat-card"><div class="stat-label">应收合计</div><div class="stat-value" style="color:#059669">' + fmt(stats.total_amount) + '</div><div class="stat-sub">单位+个人</div></div>';
}

// ==================== 申报表列表（按Excel模板展示）====================
async function renderSSDeclarationTable() {
  const el = document.getElementById('ss-list-table'); if (!el) return;
  if (ssDeclarations.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af">暂无申报记录，请导入Excel</div>';
    return;
  }

  // 加载每条申报表的明细
  let html = '<div style="display:flex;flex-direction:column;gap:24px">';
  for (const decl of ssDeclarations) {
    let details = [];
    try {
      const full = await api('/api/social-security/declarations/' + decl.id);
      details = full.details || [];
    } catch (e) { details = []; }

    html += renderSSExcelTemplate(decl, details);
  }
  html += '</div>';
  el.innerHTML = html;
}

// ==================== 按Excel模板渲染单个申报表 ====================
function renderSSExcelTemplate(decl, details) {
  const period = decl.period;
  const periodRange = period; // YYYY-MM
  // 工具：按险种code取金额
  const insMap = (items) => {
    const m = {};
    (items || []).forEach(i => { m[i.code || i.name] = i; });
    return m;
  };

  // 分组：在职人员 / 退休人员 / 家属统筹人员
  const groups = { '在职人员': [], '退休人员': [], '家属统筹人员': [] };
  details.forEach(d => {
    const cat = d.category || '在职人员';
    if (groups[cat]) groups[cat].push(d);
    else groups['在职人员'].push(d);
  });

  // 生成表头（按Excel模板列顺序）
  let thead = '<thead>';
  // 第一行：顶层分类
  thead += '<tr style="background:#d9e2f3">';
  thead += '<th rowspan="2" style="vertical-align:middle;min-width:50px">序号</th>';
  thead += '<th rowspan="2" style="vertical-align:middle;min-width:80px">姓名</th>';
  thead += '<th rowspan="2" style="vertical-align:middle;min-width:140px">证件号码</th>';
  thead += '<th colspan="2" style="text-align:center;min-width:100px">费款所属期</th>';
  thead += '<th rowspan="2" style="min-width:90px;background:#fde68a">应收金额</th>';
  thead += '<th rowspan="2" style="min-width:90px;background:#fde68a">个人社保合计</th>';
  thead += '<th rowspan="2" style="min-width:90px;background:#fde68a">单位社保合计</th>';
  thead += '<th rowspan="2" style="min-width:90px">缴费工资</th>';
  SS_INSURANCE_LIST.forEach(ins => {
    thead += '<th colspan="2" style="text-align:center;min-width:80px">' + escapeHtml(ins.name) + '</th>';
  });
  thead += '<th rowspan="2" style="min-width:80px">操作</th>';
  thead += '</tr>';
  // 第二行：子列
  thead += '<tr style="background:#e8edf5">';
  thead += '<th style="font-weight:normal;font-size:11px;min-width:45px">起</th>';
  thead += '<th style="font-weight:normal;font-size:11px;min-width:45px">止</th>';
  thead += '<th style="font-weight:normal;font-size:11px">—</th>';
  thead += '<th style="font-weight:normal;font-size:11px">—</th>';
  thead += '<th style="font-weight:normal;font-size:11px">—</th>';
  thead += '<th style="font-weight:normal;font-size:11px">—</th>';
  SS_INSURANCE_LIST.forEach(() => {
    thead += '<th style="font-weight:normal;font-size:11px">费率</th>';
    thead += '<th style="font-weight:normal;font-size:11px">应缴费额</th>';
  });
  thead += '<th></th>';
  thead += '</tr></thead>';

  // 生成数据行（按Excel模板的分组结构）
  let tbody = '<tbody>';

  for (const cat of ['在职人员', '退休人员', '家属统筹人员']) {
    const items = groups[cat];
    // 分组标题
    tbody += '<tr style="background:#dbeafe;font-weight:600"><td colspan="4">' + escapeHtml(cat) + '</td>';
    tbody += '<td colspan="' + (SS_INSURANCE_LIST.length * 2 + 1) + '"></td></tr>';

    if (items.length === 0) {
      // 小计行（全0）
      tbody += '<tr style="background:#f9fafb">';
      tbody += '<td colspan="6" style="text-align:right">小计</td>';
      SS_INSURANCE_LIST.forEach(() => {
        tbody += '<td class="num">-</td><td class="num">0.00</td>';
      });
      tbody += '<td class="num" style="background:#fef3c7">0.00</td>';
      tbody += '<td class="num" style="background:#fef3c7">0.00</td>';
      tbody += '<td class="num" style="background:#fef3c7">0.00</td>';
      tbody += '<td></td></tr>';
      continue;
    }

    let subtotalPersonal = 0, subtotalCompany = 0, subtotalTotal = 0;
    const subtotalsByIns = {}; // code -> amount sum
    SS_INSURANCE_LIST.forEach(ins => { subtotalsByIns[ins.code] = 0; });

    items.forEach((d, idx) => {
      const im = insMap(d.insurance_items);
      let rowPersonal = 0, rowCompany = 0;
      // 先遍历险种收集合计值
      SS_INSURANCE_LIST.forEach(ins => {
        const it = im[ins.code] || im[ins.name];
        const amt = it ? (it.amount || 0) : 0;
        if (ins.type === 'unit') rowCompany += amt;
        else rowPersonal += amt;
      });
      const rowTotal = rowPersonal + rowCompany;
      subtotalPersonal += rowPersonal;
      subtotalCompany += rowCompany;
      subtotalTotal += rowTotal;

      tbody += '<tr>';
      tbody += '<td>' + (idx + 1) + '</td>';
      tbody += '<td>' + escapeHtml(d.employee_name || '') + '</td>';
      tbody += '<td>' + escapeHtml(d.id_number || '') + '</td>';
      tbody += '<td>' + escapeHtml(d.period_start || periodRange) + '</td>';
      tbody += '<td>' + escapeHtml(d.period_end || periodRange) + '</td>';
      tbody += '<td class="num" style="font-weight:600;background:#fef3c7">' + fmt(rowTotal) + '</td>';
      tbody += '<td class="num" style="background:#fef3c7;color:#d97706">' + fmt(rowPersonal) + '</td>';
      tbody += '<td class="num" style="background:#fef3c7;color:#db2777">' + fmt(rowCompany) + '</td>';
      tbody += '<td class="num">' + fmt(d.salary_base || 0) + '</td>';
      SS_INSURANCE_LIST.forEach(ins => {
        const it = im[ins.code] || im[ins.name];
        const amt = it ? (it.amount || 0) : 0;
        const rate = it ? (it.rate || '-') : '-';
        subtotalsByIns[ins.code] += amt;
        tbody += '<td class="num">' + (rate === '-' ? '-' : (rate + (typeof rate === 'string' && rate.endsWith('%') ? '' : '%'))) + '</td>';
        tbody += '<td class="num">' + fmt(amt) + '</td>';
      });
      tbody += '<td class="col-action">'
        + '<button class="btn btn-sm btn-outline" onclick="openSSDetailEdit(' + decl.id + ',' + d.id + ')">编辑</button> '
        + '<button class="btn btn-sm btn-danger" onclick="deleteSSDetail(' + decl.id + ',' + d.id + ')">删除</button>'
        + '</td></tr>';
    });

    // 小计行
    tbody += '<tr style="font-weight:600;background:#f9fafb">';
    tbody += '<td colspan="9" style="text-align:right">小计</td>';
    SS_INSURANCE_LIST.forEach(ins => {
      tbody += '<td class="num">-</td>';
      tbody += '<td class="num">' + fmt(subtotalsByIns[ins.code]) + '</td>';
    });
    tbody += '<td></td></tr>';
  }

  // 合计行
  let totalPersonal = 0, totalCompany = 0;
  const totalsByIns = {};
  SS_INSURANCE_LIST.forEach(ins => { totalsByIns[ins.code] = 0; });
  details.forEach(d => {
    const im = insMap(d.insurance_items);
    SS_INSURANCE_LIST.forEach(ins => {
      const it = im[ins.code] || im[ins.name];
      const amt = it ? (it.amount || 0) : 0;
      totalsByIns[ins.code] += amt;
      if (ins.type === 'unit') totalCompany += amt;
      else totalPersonal += amt;
    });
  });
  const totalAll = totalPersonal + totalCompany;
  tbody += '<tr style="font-weight:700;background:#fef3c7">';
  tbody += '<td colspan="9" style="text-align:right">合计</td>';
  SS_INSURANCE_LIST.forEach(ins => {
    tbody += '<td class="num">-</td>';
    tbody += '<td class="num">' + fmt(totalsByIns[ins.code]) + '</td>';
  });
  tbody += '<td></td></tr>';
  tbody += '</tbody>';

  // 工具栏
  const toolbar = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:8px 12px;background:#f3f4f6;border-radius:6px">'
    + '<div style="font-size:14px;font-weight:600">📋 日常申报明细表 — ' + escapeHtml(period) + '</div>'
    + '<div style="display:flex;gap:8px">'
    + '<button class="btn btn-sm btn-outline" onclick="showSSImportModal(' + decl.id + ')">导入Excel</button>'
    + '<button class="btn btn-sm btn-info" onclick="generateSSAccrualJournal(' + decl.id + ')" style="background:#10b981;color:#fff">生成计提凭证</button>'
    + '<button class="btn btn-sm btn-info" onclick="generateSSPaymentJournals(' + decl.id + ')" style="background:#3b82f6;color:#fff">生成缴纳凭证</button>'
    + '<button class="btn btn-sm btn-danger" onclick="deleteSSDeclaration(' + decl.id + ',\'' + escJs(period) + '\')">删除申报</button>'
    + '</div></div>';

  return '<div class="ss-decl-block" style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px">'
    + toolbar
    + '<div style="overflow-x:auto"><table class="data-table" style="font-size:11px;min-width:100%">' + thead + tbody + '</table></div></div>';
}

// ==================== 导入 Excel ====================
function showSSImportModal(declarationId) {
  const defaultPeriod = ssFilterPeriod || (new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0'));
  document.getElementById('ss-modal').style.display = 'flex';
  document.getElementById('ss-modal-inner').innerHTML = '<h2 style="margin:0 0 20px 0;font-size:18px">导入社会保险费Excel</h2>'
    + '<div style="margin-bottom:16px;padding:12px;background:#fef3c7;border-radius:6px;font-size:13px;color:#92400e">'
    + '支持"日常申报明细表"格式的Excel文件（.xlsx / .xls）</div>'
    + (declarationId ? '' : '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">费款所属期 <span style="color:red">*</span></label>'
    + '<input type="month" class="form-control" id="ss-import-period" value="' + defaultPeriod + '" style="width:200px"></div>')
    + '<div class="form-group" style="margin-top:12px"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">选择文件 <span style="color:red">*</span></label>'
    + '<input type="file" class="form-control" id="ss-import-file" accept=".xlsx,.xls" style="width:100%"></div>'
    + '<div id="ss-import-preview" style="margin-top:12px;max-height:400px;overflow-y:auto"></div>'
    + '<div id="ss-import-result" style="margin-top:12px"></div>'
    + '<div style="margin-top:24px;display:flex;gap:10px;justify-content:flex-end">'
    + '<button class="btn btn-outline" onclick="closeSSModal()">取消</button>'
    + '<button class="btn btn-primary" onclick="doSSImport(' + (declarationId || 'null') + ')">开始导入</button></div>';
}

async function doSSImport(declarationId) {
  const period = declarationId ? ssFilterPeriod : document.getElementById('ss-import-period')?.value;
  const fileInput = document.getElementById('ss-import-file');
  const resultEl = document.getElementById('ss-import-result');

  if (!period) { alert('请选择费款所属期'); return; }
  if (!fileInput?.files?.length) { alert('请选择文件'); return; }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  resultEl.innerHTML = '<div style="padding:8px;color:#6b7280">⏳ 正在导入...</div>';
  try {
    const url = '/api/social-security/import?period=' + encodeURIComponent(period) + (declarationId ? '&declaration_id=' + declarationId : '');
    const res = await api(url, {
      method: 'POST',
      body: formData,
      headers: {} // no Content-Type for FormData
    });
    if (res.imported > 0) {
      resultEl.innerHTML = '<div style="padding:8px;background:#ecfdf5;color:#065f46;border-radius:4px">✅ 成功导入 ' + res.imported + ' 条记录' + (res.errors?.length ? '<br><small style="color:#dc2626">警告: ' + res.errors.join('; ') + '</small>' : '') + '</div>';
      setTimeout(() => { closeSSModal(); loadSSDeclarationList(); }, 1500);
    } else {
      resultEl.innerHTML = '<div style="padding:8px;background:#fef2f2;color:#dc2626;border-radius:4px">❌ 导入失败：未识别到有效数据' + (res.errors?.length ? '<br>' + res.errors.join('<br>') : '') + '</div>';
    }
  } catch (e) {
    handleError(e, '导入社会保险费');
    resultEl.innerHTML = '<div style="padding:8px;background:#fef2f2;color:#dc2626;border-radius:4px">❌ 导入失败</div>';
  }
}

// ==================== 编辑/新增明细 ====================
async function openSSDetailEdit(declarationId, detailId) {
  // 获取当前明细
  let detail = null;
  if (detailId) {
    try {
      const decl = await api('/api/social-security/declarations/' + declarationId);
      detail = (decl.details || []).find(d => d.id === detailId);
    } catch (e) {}
  }

  const im = {};
  (detail?.insurance_items || []).forEach(i => { im[i.code || i.name] = i; });

  // 渲染编辑表单
  let insHtml = '';
  SS_INSURANCE_LIST.forEach(ins => {
    const it = im[ins.code] || im[ins.name] || { amount: 0, rate: '' };
    insHtml += '<tr>'
      + '<td style="padding:4px;font-size:12px">' + escapeHtml(ins.name) + '<br><span style="color:#6b7280;font-size:11px">' + (ins.type === 'unit' ? '单位' : '个人') + '</span></td>'
      + '<td style="padding:4px"><input type="text" class="form-control ss-rate" data-code="' + ins.code + '" value="' + (it.rate || '') + '" placeholder="如 16%" style="width:80px;padding:4px;font-size:12px"></td>'
      + '<td style="padding:4px"><input type="number" step="0.01" class="form-control ss-amount" data-code="' + ins.code + '" value="' + (it.amount || 0) + '" style="width:100px;padding:4px;font-size:12px"></td>'
      + '</tr>';
  });

  document.getElementById('ss-modal').style.display = 'flex';
  document.getElementById('ss-modal-inner').innerHTML = '<h2 style="margin:0 0 20px 0;font-size:18px">' + (detailId ? '编辑' : '新增') + '参保人员明细</h2>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">姓名 <span style="color:red">*</span></label>'
    + '<input type="text" class="form-control" id="ss-emp-name" value="' + escapeHtml(detail?.employee_name || '') + '"></div>'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">证件号码</label>'
    + '<input type="text" class="form-control" id="ss-emp-id" value="' + escapeHtml(detail?.id_number || '') + '"></div>'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">人员类别</label>'
    + '<select class="form-control" id="ss-emp-cat"><option value="在职人员"' + (detail?.category === '在职人员' ? ' selected' : '') + '>在职人员</option><option value="退休人员"' + (detail?.category === '退休人员' ? ' selected' : '') + '>退休人员</option><option value="家属统筹人员"' + (detail?.category === '家属统筹人员' ? ' selected' : '') + '>家属统筹人员</option></select></div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">费款所属期起</label>'
    + '<input type="month" class="form-control" id="ss-emp-start" value="' + (detail?.period_start || ssFilterPeriod) + '"></div>'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">费款所属期止</label>'
    + '<input type="month" class="form-control" id="ss-emp-end" value="' + (detail?.period_end || ssFilterPeriod) + '"></div>'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">缴费工资</label>'
    + '<input type="number" step="0.01" class="form-control" id="ss-emp-salary" value="' + (detail?.salary_base || 0) + '"></div>'
    + '</div>'
    + '<h4 style="margin:16px 0 8px;font-size:14px">险种明细</h4>'
    + '<div style="max-height:400px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px"><table class="data-table" style="font-size:12px"><thead><tr><th style="padding:4px">险种</th><th style="padding:4px;width:100px">费率</th><th style="padding:4px;width:120px">应缴费额</th></tr></thead><tbody>'
    + insHtml
    + '</tbody></table></div>'
    + '<div style="margin-top:24px;display:flex;gap:10px;justify-content:flex-end">'
    + '<button class="btn btn-outline" onclick="closeSSModal()">取消</button>'
    + '<button class="btn btn-primary" onclick="saveSSDetail(' + declarationId + ',' + (detailId || 'null') + ')">保存</button></div>';
}

async function saveSSDetail(declarationId, detailId) {
  const name = document.getElementById('ss-emp-name')?.value;
  if (!name) { alert('请填写姓名'); return; }
  const idNumber = document.getElementById('ss-emp-id')?.value;
  const category = document.getElementById('ss-emp-cat')?.value;
  const periodStart = document.getElementById('ss-emp-start')?.value;
  const periodEnd = document.getElementById('ss-emp-end')?.value;
  const salaryBase = parseFloat(document.getElementById('ss-emp-salary')?.value) || 0;

  const insuranceItems = [];
  SS_INSURANCE_LIST.forEach(ins => {
    const rate = document.querySelector('.ss-rate[data-code="' + ins.code + '"]')?.value || '';
    const amount = parseFloat(document.querySelector('.ss-amount[data-code="' + ins.code + '"]')?.value) || 0;
    if (rate || amount) {
      insuranceItems.push({ code: ins.code, name: ins.name, type: ins.type, rate: rate, amount: amount });
    }
  });

  const body = {
    employee_name: name,
    id_number: idNumber,
    category: category,
    period_start: periodStart,
    period_end: periodEnd,
    salary_base: salaryBase,
    insurance_items: insuranceItems,
  };

  try {
    if (detailId) {
      await api('/api/social-security/details/' + detailId + '?company_id=' + currentCompanyId, {
        method: 'PUT', body: JSON.stringify(body)
      });
    } else {
      await api('/api/social-security/declarations/' + declarationId + '/details?company_id=' + currentCompanyId, {
        method: 'POST', body: JSON.stringify(body)
      });
    }
    closeSSModal();
    await loadSSDeclarationList();
  } catch (e) { handleError(e, '保存明细'); }
}

async function deleteSSDetail(declarationId, detailId) {
  if (!confirm('确定要删除此参保人员明细？')) return;
  try {
    await api('/api/social-security/details/' + detailId + '?company_id=' + currentCompanyId, { method: 'DELETE' });
    await loadSSDeclarationList();
  } catch (e) { handleError(e, '删除明细'); }
}

// ==================== 新建申报表 ====================
async function showSSCreateModal() {
  const defaultPeriod = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  document.getElementById('ss-modal').style.display = 'flex';
  document.getElementById('ss-modal-inner').innerHTML = '<h2 style="margin:0 0 20px 0;font-size:18px">新建社会保险费</h2>'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">费款所属期 <span style="color:red">*</span></label>'
    + '<input type="month" class="form-control" id="ss-period" value="' + defaultPeriod + '" style="width:200px"></div>'
    + '<div class="form-group" style="margin-top:12px"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">备注</label>'
    + '<input type="text" class="form-control" id="ss-note" placeholder="可选" style="width:100%"></div>'
    + '<div style="margin-top:24px;display:flex;gap:10px;justify-content:flex-end">'
    + '<button class="btn btn-outline" onclick="closeSSModal()">取消</button>'
    + '<button class="btn btn-primary" onclick="createSSDeclaration()">保存</button></div>';
}

async function createSSDeclaration() {
  const period = document.getElementById('ss-period')?.value;
  const note = document.getElementById('ss-note')?.value;
  if (!period) { alert('请选择费款所属期'); return; }
  try {
    await api('/api/social-security/declarations', {
      method: 'POST',
      body: JSON.stringify({ period: period, note: note || '', details: [] })
    });
    closeSSModal();
    await loadSSDeclarationList();
  } catch (e) { handleError(e, '创建申报'); }
}

// ==================== 删除 ====================
async function deleteSSDeclaration(id, period) {
  if (!confirm('确定要删除 ' + period + ' 的社会保险费记录？')) return;
  try {
    await api('/api/social-security/declarations/' + id, { method: 'DELETE' });
    await loadSSDeclarationList();
  } catch (e) { handleError(e, '删除申报'); }
}

// ==================== 凭证生成 ====================
async function generateSSPaymentJournals(id) {
  if (!confirm('将根据银行流水智能匹配社保缴纳记录并生成凭证，确定？')) return;
  try {
    const result = await api('/api/social-security/generate-payment-journals?company_id=' + currentCompanyId, {
      method: 'POST'
    });
    alert('生成成功！共匹配 ' + (result.generated || 0) + ' 张凭证');
    if (typeof loadJePage === 'function') loadJePage(1);
  } catch (e) {
    alert('生成失败：' + e.message);
  }
}

async function generateSSAccrualJournal(id) {
  if (!confirm('确认为此申报表生成社保计提凭证？')) return;
  try {
    const result = await api('/api/social-security/declarations/' + id + '/generate-accrual-journal?company_id=' + currentCompanyId, {
      method: 'POST'
    });
    alert('生成成功！共 ' + (result.generated || 0) + ' 张凭证');
    if (typeof loadJePage === 'function') loadJePage(1);
  } catch (e) {
    alert('生成失败：' + e.message);
  }
}

// ==================== 模态框 ====================
function closeSSModal() {
  document.getElementById('ss-modal').style.display = 'none';
}
