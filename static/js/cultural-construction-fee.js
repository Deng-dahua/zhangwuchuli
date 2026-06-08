// ==================== 文化事业建设费申报页面 ====================
// 参照增值税模块（vat-declaration.js）架构完整复刻
var ccfDeclarations = [];
var ccfSelectedId = null;
var ccfActivePage = 'main';
var ccfFilterPeriod = '';
var ccfInlineDisplayId = null;
var ccfCurrentData = null;

function safeJSON(val, fallback) {
  if (typeof val !== 'string') return val || fallback;
  try { return JSON.parse(val); } catch (e) { console.warn('JSON parse failed:', e); return fallback; }
}

// 页签定义
const CCF_PAGES = [
  { id: 'main', label: '主表' },
  { id: 'deduction', label: '应税服务扣除项目清单' },
];

// 主表行定义（19 行，对应 PDF 模板）
const CCF_ROWS = [
  { key: 'row1_taxable_income',              label: '应征收入',                        calc: null },
  { key: 'row2_tax_exempt_income',           label: '免征收入',                        calc: null },
  { key: 'row3_deduction_beginning',         label: '减除项目期初金额',                 calc: null },
  { key: 'row4_deduction_current_period',    label: '减除项目本期发生额',               calc: null },
  { key: 'row5_taxable_income_deduction',    label: '应征收入减除额',                   calc: null },
  { key: 'row6_tax_exempt_deduction',        label: '免征收入减除额',                   calc: null },
  { key: 'row7_deduction_ending_balance',     label: '减除项目期末余额',                 calc: '3+4-5-6' },
  { key: 'row8_taxable_sales',               label: '计费销售额',                       calc: '1-5' },
  { key: 'row9_fee_rate',                    label: '费率',                            calc: null },
  { key: 'row10_payable_fee',                label: '应缴费额',                        calc: '8×9' },
  { key: 'row11_unpaid_beginning',           label: '期初未缴费额',                     calc: null },
  { key: 'row12_paid_current_period',         label: '本期已缴费额',                     calc: '13+14+15' },
  { key: 'row13_prepaid',                    label: '其中：本期预缴费额',               calc: null },
  { key: 'row14_paid_last_period',           label: '本期缴纳上期费额',                 calc: null },
  { key: 'row15_paid_arrears',               label: '本期缴纳欠费额',                   calc: null },
  { key: 'row16_unpaid_ending',              label: '期末未缴费额',                     calc: '10+11-12' },
  { key: 'row17_arrears',                    label: '其中：欠缴费额',                   calc: '11-14-15' },
  { key: 'row18_fill_refund',                label: '本期应补（退）费额',               calc: '10-13' },
  { key: 'row19_inspected_supplement',       label: '本期检查已补缴费额',               calc: null },
];

// ==================== 期间步进 ====================

async function stepCCFPeriod(type, delta) {
  const ySel = document.getElementById('ccf-detail-year');
  const mSel = document.getElementById('ccf-detail-month');
  let currentYear, currentMonth;

  if (ySel && mSel && ySel.value && mSel.value) {
    currentYear = parseInt(ySel.value);
    currentMonth = parseInt(mSel.value);
  } else {
    const current = ccfDeclarations.find(function(d) { return d.id === ccfSelectedId; });
    if (!current) { toast('请先选择申报表', 'info'); return; }
    var parts = (current.period || '').split('-');
    currentYear = parseInt(parts[0]); currentMonth = parseInt(parts[1]);
    if (!currentYear || !currentMonth) return;
  }

  if (type === 'year') {
    currentYear += delta;
  } else {
    currentMonth += delta;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  }
  var targetYear = String(currentYear);
  var targetMonth = String(currentMonth).padStart(2, '0');
  var targetPeriod = targetYear + '-' + targetMonth;

  // 更新 UI
  var ySel2 = document.getElementById('ccf-detail-year');
  var mSel2 = document.getElementById('ccf-detail-month');
  if (ySel2) {
    if (!ySel2.querySelector('option[value="' + targetYear + '"]')) {
      ySel2.appendChild(new Option(targetYear + '年', targetYear));
    }
    ySel2.value = targetYear;
  }
  if (mSel2) {
    if (!mSel2.querySelector('option[value="' + targetMonth + '"]')) {
      mSel2.appendChild(new Option(targetMonth + '月', targetMonth));
    }
    mSel2.value = targetMonth;
  }

  // 缓存查找
  var found = ccfDeclarations.find(function(d) { return d.period === targetPeriod; });
  if (found) { openCCFDetailInline(found.id); return; }

  // 后端查找
  try {
    var list = await api('/api/cultural-construction-fee/declarations?period=' + encodeURIComponent(targetPeriod));
    if (list && list.items && list.items.length > 0) {
      var item = list.items[0];
      var idx = ccfDeclarations.findIndex(function(d) { return d.period === targetPeriod; });
      if (idx < 0) ccfDeclarations.push(item);
      openCCFDetailInline(item.id);
      return;
    }
  } catch (e) { /* ignore */ }

  // 空状态
  renderCCFPeriodEmpty(targetPeriod);
}

