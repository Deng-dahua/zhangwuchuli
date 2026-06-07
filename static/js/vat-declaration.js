// ==================== 增值税申报页面 ====================
// 按官方《增值税及附加税费申报表（一般纳税人适用）》009-1-1.xls 模板渲染
let vatDeclarations = [];
let vatSelectedId = null;
let vatActivePage = 'main'; // 默认主表
let vatFilterPeriod = '';
let vatInlineDisplayId = null;

const VAT_PAGES = [
  { id: 'main', label: '增值税主表' },
  { id: 'schedule1', label: '附表一 — 销售明细' },
  { id: 'schedule2', label: '附表二 — 进项明细' },
  { id: 'schedule3', label: '附表三 — 扣除项目' },
  { id: 'schedule4', label: '附表四 — 税额抵减' },
  { id: 'schedule5', label: '附表五 — 附加税费' },
  { id: 'reduction', label: '减免税申报明细表' },
];

// ==================== 主渲染（列表页） ====================
async function renderVATDeclaration(container) {
  vatInlineDisplayId = null;
  const el = container || document.getElementById('page-vat-declaration') || document.getElementById('content-area');
  el.innerHTML = '<div id="vat-stats-row" style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px"></div>'
    + '<div id="vat-forms-inline" style="display:none;margin-top:20px;background:#fff;border:1px solid var(--gray-200);border-radius:12px;padding:20px"></div>'
    + '<div id="vat-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeVATModal()"><div class="modal modal-lg" id="vat-modal-inner"></div></div>';
  await loadVATDeclarationList();
}

// ==================== 列表加载 ====================
async function loadVATDeclarationList() {
  try {
    let url = '/api/vat/declarations';
    if (vatFilterPeriod) url += '?period=' + encodeURIComponent(vatFilterPeriod);
    vatDeclarations = await api(url);
  } catch (e) { vatDeclarations = []; handleError(e, '加载申报表'); }
  renderVATStats();
  // 自动展示选中或第一条申报数据
  const inlineEl = document.getElementById('vat-forms-inline');
  if (vatDeclarations.length === 0) {
    if (inlineEl) inlineEl.style.display = 'none';
    return;
  }
  // 如果之前有选中的 ID，优先展示它；否则展示第一条
  const target = vatSelectedId ? vatDeclarations.find(d => d.id === vatSelectedId) : null;
  const first = target || vatDeclarations[0];
  vatSelectedId = first.id;
  vatActivePage = 'main';
  try {
    const data = await api('/api/vat/declarations/' + first.id);
    // 将完整数据合入缓存，供统计卡计算使用
    const idx = vatDeclarations.findIndex(d => d.id === first.id);
    if (idx >= 0) vatDeclarations[idx] = data;
    renderVATTemplateViewInline(data);
  } catch (e) {
    console.error('加载申报表详情失败:', e);
    if (inlineEl) inlineEl.style.display = 'none';
  }
  renderVATStats(); // 详情加载后重新渲染统计卡（金额已更新）
}

function renderVATStats() {
  const total = vatDeclarations.length;
  const submitted = vatDeclarations.filter(d => d.status === '已申报').length;
  const draft = vatDeclarations.filter(d => d.status === '草稿').length;
  const paid = vatDeclarations.filter(d => d.status === '已缴税').length;
  // 计算应纳税额合计
  let totalTaxPayable = 0;
  vatDeclarations.forEach(d => {
    try {
      const main = typeof d.form_main === 'string' ? JSON.parse(d.form_main) : (d.form_main || {});
      totalTaxPayable += main.row19_tax_payable || 0;
    } catch (e) { /* skip */ }
  });
  const el = document.getElementById('vat-stats-row'); if (!el) return;
  el.innerHTML = '<div class="stat-card"><div class="stat-label">申报表总数</div><div class="stat-value">' + total + '</div><div class="stat-sub">已申报 ' + submitted + ' 份</div></div>'
    + '<div class="stat-card"><div class="stat-label">应纳税额合计</div><div class="stat-value" style="color:#d97706">' + fmt(totalTaxPayable) + '</div><div class="stat-sub">所有期间汇总</div></div>'
    + '<div class="stat-card"><div class="stat-label">最新申报期间</div><div class="stat-value">' + (total > 0 ? vatDeclarations[0].period : '-') + '</div><div class="stat-sub">按时间倒序</div></div>'
    + '<div class="stat-card"><div class="stat-label">草稿</div><div class="stat-value" style="color:#f59e0b">' + draft + '</div><div class="stat-sub">待完成</div></div>'
    + '<div class="stat-card"><div class="stat-label">已缴税</div><div class="stat-value" style="color:#10b981">' + paid + '</div><div class="stat-sub">已完成</div></div>';
}

// ==================== 新建/编辑 ====================
function showVATCreateModal() {
  const now = new Date();
  const defaultPeriod = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('vat-modal-inner').innerHTML = '<h2 style="margin:0 0 20px 0;font-size:18px">＋ 新建增值税申报表</h2>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">税款所属期 <span style="color:red">*</span></label>'
    + '<input type="month" class="form-control" id="vat-period" value="' + defaultPeriod + '" style="width:100%"></div>'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">纳税人名称</label>'
    + '<input type="text" class="form-control" id="vat-taxpayer" style="width:100%"></div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">'
    + '<div class="form-group"><label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">'
    + '<input type="checkbox" id="vat-micro"> 小规模纳税人（小微企业）</label></div>'
    + '<div class="form-group"><label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">'
    + '<input type="checkbox" id="vat-six-tax"> 六税两费减征</label></div>'
    + '</div>'
    + '<div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="btn btn-outline" onclick="closeVATModal()">取消</button>'
    + '<button class="btn btn-primary" onclick="createVATDeclaration()">✅ 创建申报表</button></div>';
  document.getElementById('vat-modal').style.display = 'flex';
}

function closeVATModal() { document.getElementById('vat-modal').style.display = 'none'; }

async function createVATDeclaration() {
  const period = document.getElementById('vat-period').value;
  const taxpayer = document.getElementById('vat-taxpayer').value;
  const micro = document.getElementById('vat-micro').checked;
  const sixTax = document.getElementById('vat-six-tax').checked;
  if (!period) { toast('请选择税款所属期', 'warning'); return; }
  try {
    const resp = await api('/api/vat/declarations', {
      method: 'POST',
      body: JSON.stringify({ period: period, taxpayer_name: taxpayer, micro_enterprise: micro, six_tax_reduction: sixTax }),
    });
    closeVATModal();
    await loadVATDeclarationList();
    openVATDetailInline(resp.id);
  } catch (e) { handleError(e, '创建申报表'); }
}

// ==================== 查看附表（模板视图） ====================
async function openVATDetail(id) {
  vatSelectedId = id;
  vatActivePage = 'main'; // 默认主表
  try {
    const data = await api('/api/vat/declarations/' + id);
    renderVATTemplateView(data);
  } catch (e) {
    toast('加载申报表失败: ' + (e.message || e), 'error');
  }
}

function renderVATTemplateView(data) {
  const el = document.getElementById('vat-modal-inner');
  const main = (typeof data.form_main === 'string') ? JSON.parse(data.form_main) : (data.form_main || {});
  const statusLabel = {'草稿':'草稿','已申报':'已申报','已缴税':'已缴税'}[data.status] || data.status;

  // 页签
  let tabs = '<div class="detail-header" style="margin-bottom:0"><h2 style="margin:0">📋 增值税及附加税费申报表 <span style="font-size:13px;color:#6b7280;font-weight:400">— ' + escapeHtml(data.period) + '</span></h2>';
  tabs += '<div style="display:flex;gap:6px"><span class="badge badge-info">' + statusLabel + '</span>';
  tabs += '<button class="btn btn-sm btn-outline" onclick="editVATDeclaration(' + data.id + ')">✏️ 编辑</button></div></div>';

  tabs += '<div style="display:flex;gap:0;border-bottom:1px solid #e5e7eb;margin:12px 0 0 0;overflow-x:auto">';
  VAT_PAGES.forEach(p => {
    tabs += '<div style="padding:8px 14px;font-size:12px;cursor:pointer;border-bottom:3px solid ' + (vatActivePage === p.id ? '#1a56db' : 'transparent')
      + ';color:' + (vatActivePage === p.id ? '#1a56db' : '#6b7280') + ';font-weight:' + (vatActivePage === p.id ? '600' : '400')
      + ';white-space:nowrap" onclick="switchVATPage(\'' + p.id + '\')">' + p.label + '</div>';
  });
  tabs += '</div>';

  // 渲染当前页
  let formHtml = '';
  try {
    switch (vatActivePage) {
      case 'main': formHtml = renderMainForm(data); break;
      case 'schedule1': formHtml = renderSchedule1(data); break;
      case 'schedule2': formHtml = renderSchedule2(data); break;
      case 'schedule3': formHtml = renderSchedule3(data); break;
      case 'schedule4': formHtml = renderSchedule4(data); break;
      case 'schedule5': formHtml = renderSchedule5(data); break;
      case 'reduction': formHtml = renderReductionForm(data); break;
    }
  } catch (e) { formHtml = '<div style="padding:20px;color:#ef4444">渲染错误: ' + e.message + '</div>'; }
  el.innerHTML = tabs + '<div style="overflow-x:auto;padding:12px 0">' + formHtml + '</div>';
}

function switchVATPage(pageId) {
  vatActivePage = pageId;
  const data = vatDeclarations.find(d => d.id === vatSelectedId);
  if (data) {
    // 补充完整数据
    data.form_main = data.form_main || '{}';
    data.form_sales = data.form_sales || '{}';
    data.form_input = data.form_input || '{}';
    data.form_deduction = data.form_deduction || '{}';
    data.form_credit = data.form_credit || '{}';
    data.form_surcharge = data.form_surcharge || '{}';
    data.form_reduction = data.form_reduction || '{}';
    renderVATTemplateView(data);
  }
}

