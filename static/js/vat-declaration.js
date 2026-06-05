// ==================== 增值税申报页面 ====================
// 按官方《增值税及附加税费申报表（一般纳税人适用）》模板渲染
let vatDeclarations = [];
let vatSelectedId = null;
let vatActivePage = 2; // 默认显示主表（第2页）
let vatFilterPeriod = '';

const VAT_PAGES = [
  { id: 4, label: '附表四 — 税额抵减' },
  { id: 2, label: '增值税主表（会企02号）' },
  { id: 1, label: '附表一 — 销售明细' },
  { id: '2_annex', label: '附表二 — 进项明细' },
  { id: 'deduction', label: '减免税申报明细表' },
  { id: 3, label: '附表三 — 扣除项目' },
  { id: 5, label: '附表五 — 附加税费' },
];

// ==================== 主渲染（列表页） ====================
async function renderVATDeclaration(container) {
  const el = container || document.getElementById('page-vat-declaration') || document.getElementById('content-area');
  el.innerHTML = `
    <div id="vat-stats-row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px"></div>
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-primary" onclick="showVATCreateModal()">＋ 新建申报</button>
      </div>
      <div class="toolbar-right">
        <input type="month" class="form-control" id="vat-filter-period" value="${vatFilterPeriod}" onchange="vatFilterPeriod=this.value;renderVATDeclaration()" style="width:160px" placeholder="筛选期间">
      </div>
    </div>
    <div id="vat-list-table"></div>
    <div id="vat-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeVATModal()">
      <div class="modal modal-lg" id="vat-modal-inner"></div>
    </div>
  `;
  await loadVATDeclarationList();
}

// ==================== 列表加载 ====================
async function loadVATDeclarationList() {
  try {
    let url = '/api/vat/declarations';
    if (vatFilterPeriod) url += '?period=' + encodeURIComponent(vatFilterPeriod);
    vatDeclarations = await api(url);
  } catch (e) {
    vatDeclarations = [];
    handleError(e, '加载申报表');
  }
  renderVATStats();
  renderVATTable();
}