function onCCFDetailPeriodChange() {
  var ySel = document.getElementById('ccf-detail-year');
  var mSel = document.getElementById('ccf-detail-month');
  if (!ySel || !mSel) return;
  var period = ySel.value + '-' + mSel.value;
  var found = ccfDeclarations.find(function(d) { return d.period === period; });
  if (found) { openCCFDetailInline(found.id); }
  else { renderCCFPeriodEmpty(period); }
}

function renderCCFPeriodEmpty(period) {
  var container = document.getElementById('ccf-forms-inline');
  if (!container) return;
  var parts = period.split('-');
  var y = parts[0] || '';
  var m = parts[1] || '';
  var currentYear = new Date().getFullYear();
  var yearSet = new Set();
  (ccfDeclarations || []).forEach(function(d) {
    var yy = (d.period || '').split('-')[0];
    if (yy) yearSet.add(yy);
  });
  for (var yy = currentYear - 3; yy <= currentYear + 3; yy++) yearSet.add(String(yy));
  var years = Array.from(yearSet).sort();
  var yearOpts = '';
  years.forEach(function(yy) {
    yearOpts += '<option value="' + yy + '" ' + (yy === y ? 'selected>' : '>') + yy + '年</option>';
  });
  var monthOpts = '';
  for (var mo = 1; mo <= 12; mo++) {
    var mv = String(mo).padStart(2, '0');
    monthOpts += '<option value="' + mv + '" ' + (mv === m ? 'selected>' : '>') + mv + '月</option>';
  }
  container.style.display = 'block';
  container.innerHTML = renderCCFToolbar(yearOpts, monthOpts)
    + '<div style="text-align:center;padding:40px 20px;color:#6b7280">'
    + '<div style="font-size:48px;margin-bottom:12px">📭</div>'
    + '<div style="font-size:15px;font-weight:600;margin-bottom:4px">该期间（' + period + '）暂无申报表</div>'
    + '<div style="font-size:13px;margin-bottom:16px">请点击下方按钮创建，或选择其他期间查看</div>'
    + '<button class="btn btn-primary" onclick="showCCFCreateModal(\'' + period + '\')" style="font-size:13px">+ 创建「' + period + '」申报表</button>'
    + '</div>';
}

// ==================== 主渲染 ====================

async function renderCulturalConstructionFee(container) {
  ccfInlineDisplayId = null;
  var el = container || document.getElementById('page-cultural-construction-fee') || document.getElementById('content-area');
  el.innerHTML = '<div id="ccf-stats-row" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px"></div>'
    + '<div id="ccf-forms-inline" style="display:none;margin-top:20px;background:#fff;border:1px solid var(--gray-200);border-radius:12px;padding:20px"></div>'
    + '<div id="ccf-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeCCFModal()"><div class="modal modal-lg" id="ccf-modal-inner"></div></div>';
  await loadCCFDeclarationList();
}

// ==================== 列表加载 ====================

async function loadCCFDeclarationList() {
  try {
    var url = '/api/cultural-construction-fee/declarations';
    if (ccfFilterPeriod) url += '?period=' + encodeURIComponent(ccfFilterPeriod);
    var resp = await api(url);
    ccfDeclarations = resp.items || [];
    ccfDeclarations.sort(function(a, b) { return (a.period || '').localeCompare(b.period || ''); });
  } catch (e) { ccfDeclarations = []; handleError(e, '加载申报表'); }

  renderCCFStats();

  if (ccfDeclarations.length === 0) {
    var now = new Date();
    var defaultPeriod = ccfFilterPeriod || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'));
    renderCCFPeriodEmpty(defaultPeriod);
    return;
  }

  var target = ccfSelectedId ? ccfDeclarations.find(function(d) { return d.id === ccfSelectedId; }) : null;
  var first = target || ccfDeclarations[0];
  ccfSelectedId = first.id;
  ccfActivePage = 'main';
  try {
    var data = await api('/api/cultural-construction-fee/declarations/' + first.id);
    var idx = ccfDeclarations.findIndex(function(d) { return d.id === first.id; });
    if (idx >= 0) ccfDeclarations[idx] = data;
    renderCCFTemplateViewInline(data);
  } catch (e) {
    console.error('加载申报表详情失败:', e);
  }
  renderCCFStats();
}