// ==================== 内联展示（页面直接显示） ====================
async function openVATDetailInline(id) {
  vatSelectedId = id;
  vatActivePage = 'main';
  try {
    const data = await api('/api/vat/declarations/' + id);
    // 将完整数据合入缓存
    const idx = vatDeclarations.findIndex(d => d.id === id);
    if (idx >= 0) vatDeclarations[idx] = data;
    renderVATTemplateViewInline(data);
    renderVATStats(); // 金额可能变化，重新渲染统计卡
  } catch (e) {
    toast('加载申报表失败: ' + (e.message || e), 'error');
  }
}

function renderVATTemplateViewInline(data) {
  const container = document.getElementById('vat-forms-inline');
  if (!container) return;
  container.style.display = 'block';

  const main = (typeof data.form_main === 'string') ? JSON.parse(data.form_main) : (data.form_main || {});
  const _periodYear = escapeHtml((data.period || '').split('-')[0] || '');
  const _periodMonth = escapeHtml((data.period || '').split('-')[1] || '');
  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #e5e7eb">'
    + '<h2 style="margin:0;font-size:18px">📋 增值税及附加税费申报表</h2>'
    + '<div class="period-selector-bar" style="display:flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--gray-200);border-radius:8px;padding:3px 6px">'
    + '<div class="period-stepper" style="display:flex;align-items:center">'
    + '<span style="padding:4px 6px;border-right:1px solid var(--gray-200);font-size:13px;color:var(--gray-800);min-width:70px;text-align:center;display:block">' + _periodYear + '年</span>'
    + '</div>'
    + '<div class="period-stepper" style="display:flex;align-items:center">'
    + '<span style="padding:4px 6px;font-size:13px;color:var(--gray-800);min-width:50px;text-align:center;display:block">' + _periodMonth + '月</span>'
    + '</div></div></div>';

  // 页签
  html += '<div style="display:flex;gap:0;border-bottom:1px solid #e5e7eb;margin:12px 0 0 0;overflow-x:auto;background:#fff;border-radius:8px 8px 0 0">';
  VAT_PAGES.forEach(p => {
    html += '<div style="padding:10px 16px;font-size:13px;cursor:pointer;border-bottom:3px solid ' + (vatActivePage === p.id ? '#1a56db' : 'transparent')
      + ';color:' + (vatActivePage === p.id ? '#1a56db' : '#6b7280') + ';font-weight:' + (vatActivePage === p.id ? '600' : '400')
      + ';white-space:nowrap;transition:all 0.15s" onclick="switchVATPageInline(\'' + p.id + '\',' + data.id + ')">' + p.label + '</div>';
  });
  html += '</div>';

  // 渲染当前页
  let formHtml = '';
  try {
    switch (vatActivePage) {
      case 'main': formHtml = renderMainForm(data); break;
      case 'schedule1': formHtml = renderSchedule1(data); break;
      case 'schedule2': formHtml = renderSchedule2(data); break;
      case 'schedule3': formHtml = renderSchedule3(data); break;
      case 'schedule4': formHtml = renderSchedule4(data); break;
      case 'schedule5': formHtml = renderSchedule5(data); break;
      case 'reduction': formHtml = renderReductionForm(data); break;
    }
  } catch (e) { formHtml = '<div style="padding:20px;color:#ef4444">渲染错误: ' + e.message + '</div>'; }
  container.innerHTML = html + '<div style="overflow-x:auto;padding:12px 0">' + formHtml + '</div>';

  // 切换到不同记录或首次渲染时才滚动到表单区域
  if (vatInlineDisplayId !== data.id) {
    vatInlineDisplayId = data.id;
    setTimeout(() => container.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }
}

function closeVATInline() {
  // 内联表单已常驻显示，不再支持隐藏
}

function switchVATPageInline(pageId, id) {
  vatActivePage = pageId;
  // 从缓存获取数据并补充完整字段（若缺失则重新从 API 获取）
  let data = vatDeclarations.find(d => d.id === id);
  if (data && data.form_main === undefined) {
    // 缓存数据不含表单详情，重新从 API 获取
    api('/api/vat/declarations/' + id).then(fullData => {
      // 将完整数据合入缓存供后续切换使用
      Object.assign(data, fullData);
      data.form_main = data.form_main || '{}';
      data.form_sales = data.form_sales || '{}';
      data.form_input = data.form_input || '{}';
      data.form_deduction = data.form_deduction || '{}';
      data.form_credit = data.form_credit || '{}';
      data.form_surcharge = data.form_surcharge || '{}';
      data.form_reduction = data.form_reduction || '{}';
      renderVATTemplateViewInline(data);
    }).catch(e => {
      toast('切换页签失败: ' + (e.message || e), 'error');
    });
  } else if (data) {
    data.form_main = data.form_main || '{}';
    data.form_sales = data.form_sales || '{}';
    data.form_input = data.form_input || '{}';
    data.form_deduction = data.form_deduction || '{}';
    data.form_credit = data.form_credit || '{}';
    data.form_surcharge = data.form_surcharge || '{}';
    data.form_reduction = data.form_reduction || '{}';
    renderVATTemplateViewInline(data);
  }
}

// ==================== 编辑弹窗 ====================
function editVATDeclaration(id) {
  const d = vatDeclarations.find(x => x.id === id);
  if (!d) return;
  document.getElementById('vat-modal-inner').innerHTML = '<h2 style="margin:0 0 20px 0;font-size:18px">✏️ 编辑申报表 — ' + escapeHtml(d.period) + '</h2>'
    + '<div class="form-group"><label style="display:block;margin-bottom:4px;font-size:13px">税款所属期</label>'
    + '<input type="month" class="form-control" id="vat-edit-period" value="' + d.period + '" style="width:100%"></div>'
    + '<div class="form-group" style="margin-top:10px"><label style="display:block;margin-bottom:4px;font-size:13px">纳税人名称</label>'
    + '<input type="text" class="form-control" id="vat-edit-taxpayer" value="' + escapeHtml(d.taxpayer_name || '') + '" style="width:100%"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">'
    + '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="vat-edit-micro" ' + (d.micro_enterprise ? 'checked' : '') + '> 小规模纳税人</label>'
    + '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="vat-edit-six-tax" ' + (d.six_tax_reduction ? 'checked' : '') + '> 六税两费减征</label>'
    + '</div>'
    + '<div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="btn btn-outline" onclick="closeVATModal()">取消</button>'
    + '<button class="btn btn-primary" onclick="updateVATDeclaration(' + id + ')">✅ 保存并重新计算</button></div>';
  document.getElementById('vat-modal').style.display = 'flex';
}

async function updateVATDeclaration(id) {
  const period = document.getElementById('vat-edit-period').value;
  const taxpayer = document.getElementById('vat-edit-taxpayer').value;
  const micro = document.getElementById('vat-edit-micro').checked;
  const sixTax = document.getElementById('vat-edit-six-tax').checked;
  try {
    await api('/api/vat/declarations/' + id, {
      method: 'PUT',
      body: JSON.stringify({ period: period, taxpayer_name: taxpayer, micro_enterprise: micro, six_tax_reduction: sixTax }),
    });
    closeVATModal();
    await loadVATDeclarationList();
    openVATDetailInline(id);
  } catch (e) { handleError(e, '更新申报表'); }
}

async function deleteVATDeclaration(id, period) {
  if (!confirm('确定删除「' + period + '」的申报表吗？')) return;
  try {
    await api('/api/vat/declarations/' + id, { method: 'DELETE' });
    closeVATModal();
    await loadVATDeclarationList();
  } catch (e) { handleError(e, '删除申报表'); }
}

// ==================== 工具函数 ====================
function _fmt(n) {
  if (n === null || n === undefined || n === '') return '';
  return parseFloat(n).toFixed(2);
}
function _fm0(n) {
  if (n === null || n === undefined || n === '') return '';
  const v = parseFloat(n);
  return v === 0 ? '' : v.toFixed(2);
}

// ==================== 主表（一般纳税人适用）—— 按PDF样式 ====================
function _fmt2(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = parseFloat(v);
  return isNaN(n) ? '' : n.toFixed(2);
}
function _fmt0_2(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = parseFloat(v);
  return (n === 0) ? '' : (isNaN(n) ? '' : n.toFixed(2));
}
function _fmtDash(v) {
  if (!v || parseFloat(v) === 0) return '<td class="num" style="color:#d1d5db">——</td>';
  return '<td class="num">' + parseFloat(v).toFixed(2) + '</td>';
}

function renderMainForm(data) {
  const m = (typeof data.form_main === 'string') ? JSON.parse(data.form_main) : (data.form_main || {});
  const s = (typeof data.form_surcharge === 'string') ? JSON.parse(data.form_surcharge) : (data.form_surcharge || {});
  const y = data;  // 纳税人信息来自 data 顶层字段

  let h = '';

  // 标题
  h += '<div style="text-align:center;font-size:15px;font-weight:700;margin-bottom:2px">增值税及附加税费申报表</div>';
  h += '<div style="text-align:center;font-size:13px;margin-bottom:8px">（一般纳税人适用）</div>';

  // ========== 6列表格 ==========
  h += '<table class="vat-form-table" style="font-size:11px">';
  h += '<colgroup>';
  h += '<col style="width:26%"><col style="width:5%"><col style="width:17.25%"><col style="width:17.25%"><col style="width:17.25%"><col style="width:17.25%">';
  h += '</colgroup>';
  h += '<thead>';
  h += '<tr style="background:#d9e2f3">';
  h += '<th rowspan="2" style="padding:4px 6px">项目</th>';
  h += '<th rowspan="2" style="padding:4px 6px">栏次</th>';
  h += '<th colspan="2" style="padding:4px 6px">一般项目</th>';
  h += '<th colspan="2" style="padding:4px 6px">即征即退项目</th>';
  h += '</tr>';
  h += '<tr style="background:#d9e2f3">';
  h += '<th style="padding:4px 6px">本月数</th>';
  h += '<th style="padding:4px 6px">本年累计</th>';
  h += '<th style="padding:4px 6px">本月数</th>';
  h += '<th style="padding:4px 6px">本年累计</th>';
  h += '</tr>';
  h += '</thead>';
  h += '<tbody>';

  // --- 一、销售额 ---
  h += '<tr><td colspan="6" style="background:#f0f4fa;font-weight:600;font-size:11px;padding:5px 8px">一、销售额</td></tr>';

  h += '<tr><td>（一）按适用税率计税销售额</td><td style="text-align:center">1</td>';
  h += '<td class="num">' + _fmt2(m.row1_sales) + '</td>';
  h += '<td class="num">' + _fmt2(m.row1_sales_ytd) + '</td>';
  h += _fmtDash(m.row1_sales_refund) + _fmtDash(m.row1_sales_refund_ytd) + '</tr>';

  h += '<tr><td style="padding-left:18px">其中：应税货物销售额</td><td style="text-align:center">2</td>';
  h += '<td class="num">' + _fmt0_2(m.row2_other_invoice) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row2_other_invoice_ytd) + '</td>';
  h += _fmtDash(m.row2_other_invoice_refund) + _fmtDash(m.row2_other_invoice_refund_ytd) + '</tr>';

  h += '<tr><td style="padding-left:18px">　　　应税劳务销售额</td><td style="text-align:center">3</td>';
  h += '<td class="num">' + _fmt0_2(m.row3_no_invoice) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row3_no_invoice_ytd) + '</td>';
  h += _fmtDash(m.row3_no_invoice_refund) + _fmtDash(m.row3_no_invoice_refund_ytd) + '</tr>';

  h += '<tr><td style="padding-left:18px">　　　纳税检查调整的销售额</td><td style="text-align:center">4</td>';
  h += '<td class="num">' + _fmt0_2(m.row4_tax_check) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row4_tax_check_ytd) + '</td>';
  h += _fmtDash(m.row4_tax_check_refund) + _fmtDash(m.row4_tax_check_refund_ytd) + '</tr>';

  h += '<tr><td>（二）按简易办法计税销售额</td><td style="text-align:center">5</td>';
  h += '<td class="num">' + _fmt0_2(m.row5_simple_method) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row5_simple_method_ytd) + '</td>';
  h += _fmtDash(m.row5_simple_method_refund) + _fmtDash(m.row5_simple_method_refund_ytd) + '</tr>';

  h += '<tr><td style="padding-left:18px">其中：纳税检查调整的销售额</td><td style="text-align:center">6</td>';
  h += '<td class="num">' + _fmt0_2(m.row6_exempt_sales) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row6_exempt_sales_ytd) + '</td>';
  h += _fmtDash(m.row6_exempt_sales_refund) + _fmtDash(m.row6_exempt_sales_refund_ytd) + '</tr>';

  h += '<tr><td>（三）免、抵、退办法出口销售额</td><td style="text-align:center">7</td>';
  h += '<td class="num">' + _fmt0_2(m.row7_export_exempt) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row7_export_exempt_ytd) + '</td>';
  h += '<td class="num" style="color:#d1d5db">——</td><td class="num" style="color:#d1d5db">——</td></tr>';

  h += '<tr><td>（四）免税销售额</td><td style="text-align:center">8</td>';
  h += '<td class="num">' + _fmt0_2(m.row8_tax_free) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row8_tax_free_ytd) + '</td>';
  h += '<td class="num" style="color:#d1d5db">——</td><td class="num" style="color:#d1d5db">——</td></tr>';

  h += '<tr><td style="padding-left:18px">其中：免税货物销售额</td><td style="text-align:center">9</td>';
  h += '<td class="num">' + _fmt0_2(m.row9_exempt_goods) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row9_exempt_goods_ytd) + '</td>';
  h += '<td class="num" style="color:#d1d5db">——</td><td class="num" style="color:#d1d5db">——</td></tr>';

  h += '<tr><td style="padding-left:18px">　　　免税劳务销售额</td><td style="text-align:center">10</td>';
  h += '<td class="num">' + _fmt0_2(m.row10_exempt_service) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row10_exempt_service_ytd) + '</td>';
  h += '<td class="num" style="color:#d1d5db">——</td><td class="num" style="color:#d1d5db">——</td></tr>';

  // --- 二、税款计算 ---
  h += '<tr><td colspan="6" style="background:#f0f4fa;font-weight:600;font-size:11px;padding:5px 8px">二、税款计算</td></tr>';

  h += '<tr><td>销项税额</td><td style="text-align:center">11</td>';
  h += '<td class="num">' + _fmt2(m.row11_output_tax) + '</td>';
  h += '<td class="num">' + _fmt2(m.row11_output_tax_ytd) + '</td>';
  h += _fmtDash(m.row11_output_tax_refund) + _fmtDash(m.row11_output_tax_refund_ytd) + '</tr>';

  h += '<tr><td>进项税额</td><td style="text-align:center">12</td>';
  h += '<td class="num">' + _fmt2(m.row12_input_tax) + '</td>';
  h += '<td class="num">' + _fmt2(m.row12_input_tax_ytd) + '</td>';
  h += _fmtDash(m.row12_input_tax_refund) + _fmtDash(m.row12_input_tax_refund_ytd) + '</tr>';

  h += '<tr><td>上期留抵税额</td><td style="text-align:center">13</td>';
  h += '<td class="num">' + _fmt2(m.row13_prior_credit) + '</td>';
  h += '<td class="num">' + _fmt2(m.row13_prior_credit_ytd) + '</td>';
  h += _fmtDash(m.row13_prior_credit_refund) + _fmtDash(m.row13_prior_credit_refund_ytd) + '</tr>';

  h += '<tr><td>进项税额转出</td><td style="text-align:center">14</td>';
  h += '<td class="num">' + _fmt2(m.row14_input_transfer_out) + '</td>';
  h += '<td class="num">' + _fmt2(m.row14_input_transfer_out_ytd) + '</td>';
  h += _fmtDash(m.row14_input_transfer_out_refund) + _fmtDash(m.row14_input_transfer_out_refund_ytd) + '</tr>';

  h += '<tr><td>免、抵、退应退税额</td><td style="text-align:center">15</td>';
  h += '<td class="num">' + _fmt2(m.row15_exempt_refund) + '</td>';
  h += '<td class="num">' + _fmt2(m.row15_exempt_refund_ytd) + '</td>';
  h += _fmtDash(m.row15_exempt_refund_refund) + _fmtDash(m.row15_exempt_refund_refund_ytd) + '</tr>';

  h += '<tr><td>按适用税率计算的纳税检查应补缴税额</td><td style="text-align:center">16</td>';
  h += '<td class="num">' + _fmt2(m.row16_actual_deduct_by_item) + '</td>';
  h += '<td class="num">' + _fmt2(m.row16_actual_deduct_by_item_ytd) + '</td>';
  h += _fmtDash(m.row16_actual_deduct_by_item_refund) + _fmtDash(m.row16_actual_deduct_by_item_refund_ytd) + '</tr>';

  h += '<tr style="background:#e8f0fe"><td>应抵扣税额合计</td><td style="text-align:center;font-size:10px;color:#6b7280">17=12+13-14-15+16</td>';
  h += '<td class="num" style="font-weight:700">' + _fmt2(m.row17_total_deductible) + '</td>';
  h += '<td class="num" style="font-weight:700">' + _fmt2(m.row17_total_deductible_ytd) + '</td>';
  h += _fmtDash(m.row17_total_deductible_refund) + _fmtDash(m.row17_total_deductible_refund_ytd) + '</tr>';

  h += '<tr style="background:#e8f0fe"><td>实际抵扣税额</td><td style="text-align:center;font-size:10px;color:#6b7280">18（如17＜11，则为17，否则为11）</td>';
  h += '<td class="num" style="font-weight:700">' + _fmt2(m.row18_actual_deduct) + '</td>';
  h += '<td class="num" style="font-weight:700">' + _fmt2(m.row18_actual_deduct_ytd) + '</td>';
  h += _fmtDash(m.row18_actual_deduct_refund) + _fmtDash(m.row18_actual_deduct_refund_ytd) + '</tr>';

  h += '<tr style="background:#fef9c4"><td>应纳税额</td><td style="text-align:center;font-size:10px;color:#6b7280">19=11-18</td>';
  h += '<td class="num" style="font-weight:700;color:#d97706">' + _fmt2(m.row19_tax_payable) + '</td>';
  h += '<td class="num" style="font-weight:700;color:#d97706">' + _fmt2(m.row19_tax_payable_ytd) + '</td>';
  h += _fmtDash(m.row19_tax_payable_refund) + _fmtDash(m.row19_tax_payable_refund_ytd) + '</tr>';

  h += '<tr><td>期末留抵税额</td><td style="text-align:center;font-size:10px;color:#6b7280">20=17-18</td>';
  h += '<td class="num">' + _fmt2(m.row20_end_credit) + '</td>';
  h += '<td class="num">' + _fmt2(m.row20_end_credit_ytd) + '</td>';
  h += _fmtDash(m.row20_end_credit_refund) + _fmtDash(m.row20_end_credit_refund_ytd) + '</tr>';

  h += '<tr><td>简易计税办法计算的应纳税额</td><td style="text-align:center">21</td>';
  h += '<td class="num">' + _fmt2(m.row21_simple_tax) + '</td>';
  h += '<td class="num">' + _fmt2(m.row21_simple_tax_ytd) + '</td>';
  h += _fmtDash(m.row21_simple_tax_refund) + _fmtDash(m.row21_simple_tax_refund_ytd) + '</tr>';

  h += '<tr><td>按简易计税办法计算的纳税检查应补缴税额</td><td style="text-align:center">22</td>';
  h += '<td class="num">' + _fmt2(m.row22_simple_tax_reduction) + '</td>';
  h += '<td class="num">' + _fmt2(m.row22_simple_tax_reduction_ytd) + '</td>';
  h += _fmtDash(m.row22_simple_tax_reduction_refund) + _fmtDash(m.row22_simple_tax_reduction_refund_ytd) + '</tr>';

  h += '<tr><td>应纳税额减征额</td><td style="text-align:center">23</td>';
  h += '<td class="num">' + _fmt2(m.row23_reduction) + '</td>';
  h += '<td class="num">' + _fmt2(m.row23_reduction_ytd) + '</td>';
  h += _fmtDash(m.row23_reduction_refund) + _fmtDash(m.row23_reduction_refund_ytd) + '</tr>';

  h += '<tr style="background:#fef9c4;font-weight:700"><td>应纳税额合计</td><td style="text-align:center;font-size:10px;color:#6b7280">24=19+21-23</td>';
  h += '<td class="num" style="color:#d97706">' + _fmt2(m.row24_tax_payable_total) + '</td>';
  h += '<td class="num" style="color:#d97706">' + _fmt2(m.row24_tax_payable_total_ytd) + '</td>';
  h += _fmtDash(m.row24_tax_payable_total_refund) + _fmtDash(m.row24_tax_payable_total_refund_ytd) + '</tr>';

  // --- 三、税款缴纳 ---
  h += '<tr><td colspan="6" style="background:#f0f4fa;font-weight:600;font-size:11px;padding:5px 8px">三、税款缴纳</td></tr>';

  h += '<tr><td>期初未缴税额（多缴为负数）</td><td style="text-align:center">25</td>';
  h += '<td class="num">' + _fmt2(m.row25_prior_unpaid) + '</td>';
  h += '<td class="num">' + _fmt2(m.row25_prior_unpaid_ytd) + '</td>';
  h += _fmtDash(m.row25_prior_unpaid_refund) + _fmtDash(m.row25_prior_unpaid_refund_ytd) + '</tr>';

  h += '<tr><td>实收出口开具专用缴款书退税额</td><td style="text-align:center">26</td>';
  h += '<td class="num">' + _fmt2(m.row26_real_paid_during) + '</td>';
  h += '<td class="num">' + _fmt2(m.row26_real_paid_during_ytd) + '</td>';
  h += _fmtDash(m.row26_real_paid_during_refund) + _fmtDash(m.row26_real_paid_during_refund_ytd) + '</tr>';

  h += '<tr><td>本期已缴税额</td><td style="text-align:center;font-size:10px;color:#6b7280">27=28+29+30+31</td>';
  h += '<td class="num">' + _fmt2(m.row27_installment_prepaid) + '</td>';
  h += '<td class="num">' + _fmt2(m.row27_installment_prepaid_ytd) + '</td>';
  h += _fmtDash(m.row27_installment_prepaid_refund) + _fmtDash(m.row27_installment_prepaid_refund_ytd) + '</tr>';

  h += '<tr><td style="padding-left:18px">①分次预缴税额</td><td style="text-align:center">28</td>';
  h += '<td class="num">' + _fmt2(m.row28_export_tax_refund) + '</td>';
  h += '<td class="num">' + _fmt2(m.row28_export_tax_refund_ytd) + '</td>';
  h += _fmtDash(m.row28_export_tax_refund_refund) + _fmtDash(m.row28_export_tax_refund_refund_ytd) + '</tr>';

  h += '<tr><td style="padding-left:18px">②出口开具专用缴款书预缴税额</td><td style="text-align:center">29</td>';
  h += '<td class="num">' + _fmt2(m.row29_remote_prepaid) + '</td>';
  h += '<td class="num">' + _fmt2(m.row29_remote_prepaid_ytd) + '</td>';
  h += _fmtDash(m.row29_remote_prepaid_refund) + _fmtDash(m.row29_remote_prepaid_refund_ytd) + '</tr>';

  h += '<tr><td style="padding-left:18px">③本期缴纳上期应纳税额</td><td style="text-align:center">30</td>';
  h += '<td class="num">' + _fmt2(m.row30_already_paid_total) + '</td>';
  h += '<td class="num">' + _fmt2(m.row30_already_paid_total_ytd) + '</td>';
  h += _fmtDash(m.row30_already_paid_total_refund) + _fmtDash(m.row30_already_paid_total_refund_ytd) + '</tr>';

  h += '<tr><td style="padding-left:18px">④本期缴纳欠缴税额</td><td style="text-align:center">31</td>';
  h += '<td class="num">' + _fmt2(m.row31_should_pay_refund) + '</td>';
  h += '<td class="num">' + _fmt2(m.row31_should_pay_refund_ytd) + '</td>';
  h += _fmtDash(m.row31_should_pay_refund_refund) + _fmtDash(m.row31_should_pay_refund_refund_ytd) + '</tr>';

  h += '<tr><td>期末未缴税额（多缴为负数）</td><td style="text-align:center;font-size:10px;color:#6b7280">32=24+25+26-27</td>';
  h += '<td class="num">' + _fmt2(m.row32_check_tax_should) + '</td>';
  h += '<td class="num">' + _fmt2(m.row32_check_tax_should_ytd) + '</td>';
  h += _fmtDash(m.row32_check_tax_should_refund) + _fmtDash(m.row32_check_tax_should_refund_ytd) + '</tr>';

  h += '<tr><td style="padding-left:18px">其中：欠缴税额（≥0）</td><td style="text-align:center;font-size:10px;color:#6b7280">33=25+26-27</td>';
  h += '<td class="num">' + _fmt2(m.row33_check_prepaid) + '</td>';
  h += '<td class="num">' + _fmt2(m.row33_check_prepaid_ytd) + '</td>';
  h += _fmtDash(m.row33_check_prepaid_refund) + _fmtDash(m.row33_check_prepaid_refund_ytd) + '</tr>';

  h += '<tr style="background:#fef9c4"><td>本期应补(退)税额</td><td style="text-align:center;font-size:10px;color:#6b7280">34＝24-28-29</td>';
  h += '<td class="num" style="font-weight:700;color:#d97706">' + _fmt2(m.row34_should_check) + '</td>';
  h += '<td class="num" style="font-weight:700;color:#d97706">' + _fmt2(m.row34_should_check_ytd) + '</td>';
  h += _fmtDash(m.row34_should_check_refund) + _fmtDash(m.row34_should_check_refund_ytd) + '</tr>';

  h += '<tr><td>即征即退实际退税额</td><td style="text-align:center">35</td>';
  h += '<td class="num" style="color:#d1d5db">——</td><td class="num" style="color:#d1d5db">——</td>';
  h += '<td class="num">——</td><td class="num">——</td></tr>';

  h += '<tr><td>期初未缴查补税额</td><td style="text-align:center">36</td>';
  h += '<td class="num">' + _fmt2(m.row36_prior_unpaid_check) + '</td>';
  h += '<td class="num">' + _fmt2(m.row36_prior_unpaid_check_ytd) + '</td>';
  h += _fmtDash(m.row36_prior_unpaid_check_refund) + _fmtDash(m.row36_prior_unpaid_check_refund_ytd) + '</tr>';

  h += '<tr><td>本期入库查补税额</td><td style="text-align:center">37</td>';
  h += '<td class="num">' + _fmt2(m.row37_check_paid) + '</td>';
  h += '<td class="num">' + _fmt2(m.row37_check_paid_ytd) + '</td>';
  h += _fmtDash(m.row37_check_paid_refund) + _fmtDash(m.row37_check_paid_refund_ytd) + '</tr>';

  h += '<tr><td>期末未缴查补税额</td><td style="text-align:center;font-size:10px;color:#6b7280">38=16+22+36-37</td>';
  h += '<td class="num">' + _fmt2(m.row38_end_check) + '</td>';
  h += '<td class="num">' + _fmt2(m.row38_end_check_ytd) + '</td>';
  h += _fmtDash(m.row38_end_check_refund) + _fmtDash(m.row38_end_check_refund_ytd) + '</tr>';

  // --- 四、附加税费 ---
  h += '<tr><td colspan="6" style="background:#f0f4fa;font-weight:600;font-size:11px;padding:5px 8px">四、附加税费</td></tr>';

  h += '<tr><td>城市维护建设税本期应补（退）税额</td><td style="text-align:center">39</td>';
  h += '<td class="num">' + _fmt2(m.row39_city_maintenance_tax) + '</td>';
  h += '<td class="num">' + _fmt2(m.row39_city_maintenance_tax_ytd) + '</td>';
  h += _fmtDash(m.row39_city_maintenance_tax_refund) + _fmtDash(m.row39_city_maintenance_tax_refund_ytd) + '</tr>';

  h += '<tr><td>教育费附加本期应补（退）费额</td><td style="text-align:center">40</td>';
  h += '<td class="num">' + _fmt2(m.row40_education_surcharge) + '</td>';
  h += '<td class="num">' + _fmt2(m.row40_education_surcharge_ytd) + '</td>';
  h += _fmtDash(m.row40_education_surcharge_refund) + _fmtDash(m.row40_education_surcharge_refund_ytd) + '</tr>';

  h += '<tr><td>地方教育附加本期应补（退）费额</td><td style="text-align:center">41</td>';
  h += '<td class="num">' + _fmt2(m.row41_local_education_surcharge) + '</td>';
  h += '<td class="num">' + _fmt2(m.row41_local_education_surcharge_ytd) + '</td>';
  h += _fmtDash(m.row41_local_education_surcharge_refund) + _fmtDash(m.row41_local_education_surcharge_refund_ytd) + '</tr>';

  h += '</tbody></table>';
  return h;
}