function renderVATStats() {
  const total = vatDeclarations.length;
  const submitted = vatDeclarations.filter(d => d.status === '已申报').length;
  const el = document.getElementById('vat-stats-row');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">申报表总数</div><div class="stat-value">${total}</div><div class="stat-sub">已申报 ${submitted} 份</div></div>
    <div class="stat-card"><div class="stat-label">最新申报期间</div><div class="stat-value">${vatDeclarations.length > 0 ? vatDeclarations[0].period : '-'}</div><div class="stat-sub">按时间倒序</div></div>
    <div class="stat-card"><div class="stat-label">草稿</div><div class="stat-value" style="color:#f59e0b">${vatDeclarations.filter(d => d.status === '草稿').length}</div><div class="stat-sub">待完成</div></div>
    <div class="stat-card"><div class="stat-label">已缴税</div><div class="stat-value" style="color:#10b981">${vatDeclarations.filter(d => d.status === '已缴税').length}</div><div class="stat-sub">已完成</div></div>
  `;
}

function renderVATTable() {
  const el = document.getElementById('vat-list-table');
  if (!el) return;
  let html = '<div class="table-wrap"><table class="data-table"><thead><tr>';
  html += '<th>税款所属期</th><th>纳税人名称</th><th>小规模纳税人</th><th>六税两费减征</th><th>状态</th><th>应纳税额</th><th>填报日期</th><th>申报日期</th><th>操作</th>';
  html += '</tr></thead><tbody>';
  if (vatDeclarations.length === 0) {
    html += '<tr><td colspan="9" style="text-align:center;padding:40px;color:#9ca3af">暂无申报表，点击「＋ 新建申报」创建</td></tr>';
  } else {
    vatDeclarations.forEach(d => {
      try {
        const main = typeof d.form_main === 'string' ? JSON.parse(d.form_main) : (d.form_main || {});
        const taxPayable = main.row19_tax_payable || 0;
        const badge = {'草稿':'<span class="badge badge-draft">草稿</span>','已申报':'<span class="badge badge-audited">已申报</span>','已缴税':'<span class="badge badge-posted">已缴税</span>'}[d.status] || d.status;
        html += '<tr>';
        html += '<td><strong>' + escHtml(d.period) + '</strong></td>';
        html += '<td>' + escHtml(d.taxpayer_name || '') + '</td>';
        html += '<td>' + (d.micro_enterprise ? '✅ 是' : '否') + '</td>';
        html += '<td>' + (d.six_tax_reduction ? '✅ 是' : '否') + '</td>';
        html += '<td>' + badge + '</td>';
        html += '<td class="num" style="font-weight:600;color:' + (taxPayable > 0 ? '#d97706' : '#6b7280') + '">' + fmt(taxPayable) + '</td>';
        html += '<td>' + (d.fill_date || '-') + '</td>';
        html += '<td>' + (d.submitted_at ? new Date(d.submitted_at).toLocaleDateString('zh-CN') : '-') + '</td>';
        html += '<td class="col-action">';
        html += '<button class="btn btn-sm btn-outline" onclick="openVATDetail(' + d.id + ')">📋 查看附表</button> ';
        html += '<button class="btn btn-sm btn-danger" onclick="deleteVATDeclaration(' + d.id + ',\'' + escJs(d.period) + '\')">🗑</button>';
        html += '</td></tr>';
      } catch(e) { /* skip bad data */ }
    });
  }
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

// ==================== 新建 ====================
function showVATCreateModal() {
  document.getElementById('vat-modal').style.display = 'flex';
  document.getElementById('vat-modal-inner').innerHTML = `
    <div class="modal-title">＋ 新建增值税申报表</div>
    <div class="form-grid">
      <div class="form-group"><label>税款所属期 *</label><input type="month" class="form-control" id="vat-new-period" required></div>
      <div class="form-group"><label>行业</label><input type="text" class="form-control" id="vat-new-industry" placeholder="如：商业、服务业"></div>
      <div class="form-group"><label>登记注册类型</label><input type="text" class="form-control" id="vat-new-register-type" placeholder="如：有限责任公司"></div>
      <div class="form-group"><label>银行账户</label><input type="text" class="form-control" id="vat-new-bank-account" placeholder="开户行及账号"></div>
      <div class="form-group"><label>联系电话</label><input type="text" class="form-control" id="vat-new-phone" placeholder="电话号码"></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:24px;align-items:center">
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="vat-new-micro" checked> 小规模纳税人</label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="vat-new-six-tax" checked> 享受六税两费减征</label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeVATModal()">取消</button>
      <button class="btn btn-primary" onclick="createVATDeclaration()">✅ 创建并自动计算</button>
    </div>
  `;
}

function closeVATModal() { document.getElementById('vat-modal').style.display = 'none'; }

async function createVATDeclaration() {
  const period = document.getElementById('vat-new-period').value;
  if (!period) { toast('请选择税款所属期', 'error'); return; }
  try {
    const body = {
      period, industry: document.getElementById('vat-new-industry').value,
      register_type: document.getElementById('vat-new-register-type').value,
      bank_account: document.getElementById('vat-new-bank-account').value,
      phone: document.getElementById('vat-new-phone').value,
      micro_enterprise: document.getElementById('vat-new-micro').checked,
      six_tax_reduction: document.getElementById('vat-new-six-tax').checked
    };
    await api('/api/vat/declarations', { method: 'POST', body: JSON.stringify(body) });
    toast('申报表已创建并计算完成', 'success');
    closeVATModal();
    await loadVATDeclarationList();
  } catch (e) { handleError(e, '创建申报表'); }
}

// ==================== 查看附表 — 全页模板渲染 ====================
async function openVATDetail(id) {
  vatSelectedId = id;
  vatActivePage = 2; // 默认主表
  try {
    const data = await api('/api/vat/declarations/' + id);
    // 解析 JSON 字符串
    ['form_main','form_sales','form_input','form_deduction','form_credit','form_surcharge','form_reduction'].forEach(k => {
      if (typeof data[k] === 'string') { try { data[k] = JSON.parse(data[k]); } catch(e) { data[k] = {}; } }
    });
    window._vatDetailData = data;
    renderVATTemplateView(data);
  } catch (e) { handleError(e, '加载申报表'); }
}

function renderVATTemplateView(data) {
  const container = document.getElementById('page-vat-declaration') || document.getElementById('content-area');
  if (!container) return;

  // 隐藏普通列表
  document.querySelectorAll('#vat-stats-row, #vat-list-table, .toolbar').forEach(el => { if(el) el.style.display = 'none'; });

  // 检查是否已有模板视图
  let view = document.getElementById('vat-template-view');
  if (!view) {
    view = document.createElement('div');
    view.id = 'vat-template-view';
    view.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0';
    container.appendChild(view);
  }

  // 页面选择器
  const pages = [
    { id: 4, label: '附表四（税额抵减）', icon: '🔐' },
    { id: 2, label: '主表（会企02号）', icon: '📊' },
    { id: 1, label: '附表一（销售明细）', icon: '📤' },
    { id: 'annex2', label: '附表二（进项明细）', icon: '📥' },
    { id: 'reduction', label: '减免税明细表', icon: '🎁' },
    { id: 3, label: '附表三（扣除项目）', icon: '📐' },
    { id: 5, label: '附表五（附加税费）', icon: '🧮' },
  ];

  let tabsHtml = '<div class="card" style="padding:12px 16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
  tabsHtml += '<span style="font-weight:600;font-size:14px;margin-right:12px">' + escHtml(data.period) + ' 申报表 — ' + escHtml(data.taxpayer_name || '') + '</span>';
  pages.forEach(p => {
    tabsHtml += '<button class="btn btn-sm ' + (vatActivePage === p.id ? 'btn-primary' : 'btn-outline') + '" onclick="switchVATPage(\'' + p.id + '\')">' + p.icon + ' ' + p.label + '</button>';
  });
  tabsHtml += '<span style="flex:1"></span>';
  tabsHtml += '<button class="btn btn-sm btn-outline" onclick="recomputeFromTemplate()">🔄 重新计算</button>';
  tabsHtml += '<button class="btn btn-sm btn-outline" onclick="backToVATList()" style="color:#6b7280">← 返回列表</button>';
  tabsHtml += '</div>';

  // 内容区
  let contentHtml = '<div id="vat-page-content" style="flex:1;overflow:auto;margin-top:8px">';
  contentHtml += renderVATPage(data, vatActivePage);
  contentHtml += '</div>';

  view.innerHTML = tabsHtml + contentHtml;
}

function switchVATPage(pageId) {
  vatActivePage = pageId;
  renderVATTemplateView(window._vatDetailData);
}

function backToVATList() {
  const view = document.getElementById('vat-template-view');
  if (view) view.remove();
  document.querySelectorAll('#vat-stats-row, #vat-list-table, .toolbar').forEach(el => { if(el) el.style.display = ''; });
  loadVATDeclarationList();
}

async function recomputeFromTemplate() {
  if (!vatSelectedId) return;
  try {
    const result = await api('/api/vat/declarations/' + vatSelectedId + '/recompute', { method: 'POST' });
    toast(result.msg || '重新计算完成', 'success');
    const data = await api('/api/vat/declarations/' + vatSelectedId);
    ['form_main','form_sales','form_input','form_deduction','form_credit','form_surcharge','form_reduction'].forEach(k => {
      if (typeof data[k] === 'string') { try { data[k] = JSON.parse(data[k]); } catch(e) { data[k] = {}; } }
    });
    window._vatDetailData = data;
    renderVATTemplateView(data);
  } catch (e) { handleError(e, '重新计算'); }
}

// ==================== 分页渲染 ====================
function renderVATPage(data, pageId) {
  switch (pageId) {
    case 2: return renderMainForm(data);
    case 1: return renderSchedule1(data);
    case 'annex2': return renderSchedule2(data);
    case 3: return renderSchedule3(data);
    case 4: return renderSchedule4(data);
    case 5: return renderSchedule5(data);
    case 'reduction': return renderReductionForm(data);
    default: return '<div class="empty-state">未找到对应附表</div>';
  }
}

// ==================== 主表（Page 2）—— 会企02号 ====================
function renderMainForm(data) {
  const f = data.form_main || {};
  const info = data;

  // 纳税人信息头
  let h = '<div class="card" style="padding:0;overflow:hidden">';
  h += '<div style="text-align:center;padding:12px 0 8px;font-size:18px;font-weight:700;letter-spacing:2px">增值税及附加税费申报表</div>';
  h += '<div style="text-align:center;padding:0 0 8px;font-size:13px;color:#6b7280">（一般纳税人适用）</div>';
  h += '<div style="text-align:center;padding:4px 0 12px;font-size:13px">';
  h += '税款所属时间：<strong>' + escHtml(f.period || data.period) + '</strong> 至 <strong>' + escHtml(f.period || data.period) + '</strong>';
  h += ' &nbsp; 填表日期：<strong>' + (data.fill_date || '____年__月__日') + '</strong>';
  h += '</div>';

  // 纳税人基本信息（两行四列）
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;border-top:2px solid #000;font-size:13px">';
  h += '<div style="border-bottom:1px solid #999;border-right:1px solid #999;padding:6px 10px"><span style="color:#6b7280">纳税人名称：</span>' + escHtml(info.taxpayer_name || '') + '</div>';
  h += '<div style="border-bottom:1px solid #999;padding:6px 10px"><span style="color:#6b7280">识别号：</span>' + escHtml(info.taxpayer_id || '') + '</div>';
  h += '<div style="border-bottom:1px solid #999;border-right:1px solid #999;padding:6px 10px"><span style="color:#6b7280">所属行业：</span>' + escHtml(info.industry || '') + '</div>';
  h += '<div style="border-bottom:1px solid #999;padding:6px 10px"><span style="color:#6b7280">登记注册类型：</span>' + escHtml(info.register_type || '') + '</div>';
  h += '<div style="border-bottom:1px solid #999;border-right:1px solid #999;padding:6px 10px"><span style="color:#6b7280">法定代表人：</span>' + escHtml(info.legal_representative || '') + '</div>';
  h += '<div style="border-bottom:1px solid #999;padding:6px 10px"><span style="color:#6b7280">注册地址：</span>' + escHtml(info.address || '') + '</div>';
  h += '<div style="padding:6px 10px;border-right:1px solid #999"><span style="color:#6b7280">开户银行及账号：</span>' + escHtml(info.bank_account || '') + '</div>';
  h += '<div style="padding:6px 10px"><span style="color:#6b7280">联系电话：</span>' + escHtml(info.phone || '') + '</div>';
  h += '</div>';

  // 主表
  h += '<table class="vat-form-table">';
  h += '<thead><tr>';
  h += '<th style="width:40px;text-align:center">栏次</th>';
  h += '<th style="text-align:center">项目</th>';
  h += '<th style="width:100px;text-align:center">一般项目<br>本月数</th>';
  h += '<th style="width:100px;text-align:center">一般项目<br>本年累计</th>';
  h += '<th style="width:100px;text-align:center">即征即退<br>本月数</th>';
  h += '<th style="width:100px;text-align:center">即征即退<br>本年累计</th>';
  h += '</tr></thead><tbody>';

  // === 销售额 ===
  h += _sectionHeader('一、销售额', 6);
  h += _mainRow(1, '（一）按适用税率计税销售额', f.row1_sales);
  h += _mainRow(2, '　其中：应税货物销售额', 0.0);
  h += _mainRow(3, '　　　　应税劳务销售额', 0.0);
  h += _mainRow(4, '　　　　纳税检查调整的销售额', 0.0);
  h += _mainRow(5, '（二）按简易办法计税销售额', 0.0);
  h += _mainRow(6, '　其中：纳税检查调整的销售额', 0.0);
  h += _mainRow(7, '（三）免、抵、退办法出口销售额', 0.0);
  h += _mainRow(8, '（四）免税销售额', 0.0);
  h += _mainRow(9, '　其中：免税货物销售额', 0.0);
  h += _mainRow(10, '　　　　免税劳务销售额', 0.0);

  // === 税款计算 ===
  h += _sectionHeader('二、税款计算', 6);
  h += _mainRow(11, '销项税额', f.row11_output_tax, true);
  h += _mainRow(12, '进项税额', f.row12_input_tax, true);
  h += _mainRow(13, '上期留抵税额', f.row13_prior_credit);
  h += _mainRow(14, '进项税额转出', f.row14_input_transfer_out);
  h += _mainRow(15, '免、抵、退应退税额', f.row15_exempt_refund);
  h += _mainRow(16, '按适用税率计算的纳税检查应补缴税额', f.row16_actual_deduct_by_item);
  h += _mainRow(17, '应抵扣税额合计', f.row17_total_deductible, true, '12+13-14-15+16');
  h += _mainRow(18, '实际抵扣税额（如17<11，则为17，否则为11）', f.row18_actual_deduct, false, 'min(17,11)');
  h += _mainRow(19, '应纳税额', f.row19_tax_payable, true, '11-18');
  h += _mainRow(20, '期末留抵税额', f.row20_end_credit, false, '17-18');
  h += _mainRow(21, '简易计税办法计算的应纳税额', 0.0);
  h += _mainRow(22, '按简易计税办法计算的纳税检查应补缴税额', 0.0);
  h += _mainRow(23, '应纳税额减征额', f.row23_reduction);
  h += _mainRow(24, '应纳税额合计', f.row24_tax_payable_total, true, '19+21-23');

  // === 税款缴纳 ===
  h += _sectionHeader('三、税款缴纳', 6);
  h += _mainRow(25, '期初未缴税额（多缴为负数）', 0.0);
  h += _mainRow(26, '实收出口开具专用缴款书退税额', 0.0);
  h += _mainRow(27, '本期已缴税额', 0.0);
  h += _mainRow(28, '①分次预缴税额', 0.0);
  h += _mainRow(29, '②出口开具专用缴款书预缴税额', 0.0);
  h += _mainRow(30, '③本期缴纳上期应纳税额', 0.0);
  h += _mainRow(31, '④本期缴纳欠缴税额', 0.0);
  h += _mainRow(32, '期末未缴税额（多缴为负数）', 0.0, false, '25+26-27');
  h += _mainRow(33, '其中：欠缴税额（≥0）', 0.0);
  h += _mainRow(34, '本期应补（退）税额', 0.0, false, '24-28-29');
  h += _mainRow(35, '即征即退实际退税额', 0.0);
  h += _mainRow(36, '期初未缴查补税额', 0.0);
  h += _mainRow(37, '本期入库查补税额', 0.0);
  h += _mainRow(38, '期末未缴查补税额', 0.0, false, '36+37');

  // === 附加税费 ===
  h += _sectionHeader('四、附加税费', 6);
  h += _mainRow(39, '城市维护建设税', f.city_maintenance_tax || f.row39_city_maintenance_tax, true);
  h += _mainRow(40, '教育费附加', f.education_surcharge || f.row40_education_surcharge, true);
  h += _mainRow(41, '地方教育附加', f.local_education_surcharge || f.row41_local_education_surcharge, true);
  // 附加税费合计
  const totalSurcharge = (f.city_maintenance_tax || f.row39_city_maintenance_tax || 0)
    + (f.education_surcharge || f.row40_education_surcharge || 0)
    + (f.local_education_surcharge || f.row41_local_education_surcharge || 0);
  h += _mainRow('', '附加税费合计', totalSurcharge, true);

  h += '</tbody></table>';
  h += '</div>';
  return h;
}

// 主表行
function _mainRow(col, label, val, bold, formula) {
  const v = val || 0;
  const cls = bold ? 'vat-bold' : '';
  const formulaNote = formula ? ' <span style="font-size:10px;color:#9ca3af">[' + formula + ']</span>' : '';
  return '<tr class="' + cls + '">' +
    '<td style="text-align:center;font-size:11px;color:#6b7280">' + (col || '') + '</td>' +
    '<td>' + label + formulaNote + '</td>' +
    '<td class="num">' + fmt(v) + '</td>' +
    '<td class="num" style="color:#9ca3af">—</td>' +
    '<td class="num" style="color:#9ca3af">—</td>' +
    '<td class="num" style="color:#9ca3af">—</td>' +
    '</tr>';
}

function _sectionHeader(text, colspan) {
  return '<tr style="background:#f0f4ff"><td colspan="' + colspan + '" style="font-weight:700;font-size:13px;padding:8px 12px;color:#1a56db;border-bottom:2px solid #bfdbfe">' + text + '</td></tr>';
}

// ==================== 附表一（Page 3）— 销售明细 ====================
function renderSchedule1(data) {
  const f = data.form_sales || {};
  let h = '<div class="card" style="padding:12px">';
  h += '<div style="text-align:center;font-size:16px;font-weight:700;margin-bottom:12px">附列资料（一）</div>';
  h += '<div style="text-align:center;font-size:13px;font-weight:600;margin-bottom:12px">本期销售情况明细</div>';

  h += '<table class="vat-form-table">';
  h += '<thead><tr>';
  h += '<th rowspan="2" style="width:30px">栏次</th>';
  h += '<th rowspan="2">项目</th>';
  h += '<th colspan="2">开具增值税<br>专用发票</th>';
  h += '<th colspan="2">开具其他发票</th>';
  h += '<th colspan="2">未开具发票</th>';
  h += '<th colspan="2">纳税检查调整</th>';
  h += '<th colspan="2">合计</th>';
  h += '<th rowspan="2">扣除项目</th>';
  h += '<th rowspan="2">扣除后</th>';
  h += '</tr><tr>';
  h += '<th>销售额</th><th>销项税额</th>';
  h += '<th>销售额</th><th>销项税额</th>';
  h += '<th>销售额</th><th>销项税额</th>';
  h += '<th>销售额</th><th>销项税额</th>';
  h += '<th>销售额</th><th>销项税额</th>';
  h += '</tr></thead><tbody>';

  // 全部征税项目
  h += _s1Row('1', '13%税率的货物及加工修理修配劳务',
    f.row1_13_special_sales, f.row1_13_special_tax,
    f.row1_13_other_sales, f.row1_13_other_tax,
    f.row1_13_no_invoice_sales, f.row1_13_no_invoice_tax,
    f.row1_13_check_sales, f.row1_13_check_tax,
    f.row1_13_total_sales, f.row1_13_total_tax);

  h += _s1Row('2', '13%税率的服务、不动产和无形资产',
    f.row2_13_service_special_sales, f.row2_13_service_special_tax,
    f.row2_13_service_other_sales, f.row2_13_service_other_tax,
    f.row2_13_service_no_invoice_sales, f.row2_13_service_no_invoice_tax,
    f.row2_13_service_check_sales, f.row2_13_service_check_tax,
    f.row2_13_service_total_sales, f.row2_13_service_total_tax);

  h += _s1Row('3', '9%税率的货物及加工修理修配劳务',
    f.row3_9_special_sales, f.row3_9_special_tax,
    f.row3_9_other_sales, f.row3_9_other_tax,
    f.row3_9_no_invoice_sales, f.row3_9_no_invoice_tax,
    f.row3_9_check_sales, f.row3_9_check_tax,
    f.row3_9_total_sales, f.row3_9_total_tax);

  h += _s1Row('4', '6%税率',
    f.row4_6_special_sales, f.row4_6_special_tax,
    f.row4_6_other_sales, f.row4_6_other_tax,
    f.row4_6_no_invoice_sales, f.row4_6_no_invoice_tax,
    f.row4_6_check_sales, f.row4_6_check_tax,
    f.row4_6_total_sales, f.row4_6_total_tax);

  h += _s1Row('5', '5%征收率的货物及加工修理修配劳务',
    f.row5_5_special_sales, f.row5_5_special_tax,
    f.row5_5_other_sales, f.row5_5_other_tax,
    f.row5_5_no_invoice_sales, f.row5_5_no_invoice_tax,
    f.row5_5_check_sales, f.row5_5_check_tax,
    f.row5_5_total_sales, f.row5_5_total_tax);

  h += _s1Row('6', '3%征收率的货物及加工修理修配劳务',
    f.row6_3_goods_special_sales, f.row6_3_goods_special_tax,
    f.row6_3_goods_other_sales, f.row6_3_goods_other_tax,
    f.row6_3_goods_no_invoice_sales, f.row6_3_goods_no_invoice_tax,
    f.row6_3_goods_check_sales, f.row6_3_goods_check_tax,
    f.row6_3_goods_total_sales, f.row6_3_goods_total_tax);

  h += _s1Row('7', '3%征收率的服务、不动产和无形资产',
    f.row7_3_service_special_sales, f.row7_3_service_special_tax, 0,0,0,0,0,0,
    f.row7_3_service_total_sales, f.row7_3_service_total_tax);

  // 合计行
  const tSales = f.total_sales || 0;
  const tTax = f.total_output_tax || 0;
  h += _s1Row('', '<strong>合计</strong>', tSales, tTax, 0,0,0,0,0,0, tSales, tTax, true);

  h += '</tbody></table></div>';
  return h;
}

function _s1Row(col, label, sSpecial, tSpecial, sOther, tOther, sNo, tNo, sCheck, tCheck, sTotal, tTotal, bold) {
  const cls = bold ? 'vat-bold' : '';
  return '<tr class="' + cls + '">' +
    '<td style="text-align:center;font-size:11px;color:#6b7280">' + (col || '') + '</td>' +
    '<td>' + label + '</td>' +
    '<td class="num">' + fmt(sSpecial) + '</td><td class="num">' + fmt(tSpecial) + '</td>' +
    '<td class="num">' + fmt(sOther) + '</td><td class="num">' + fmt(tOther) + '</td>' +
    '<td class="num">' + fmt(sNo) + '</td><td class="num">' + fmt(tNo) + '</td>' +
    '<td class="num">' + fmt(sCheck) + '</td><td class="num">' + fmt(tCheck) + '</td>' +
    '<td class="num" style="font-weight:600">' + fmt(sTotal) + '</td><td class="num" style="font-weight:600">' + fmt(tTotal) + '</td>' +
    '<td class="num" style="color:#9ca3af">—</td>' +
    '<td class="num" style="color:#9ca3af">—</td>' +
    '</tr>';
}

// ==================== 附表二（Page 4）— 进项税额明细 ====================
function renderSchedule2(data) {
  const f = data.form_input || {};
  let h = '<div class="card" style="padding:12px">';
  h += '<div style="text-align:center;font-size:16px;font-weight:700;margin-bottom:12px">附列资料（二）</div>';
  h += '<div style="text-align:center;font-size:13px;font-weight:600;margin-bottom:12px">本期进项税额明细</div>';

  h += '<table class="vat-form-table"><thead><tr>';
  h += '<th style="width:30px;text-align:center">栏次</th><th>项目</th>';
  h += '<th style="width:60px;text-align:center">份数</th>';
  h += '<th style="width:100px;text-align:center">金额</th>';
  h += '<th style="width:100px;text-align:center">税额</th>';
  h += '</tr></thead><tbody>';

  // 一、申报抵扣的进项税额
  h += _sectionHeader('一、申报抵扣的进项税额', 5);
  h += _s2Row(1, '（一）认证相符的增值税专用发票', f.row1_certified_count || f.certified_count, f.row1_certified_amount || f.certified_amount, f.row1_certified_tax || f.certified_tax);
  h += _s2Row(2, '　　其中：本期认证相符且本期申报抵扣', f.row1_certified_count || f.certified_count, f.row1_certified_amount || f.certified_amount, f.row1_certified_tax || f.certified_tax);
  h += _s2Row(3, '　　　　前期认证相符且本期申报抵扣', 0, 0, 0);
  h += _s2Row(4, '（二）其他扣税凭证', 0, 0, 0);
  h += _s2Row(5, '　　其中：海关进口增值税专用缴款书', 0, 0, 0);
  h += _s2Row(6, '　　　　农产品收购发票或者销售发票', 0, 0, 0);
  h += _s2Row(7, '　　　　代扣代缴税收缴款凭证', 0, 0, 0);
  h += _s2Row(8, '　　　　加计扣除农产品进项税额', 0, 0, 0);
  h += _s2Row(9, '　　　　其他', 0, 0, 0);
  // 合计
  h += _s2Row(12, '<strong>（五）当期申报抵扣进项税额合计</strong>',
    f.row1_certified_count || f.certified_count,
    f.row1_certified_amount || f.certified_amount,
    f.row1_certified_tax || f.certified_tax || f.total_deductible, true);

  // 二、进项税额转出额
  h += _sectionHeader('二、进项税额转出额', 5);
  h += _s2Row(13, '本期进项税额转出额', 0, 0, 0);
  h += _s2Row(14, '　　其中：免税项目用', 0, 0, 0);
  h += _s2Row(15, '　　　　集体福利、个人消费', 0, 0, 0);
  h += _s2Row(16, '　　　　非正常损失', 0, 0, 0);
  h += _s2Row(17, '　　　　简易计税方法征税项目用', 0, 0, 0);
  h += _s2Row(18, '　　　　免抵退税办法不得抵扣的进项税额', 0, 0, 0);
  h += _s2Row(19, '　　　　纳税检查调减进项税额', 0, 0, 0);
  h += _s2Row(20, '　　　　红字专用发票信息表注明的进项税额', 0, 0, 0);
  h += _s2Row(21, '　　　　上期留抵税额抵减欠税', 0, 0, 0);
  h += _s2Row(22, '　　　　上期留抵税额退税', 0, 0, 0);
  h += _s2Row(23, '　　　　异常凭证转出进项税额', 0, 0, 0);

  // 三、待抵扣进项税额
  h += _sectionHeader('三、待抵扣进项税额', 5);
  h += _s2Row(24, '（一）认证相符的增值税专用发票', 0, 0, 0);
  h += _s2Row(25, '　　期初已认证相符但未申报抵扣', 0, 0, 0);
  h += _s2Row(26, '　　本期认证相符且本期未申报抵扣', 0, 0, 0);
  h += _s2Row(27, '　　期末已认证相符但未申报抵扣', 0, 0, 0);

  // 四、其他
  h += _sectionHeader('四、其他', 5);
  h += _s2Row(28, '其中：按照税法规定不允许抵扣', 0, 0, 0);

  h += '</tbody></table></div>';
  return h;
}

function _s2Row(col, label, cnt, amt, tax, bold) {
  const cls = bold ? 'vat-bold' : '';
  return '<tr class="' + cls + '">' +
    '<td style="text-align:center;font-size:11px;color:#6b7280">' + (col || '') + '</td>' +
    '<td>' + label + '</td>' +
    '<td class="num">' + (cnt || 0) + '</td>' +
    '<td class="num">' + fmt(amt || 0) + '</td>' +
    '<td class="num">' + fmt(tax || 0) + '</td>' +
    '</tr>';
}

// ==================== 附表四（Page 1）— 税额抵减 ====================
function renderSchedule4(data) {
  const f = data.form_credit || {};
  let h = '<div class="card" style="padding:12px">';
  h += '<div style="text-align:center;font-size:16px;font-weight:700;margin-bottom:12px">附列资料（四）</div>';
  h += '<div style="text-align:center;font-size:13px;font-weight:600;margin-bottom:12px">税额抵减情况表</div>';

  // 一、税额抵减情况
  h += '<table class="vat-form-table"><thead><tr>';
  h += '<th style="width:30px;text-align:center">栏次</th><th>项目</th>';
  h += '<th style="width:100px;text-align:center">期初余额</th>';
  h += '<th style="width:100px;text-align:center">本期发生额</th>';
  h += '<th style="width:100px;text-align:center">本期应抵减</th>';
  h += '<th style="width:100px;text-align:center">本期实际抵减</th>';
  h += '<th style="width:100px;text-align:center">期末余额</th>';
  h += '</tr></thead><tbody>';

  h += _sectionHeader('一、税额抵减情况', 7);
  h += _s4Row(1, '增值税税控系统专用设备费及技术维护费', 0, 0, 0, 0, 0);
  h += _s4Row(2, '分支机构预征缴纳税款', 0, 0, 0, 0, 0);
  h += _s4Row(3, '建筑服务预征缴纳税款', 0, 0, 0, 0, 0);
  h += _s4Row(4, '销售不动产预征缴纳税款', 0, 0, 0, 0, 0);
  h += _s4Row(5, '出租不动产预征缴纳税款', 0, 0, 0, 0, 0);

  // 二、加计抵减情况
  h += _sectionHeader('二、加计抵减情况', 7);
  // 一般项目
  h += '<tr style="background:#f9fafb"><td colspan="2" style="font-weight:600">一般项目加计抵减计算</td>'
    + '<td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td></tr>';
  h += _s4Row(6, '期初余额', f.item1_begin, 0, 0, 0, f.item1_begin);
  h += _s4Row(7, '本期发生额', 0, f.item1_occur, 0, 0, 0);
  h += _s4Row(8, '本期调减额', 0, 0, f.item1_should_deduct, 0, 0);
  h += _s4Row(9, '本期可抵减额', 0, 0, 0, 0, 0);
  h += _s4Row(10, '本期实际抵减额', 0, 0, 0, f.item1_actual_deduct, 0);
  h += _s4Row(11, '期末余额', 0, 0, 0, 0, f.item1_end, true);

  // 即征即退项目
  h += '<tr style="background:#f9fafb"><td colspan="2" style="font-weight:600">即征即退项目加计抵减计算</td>'
    + '<td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td></tr>';
  h += _s4Row(12, '期初余额', f.item2_begin, 0, 0, 0, 0);
  h += _s4Row(13, '期末余额', 0, 0, 0, 0, f.item2_end);

  h += '</tbody></table></div>';
  return h;
}

function _s4Row(col, label, begin, occur, should, actual, end, bold) {
  const cls = bold ? 'vat-bold' : '';
  return '<tr class="' + cls + '">' +
    '<td style="text-align:center;font-size:11px;color:#6b7280">' + (col || '') + '</td>' +
    '<td>' + label + '</td>' +
    '<td class="num">' + fmt(begin || 0) + '</td>' +
    '<td class="num">' + fmt(occur || 0) + '</td>' +
    '<td class="num">' + fmt(should || 0) + '</td>' +
    '<td class="num">' + fmt(actual || 0) + '</td>' +
    '<td class="num">' + fmt(end || 0) + '</td>' +
    '</tr>';
}

// ==================== 附表三（Page 6）— 服务、不动产和无形资产扣除项目明细 ====================
function renderSchedule3(data) {
  const f = data.form_deduction || {};
  let h = '<div class="card" style="padding:12px">';
  h += '<div style="text-align:center;font-size:16px;font-weight:700;margin-bottom:12px">附列资料（三）</div>';
  h += '<div style="text-align:center;font-size:13px;font-weight:600;margin-bottom:12px">服务、不动产和无形资产扣除项目明细</div>';

  h += '<table class="vat-form-table"><thead><tr>';
  h += '<th style="width:30px;text-align:center">栏次</th><th>项目</th>';
  h += '<th style="width:100px;text-align:center">本期应税<br>价税合计额</th>';
  h += '<th style="width:80px;text-align:center">期初余额</th>';
  h += '<th style="width:80px;text-align:center">本期发生额</th>';
  h += '<th style="width:80px;text-align:center">本期应扣除</th>';
  h += '<th style="width:80px;text-align:center">本期实际扣除</th>';
  h += '<th style="width:80px;text-align:center">期末余额</th>';
  h += '</tr></thead><tbody>';

  h += _s3Row(1, '13%税率的项目', f.row2_13_price_tax, f.row2_13_begin, f.row2_13_occur, f.row2_13_should, f.row2_13_actual, f.row2_13_end);
  h += _s3Row(2, '9%税率的项目', f.row3_9_price_tax, f.row3_9_begin, f.row3_9_occur, f.row3_9_should, f.row3_9_actual, f.row3_9_end);
  h += _s3Row(3, '6%税率的项目', f.row4_6_price_tax, f.row4_6_begin, f.row4_6_occur, f.row4_6_should, f.row4_6_actual, f.row4_6_end);
  h += _s3Row(4, '5%征收率的项目', f.row5_5_price_tax, f.row5_5_begin, f.row5_5_occur, f.row5_5_should, f.row5_5_actual, f.row5_5_end);

  // 合计
  const t = f.row_total_price_tax || f.row1_total_price_tax || 0;
  h += _s3Row('', '<strong>合计</strong>', t, f.row_total_begin || 0, f.row_total_occur || 0,
    f.row_total_should || 0, f.row_total_actual || 0, f.row_total_end || 0, true);

  h += '</tbody></table></div>';
  return h;
}

function _s3Row(col, label, pt, begin, occur, should, actual, end, bold) {
  const cls = bold ? 'vat-bold' : '';
  return '<tr class="' + cls + '">' +
    '<td style="text-align:center;font-size:11px;color:#6b7280">' + (col || '') + '</td>' +
    '<td>' + label + '</td>' +
    '<td class="num">' + fmt(pt || 0) + '</td>' +
    '<td class="num">' + fmt(begin || 0) + '</td>' +
    '<td class="num">' + fmt(occur || 0) + '</td>' +
    '<td class="num">' + fmt(should || 0) + '</td>' +
    '<td class="num">' + fmt(actual || 0) + '</td>' +
    '<td class="num">' + fmt(end || 0) + '</td>' +
    '</tr>';
}

// ==================== 附表五（Page 7）— 附加税费 ====================
function renderSchedule5(data) {
  const f = data.form_surcharge || {};
  let h = '<div class="card" style="padding:12px">';
  h += '<div style="text-align:center;font-size:16px;font-weight:700;margin-bottom:12px">附列资料（五）</div>';
  h += '<div style="text-align:center;font-size:13px;font-weight:600;margin-bottom:12px">附加税费情况表</div>';

  // 六税两费提示
  const hasReduction = data.micro_enterprise && data.six_tax_reduction;
  h += '<div style="margin-bottom:12px;font-size:13px;padding:8px 12px;border-radius:6px;background:' + (hasReduction ? '#ecfdf5' : '#f9fafb') + '">';
  h += '计税依据（增值税应纳税额）：<strong>' + fmt(f.city_base || 0) + ' 元</strong>';
  if (hasReduction) {
    h += ' &nbsp; <span style="color:#059669;font-weight:600">小微企业"六税两费"减半征收</span>';
    h += ' &nbsp; 减免期间：' + escHtml(data.reduction_start || '') + ' 至 ' + escHtml(data.reduction_end || '');
  }
  h += '</div>';

  h += '<table class="vat-form-table"><thead><tr>';
  h += '<th style="width:30px;text-align:center">栏次</th><th>税种</th>';
  h += '<th style="width:80px;text-align:center">计税依据</th>';
  h += '<th style="width:50px;text-align:center">税率</th>';
  h += '<th style="width:80px;text-align:center">应纳税额</th>';
  h += '<th style="width:80px;text-align:center">减免性质</th>';
  h += '<th style="width:80px;text-align:center">减免税额</th>';
  h += '<th style="width:80px;text-align:center">已缴税额</th>';
  h += '<th style="width:80px;text-align:center">本期应补（退）</th>';
  h += '</tr></thead><tbody>';

  // 城市维护建设税
  h += _s5Row(1, '城市维护建设税', f.city_base, '7%', f.city_tax, f.city_reduction_type || '', f.city_reduction_amount || 0, 0, f.city_final);
  // 教育费附加
  h += _s5Row(2, '教育费附加', f.edu_base, '3%', f.edu_tax, f.edu_reduction_type || '', f.edu_reduction_amount || 0, 0, f.edu_final);
  // 地方教育附加
  h += _s5Row(3, '地方教育附加', f.local_edu_base, '2%', f.local_edu_tax, f.local_edu_reduction_type || '', f.local_edu_reduction_amount || 0, 0, f.local_edu_final);
  // 合计
  const totalTax = (f.city_tax || 0) + (f.edu_tax || 0) + (f.local_edu_tax || 0);
  const totalReduction = (f.city_reduction_amount || 0) + (f.edu_reduction_amount || 0) + (f.local_edu_reduction_amount || 0);
  const totalFinal = (f.city_final || 0) + (f.edu_final || 0) + (f.local_edu_final || 0);
  h += _s5Row('', '<strong>合计</strong>', f.city_base || 0, '', totalTax, '', totalReduction, 0, totalFinal, true);

  h += '</tbody></table></div>';
  return h;
}

function _s5Row(col, label, base, rate, tax, reductionType, reductionAmt, paid, final, bold) {
  const cls = bold ? 'vat-bold' : '';
  return '<tr class="' + cls + '">' +
    '<td style="text-align:center;font-size:11px;color:#6b7280">' + (col || '') + '</td>' +
    '<td>' + label + '</td>' +
    '<td class="num">' + fmt(base || 0) + '</td>' +
    '<td class="num">' + (rate || '') + '</td>' +
    '<td class="num">' + fmt(tax || 0) + '</td>' +
    '<td style="font-size:11px;text-align:center;color:#059669">' + escHtml(reductionType || '') + '</td>' +
    '<td class="num" style="color:#059669">' + fmt(reductionAmt || 0) + '</td>' +
    '<td class="num">' + fmt(paid || 0) + '</td>' +
    '<td class="num">' + fmt(final || 0) + '</td>' +
    '</tr>';
}

// ==================== 减免税申报明细表（Page 5） ====================
function renderReductionForm(data) {
  const f = data.form_reduction || {};
  let h = '<div class="card" style="padding:12px">';
  h += '<div style="text-align:center;font-size:16px;font-weight:700;margin-bottom:12px">增值税减免税申报明细表</div>';

  h += '<div style="margin-bottom:12px;font-size:13px;padding:8px 12px;border-radius:6px;background:#f9fafb">';
  h += '小规模纳税人：<strong>' + (data.micro_enterprise ? '✅ 是' : '否') + '</strong> &nbsp;|&nbsp; ';
  h += '享受六税两费减征：<strong>' + (data.six_tax_reduction ? '✅ 是' : '否') + '</strong>';
  h += '</div>';

  // 一、减税项目
  h += '<div style="font-size:14px;font-weight:600;margin:12px 0 8px">一、减税项目</div>';
  h += '<table class="vat-form-table"><thead><tr>';
  h += '<th style="width:30px;text-align:center">栏次</th><th>项目</th>';
  h += '<th style="width:100px;text-align:center">期初余额</th>';
  h += '<th style="width:100px;text-align:center">本期发生额</th>';
  h += '<th style="width:100px;text-align:center">本期应抵减</th>';
  h += '<th style="width:100px;text-align:center">本期实际抵减</th>';
  h += '<th style="width:100px;text-align:center">期末余额</th>';
  h += '</tr></thead><tbody>';

  const reductionItems = f.tax_reduction_items || f.reduction_items || [];
  if (reductionItems.length === 0) {
    h += '<tr><td colspan="7" style="text-align:center;padding:20px;color:#9ca3af">暂无减税项目</td></tr>';
  } else {
    reductionItems.forEach((item, i) => {
      h += '<tr>';
      h += '<td style="text-align:center;font-size:11px;color:#6b7280">' + (i + 1) + '</td>';
      h += '<td>' + escHtml(item.name || '') + ' <span style="font-size:10px;color:#9ca3af">' + escHtml(item.code || '') + '</span></td>';
      h += '<td class="num">' + fmt(item.begin || 0) + '</td>';
      h += '<td class="num">' + fmt(item.occur || 0) + '</td>';
      h += '<td class="num">' + fmt(item.should || 0) + '</td>';
      h += '<td class="num">' + fmt(item.actual || 0) + '</td>';
      h += '<td class="num">' + fmt(item.end || 0) + '</td>';
      h += '</tr>';
    });
  }
  h += _s4Row('', '<strong>合计</strong>', f.tax_reduction_total_occur || 0, 0,
    f.tax_reduction_total_should || 0, f.tax_reduction_total_actual || 0,
    f.tax_reduction_total_end || 0, true);
  h += '</tbody></table>';

  // 二、免税项目
  h += '<div style="font-size:14px;font-weight:600;margin:16px 0 8px">二、免税项目</div>';
  h += '<table class="vat-form-table"><thead><tr>';
  h += '<th style="width:30px;text-align:center">栏次</th><th>项目</th>';
  h += '<th style="width:100px;text-align:center">免征增值税<br>项目销售额</th>';
  h += '<th style="width:100px;text-align:center">免税销售额<br>对应进项税额</th>';
  h += '<th style="width:80px;text-align:center">免税额</th>';
  h += '</tr></thead><tbody>';

  const exemptItems = f.exempt_items || [];
  if (exemptItems.length === 0) {
    h += '<tr><td colspan="5" style="text-align:center;padding:20px;color:#9ca3af">暂无免税项目</td></tr>';
  } else {
    exemptItems.forEach((item, i) => {
      h += '<tr>';
      h += '<td style="text-align:center;font-size:11px;color:#6b7280">' + (i + 1) + '</td>';
      h += '<td>' + escHtml(item.name || '') + '</td>';
      h += '<td class="num">' + fmt(item.sales || 0) + '</td>';
      h += '<td class="num">' + fmt(item.input_tax || 0) + '</td>';
      h += '<td class="num">' + fmt(item.exempt_amount || 0) + '</td>';
      h += '</tr>';
    });
  }
  h += '<tr class="vat-bold"><td style="text-align:center;font-size:11px;color:#6b7280"></td><td><strong>合计</strong></td>';
  h += '<td class="num">' + fmt(f.exempt_total_exempt_sales || 0) + '</td>';
  h += '<td class="num">' + fmt(f.exempt_total_exempt_tax || 0) + '</td>';
  h += '<td class="num">' + fmt(f.exempt_total_exempt_amount || 0) + '</td>';
  h += '</tr>';

  h += '</tbody></table></div>';
  return h;
}

// ==================== 删除 ====================
async function deleteVATDeclaration(id, period) {
  if (!confirm('确认删除 ' + period + ' 的申报表？此操作不可恢复。')) return;
  try {
    await api('/api/vat/declarations/' + id, { method: 'DELETE' });
    toast('删除成功', 'success');
    await loadVATDeclarationList();
  } catch (e) { handleError(e, '删除申报表'); }
}

// ==================== 辅助函数 ====================
function fmt(v) {
  if (v === null || v === undefined || v === '') return '0.00';
  const n = parseFloat(v);
  if (isNaN(n)) return '0.00';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escJs(s) {
  if (!s) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