// ==================== 统计卡片 ====================

function renderCCFStats() {
  var el = document.getElementById('ccf-stats-row'); if (!el) return;
  var main = {};
  if (ccfCurrentData) {
    try { main = safeJSON(ccfCurrentData.form_main, {}); } catch (e) { /* skip */ }
  }
  var taxableIncome = main.row1_taxable_income_current || 0;
  var payableFee = main.row10_payable_fee_current || 0;
  var fillRefund = main.row18_fill_refund_current || 0;

  function card(label, value, color) {
    var c = color || '#1a56db';
    return '<div class="stat-card"><div class="stat-label">' + label + '</div><div class="stat-value" style="color:' + c + '">' + fmt(value) + '</div></div>';
  }

  el.innerHTML = card('应征收入', taxableIncome, '#0f766e')
    + card('应缴费额', payableFee, '#d97706')
    + card('应补(退)费额', fillRefund, '#dc2626');
}

// ==================== 内联展示 ====================

async function openCCFDetailInline(id) {
  ccfSelectedId = id;
  ccfActivePage = 'main';
  try {
    var data = await api('/api/cultural-construction-fee/declarations/' + id);
    var idx = ccfDeclarations.findIndex(function(d) { return d.id === id; });
    if (idx >= 0) ccfDeclarations[idx] = data;
    renderCCFTemplateViewInline(data);
    renderCCFStats();
  } catch (e) {
    toast('加载申报表失败: ' + (e.message || e), 'error');
  }
}