// ==================== 附表一：销售情况明细 ====================
function renderSchedule1(data) {
  const s = (typeof data.form_sales === 'string') ? JSON.parse(data.form_sales) : (data.form_sales || {});

  function td(v) { return '<td class="num">' + _fm0(v) + '</td>'; }
  function tdDash() { return '<td class="num" style="color:#d1d5db">——</td>'; }

  return '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税及附加税费申报表附列资料（一）</div>'
    + '<div style="font-size:11px;color:#6b7280;text-align:center;margin-bottom:6px">（本期销售情况明细）</div>'
    + '<table class="vat-form-table" style="font-size:10px">'
    + '<colgroup>'
    + '<col style="width:18%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:6%">'
    + '<col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:6%">'
    + '<col style="width:7%"><col style="width:7%"><col style="width:6%"><col style="width:8%"><col style="width:6%"></col>'
    + '</colgroup>'
    + '<thead>'
    + '<tr style="background:#d9e2f3"><th rowspan="3">项目及栏次</th>'
    + '<th colspan="2">开具增值税专用发票</th><th colspan="2">开具其他发票</th>'
    + '<th colspan="2">未开具发票</th><th colspan="2">纳税检查调整</th>'
    + '<th colspan="2">合计</th>'
    + '<th rowspan="3">服务、不动产和无形资产扣除项目本期实际扣除金额</th>'
    + '<th colspan="2" rowspan="2">扣除后</th></tr>'
    + '<tr style="background:#d9e2f3">'
    + '<th>销售额</th><th>销项(应纳)税额</th><th>销售额</th><th>销项(应纳)税额</th>'
    + '<th>销售额</th><th>销项(应纳)税额</th><th>销售额</th><th>销项(应纳)税额</th>'
    + '<th>销售额</th><th>销项(应纳)税额</th></tr>'
    + '<tr style="background:#d9e2f3">'
    + '<th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th>'
    + '<th>9=1+3+5+7</th><th>10=2+4+6+8</th>'
    + '<th>13=11-12</th><th>14=13÷(100%+税率或征收率)×税率或征收率</th></tr>'
    + '</thead>'
    + '<tbody>'

    // 一、一般计税方法计税
    + '<tr style="background:#f0f4fa"><td colspan="14" style="font-weight:600;padding:4px 8px;font-size:11px">一、一般计税方法计税</td></tr>'
    + '<tr style="background:#f5f7fa"><td colspan="14" style="font-weight:600;padding:3px 8px;font-size:10px">全部征税项目</td></tr>'
    + '<tr><td>13%税率的货物及加工修理修配劳务　<span style="font-size:9px;color:#6b7280">1</span></td>'
    + td(s.row1_13_special_sales) + td(s.row1_13_special_tax) + td(s.row1_13_other_sales) + td(s.row1_13_other_tax)
    + td(s.row1_13_no_invoice_sales) + td(s.row1_13_no_invoice_tax) + td(s.row1_13_check_sales) + td(s.row1_13_check_tax)
    + td(s.row1_13_total_sales) + td(s.row1_13_total_tax) + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td>13%税率的服务、不动产和无形资产　<span style="font-size:9px;color:#6b7280">2</span></td>'
    + td(s.row2_13_service_special_sales) + td(s.row2_13_service_special_tax)
    + td(s.row2_13_service_other_sales) + td(s.row2_13_service_other_tax)
    + td(s.row2_13_service_no_invoice_sales) + td(s.row2_13_service_no_invoice_tax)
    + td(s.row2_13_service_check_sales) + td(s.row2_13_service_check_tax)
    + td(s.row2_13_service_total_sales) + td(s.row2_13_service_total_tax) + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td>9%税率的货物及加工修理修配劳务　<span style="font-size:9px;color:#6b7280">3</span></td>'
    + td(s.row3_9_special_sales) + td(s.row3_9_special_tax) + td(s.row3_9_other_sales) + td(s.row3_9_other_tax)
    + td(s.row3_9_no_invoice_sales) + td(s.row3_9_no_invoice_tax) + td(s.row3_9_check_sales) + td(s.row3_9_check_tax)
    + td(s.row3_9_total_sales) + td(s.row3_9_total_tax) + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td>9%税率的服务、不动产和无形资产　<span style="font-size:9px;color:#6b7280">4</span></td>'
    + td(s.row4_9_service_sales) + td(s.row4_9_service_tax)
    + td(s.row4_9_service_other_sales) + td(s.row4_9_service_other_tax)
    + td(s.row4_9_service_no_invoice_sales) + td(s.row4_9_service_no_invoice_tax)
    + td(s.row4_9_service_check_sales) + td(s.row4_9_service_check_tax)
    + td(s.row4_9_service_total_sales) + td(s.row4_9_service_total_tax) + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td>6%税率　<span style="font-size:9px;color:#6b7280">5</span></td>'
    + td(s.row5_6_special_sales) + td(s.row5_6_special_tax) + td(s.row5_6_other_sales) + td(s.row5_6_other_tax)
    + td(s.row5_6_no_invoice_sales) + td(s.row5_6_no_invoice_tax) + td(s.row5_6_check_sales) + td(s.row5_6_check_tax)
    + td(s.row5_6_total_sales) + td(s.row5_6_total_tax) + tdDash() + tdDash() + tdDash() + '</tr>'

    // 即征即退项目
    + '<tr style="background:#f5f7fa"><td colspan="14" style="font-weight:600;padding:3px 8px;font-size:10px">其中：即征即退项目</td></tr>'
    + '<tr><td>即征即退货物及加工修理修配劳务　<span style="font-size:9px;color:#6b7280">6</span></td>'
    + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td>即征即退服务、不动产和无形资产　<span style="font-size:9px;color:#6b7280">7</span></td>'
    + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + '</tr>'

    // 二、简易计税方法计税
    + '<tr style="background:#f0f4fa"><td colspan="14" style="font-weight:600;padding:4px 8px;font-size:11px">二、简易计税方法计税</td></tr>'
    + '<tr style="background:#f5f7fa"><td colspan="14" style="font-weight:600;padding:3px 8px;font-size:10px">全部征税项目</td></tr>'
    + '<tr><td>6%征收率　<span style="font-size:9px;color:#6b7280">8</span></td>'
    + td(s.row8_6_collect_sales) + td(s.row8_6_collect_tax) + td(s.row8_6_collect_other_sales) + td(s.row8_6_collect_other_tax)
    + td(s.row8_6_collect_no_invoice_sales) + td(s.row8_6_collect_no_invoice_tax)
    + td(s.row8_6_collect_check_sales) + td(s.row8_6_collect_check_tax)
    + td(s.row8_6_collect_total_sales) + td(s.row8_6_collect_total_tax) + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td>5%征收率的货物及加工修理修配劳务　<span style="font-size:9px;color:#6b7280">9a</span></td>'
    + td(s.row9a_5_goods_sales) + td(s.row9a_5_goods_tax) + td(s.row9a_5_goods_other_sales) + td(s.row9a_5_goods_other_tax)
    + td(s.row9a_5_goods_no_invoice_sales) + td(s.row9a_5_goods_no_invoice_tax)
    + td(s.row9a_5_goods_check_sales) + td(s.row9a_5_goods_check_tax)
    + td(s.row9a_5_goods_total_sales) + td(s.row9a_5_goods_total_tax) + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td>5%征收率的服务、不动产和无形资产　<span style="font-size:9px;color:#6b7280">9b</span></td>'
    + td(s.row9b_5_service_sales) + td(s.row9b_5_service_tax) + td(s.row9b_5_service_other_sales) + td(s.row9b_5_service_other_tax)
    + td(s.row9b_5_service_no_invoice_sales) + td(s.row9b_5_service_no_invoice_tax)
    + td(s.row9b_5_service_check_sales) + td(s.row9b_5_service_check_tax)
    + td(s.row9b_5_service_total_sales) + td(s.row9b_5_service_total_tax) + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td>4%征收率　<span style="font-size:9px;color:#6b7280">10</span></td>'
    + td(s.row10_4_collect_sales) + td(s.row10_4_collect_tax) + td(s.row10_4_collect_other_sales) + td(s.row10_4_collect_other_tax)
    + td(s.row10_4_collect_no_invoice_sales) + td(s.row10_4_collect_no_invoice_tax)
    + td(s.row10_4_collect_check_sales) + td(s.row10_4_collect_check_tax)
    + td(s.row10_4_collect_total_sales) + td(s.row10_4_collect_total_tax) + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td>3%征收率的货物及加工修理修配劳务　<span style="font-size:9px;color:#6b7280">11</span></td>'
    + td(s.row11_3_goods_sales) + td(s.row11_3_goods_tax) + td(s.row11_3_goods_other_sales) + td(s.row11_3_goods_other_tax)
    + td(s.row11_3_goods_no_invoice_sales) + td(s.row11_3_goods_no_invoice_tax)
    + td(s.row11_3_goods_check_sales) + td(s.row11_3_goods_check_tax)
    + td(s.row11_3_goods_total_sales) + td(s.row11_3_goods_total_tax) + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td>3%征收率的服务、不动产和无形资产　<span style="font-size:9px;color:#6b7280">12</span></td>'
    + td(s.row12_3_service_sales) + td(s.row12_3_service_tax) + td(s.row12_3_service_other_sales) + td(s.row12_3_service_other_tax)
    + td(s.row12_3_service_no_invoice_sales) + td(s.row12_3_service_no_invoice_tax)
    + td(s.row12_3_service_check_sales) + td(s.row12_3_service_check_tax)
    + td(s.row12_3_service_total_sales) + td(s.row12_3_service_total_tax) + tdDash() + tdDash() + tdDash() + '</tr>'

    // 即征即退项目（简易）
    + '<tr style="background:#f5f7fa"><td colspan="14" style="font-weight:600;padding:3px 8px;font-size:10px">其中：即征即退项目</td></tr>'
    + '<tr><td>即征即退货物及加工修理修配劳务　<span style="font-size:9px;color:#6b7280">14</span></td>'
    + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td>即征即退服务、不动产和无形资产　<span style="font-size:9px;color:#6b7280">15</span></td>'
    + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + '</tr>'

    // 三、免抵退税
    + '<tr style="background:#f0f4fa"><td colspan="14" style="font-weight:600;padding:4px 8px;font-size:11px">三、免抵退税</td></tr>'
    + '<tr><td>货物及加工修理修配劳务　<span style="font-size:9px;color:#6b7280">16</span></td>'
    + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td>服务、不动产和无形资产　<span style="font-size:9px;color:#6b7280">17</span></td>'
    + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + '</tr>'

    // 四、免税
    + '<tr style="background:#f0f4fa"><td colspan="14" style="font-weight:600;padding:4px 8px;font-size:11px">四、免税</td></tr>'
    + '<tr><td>货物及加工修理修配劳务　<span style="font-size:9px;color:#6b7280">18</span></td>'
    + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td>服务、不动产和无形资产　<span style="font-size:9px;color:#6b7280">19</span></td>'
    + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + tdDash() + '</tr>'

    + '</tbody></table>';
}

// ==================== 附表二：进项税额明细 ====================
function renderSchedule2(data) {
  const inp = (typeof data.form_input === 'string') ? JSON.parse(data.form_input) : (data.form_input || {});

  function tdNum(v) { return '<td class="num">' + _fm0(v) + '</td>'; }
  function tdDash() { return '<td class="num" style="color:#d1d5db">——</td>'; }
  function tdCnt(v) { return '<td class="num">' + ((v === 0 || v === null || v === undefined) ? '' : v) + '</td>'; }

  return '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税及附加税费申报表附列资料（二）</div>'
    + '<div style="font-size:11px;color:#6b7280;text-align:center;margin-bottom:6px">（本期进项税额明细）</div>'

    // 一、申报抵扣的进项税额
    + '<div style="font-size:12px;font-weight:600;margin-bottom:4px">一、申报抵扣的进项税额</div>'
    + '<table class="vat-form-table"><colgroup><col style="width:60%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:10%"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th>项目</th><th>栏次</th><th>份数</th><th>金额</th><th>税额</th></tr></thead><tbody>'
    + '<tr><td>（一）认证相符的增值税专用发票</td><td style="text-align:center">1=2+3</td>' + tdCnt(inp.row1_certified_count) + tdNum(inp.row1_certified_amount) + tdNum(inp.row1_certified_tax) + '</tr>'
    + '<tr><td style="padding-left:16px">其中：本期认证相符且本期申报抵扣</td><td style="text-align:center">2</td>' + tdCnt(inp.row2_certified_curr_count) + tdNum(inp.row2_certified_curr_amount) + tdNum(inp.row2_certified_curr_tax) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　前期认证相符且本期申报抵扣</td><td style="text-align:center">3</td>' + tdCnt(inp.row3_certified_prior_count) + tdNum(inp.row3_certified_prior_amount) + tdNum(inp.row3_certified_prior_tax) + '</tr>'
    + '<tr><td>（二）其他扣税凭证</td><td style="text-align:center">4=5+6+7+8a+8b</td>' + tdCnt(inp.row4_other_count) + tdNum(inp.row4_other_amount) + tdNum(inp.row4_other_tax) + '</tr>'
    + '<tr><td style="padding-left:16px">其中：海关进口增值税专用缴款书</td><td style="text-align:center">5</td>' + tdCnt(inp.row5_customs_count) + tdNum(inp.row5_customs_amount) + tdNum(inp.row5_customs_tax) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　农产品收购发票或者销售发票</td><td style="text-align:center">6</td>' + tdCnt(inp.row6_agri_count) + tdNum(inp.row6_agri_amount) + tdNum(inp.row6_agri_tax) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　代扣代缴税收缴款凭证</td><td style="text-align:center">7</td>' + tdCnt(inp.row7_wht_count) + tdDash() + tdNum(inp.row7_wht_tax) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　加计扣除农产品进项税额</td><td style="text-align:center">8a</td>' + tdDash() + tdDash() + tdNum(inp.row8a_agri_extra) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　其他</td><td style="text-align:center">8b</td>' + tdCnt(inp.row8b_other_count) + tdNum(inp.row8b_other_amount) + tdNum(inp.row8b_other_tax) + '</tr>'
    + '<tr><td>（三）本期用于购建不动产的扣税凭证</td><td style="text-align:center">9</td>' + tdCnt(inp.row9_real_estate_count) + tdNum(inp.row9_real_estate_amount) + tdNum(inp.row9_real_estate_tax) + '</tr>'
    + '<tr><td>（四）本期用于抵扣的旅客运输服务扣税凭证</td><td style="text-align:center">10</td>' + tdCnt(inp.row10_travel_count) + tdNum(inp.row10_travel_amount) + tdNum(inp.row10_travel_tax) + '</tr>'
    + '<tr><td>（五）外贸企业进项税额抵扣证明</td><td style="text-align:center">11</td>' + tdDash() + tdDash() + tdNum(inp.row11_foreign_trade_tax) + '</tr>'
    + '<tr style="background:#f0fdf4;font-weight:700"><td>当期申报抵扣进项税额合计</td><td style="text-align:center">12=1+4+11</td>'
    + '<td class="num">' + ((inp.certified_count || 0) + (inp.row4_other_count || 0) + (inp.row11_foreign_trade_count || 0) || '') + '</td>'
    + '<td class="num">' + _fmt(inp.certified_amount) + '</td><td class="num">' + _fmt(inp.certified_tax) + '</td></tr>'
    + '</tbody></table>'

    // 二、进项税额转出额
    + '<div style="font-size:12px;font-weight:600;margin:12px 0 4px 0">二、进项税额转出额</div>'
    + '<table class="vat-form-table"><colgroup><col style="width:70%"><col style="width:10%"><col style="width:20%"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th>项目</th><th>栏次</th><th>税额</th></tr></thead><tbody>'
    + '<tr><td>本期进项税额转出额</td><td style="text-align:center">13=14至23之和</td><td class="num">' + _fmt(inp.row13_transfer_out_total) + '</td></tr>'
    + '<tr><td style="padding-left:16px">其中：免税项目用</td><td style="text-align:center">14</td>' + tdNum(inp.row14_exempt_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　集体福利、个人消费</td><td style="text-align:center">15</td>' + tdNum(inp.row15_collective_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　非正常损失</td><td style="text-align:center">16</td>' + tdNum(inp.row16_abnormal_loss) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　简易计税方法征税项目用</td><td style="text-align:center">17</td>' + tdNum(inp.row17_simple_tax_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　免抵退税办法不得抵扣的进项税额</td><td style="text-align:center">18</td>' + tdNum(inp.row18_exempt_credit_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　纳税检查调减进项税额</td><td style="text-align:center">19</td>' + tdNum(inp.row19_tax_check_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　红字专用发票信息表注明的进项税额</td><td style="text-align:center">20</td>' + tdNum(inp.row20_red_letter_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　上期留抵税额抵减欠税</td><td style="text-align:center">21</td>' + tdNum(inp.row21_prior_credit_arrears) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　上期留抵税额退税</td><td style="text-align:center">22</td>' + tdNum(inp.row22_prior_credit_refund) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　异常凭证转出进项税额</td><td style="text-align:center">23a</td>' + tdNum(inp.row23a_abnormal_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　其他应作进项税额转出的情形</td><td style="text-align:center">23b</td>' + tdNum(inp.row23b_other_transfer) + '</tr>'
    + '</tbody></table>'

    // 三、待抵扣进项税额
    + '<div style="font-size:12px;font-weight:600;margin:12px 0 4px 0">三、待抵扣进项税额</div>'
    + '<table class="vat-form-table"><colgroup><col style="width:60%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:10%"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th>项目</th><th>栏次</th><th>份数</th><th>金额</th><th>税额</th></tr></thead><tbody>'
    + '<tr><td>（一）认证相符的增值税专用发票</td><td style="text-align:center">24</td>' + tdDash() + tdDash() + tdDash() + '</tr>'
    + '<tr><td style="padding-left:16px">期初已认证相符但未申报抵扣</td><td style="text-align:center">25</td>' + tdCnt(inp.row25_pending_begin_count) + tdNum(inp.row25_pending_begin_amount) + tdNum(inp.row25_pending_begin_tax) + '</tr>'
    + '<tr><td style="padding-left:16px">本期认证相符且本期未申报抵扣</td><td style="text-align:center">26</td>' + tdCnt(inp.row26_pending_curr_count) + tdNum(inp.row26_pending_curr_amount) + tdNum(inp.row26_pending_curr_tax) + '</tr>'
    + '<tr><td style="padding-left:16px">期末已认证相符但未申报抵扣</td><td style="text-align:center">27</td>' + tdCnt(inp.row27_pending_end_count) + tdNum(inp.row27_pending_end_amount) + tdNum(inp.row27_pending_end_tax) + '</tr>'
    + '<tr><td style="padding-left:24px">其中：按照税法规定不允许抵扣</td><td style="text-align:center">28</td>' + tdCnt(inp.row28_not_allowed_count) + tdNum(inp.row28_not_allowed_amount) + tdNum(inp.row28_not_allowed_tax) + '</tr>'
    + '<tr><td>（二）其他扣税凭证</td><td style="text-align:center">29=30至33之和</td>' + tdCnt(inp.row29_other_pending_count) + tdNum(inp.row29_other_pending_amount) + tdNum(inp.row29_other_pending_tax) + '</tr>'
    + '<tr><td style="padding-left:16px">其中：海关进口增值税专用缴款书</td><td style="text-align:center">30</td>' + tdCnt(inp.row30_customs_pending_count) + tdNum(inp.row30_customs_pending_amount) + tdNum(inp.row30_customs_pending_tax) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　农产品收购发票或者销售发票</td><td style="text-align:center">31</td>' + tdCnt(inp.row31_agri_pending_count) + tdNum(inp.row31_agri_pending_amount) + tdNum(inp.row31_agri_pending_tax) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　代扣代缴税收缴款凭证</td><td style="text-align:center">32</td>' + tdCnt(inp.row32_wht_pending_count) + tdDash() + tdNum(inp.row32_wht_pending_tax) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　其他</td><td style="text-align:center">33</td>' + tdCnt(inp.row33_other_pending_count) + tdNum(inp.row33_other_pending_amount) + tdNum(inp.row33_other_pending_tax) + '</tr>'
    + '<tr><td></td><td style="text-align:center">34</td><td class="num"></td><td class="num"></td><td class="num"></td></tr>'
    + '</tbody></table>'

    // 四、其他
    + '<div style="font-size:12px;font-weight:600;margin:12px 0 4px 0">四、其他</div>'
    + '<table class="vat-form-table"><colgroup><col style="width:60%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:10%"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th>项目</th><th>栏次</th><th>份数</th><th>金额</th><th>税额</th></tr></thead><tbody>'
    + '<tr><td>本期认证相符的增值税专用发票</td><td style="text-align:center">35</td>' + tdCnt(inp.row35_cert_count) + tdNum(inp.row35_cert_amount) + tdNum(inp.row35_cert_tax) + '</tr>'
    + '<tr><td>代扣代缴税额</td><td style="text-align:center">36</td>' + tdDash() + tdDash() + tdNum(inp.row36_wht_total_tax) + '</tr>'
    + '</tbody></table>';
}

// ==================== 附表三：扣除项目明细 ====================
function renderSchedule3(data) {
  const d = (typeof data.form_deduction === 'string') ? JSON.parse(data.form_deduction) : (data.form_deduction || {});

  function td(v) { return '<td class="num">' + _fm0(v) + '</td>'; }

  return '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税及附加税费申报表附列资料（三）</div>'
    + '<div style="font-size:11px;color:#6b7280;text-align:center;margin-bottom:6px">（服务、不动产和无形资产扣除项目明细）</div>'
    + '<table class="vat-form-table">'
    + '<colgroup><col style="width:28%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"></colgroup>'
    + '<thead>'
    + '<tr style="background:#d9e2f3"><th rowspan="2">项目及栏次</th>'
    + '<th rowspan="2">本期服务、不动产和无形资产价税合计额（免税销售额）</th>'
    + '<th colspan="4">服务、不动产和无形资产扣除项目</th></tr>'
    + '<tr style="background:#d9e2f3"><th>期初余额</th><th>本期发生额</th><th>本期应扣除金额</th><th>本期实际扣除金额</th><th>期末余额</th></tr>'
    + '<tr style="background:#e8edf5"><th style="text-align:center">栏次</th><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center">3</th><th style="text-align:center;font-size:10px">4=2+3</th><th style="text-align:center;font-size:10px">5(5≤1且5≤4)</th><th style="text-align:center;font-size:10px">6=4-5</th></tr>'
    + '</thead>'
    + '<tbody>'
    + '<tr><td>13%税率的项目　<span style="font-size:9px;color:#6b7280">1</span></td>'
    + td(d.row2_13_price_tax) + td(d.row2_13_begin) + td(d.row2_13_occur) + td(d.row2_13_should) + td(d.row2_13_actual) + td(d.row2_13_end) + '</tr>'
    + '<tr><td>9%税率的项目　<span style="font-size:9px;color:#6b7280">2</span></td>'
    + td(d.row3_9_price_tax) + td(d.row3_9_begin) + td(d.row3_9_occur) + td(d.row3_9_should) + td(d.row3_9_actual) + td(d.row3_9_end) + '</tr>'
    + '<tr><td>6%税率的项目（不含金融商品转让）　<span style="font-size:9px;color:#6b7280">3</span></td>'
    + td(d.row4_6_price_tax) + td(d.row4_6_begin) + td(d.row4_6_occur) + td(d.row4_6_should) + td(d.row4_6_actual) + td(d.row4_6_end) + '</tr>'
    + '<tr><td>6%税率的金融商品转让项目　<span style="font-size:9px;color:#6b7280">4</span></td>'
    + td(d.row4_fin_price_tax) + td(d.row4_fin_begin) + td(d.row4_fin_occur) + td(d.row4_fin_should) + td(d.row4_fin_actual) + td(d.row4_fin_end) + '</tr>'
    + '<tr><td>5%征收率的项目　<span style="font-size:9px;color:#6b7280">5</span></td>'
    + td(d.row5_5_price_tax) + td(d.row5_5_begin) + td(d.row5_5_occur) + td(d.row5_5_should) + td(d.row5_5_actual) + td(d.row5_5_end) + '</tr>'
    + '<tr><td>3%征收率的项目　<span style="font-size:9px;color:#6b7280">6</span></td>'
    + td(d.row6_3_price_tax) + td(d.row6_3_begin) + td(d.row6_3_occur) + td(d.row6_3_should) + td(d.row6_3_actual) + td(d.row6_3_end) + '</tr>'
    + '<tr><td>免抵退税的项目　<span style="font-size:9px;color:#6b7280">7</span></td>'
    + td(d.row7_exempt_credit_price_tax) + td(d.row7_exempt_credit_begin) + td(d.row7_exempt_credit_occur)
    + td(d.row7_exempt_credit_should) + td(d.row7_exempt_credit_actual) + td(d.row7_exempt_credit_end) + '</tr>'
    + '<tr><td>免税的项目　<span style="font-size:9px;color:#6b7280">8</span></td>'
    + td(d.row8_exempt_price_tax) + td(d.row8_exempt_begin) + td(d.row8_exempt_occur) + td(d.row8_exempt_should) + td(d.row8_exempt_actual) + td(d.row8_exempt_end) + '</tr>'
    + '</tbody></table>';
}

// ==================== 附表四：税额抵减情况表 ====================
function renderSchedule4(data) {
  const c = (typeof data.form_credit === 'string') ? JSON.parse(data.form_credit) : (data.form_credit || {});
  function td(v) { return '<td class="num">' + _fm0(v) + '</td>'; }

  return '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税及附加税费申报表附列资料（四）</div>'
    + '<div style="font-size:11px;color:#6b7280;text-align:center;margin-bottom:6px">（税额抵减情况表）</div>'

    // 一、税额抵减情况
    + '<div style="font-size:12px;font-weight:600;margin-bottom:4px">一、税额抵减情况</div>'
    + '<table class="vat-form-table"><colgroup><col style="width:5%"><col style="width:35%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th>序号</th><th>抵减项目</th><th>期初余额</th><th>本期发生额</th><th>本期应抵减税额</th><th>本期实际抵减税额</th><th>期末余额</th></tr>'
    + '<tr style="background:#e8edf5"><th colspan="2" style="text-align:center">栏次</th><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center;font-size:10px">3=1+2</th><th style="text-align:center;font-size:10px">4≤3</th><th style="text-align:center;font-size:10px">5=3-4</th></tr></thead><tbody>'
    + '<tr><td style="text-align:center">1</td><td>增值税税控系统专用设备费及技术维护费</td>' + td(c.tax_control_begin) + td(c.tax_control_occur) + td(c.tax_control_should) + td(c.tax_control_actual) + td(c.tax_control_end) + '</tr>'
    + '<tr><td style="text-align:center">2</td><td>分支机构预征缴纳税款</td>' + td(c.branch_begin) + td(c.branch_occur) + td(c.branch_should) + td(c.branch_actual) + td(c.branch_end) + '</tr>'
    + '<tr><td style="text-align:center">3</td><td>建筑服务预征缴纳税款</td>' + td(c.construction_begin) + td(c.construction_occur) + td(c.construction_should) + td(c.construction_actual) + td(c.construction_end) + '</tr>'
    + '<tr><td style="text-align:center">4</td><td>销售不动产预征缴纳税款</td>' + td(c.real_estate_begin) + td(c.real_estate_occur) + td(c.real_estate_should) + td(c.real_estate_actual) + td(c.real_estate_end) + '</tr>'
    + '<tr><td style="text-align:center">5</td><td>出租不动产预征缴纳税款</td>' + td(c.rental_begin) + td(c.rental_occur) + td(c.rental_should) + td(c.rental_actual) + td(c.rental_end) + '</tr>'
    + '</tbody></table>'

    // 二、加计抵减情况
    + '<div style="font-size:12px;font-weight:600;margin:12px 0 4px 0">二、加计抵减情况</div>'
    + '<table class="vat-form-table"><colgroup><col style="width:5%"><col style="width:25%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:12%"><col style="width:14%"><col style="width:14%"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th>序号</th><th>加计抵减项目</th><th>期初余额</th><th>本期发生额</th><th>本期调减额</th><th>本期可抵减额</th><th>本期实际抵减额</th><th>期末余额</th></tr>'
    + '<tr style="background:#e8edf5"><th colspan="2" style="text-align:center">栏次</th><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center">3</th><th style="text-align:center;font-size:9px">4=1+2-3</th><th style="text-align:center">5</th><th style="text-align:center;font-size:9px">6=4-5</th></tr></thead><tbody>'
    + '<tr><td style="text-align:center">6</td><td>一般项目加计抵减额计算</td>' + td(c.item1_begin) + td(c.item1_occur) + td(c.item1_adjust) + td(c.item1_can_deduct) + td(c.item1_actual_deduct) + td(c.item1_end) + '</tr>'
    + '<tr><td style="text-align:center">7</td><td>即征即退项目加计抵减额计算</td>' + td(c.item2_begin) + td(c.item2_occur) + td(c.item2_adjust) + td(c.item2_can_deduct) + td(c.item2_actual_deduct) + td(c.item2_end) + '</tr>'
    + '<tr style="background:#f0fdf4;font-weight:700"><td style="text-align:center">8</td><td>合计</td>'
    + '<td class="num">' + _fmt((c.item1_begin || 0) + (c.item2_begin || 0)) + '</td>'
    + '<td class="num">' + _fmt((c.item1_occur || 0) + (c.item2_occur || 0)) + '</td>'
    + '<td class="num">' + _fmt((c.item1_adjust || 0) + (c.item2_adjust || 0)) + '</td>'
    + '<td class="num">' + _fmt((c.item1_can_deduct || 0) + (c.item2_can_deduct || 0)) + '</td>'
    + '<td class="num">' + _fmt((c.item1_actual_deduct || 0) + (c.item2_actual_deduct || 0)) + '</td>'
    + '<td class="num">' + _fmt((c.item1_end || 0) + (c.item2_end || 0)) + '</td></tr>'
    + '</tbody></table>';
}

// ==================== 附表五：附加税费情况表 ====================
function renderSchedule5(data) {
  const scf = (typeof data.form_surcharge === 'string') ? JSON.parse(data.form_surcharge) : (data.form_surcharge || {});
  function td(v) { return '<td class="num">' + _fmt(v) + '</td>'; }
  function tdZero(v) { return '<td class="num">' + _fm0(v) + '</td>'; }

  return '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税及附加税费申报表（一般纳税人适用）附列资料（五）</div>'
    + '<div style="font-size:11px;color:#6b7280;text-align:center;margin-bottom:6px">（附加税费情况表）</div>'
    + '<table class="vat-form-table" style="font-size:10px">'
    + '<colgroup><col style="width:8%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:5%">'
    + '<col style="width:9%"><col style="width:5%"><col style="width:6%"><col style="width:5%"><col style="width:6%">'
    + '<col style="width:5%"><col style="width:6%"><col style="width:7%"><col style="width:7%"><col style="width:7%"></col>'
    + '</colgroup>'
    + '<thead>'
    + '<tr style="background:#d9e2f3">'
    + '<th rowspan="2">税（费）种</th>'
    + '<th colspan="3">计税（费）依据</th>'
    + '<th rowspan="2">税（费）率（%）</th><th rowspan="2">本期应纳税（费）额</th>'
    + '<th colspan="2">本期减免税（费）额</th>'
    + '<th colspan="2">小微企业"六税两费"减免政策</th>'
    + '<th colspan="3">试点建设培育产教融合型企业</th>'
    + '<th rowspan="2">本期已缴税（费）额</th><th rowspan="2">本期应补（退）税（费）额</th>'
    + '</tr>'
    + '<tr style="background:#d9e2f3">'
    + '<th>增值税税额</th><th>增值税免抵税额</th><th>留抵退税本期扣除额</th>'
    + '<th>减免性质代码</th><th>减免税（费）额</th>'
    + '<th>减征比例（%）</th><th>减征额</th>'
    + '<th>减免性质代码</th><th>本期抵免金额</th>'
    + '</tr>'
    + '<tr style="background:#e8edf5"><th colspan="2">栏次</th>'
    + '<th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center">3</th>'
    + '<th style="text-align:center">4</th><th style="text-align:center;font-size:9px">5=(1+2-3)×4</th>'
    + '<th style="text-align:center">6</th><th style="text-align:center">7</th>'
    + '<th style="text-align:center">8</th><th style="text-align:center;font-size:9px">9=(5-7)×8</th>'
    + '<th style="text-align:center">10</th><th style="text-align:center">11</th>'
    + '<th style="text-align:center">12</th><th style="text-align:center;font-size:9px">13=5-7-9-11-12</th></tr>'
    + '</thead>'
    + '<tbody>'
    + '<tr><td>城市维护建设税</td><td style="text-align:center">1</td>'
    + td(scf.city_base) + tdZero(scf.vat_exempt_credit) + tdZero(scf.vat_refund_deduct)
    + '<td class="num">' + ((scf.city_rate || 0) * 100).toFixed(0) + '%</td>'
    + td(scf.city_tax) + '<td>' + (scf.city_reduction_code || '') + '</td>' + tdZero(scf.city_reduction_amount)
    + '<td class="num">' + ((scf.city_reduction_rate || 0) * 100).toFixed(0) + '%</td>'
    + tdZero(scf.city_six_tax_amount)
    + '<td>' + (scf.city_edu_pilot_code || '') + '</td>' + tdZero(scf.city_edu_pilot_amount) + tdZero(scf.city_paid) + td(scf.city_final) + '</tr>'

    + '<tr><td>教育费附加</td><td style="text-align:center">2</td>'
    + td(scf.edu_base) + tdZero(scf.edu_exempt_credit) + tdZero(scf.edu_vat_refund_deduct)
    + '<td class="num">' + ((scf.edu_rate || 0) * 100).toFixed(0) + '%</td>'
    + td(scf.edu_tax) + '<td>' + (scf.edu_reduction_code || '') + '</td>' + tdZero(scf.edu_reduction_amount)
    + '<td class="num">' + ((scf.edu_reduction_rate || 0) * 100).toFixed(0) + '%</td>'
    + tdZero(scf.edu_six_tax_amount)
    + '<td>' + (scf.edu_edu_pilot_code || '') + '</td>' + tdZero(scf.edu_edu_pilot_amount) + tdZero(scf.edu_paid) + td(scf.edu_final) + '</tr>'

    + '<tr><td>地方教育附加</td><td style="text-align:center">3</td>'
    + td(scf.local_edu_base) + tdZero(scf.local_edu_exempt_credit) + tdZero(scf.local_edu_vat_refund_deduct)
    + '<td class="num">' + ((scf.local_edu_rate || 0) * 100).toFixed(0) + '%</td>'
    + td(scf.local_edu_tax) + '<td>' + (scf.local_edu_reduction_code || '') + '</td>' + tdZero(scf.local_edu_reduction_amount)
    + '<td class="num">' + ((scf.local_edu_reduction_rate || 0) * 100).toFixed(0) + '%</td>'
    + tdZero(scf.local_edu_six_tax_amount)
    + '<td>' + (scf.local_edu_edu_pilot_code || '') + '</td>' + tdZero(scf.local_edu_edu_pilot_amount) + tdZero(scf.local_edu_paid) + td(scf.local_edu_final) + '</tr>'

    + '<tr style="background:#f0fdf4;font-weight:700"><td>合计</td><td style="text-align:center">4</td>'
    + '<td class="num">——</td><td class="num">——</td><td class="num">——</td><td class="num">——</td>'
    + td(scf.total_tax) + '<td>——</td>' + tdZero(scf.total_reduction)
    + '<td class="num">——</td>' + tdZero(scf.total_six_tax_reduction)
    + '<td>——</td>' + tdZero(scf.total_edu_pilot) + tdZero(scf.total_paid) + td(scf.total_final) + '</tr>'

    + '</tbody></table>';
}

// ==================== 减免税申报明细表 ====================
function renderReductionForm(data) {
  const r = (typeof data.form_reduction === 'string') ? JSON.parse(data.form_reduction) : (data.form_reduction || {});
  function td(v) { return '<td class="num">' + _fm0(v) + '</td>'; }

  let html = '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税减免税申报明细表</div>';

  // 一、减税项目
  html += '<div style="font-size:12px;font-weight:600;margin-bottom:4px">一、减税项目</div>';
  html += '<table class="vat-form-table"><colgroup><col style="width:40%"><col style="width:8%"><col style="width:12%"><col style="width:12%"><col style="width:14%"><col style="width:14%"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th>减税性质代码及名称</th><th>栏次</th><th>期初余额</th><th>本期发生额</th><th>本期应抵减税额</th><th>本期实际抵减税额</th><th>期末余额</th></tr>'
    + '<tr style="background:#e8edf5"><th></th><th style="text-align:center">栏次</th><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center;font-size:10px">3=1+2</th><th style="text-align:center;font-size:10px">4≤3</th><th style="text-align:center;font-size:10px">5=3-4</th></tr></thead>';

  const taxReductionItems = (r.tax_reduction_items || r.reduction_items || []);
  if (taxReductionItems.length === 0) {
    html += '<tbody><tr><td>合计</td><td style="text-align:center">1</td>' + td(r.tax_reduction_1_begin) + td(r.tax_reduction_1_occur) + td(r.tax_reduction_1_should) + td(r.tax_reduction_1_actual) + td(r.tax_reduction_1_end) + '</tr></tbody>';
  } else {
    html += '<tbody>';
    taxReductionItems.forEach((item, i) => {
      html += '<tr><td>' + escapeHtml(item.name || ('减税项目' + (i + 1))) + '</td><td style="text-align:center">' + (i + 1) + '</td>'
        + td(item.begin_balance) + td(item.current_amount) + td(item.should_reduce) + td(item.actual_reduce) + td(item.end_balance) + '</tr>';
    });
    html += '</tbody>';
  }
  html += '</table>';

  // 二、免税项目
  html += '<div style="font-size:12px;font-weight:600;margin:12px 0 4px 0">二、免税项目</div>';
  html += '<table class="vat-form-table"><colgroup><col style="width:30%"><col style="width:8%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:14%"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th>免税性质代码及名称</th><th>栏次</th><th>免征增值税项目销售额</th><th>免税销售额扣除项目本期实际扣除金额</th><th>扣除后免税销售额</th><th>免税销售额对应的进项税额</th><th>免税额</th></tr>'
    + '<tr style="background:#e8edf5"><th></th><th style="text-align:center">栏次</th><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center;font-size:10px">3=1-2</th><th style="text-align:center">4</th><th style="text-align:center">5</th></tr></thead><tbody>';

  const exemptItems = r.exempt_items || [];
  if (exemptItems.length === 0) {
    html += '<tr><td>合　计</td><td style="text-align:center">7</td>' + td(r.exempt_7_sales) + td(r.exempt_7_deduction) + td(r.exempt_7_after) + td(r.exempt_7_input_tax) + td(r.exempt_7_amount) + '</tr>'
      + '<tr><td>出口免税</td><td style="text-align:center">8</td>' + td(r.exempt_8_sales) + '<td class="num" style="color:#d1d5db">——</td><td class="num" style="color:#d1d5db">——</td><td class="num" style="color:#d1d5db">——</td><td class="num">' + _fm0(r.exempt_8_amount) + '</td></tr>'
      + '<tr><td style="padding-left:16px">其中：跨境服务</td><td style="text-align:center">9</td>' + td(r.exempt_9_sales) + '<td class="num" style="color:#d1d5db">——</td><td class="num" style="color:#d1d5db">——</td><td class="num" style="color:#d1d5db">——</td><td class="num">' + _fm0(r.exempt_9_amount) + '</td></tr>';
  } else {
    exemptItems.forEach((item, i) => {
      html += '<tr><td>' + escapeHtml(item.name || '') + '</td><td style="text-align:center">' + (i + 7) + '</td>'
        + td(item.exempt_sales) + td(item.deduction_amount) + td(item.after_deduction) + td(item.input_tax) + td(item.exempt_amount) + '</tr>';
    });
  }
  html += '</tbody></table>';

  return html;
}