function renderCCFTemplateViewInline(data) {
  var container = document.getElementById('ccf-forms-inline');
  if (!container) return;
  container.style.display = 'block';
  ccfCurrentData = data;

  var main = safeJSON(data.form_main, {});

  // 年份范围
  var currentYear = new Date().getFullYear();
  var yearSet = new Set();
  (ccfDeclarations || []).forEach(function(d) {
    var y = (d.period || '').split('-')[0];
    if (y) yearSet.add(y);
  });
  for (var y = currentYear - 3; y <= currentYear + 3; y++) yearSet.add(String(y));
  var years = Array.from(yearSet).sort();
  var periodYear = ((data.period || '').split('-')[0] || '');
  var periodMonth = ((data.period || '').split('-')[1] || '');

  var yearOpts = '';
  years.forEach(function(y) {
    yearOpts += '<option value="' + y + '" ' + (y === periodYear ? 'selected>' : '>') + y + '年</option>';
  });
  var monthOpts = '';
  for (var m = 1; m <= 12; m++) {
    var mv = String(m).padStart(2, '0');
    monthOpts += '<option value="' + mv + '" ' + (mv === periodMonth ? 'selected>' : '>') + mv + '月</option>';
  }

  // 工具栏 + 页签
  var html = renderCCFToolbar(yearOpts, monthOpts);

  html += '<div style="display:flex;gap:0;border-bottom:1px solid #e5e7eb;margin:12px 0 0 0;overflow-x:auto;background:#fff;border-radius:8px 8px 0 0">';
  CCF_PAGES.forEach(function(p) {
    html += '<div style="padding:10px 16px;font-size:13px;cursor:pointer;border-bottom:3px solid ' + (ccfActivePage === p.id ? '#1a56db' : 'transparent')
      + ';color:' + (ccfActivePage === p.id ? '#1a56db' : '#6b7280') + ';font-weight:' + (ccfActivePage === p.id ? '600' : '400')
      + ';white-space:nowrap;transition:all 0.15s" onclick="switchCCFPageInline(\'' + p.id + '\',' + data.id + ')">' + p.label + '</div>';
  });
  html += '</div>';

  // 表单内容
  var formHtml = '';
  try {
    switch (ccfActivePage) {
      case 'main': formHtml = renderCCFMainForm(data, main); break;
      case 'deduction': formHtml = renderCCFDeductionForm(data); break;
    }
  } catch (e) { formHtml = '<div style="padding:20px;color:#ef4444">渲染错误: ' + e.message + '</div>'; }

  container.innerHTML = html + '<div style="overflow-x:auto;padding:12px 0">' + formHtml + '</div>';

  if (ccfInlineDisplayId !== data.id) {
    ccfInlineDisplayId = data.id;
    setTimeout(function() { container.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
  }
}

function switchCCFPageInline(pageId, id) {
  ccfActivePage = pageId;
  var data = ccfDeclarations.find(function(d) { return d.id === id; });
  if (data && data.form_main === undefined) {
    api('/api/cultural-construction-fee/declarations/' + id).then(function(fullData) {
      Object.assign(data, fullData);
      data.form_main = data.form_main || '{}';
      data.form_deduction = data.form_deduction || '{}';
      renderCCFTemplateViewInline(data);
    }).catch(function(e) {
      toast('切换页签失败: ' + (e.message || e), 'error');
    });
  } else if (data) {
    data.form_main = data.form_main || '{}';
    data.form_deduction = data.form_deduction || '{}';
    renderCCFTemplateViewInline(data);
  }
}

// ==================== 工具栏 ====================

function renderCCFToolbar(yearOpts, monthOpts) {
  var btnStyle = 'padding:4px 12px;font-size:12px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#374151;cursor:pointer;white-space:nowrap';
  var dangerBtnStyle = 'padding:4px 12px;font-size:12px;border-radius:6px;border:1px solid #fca5a5;background:#fff;color:#dc2626;cursor:pointer;white-space:nowrap';
  var primaryBtnStyle = 'padding:4px 12px;font-size:12px;border-radius:6px;border:1px solid #1a56db;background:#1a56db;color:#fff;cursor:pointer;white-space:nowrap';
  return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #e5e7eb;flex-wrap:wrap">'
    + '<div class="period-selector-bar" style="display:flex;gap:4px;align-items:center">'
    + '<div class="period-stepper">'
    + '<select id="ccf-detail-year" class="period-selector-year" onchange="onCCFDetailPeriodChange()">'
    + yearOpts + '</select>'
    + '<div class="stepper-arrows">'
    + '<button class="stepper-btn stepper-up" onclick="stepCCFPeriod(\'year\',1)" title="下一年">▲</button>'
    + '<button class="stepper-btn stepper-down" onclick="stepCCFPeriod(\'year\',-1)" title="上一年">▼</button>'
    + '</div></div>'
    + '<div class="period-stepper">'
    + '<select id="ccf-detail-month" class="period-selector-month" onchange="onCCFDetailPeriodChange()">'
    + monthOpts + '</select>'
    + '<div class="stepper-arrows">'
    + '<button class="stepper-btn stepper-up" onclick="stepCCFPeriod(\'month\',1)" title="下一月">▲</button>'
    + '<button class="stepper-btn stepper-down" onclick="stepCCFPeriod(\'month\',-1)" title="上一月">▼</button>'
    + '</div></div></div>'
    + '<button style="' + btnStyle + '" onclick="onCCFDetailPeriodChange()" title="按所选期间查询">查询</button>'
    + '<button style="' + btnStyle + '" onclick="ccfClearFilter()" title="清除筛选条件">清除</button>'
    + '<button style="' + btnStyle + '" onclick="showCCFEditModal()" title="编辑申报表基本信息">编辑</button>'
    + '<button style="' + primaryBtnStyle + '" onclick="ccfSaveCurrent()" title="保存当前申报表">保存</button>'
    + '<button style="' + btnStyle + '" onclick="ccfAutoCalculate()" title="自动计算各栏次">自动计算</button>'
    + '<button style="' + dangerBtnStyle + '" onclick="ccfDeleteCurrent()" title="删除当前申报表">删除报表</button>'
    + '</div>';
}

function ccfClearFilter() {
  ccfFilterPeriod = '';
  ccfCurrentData = null;
  loadCCFDeclarationList();
}

// ==================== 主表渲染 ====================

function renderCCFMainForm(data, main) {
  var h = '';

  // 表头
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px">';
  h += '<div style="font-size:15px;font-weight:700;text-align:center;flex:1">文化事业建设费申报表</div>';
  h += '<div style="font-size:12px;color:#6b7280;text-align:right">';
  h += '纳税人名称：' + escapeHtml(data.taxpayer_name || '') + '<br>';
  h += '税款所属期：' + escapeHtml(data.period || '') + '<br>';
  h += '填表日期：' + escapeHtml(data.fill_date || '') + '&nbsp;&nbsp;状态：<span class="badge badge-info">' + escapeHtml(data.status || '草稿') + '</span>';
  h += '</div></div>';

  // 主表 19 行 × 4 列（项目/栏次/本月数/本年累计）
  h += '<table class="vat-form-table" style="font-size:12px;width:100%">';
  h += '<colgroup><col style="width:38%"><col style="width:7%"><col style="width:27.5%"><col style="width:27.5%"></colgroup>';
  h += '<thead>';
  h += '<tr style="background:#d9e2f3">';
  h += '<th style="padding:6px 8px">项　　目</th>';
  h += '<th style="padding:6px 8px;text-align:center">栏次</th>';
  h += '<th style="padding:6px 8px;text-align:center">本月（期）数</th>';
  h += '<th style="padding:6px 8px;text-align:center">本年累计</th>';
  h += '</tr>';
  h += '</thead>';
  h += '<tbody>';

  for (var i = 0; i < CCF_ROWS.length; i++) {
    var row = CCF_ROWS[i];
    var rn = i + 1;
    var bg = i % 2 === 1 ? 'background:#f9fafb' : '';
    var isCalc = !!row.calc;

    h += '<tr style="' + bg + '">';
    // 项目
    h += '<td style="padding:5px 8px;font-size:11px">';
    h += row.label;
    if (row.calc) h += ' <span style="color:#9ca3af;font-size:10px">（' + row.calc + '）</span>';
    h += '</td>';
    // 栏次
    h += '<td style="padding:5px 4px;text-align:center;font-size:11px;font-weight:600">' + rn + '</td>';
    // 本月数
    var curVal = _ccfGetVal(main, row.key + '_current');
    h += '<td style="padding:4px 6px;text-align:right">';
    h += '<input type="number" step="0.01" id="ccf-cur-' + row.key + '" value="' + curVal + '" style="width:100%;text-align:right;font-size:11px;border:1px solid #e5e7eb;border-radius:4px;padding:4px 6px;' + (isCalc ? 'background:#f0f9ff;font-weight:600' : '') + '" onchange="ccfOnMainChange()">';
    h += '</td>';
    // 本年累计
    var ytdVal = _ccfGetVal(main, row.key + '_ytd');
    h += '<td style="padding:4px 6px;text-align:right">';
    h += '<input type="number" step="0.01" id="ccf-ytd-' + row.key + '" value="' + ytdVal + '" style="width:100%;text-align:right;font-size:11px;border:1px solid #e5e7eb;border-radius:4px;padding:4px 6px;' + (isCalc ? 'background:#f0f9ff;font-weight:600' : '') + '" onchange="ccfOnMainChange()">';
    h += '</td>';
    h += '</tr>';
  }

  h += '</tbody></table>';

  // 底部：声明
  h += '<div style="margin-top:12px;font-size:11px;color:#6b7280;line-height:1.8">';
  h += '声明：此表是根据国家文化事业建设费有关规定填报的，是真实、可靠、完整的。<br>';
  h += '经办人（签章）________　　　　填表人（签章）________　　　　纳税人（签章）________';
  h += '</div>';

  return h;
}

function _ccfGetVal(main, key) {
  var v = parseFloat(main[key] || 0);
  return isNaN(v) ? '0.00' : v.toFixed(2);
}

// ==================== 扣除项目清单渲染 ====================

function renderCCFDeductionForm(data) {
  var deductions = data.deductions || [];
  var h = '';

  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
  h += '<h3 style="margin:0;font-size:14px">应税服务扣除项目清单</h3>';
  h += '<button class="btn btn-sm btn-success" onclick="ccfAddDeductionRow()">＋ 添加扣除项目</button>';
  h += '</div>';

  h += '<table class="vat-form-table" style="font-size:12px;width:100%">';
  h += '<colgroup><col><col><col><col><col><col><col></colgroup>';
  h += '<thead>';
  h += '<tr style="background:#d9e2f3">';
  h += '<th style="padding:5px 6px">序号</th>';
  h += '<th style="padding:5px 6px">开票方纳税人识别号</th>';
  h += '<th style="padding:5px 6px">开票方单位名称</th>';
  h += '<th style="padding:5px 6px">服务项目名称</th>';
  h += '<th style="padding:5px 6px">凭证种类</th>';
  h += '<th style="padding:5px 6px">凭证号码</th>';
  h += '<th style="padding:5px 6px">金额</th>';
  h += '</tr>';
  h += '</thead>';
  h += '<tbody>';

  var total = 0;
  if (deductions.length === 0) {
    h += '<tr><td colspan="7" style="text-align:center;padding:20px;color:#9ca3af">暂无扣除项目</td></tr>';
  } else {
    for (var i = 0; i < deductions.length; i++) {
      var d = deductions[i];
      var amt = parseFloat(d.amount || 0);
      total += amt;
      h += '<tr style="' + (i % 2 === 1 ? 'background:#f9fafb' : '') + '">';
      h += '<td style="text-align:center;padding:4px">' + d.seq + '</td>';
      h += '<td style="padding:2px"><input type="text" value="' + escapeHtml(d.invoice_supplier_tax_no || '') + '" data-seq="' + d.seq + '" data-field="invoice_supplier_tax_no" class="ccf-ded-field" style="width:100%;font-size:11px;border:1px solid #e5e7eb;border-radius:4px;padding:3px 4px"></td>';
      h += '<td style="padding:2px"><input type="text" value="' + escapeHtml(d.invoice_supplier_name || '') + '" data-seq="' + d.seq + '" data-field="invoice_supplier_name" class="ccf-ded-field" style="width:100%;font-size:11px;border:1px solid #e5e7eb;border-radius:4px;padding:3px 4px"></td>';
      h += '<td style="padding:2px"><input type="text" value="' + escapeHtml(d.service_item_name || '') + '" data-seq="' + d.seq + '" data-field="service_item_name" class="ccf-ded-field" style="width:100%;font-size:11px;border:1px solid #e5e7eb;border-radius:4px;padding:3px 4px"></td>';
      h += '<td style="padding:2px"><input type="text" value="' + escapeHtml(d.voucher_type || '') + '" data-seq="' + d.seq + '" data-field="voucher_type" class="ccf-ded-field" style="width:100%;font-size:11px;border:1px solid #e5e7eb;border-radius:4px;padding:3px 4px"></td>';
      h += '<td style="padding:2px"><input type="text" value="' + escapeHtml(d.voucher_no || '') + '" data-seq="' + d.seq + '" data-field="voucher_no" class="ccf-ded-field" style="width:100%;font-size:11px;border:1px solid #e5e7eb;border-radius:4px;padding:3px 4px"></td>';
      h += '<td style="padding:2px"><input type="number" step="0.01" value="' + amt.toFixed(2) + '" data-seq="' + d.seq + '" data-field="amount" class="ccf-ded-field" style="width:100%;text-align:right;font-size:11px;border:1px solid #e5e7eb;border-radius:4px;padding:3px 4px"></td>';
      h += '</tr>';
    }
  }

  h += '</tbody>';
  h += '<tfoot>';
  h += '<tr style="background:#f0f9ff;font-weight:700">';
  h += '<td colspan="6" style="text-align:right;padding:6px 8px">合　　计</td>';
  h += '<td style="text-align:right;padding:6px 8px">' + total.toFixed(2) + '</td>';
  h += '</tr>';
  h += '</tfoot>';
  h += '</table>';

  return h;
}

// ==================== 主表输入 → 实时计算 ====================

function ccfOnMainChange() {
  function g(id) { var el = document.getElementById(id); return el ? parseFloat(el.value || 0) : 0; }
  function s(id, v) { var el = document.getElementById(id); if (el) el.value = v.toFixed(2); }

  // 栏次7 = 3+4-5-6
  s('ccf-cur-row7_deduction_ending_balance', g('ccf-cur-row3_deduction_beginning') + g('ccf-cur-row4_deduction_current_period') - g('ccf-cur-row5_taxable_income_deduction') - g('ccf-cur-row6_tax_exempt_deduction'));
  // 栏次8 = 1-5
  s('ccf-cur-row8_taxable_sales', g('ccf-cur-row1_taxable_income') - g('ccf-cur-row5_taxable_income_deduction'));
  // 栏次10 = 8×9
  var rate = g('ccf-cur-row9_fee_rate') || 0.03;
  s('ccf-cur-row10_payable_fee', g('ccf-cur-row8_taxable_sales') * rate);
  // 栏次12 = 13+14+15
  s('ccf-cur-row12_paid_current_period', g('ccf-cur-row13_prepaid') + g('ccf-cur-row14_paid_last_period') + g('ccf-cur-row15_paid_arrears'));
  // 栏次16 = 10+11-12
  s('ccf-cur-row16_unpaid_ending', g('ccf-cur-row10_payable_fee') + g('ccf-cur-row11_unpaid_beginning') - g('ccf-cur-row12_paid_current_period'));
  // 栏次17 = 11-14-15
  s('ccf-cur-row17_arrears', g('ccf-cur-row11_unpaid_beginning') - g('ccf-cur-row14_paid_last_period') - g('ccf-cur-row15_paid_arrears'));
  // 栏次18 = 10-13
  s('ccf-cur-row18_fill_refund', g('ccf-cur-row10_payable_fee') - g('ccf-cur-row13_prepaid'));
}

// ==================== 扣除项目操作 ====================

function ccfSyncDeductionsFromDOM() {
  if (!ccfCurrentData) return;
  ccfCurrentData.deductions = ccfCurrentData.deductions || [];
  var fields = document.querySelectorAll('.ccf-ded-field');
  fields.forEach(function(inp) {
    var seq = parseInt(inp.getAttribute('data-seq'));
    var field = inp.getAttribute('data-field');
    var d = ccfCurrentData.deductions.find(function(x) { return x.seq === seq; });
    if (!d) return;
    if (field === 'amount') {
      d[field] = parseFloat(inp.value || 0);
    } else {
      d[field] = inp.value;
    }
  });
}

function ccfAddDeductionRow() {
  if (!ccfCurrentData) { toast('请先选择申报表', 'warning'); return; }
  ccfCurrentData.deductions = ccfCurrentData.deductions || [];
  var seq = ccfCurrentData.deductions.length + 1;
  ccfCurrentData.deductions.push({
    seq: seq,
    invoice_supplier_tax_no: '',
    invoice_supplier_name: '',
    service_item_name: '',
    voucher_type: '',
    voucher_no: '',
    amount: 0
  });
  ccfActivePage = 'deduction';
  renderCCFTemplateViewInline(ccfCurrentData);
}

// ==================== 保存 / 删除 ====================

async function ccfSaveCurrent() {
  if (!ccfCurrentData) { toast('没有可保存的申报表', 'warning'); return; }

  // 同步扣除项目
  ccfSyncDeductionsFromDOM();

  // 收集主表数据
  var mainData = {};
  CCF_ROWS.forEach(function(row) {
    var curEl = document.getElementById('ccf-cur-' + row.key);
    var ytdEl = document.getElementById('ccf-ytd-' + row.key);
    mainData[row.key + '_current'] = curEl ? parseFloat(curEl.value || 0) : 0;
    mainData[row.key + '_ytd'] = ytdEl ? parseFloat(ytdEl.value || 0) : 0;
  });

  var payload = {
    period: ccfCurrentData.period,
    taxpayer_name: ccfCurrentData.taxpayer_name || (typeof currentCompanyName !== 'undefined' ? currentCompanyName : ''),
    status: '已确认',
    form_main: mainData,
    form_deduction: {},
    deductions: ccfCurrentData.deductions || [],
  };
  // 同时填充 row 字段（兼容后端非 JSON 模式）
  CCF_ROWS.forEach(function(row) {
    payload[row.key + '_current'] = mainData[row.key + '_current'] || 0;
    payload[row.key + '_ytd'] = mainData[row.key + '_ytd'] || 0;
  });

  try {
    var result;
    if (ccfCurrentData.id) {
      result = await api('/api/cultural-construction-fee/declarations/' + ccfCurrentData.id, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      result = await api('/api/cultural-construction-fee/declarations', { method: 'POST', body: JSON.stringify(payload) });
      if (result.id) ccfCurrentData.id = result.id;
    }
    toast('保存成功');
    await loadCCFDeclarationList();
  } catch (e) { toast('保存失败：' + (e.message || e), 'error'); }
}

async function ccfDeleteCurrent() {
  if (!ccfCurrentData || !ccfCurrentData.id) {
    toast('没有可删除的申报表', 'warning');
    return;
  }
  if (!confirm('确定删除「' + ccfCurrentData.period + '」的申报表吗？')) return;
  try {
    await api('/api/cultural-construction-fee/declarations/' + ccfCurrentData.id, { method: 'DELETE' });
    toast('删除成功');
    ccfCurrentData = null;
    ccfSelectedId = null;
    await loadCCFDeclarationList();
  } catch (e) { toast('删除失败：' + (e.message || e), 'error'); }
}

// ==================== 自动计算 ====================

async function ccfAutoCalculate() {
  if (!ccfCurrentData || !ccfCurrentData.id) {
    toast('请先保存申报表', 'warning');
    return;
  }
  try {
    await api('/api/cultural-construction-fee/declarations/' + ccfCurrentData.id + '/auto-calculate', { method: 'POST' });
    toast('自动计算完成');
    // 重新加载
    var data = await api('/api/cultural-construction-fee/declarations/' + ccfCurrentData.id);
    var idx = ccfDeclarations.findIndex(function(d) { return d.id === ccfCurrentData.id; });
    if (idx >= 0) ccfDeclarations[idx] = data;
    ccfCurrentData = data;
    renderCCFTemplateViewInline(data);
  } catch (e) { toast('自动计算失败：' + (e.message || e), 'error'); }
}

// ==================== 模态窗（新建/编辑） ====================

function showCCFCreateModal(period) {
  var now = new Date();
  var defaultPeriod = period || ccfFilterPeriod || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'));
  var defaultTaxpayerName = (typeof currentCompanyName !== 'undefined' && currentCompanyName) ? currentCompanyName : '';

  document.getElementById('ccf-modal-inner').innerHTML = '<h2 style="margin:0 0 20px 0;font-size:18px">＋ 新建文化事业建设费申报表</h2>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">税款所属期 <span style="color:red">*</span></label>'
    + '<input type="month" class="form-control" id="ccf-modal-period" value="' + defaultPeriod + '" style="width:100%"></div>'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">纳税人名称</label>'
    + '<input type="text" class="form-control" id="ccf-modal-taxpayer" value="' + escapeHtml(defaultTaxpayerName) + '" style="width:100%"></div>'
    + '</div>'
    + '<div class="form-group" style="margin-top:10px"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">备注</label>'
    + '<input type="text" class="form-control" id="ccf-modal-note" style="width:100%" placeholder="可选"></div>'
    + '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="btn btn-outline" onclick="closeCCFModal()">取消</button>'
    + '<button class="btn btn-primary" onclick="createCCFDeclaration()">✅ 创建申报表</button></div>';
  document.getElementById('ccf-modal').style.display = 'flex';
}

function closeCCFModal() { document.getElementById('ccf-modal').style.display = 'none'; }

async function createCCFDeclaration() {
  var period = document.getElementById('ccf-modal-period').value;
  var taxpayer = document.getElementById('ccf-modal-taxpayer').value;
  var note = document.getElementById('ccf-modal-note').value;
  if (!period) { toast('请选择税款所属期', 'warning'); return; }
  try {
    var resp = await api('/api/cultural-construction-fee/declarations', {
      method: 'POST',
      body: JSON.stringify({ period: period, taxpayer_name: taxpayer, note: note }),
    });
    closeCCFModal();
    toast('创建成功');
    await loadCCFDeclarationList();
    openCCFDetailInline(resp.id);
  } catch (e) { handleError(e, '创建申报表'); }
}

function showCCFEditModal() {
  if (!ccfCurrentData || !ccfCurrentData.id) { toast('请先选择申报表', 'warning'); return; }
  var d = ccfCurrentData;
  document.getElementById('ccf-modal-inner').innerHTML = '<h2 style="margin:0 0 20px 0;font-size:18px">✏️ 编辑申报表 — ' + escapeHtml(d.period) + '</h2>'
    + '<div class="form-group"><label style="display:block;margin-bottom:4px;font-size:13px">税款所属期</label>'
    + '<input type="month" class="form-control" id="ccf-edit-period" value="' + d.period + '" style="width:100%"></div>'
    + '<div class="form-group" style="margin-top:10px"><label style="display:block;margin-bottom:4px;font-size:13px">纳税人名称</label>'
    + '<input type="text" class="form-control" id="ccf-edit-taxpayer" value="' + escapeHtml(d.taxpayer_name || '') + '" style="width:100%"></div>'
    + '<div class="form-group" style="margin-top:10px"><label style="display:block;margin-bottom:4px;font-size:13px">状态</label>'
    + '<select class="form-control" id="ccf-edit-status" style="width:100%">'
    + '<option value="草稿"' + (d.status === '草稿' ? ' selected' : '') + '>草稿</option>'
    + '<option value="已确认"' + (d.status === '已确认' ? ' selected' : '') + '>已确认</option>'
    + '<option value="已申报"' + (d.status === '已申报' ? ' selected' : '') + '>已申报</option>'
    + '</select></div>'
    + '<div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="btn btn-outline" onclick="closeCCFModal()">取消</button>'
    + '<button class="btn btn-primary" onclick="updateCCFDeclaration()">✅ 保存修改</button></div>';
  document.getElementById('ccf-modal').style.display = 'flex';
}

async function updateCCFDeclaration() {
  var period = document.getElementById('ccf-edit-period').value;
  var taxpayer = document.getElementById('ccf-edit-taxpayer').value;
  var status = document.getElementById('ccf-edit-status').value;
  try {
    await api('/api/cultural-construction-fee/declarations/' + ccfCurrentData.id, {
      method: 'PUT',
      body: JSON.stringify({ period: period, taxpayer_name: taxpayer, status: status }),
    });
    closeCCFModal();
    await loadCCFDeclarationList();
    openCCFDetailInline(ccfCurrentData.id);
  } catch (e) { handleError(e, '更新申报表'); }
}
