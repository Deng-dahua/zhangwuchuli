// ==================== 增值税申报页面 ====================
// 按官方《增值税及附加税费申报表（一般纳税人适用）》009-1-1.xls 模板渲染
var vatDeclarations = [];
var vatSelectedId = null;
var vatActivePage = 'main'; // 默认主表
var vatFilterPeriod = '';
var vatInlineDisplayId = null;
var vatCurrentData = null;

function safeJSON(val, fallback) {
  if (typeof val !== 'string') return val || fallback;
  try { return JSON.parse(val); } catch (e) { console.warn('JSON parse failed:', e); return fallback; }
}

const VAT_PAGES = [
  { id: 'main', label: '增值税主表' },
  { id: 'schedule1', label: '附表一 — 销售明细' },
  { id: 'schedule2', label: '附表二 — 进项明细' },
  { id: 'schedule3', label: '附表三 — 扣除项目' },
  { id: 'schedule4', label: '附表四 — 税额抵减' },
  { id: 'schedule5', label: '附表五 — 附加税费' },
  { id: 'reduction', label: '减免税申报明细表' },
];

async function stepVATPeriod(type, delta) {
  // 获取当前显示的年月（优先从页面 select 控件读，其次从缓存的 declaration）
  const ySel = document.getElementById('vat-detail-year');
  const mSel = document.getElementById('vat-detail-month');
  let currentYear, currentMonth;

  if (ySel && mSel && ySel.value && mSel.value) {
    currentYear = parseInt(ySel.value);
    currentMonth = parseInt(mSel.value);
  } else {
    const current = vatDeclarations.find(d => d.id === vatSelectedId);
    if (!current) { showToast('请先选择申报表', 'info'); return; }
    [currentYear, currentMonth] = (current.period || '').split('-').map(Number);
    if (!currentYear || !currentMonth) return;
  }

  if (type === 'year') {
    currentYear += delta;
  } else {
    currentMonth += delta;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  }
  const targetYear = String(currentYear);
  const targetMonth = String(currentMonth).padStart(2, '0');
  const targetPeriod = targetYear + '-' + targetMonth;

  // 无论有没有申报表，先更新显示的年/月（数字必须跳动）
  const ySel2 = document.getElementById('vat-detail-year');
  const mSel2 = document.getElementById('vat-detail-month');
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

  // 先在本页缓存里查找
  const found = vatDeclarations.find(d => d.period === targetPeriod);
  if (found) {
    openVATDetailInline(found.id);
    return;
  }

  // 缓存里没有，尝试从后端加载
  try {
    const list = await api('/api/vat/declarations?period=' + encodeURIComponent(targetPeriod));
    if (list && list.length > 0) {
      const idx = vatDeclarations.findIndex(d => d.period === targetPeriod);
      if (idx < 0) vatDeclarations.push(list[0]);
      openVATDetailInline(list[0].id);
      return;
    }
  } catch (e) { /* ignore */ }

  // 至此确认无申报表，数字已跳，渲染空状态提示（避免残留旧数据）
  renderVATPeriodEmpty(targetPeriod);
}

// 用户直接在下拉框选择年期/月份时触发
function onVATDetailPeriodChange() {
  const ySel = document.getElementById('vat-detail-year');
  const mSel = document.getElementById('vat-detail-month');
  if (!ySel || !mSel) return;
  const period = ySel.value + '-' + mSel.value;
  const found = vatDeclarations.find(d => d.period === period);
  if (found) {
    openVATDetailInline(found.id);
  } else {
    // 无申报表时渲染空状态，避免残留旧数据
    renderVATPeriodEmpty(period);
  }
}

// 渲染"该期间暂无申报表"的空状态，保留期间选择器
function renderVATPeriodEmpty(period) {
  const container = document.getElementById('vat-forms-inline');
  if (!container) return;
  const [y, m] = period.split('-');
  const _periodYear = y || '';
  const _periodMonth = m || '';
  const currentYear = new Date().getFullYear();
  const yearSet = new Set();
  (vatDeclarations || []).forEach(d => {
    const [yy] = (d.period || '').split('-');
    if (yy) yearSet.add(yy);
  });
  for (let yy = currentYear - 3; yy <= currentYear + 3; yy++) yearSet.add(String(yy));
  const years = [...yearSet].sort();
  let yearOpts = '';
  years.forEach(yy => {
    yearOpts += '<option value="' + yy + '" ' + (yy === _periodYear ? 'selected>' : '>') + yy + '年</option>';
  });
  let monthOpts = '';
  for (let mo = 1; mo <= 12; mo++) {
    const mv = String(mo).padStart(2, '0');
    monthOpts += '<option value="' + mv + '" ' + (mv === _periodMonth ? 'selected>' : '>') + mv + '月</option>';
  }
  container.style.display = 'block';
  container.innerHTML = renderVATToolbar(yearOpts, monthOpts)
    + '<div style="text-align:center;padding:40px 20px;color:#6b7280">'
    + '<div style="font-size:48px;margin-bottom:12px">📭</div>'
    + '<div style="font-size:15px;font-weight:600;margin-bottom:4px">该期间（' + period + '）暂无申报表</div>'
    + '<div style="font-size:13px;margin-bottom:16px">请点击下方按钮创建，或选择其他期间查看</div>'
    + '<button class="btn btn-primary" onclick="showVATCreateModal(\'' + period + '\')" style="font-size:13px">+ 创建「' + period + '」申报表</button>'
    + '</div>';
}

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
async function loadVATDeclarationList(emptyPeriod) {
  try {
    let url = '/api/vat/declarations';
    if (vatFilterPeriod) url += '?period=' + encodeURIComponent(vatFilterPeriod);
    vatDeclarations = await api(url);
    // 按期次升序排列，确保导航顺序正确
    vatDeclarations.sort((a, b) => (a.period || '').localeCompare(b.period || ''));
  } catch (e) { vatDeclarations = []; handleError(e, '加载申报表'); }
  renderVATStats();
  // 自动展示选中或第一条申报数据
  const inlineEl = document.getElementById('vat-forms-inline');
  if (vatDeclarations.length === 0) {
    // 有筛选条件时显示该期间的空状态；否则显示当前月份空状态
    const now = new Date();
    const defaultPeriod = emptyPeriod || vatFilterPeriod || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'));
    renderVATPeriodEmpty(defaultPeriod);
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
  const el = document.getElementById('vat-stats-row'); if (!el) return;
  // 从当前选中的申报表取数据
  let main = {};
  let scf = {};
  if (vatCurrentData) {
    try {
      main = safeJSON(vatCurrentData.form_main, {});
    } catch (e) { /* skip */ }
    try {
      scf = safeJSON(vatCurrentData.form_surcharge, {});
    } catch (e) { /* skip */ }
  }
  // 销售额：从主表取不含税销售额（已修正为 amount，不是价税合计 total_amount）
  const salesRevenue = main.row1_sales || 0;
  const vatTax = main.row19_tax_payable || 0;
  const endCredit = main.row20_end_credit || 0;
  // 附加税费必须取"减免后实际应纳"值（city_final/edu_final/local_edu_final），
  // 不能用 city_tax 原值（那是减免前的），否则六税两费减征时金额会偏大一倍
  const cityTax = scf.city_final || scf.city_tax || main.row39_city_maintenance_tax || 0;
  const eduTax = scf.edu_final || scf.edu_tax || main.row40_education_surcharge || 0;
  const localEdu = scf.local_edu_final || scf.local_edu_tax || main.row41_local_education_surcharge || 0;
  // 附加税费合计（不含增值税本身，增值税另有独立卡片）
  const surchargeTotal = cityTax + eduTax + localEdu;

  function card(label, value, color) {
    var c = color || '#1a56db';
    return '<div class="stat-card"><div class="stat-label">' + label + '</div><div class="stat-value" style="color:' + c + '">' + fmt(value) + '</div></div>';
  }

  el.style.gridTemplateColumns = 'repeat(7, 1fr)';
  el.innerHTML = card('本期销售额', salesRevenue, '#0f766e')
    + card('应纳增值税', vatTax, '#d97706')
    + card('期末留抵税额', endCredit, '#059669')
    + card('城建税', cityTax, '#7c3aed')
    + card('教育费附加', eduTax, '#2563eb')
    + card('地方教育附加', localEdu, '#0891b2')
    + card('附加税费合计', surchargeTotal, '#dc2626');
}

// ==================== 新建/编辑 ====================
function showVATCreateModal(period) {
  const now = new Date();
  // 优先使用传入的期间，其次用全局过滤期间，最后取当前日期
  const defaultPeriod = period || vatFilterPeriod || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'));
  // 纳税人名称默认取顶格栏账套名称
  const defaultTaxpayerName = (typeof currentCompanyName !== 'undefined' && currentCompanyName) ? currentCompanyName : '';
  document.getElementById('vat-modal-inner').innerHTML = '<h2 style="margin:0 0 20px 0;font-size:18px">＋ 新建增值税申报表</h2>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">税款所属期 <span style="color:red">*</span></label>'
    + '<input type="month" class="form-control" id="vat-period" value="' + defaultPeriod + '" style="width:100%" onchange="vatFetchMicroCheck()"></div>'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">纳税人名称</label>'
    + '<input type="text" class="form-control" id="vat-taxpayer" value="' + escapeHtml(defaultTaxpayerName) + '" style="width:100%"></div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">'
    + '<div class="form-group"><label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">'
    + '<input type="checkbox" id="vat-micro"> 小型微利企业</label></div>'
    + '<div class="form-group"><label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">'
    + '<input type="checkbox" id="vat-six-tax"> 六税两费减征</label></div>'
    + '</div>'
    + '<div id="vat-micro-check-result" style="margin-top:8px;font-size:12px;line-height:1.6">'
    + '<div style="color:#6b7280;text-align:center;padding:8px">⏳ 正在校验小型微利企业标准...</div>'
    + '</div>'
    + '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="btn btn-outline" onclick="closeVATModal()">取消</button>'
    + '<button class="btn btn-primary" onclick="createVATDeclaration()">✅ 创建申报表</button></div>';
  document.getElementById('vat-modal').style.display = 'flex';
  // 自动拉取校验结果
  vatFetchMicroCheck();
}

// 拉取小型微利企业自动校验结果
async function vatFetchMicroCheck() {
  var periodEl = document.getElementById('vat-period');
  var resultEl = document.getElementById('vat-micro-check-result');
  if (!periodEl || !resultEl) return;
  var period = periodEl.value;
  if (!period) return;

  resultEl.innerHTML = '<div style="color:#6b7280;text-align:center;padding:8px">⏳ 正在校验...</div>';
  try {
    var resp = await api('/api/vat/check-micro-enterprise?period=' + encodeURIComponent(period));
    _renderMicroCheckResult(resp, resultEl);
  } catch(e) {
    resultEl.innerHTML = '<div style="color:#ef4444;padding:8px">❌ 校验失败：' + (e.message || '网络错误') + '</div>';
  }
}

// 渲染校验结果卡片
function _renderMicroCheckResult(v, el) {
  var allOk = v.all_ok;
  var statusColor = allOk ? '#059669' : '#dc2626';
  var statusIcon  = allOk ? '✅' : '❌';
  var statusText  = allOk ? '符合小型微利企业标准' : '不符合小型微利企业标准';

  function fmtWan(val) {
    if (typeof val !== 'number') return '—';
    return (val / 10000).toFixed(2) + '万';
  }

  function fmtCount(val) {
    if (typeof val !== 'number') return '—';
    return val + '人';
  }

  function badge(ok) { return ok ? '✅' : '❌'; }

  // 自动勾选复选框
  var microCB = document.getElementById('vat-micro');
  var sixTaxCB = document.getElementById('vat-six-tax');
  if (allOk) {
    if (microCB) microCB.checked = true;
    if (sixTaxCB) sixTaxCB.checked = true;
  }

  var html = '';
  // 判定结果条
  html += '<div style="background:' + statusColor + ';color:#fff;padding:6px 12px;border-radius:6px;font-weight:600;margin-bottom:8px">';
  html += statusIcon + ' ' + statusText;
  html += '</div>';

  // 三列指标卡片
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">';
  // 1. 应纳税所得额
  html += '<div style="background:#f9fafb;border:1px solid ' + (v.income_ok ? '#d1fae5' : '#fecaca') + ';border-radius:6px;padding:8px;text-align:center">';
  html += '<div style="font-size:11px;color:#6b7280;margin-bottom:2px">' + badge(v.income_ok) + ' 应纳税所得额</div>';
  html += '<div style="font-weight:700;font-size:15px;color:' + (v.income_ok ? '#059669' : '#dc2626') + '">' + fmtWan(v.net_profit) + '</div>';
  html += '<div style="font-size:10px;color:#9ca3af">标准 ≤300万</div>';
  html += '</div>';
  // 2. 从业人数
  html += '<div style="background:#f9fafb;border:1px solid ' + (v.employee_ok ? '#d1fae5' : '#fecaca') + ';border-radius:6px;padding:8px;text-align:center">';
  html += '<div style="font-size:11px;color:#6b7280;margin-bottom:2px">' + badge(v.employee_ok) + ' 从业人数</div>';
  html += '<div style="font-weight:700;font-size:15px;color:' + (v.employee_ok ? '#059669' : '#dc2626') + '">' + fmtCount(v.employee_count) + '</div>';
  html += '<div style="font-size:10px;color:#9ca3af">标准 ≤300人</div>';
  html += '</div>';
  // 3. 资产总额
  html += '<div style="background:#f9fafb;border:1px solid ' + (v.asset_ok ? '#d1fae5' : '#fecaca') + ';border-radius:6px;padding:8px;text-align:center">';
  html += '<div style="font-size:11px;color:#6b7280;margin-bottom:2px">' + badge(v.asset_ok) + ' 资产总额</div>';
  html += '<div style="font-weight:700;font-size:15px;color:' + (v.asset_ok ? '#059669' : '#dc2626') + '">' + fmtWan(v.total_assets) + '</div>';
  html += '<div style="font-size:10px;color:#9ca3af">标准 ≤5000万</div>';
  html += '</div>';
  html += '</div>';

  // 警告列表
  if (v.warnings && v.warnings.length > 0) {
    html += '<div style="margin-top:6px">';
    for (var i = 0; i < v.warnings.length; i++) {
      html += '<div style="font-size:11px;color:#dc2626;padding:2px 0">⚠️ ' + v.warnings[i] + '</div>';
    }
    html += '</div>';
  }

  html += '<div style="margin-top:6px;font-size:10px;color:#9ca3af;text-align:center">'
    + '数据来源：年度利润表（净利润）+ 年度工资记录（去重人数）+ 期末资产负债表（资产总计）<br>'
    + '法律依据：财政部 税务总局公告2023年第12号</div>';

  el.innerHTML = html;
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
    // 显示校验结果提醒
    if (resp.validation) {
      var v = resp.validation;
      if (!v.all_ok && micro && sixTax) {
        toast('⚠️ 系统自动校验不通过！' + (v.warnings && v.warnings.length ? v.warnings[0] : '不符合小型微利企业标准'), 'warning', 10000);
      } else if (v.all_ok) {
        toast('✅ 系统校验通过：符合小型微利企业标准', 'success', 4000);
      }
    }
    if (resp.legal_warnings && resp.legal_warnings.length) {
      for (var i = 0; i < resp.legal_warnings.length; i++) {
        toast(resp.legal_warnings[i], 'warning', 8000);
      }
    }
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
  const main = safeJSON(data.form_main, {});
  const statusLabel = {'草稿':'草稿','已申报':'已申报','已缴税':'已缴税'}[data.status] || data.status;

  // 页签
  let tabs = '<div class="detail-header" style="margin-bottom:0"><h2 style="margin:0">增值税及附加税费申报表 <span style="font-size:13px;color:#6b7280;font-weight:400">— ' + escapeHtml(data.period) + '</span></h2>';
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

  // 自动计算
  if (vatActivePage === 'main') setTimeout(calculateVATMainForm, 100);
  if (vatActivePage === 'schedule1') setTimeout(calculateSchedule1, 100);
  if (vatActivePage === 'schedule2') setTimeout(calculateSchedule2, 100);
  if (vatActivePage === 'schedule3') setTimeout(calculateSchedule3, 100);
  if (vatActivePage === 'schedule4') setTimeout(calculateSchedule4, 100);
  if (vatActivePage === 'schedule5') setTimeout(calculateSchedule5, 100);
  if (vatActivePage === 'reduction') setTimeout(calculateReductionForm, 100);
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
  // 缓存当前数据供统计卡使用
  vatCurrentData = data;

  const main = safeJSON(data.form_main, {});

  // 年份：从已有数据取范围，并确保包含当前年 ± 3 年
  const currentYear = new Date().getFullYear();
  const yearSet = new Set();
  (vatDeclarations || []).forEach(d => {
    const [y] = (d.period || '').split('-');
    if (y) yearSet.add(y);
  });
  for (let y = currentYear - 3; y <= currentYear + 3; y++) yearSet.add(String(y));
  const years = [...yearSet].sort();
  const _periodYear = escapeHtml((data.period || '').split('-')[0] || '');
  const _periodMonth = escapeHtml((data.period || '').split('-')[1] || '');

  // 生成年份选项
  let yearOpts = '';
  years.forEach(y => {
    yearOpts += '<option value="' + y + '" ' + (y === _periodYear ? 'selected>' : '>') + y + '年</option>';
  });
  // 月份：始终显示全部 1-12 月
  let monthOpts = '';
  for (let m = 1; m <= 12; m++) {
    const mv = String(m).padStart(2, '0');
    monthOpts += '<option value="' + mv + '" ' + (mv === _periodMonth ? 'selected>' : '>') + mv + '月</option>';
  }

  // 工具栏（时间栏在最左 + 按钮）
  let html = renderVATToolbar(yearOpts, monthOpts);

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

  // 记录当前展示的记录 ID（用于切换到不同记录时刷新）
  if (vatInlineDisplayId !== data.id) {
    vatInlineDisplayId = data.id;
  }

  // 主表自动计算 + 上期数据自动填列
  if (vatActivePage === 'main') {
    setTimeout(function() {
      calculateVATMainForm();
      // 如果row13或row25为空/0，自动从上期取数
      var el13 = document.getElementById('vat-row13_prior_credit');
      var el25 = document.getElementById('vat-row25_prior_unpaid');
      var v13 = el13 ? parseFloat(el13.value) : NaN;
      var v25 = el25 ? parseFloat(el25.value) : NaN;
      if ((isNaN(v13) || v13 === 0) && (isNaN(v25) || v25 === 0)) {
        fetchPriorPeriodData();
      }
    }, 100);
  }
  // 附表自动计算
  if (vatActivePage === 'schedule1') {
    setTimeout(calculateSchedule1, 100);
  }
  if (vatActivePage === 'schedule2') {
    setTimeout(calculateSchedule2, 100);
  }
  if (vatActivePage === 'schedule3') {
    setTimeout(calculateSchedule3, 100);
  }
  if (vatActivePage === 'schedule4') {
    setTimeout(calculateSchedule4, 100);
  }
  if (vatActivePage === 'schedule5') {
    setTimeout(calculateSchedule5, 100);
  }
  if (vatActivePage === 'reduction') {
    setTimeout(calculateReductionForm, 100);
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
    await loadVATDeclarationList(period);
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
// 统一输入框生成（数据字段，带 onchange 触发计算）
function _inp(id, val, cls) {
  var v = (val !== null && val !== undefined && val !== '') ? parseFloat(val) : '';
  if (v !== '' && isNaN(v)) v = '';
  return '<input type="number" step="0.01" id="' + id + '" value="' + v + '" onchange="vatFieldChanged()">';
}
// 即征即退列输入（无 onchange，不触发主表计算）
function _refundTd(val) {
  if (!val || parseFloat(val) === 0) return '<td class="num"><input type="number" step="0.01" value=""></td>';
  return '<td class="num"><input type="number" step="0.01" value="' + parseFloat(val).toFixed(2) + '"></td>';
}


// ==================== VAT 工具栏（时间栏+按钮） ====================
function renderVATToolbar(yearOpts, monthOpts) {
  return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #e5e7eb;flex-wrap:wrap">'
    + '<div class="period-selector-bar" style="display:flex;gap:4px;align-items:center">'
    + '<div class="period-stepper">'
    + '<select id="vat-detail-year" class="period-selector-year" onchange="onVATDetailPeriodChange()">'
    + yearOpts + '</select>'
    + '<div class="stepper-arrows">'
    + '<button class="stepper-btn stepper-up" onclick="stepVATPeriod(\'year\',1)" title="下一年">▲</button>'
    + '<button class="stepper-btn stepper-down" onclick="stepVATPeriod(\'year\',-1)" title="上一年">▼</button>'
    + '</div></div>'
    + '<div class="period-stepper">'
    + '<select id="vat-detail-month" class="period-selector-month" onchange="onVATDetailPeriodChange()">'
    + monthOpts + '</select>'
    + '<div class="stepper-arrows">'
    + '<button class="stepper-btn stepper-up" onclick="stepVATPeriod(\'month\',1)" title="下一月">▲</button>'
    + '<button class="stepper-btn stepper-down" onclick="stepVATPeriod(\'month\',-1)" title="上一月">▼</button>'
    + '</div></div></div>'
    + '<button class="btn-toolbar" onclick="onVATDetailPeriodChange()" title="按所选期间查询">查询</button>'
    + '<button class="btn-toolbar" onclick="vatClearFilter()" title="清除筛选条件">清除</button>'
    + '<button class="btn-toolbar" onclick="vatGenerateVoucher()" title="生成增值税相关凭证">生成凭证</button>'
    + '<button class="btn-toolbar" onclick="vatSaveManualData()" title="保存手动填列的数据" style="background:#059669;color:#fff">保存数据</button>'
    + '<button class="btn-toolbar-danger" onclick="vatDeleteCurrent()" title="删除当前申报表">删除报表</button>'
    + '</div>';
}

function vatClearFilter() {
  vatFilterPeriod = '';
  vatCurrentData = null;
  loadVATDeclarationList();
}


function vatFieldChanged() {
  // 标记表单已修改，提示用户保存
  if (typeof vatDirty !== 'undefined') vatDirty = true;
  // 自动计算主表
  calculateVATMainForm();
}

// ==================== 主表自动计算逻辑 ====================
function calculateVATMainForm() {
  // 辅助：读输入框数值
  function getVal(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var v = parseFloat(el.value);
    return isNaN(v) ? 0 : v;
  }
  // 辅助：设置只读单元格文本
  function setText(id, val) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = (val === 0 || val === -0) ? '' : parseFloat(val).toFixed(2);
  }

  // 读取相关字段（一般项目本月数）
  var r11 = getVal('vat-row11_output_tax');
  var r12 = getVal('vat-row12_input_tax');
  var r13 = getVal('vat-row13_prior_credit');
  var r14 = getVal('vat-row14_input_transfer_out');
  var r15 = getVal('vat-row15_exempt_refund');
  var r16 = getVal('vat-row16_actual_deduct_by_item');
  var r21 = getVal('vat-row21_simple_tax');
  var r23 = getVal('vat-row23_reduction');
  var r25 = getVal('vat-row25_prior_unpaid');
  var r26 = getVal('vat-row26_real_paid_during');
  var r28 = getVal('vat-row28_export_tax_refund');
  var r29 = getVal('vat-row29_remote_prepaid');
  var r30 = getVal('vat-row30_already_paid_total');
  var r31 = getVal('vat-row31_should_pay_refund');

  // 计算
  var r17 = r12 + r13 - r14 - r15 + r16;  // 17=12+13-14-15+16
  var r18 = Math.min(r17, r11);            // 18=min(17,11)
  var r19 = r11 - r18;                     // 19=11-18
  var r20 = r17 - r18;                     // 20=17-18
  var r24 = r19 + r21 - r23;               // 24=19+21-23
  var r27 = r28 + r29 + r30 + r31;         // 27=28+29+30+31
  var r32 = r24 + r25 + r26 - r27;         // 32=24+25+26-27
  var r34 = r24 - r28 - r29;               // 34=24-28-29

  // 更新显示（一般项目本月数）
  setText('vat-row17_total_deductible', r17);
  setText('vat-row18_actual_deduct', r18);
  setText('vat-row19_tax_payable', r19);
  setText('vat-row20_end_credit', r20);
  setText('vat-row24_tax_payable_total', r24);
  setText('vat-row27_installment_prepaid', r27);
  setText('vat-row32_check_tax_should', r32);
  setText('vat-row34_should_check', r34);

  // 读取本年累计字段
  var r11ytd = getVal('vat-row11_output_tax_ytd');
  var r12ytd = getVal('vat-row12_input_tax_ytd');
  var r13ytd = getVal('vat-row13_prior_credit_ytd');
  var r14ytd = getVal('vat-row14_input_transfer_out_ytd');
  var r15ytd = getVal('vat-row15_exempt_refund_ytd');
  var r16ytd = getVal('vat-row16_actual_deduct_by_item_ytd');
  var r21ytd = getVal('vat-row21_simple_tax_ytd');
  var r23ytd = getVal('vat-row23_reduction_ytd');
  var r25ytd = getVal('vat-row25_prior_unpaid_ytd');
  var r26ytd = getVal('vat-row26_real_paid_during_ytd');
  var r28ytd = getVal('vat-row28_export_tax_refund_ytd');
  var r29ytd = getVal('vat-row29_remote_prepaid_ytd');
  var r30ytd = getVal('vat-row30_already_paid_total_ytd');
  var r31ytd = getVal('vat-row31_should_pay_refund_ytd');

  // 计算本年累计
  var r17ytd = r12ytd + r13ytd - r14ytd - r15ytd + r16ytd;
  var r18ytd = Math.min(r17ytd, r11ytd);
  var r19ytd = r11ytd - r18ytd;
  var r20ytd = r17ytd - r18ytd;
  var r24ytd = r19ytd + r21ytd - r23ytd;
  var r27ytd = r28ytd + r29ytd + r30ytd + r31ytd;
  var r32ytd = r24ytd + r25ytd + r26ytd - r27ytd;
  var r34ytd = r24ytd - r28ytd - r29ytd;

  // 更新显示（本年累计）
  setText('vat-row17_total_deductible_ytd', r17ytd);
  setText('vat-row18_actual_deduct_ytd', r18ytd);
  setText('vat-row19_tax_payable_ytd', r19ytd);
  setText('vat-row20_end_credit_ytd', r20ytd);
  setText('vat-row24_tax_payable_total_ytd', r24ytd);
  setText('vat-row27_installment_prepaid_ytd', r27ytd);
  setText('vat-row32_check_tax_should_ytd', r32ytd);
  setText('vat-row34_should_check_ytd', r34ytd);
}

function vatCollectFormData() {
  // 收集所有输入框的值，按表单分配
  var allData = {};
  
  // 辅助：收集指定前缀的输入框
  function collect(prefix) {
    var inputs = document.querySelectorAll('[id^="' + prefix + '"][type="number"]');
    var data = {};
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      var key = inp.id.replace(prefix, '');
      var val = parseFloat(inp.value);
      data[key] = isNaN(val) ? 0 : val;
    }
    return data;
  }
  
  allData.form_main = collect('vat-');
  allData.form_sales = collect('sch1-');
  allData.form_input = collect('sch2-');
  allData.form_deduction = collect('sch3-');
  allData.form_credit = collect('sch4-');
  allData.form_surcharge = collect('sch5-');
  allData.form_reduction = collect('red-');
  
  return allData;
}

async function vatSaveManualData() {
  if (!vatCurrentData || !vatCurrentData.id) {
    toast('请先查询并选择一份申报表', 'warning');
    return;
  }
  try {
    var allFormData = vatCollectFormData();
    var resp = await fetch('/api/vat/declarations/' + vatCurrentData.id + '?company_id=' + (currentCompanyId || 1), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(allFormData)
    });
    var result = await resp.json();
    if (!resp.ok) throw new Error(result.detail || '保存失败');
    toast('表单数据已保存', 'success');
    // 重新加载页面数据
    await openVATDetailInline(vatCurrentData.id);
  } catch (e) { toast('保存失败: ' + (e.message || '未知错误'), 'error'); }
}

function vatGenerateVoucher() {
  if (!vatCurrentData || !vatCurrentData.id) {
    toast('请先选择一份申报表', 'warning');
    return;
  }
  toast('凭证生成功能开发中，请稍后...', 'info');
}

function vatDeleteCurrent() {
  if (!vatCurrentData || !vatCurrentData.id) {
    toast('没有可删除的申报表', 'warning');
    return;
  }
  deleteVATDeclaration(vatCurrentData.id, vatCurrentData.period);
}



// ========== 上期数据自动填列 ==========
async function fetchPriorPeriodData() {
  if (!vatCurrentData || !vatCurrentData.period) return;
  var period = vatCurrentData.period;
  var companyId = currentCompanyId || 1;
  try {
    var resp = await fetch('/api/vat/prior-data?company_id=' + companyId + '&period=' + encodeURIComponent(period));
    var data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || '获取失败');

    // 填列第13行：上期留抵税额
    var el13 = document.getElementById('vat-row13_prior_credit');
    if (el13) {
      el13.value = data.row13_prior_credit || 0;
      el13.style.background = data.has_prev ? '#e8f5e9' : '';
    }

    // 填列第25行：期初未缴税额
    var el25 = document.getElementById('vat-row25_prior_unpaid');
    if (el25) {
      el25.value = data.row25_prior_unpaid || 0;
      el25.style.background = data.has_prev ? '#e8f5e9' : '';
    }

    // 触发表间同步和主表计算
    if (typeof vatFieldChanged === 'function') vatFieldChanged();

    if (data.has_prev) {
      toast('已从上期(' + data.prev_period + ')申报表自动填列', 'success');
    }
  } catch (e) {
    console.error('获取上期数据失败:', e);
  }
}

function renderMainForm(data) {
  const m = safeJSON(data.form_main, {});
  const s = safeJSON(data.form_surcharge, {});

  let h = '';

  // 标题
  h += '<div style="text-align:center;font-size:15px;font-weight:700;margin-bottom:2px">增值税及附加税费申报表</div>';
  h += '<div style="text-align:center;font-size:13px;margin-bottom:4px">（一般纳税人适用）</div>';

  // ========== 7列表格主表（第1列为纵向分类标签） ==========
  h += '<table class="vat-form-table" style="font-size:11px">';
  h += '<colgroup>';
  h += '<col><col><col><col><col><col><col>';
  h += '</colgroup>';
  h += '<thead>';
  h += '<tr style="background:#d9e2f3">';
  h += '<th colspan="2" rowspan="2" style="padding:4px 6px">项目</th>';
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

  // row 1
  h += '<tr><td rowspan="10" style="text-align:center;vertical-align:middle;font-weight:700;font-size:13px;background:#f7f8fc;writing-mode:vertical-lr;letter-spacing:2px">销售额</td><td>（一）按适用税率计税销售额</td><td style="text-align:center">1</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row1_sales" value="' + (m.row1_sales != null ? m.row1_sales : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row1_sales_ytd" value="' + (m.row1_sales_ytd != null ? m.row1_sales_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row1_sales_refund) + _refundTd(m.row1_sales_refund_ytd) + '</tr>';
  // row 2
  h += '<tr><td style="padding-left:18px">其中：应税货物销售额</td><td style="text-align:center">2</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row2_other_invoice" value="' + (m.row2_other_invoice ? (parseFloat(m.row2_other_invoice) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row2_other_invoice_ytd" value="' + (m.row2_other_invoice_ytd ? (parseFloat(m.row2_other_invoice_ytd) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row2_other_invoice_refund) + _refundTd(m.row2_other_invoice_refund_ytd) + '</tr>';
  // row 3
  h += '<tr><td style="padding-left:18px">　　　应税劳务销售额</td><td style="text-align:center">3</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row3_no_invoice" value="' + (m.row3_no_invoice ? (parseFloat(m.row3_no_invoice) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row3_no_invoice_ytd" value="' + (m.row3_no_invoice_ytd ? (parseFloat(m.row3_no_invoice_ytd) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row3_no_invoice_refund) + _refundTd(m.row3_no_invoice_refund_ytd) + '</tr>';
  // row 4
  h += '<tr><td style="padding-left:18px">　　　纳税检查调整的销售额</td><td style="text-align:center">4</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row4_tax_check" value="' + (m.row4_tax_check ? (parseFloat(m.row4_tax_check) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row4_tax_check_ytd" value="' + (m.row4_tax_check_ytd ? (parseFloat(m.row4_tax_check_ytd) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row4_tax_check_refund) + _refundTd(m.row4_tax_check_refund_ytd) + '</tr>';
  // row 5
  h += '<tr><td>（二）按简易办法计税销售额</td><td style="text-align:center">5</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row5_simple_method" value="' + (m.row5_simple_method ? (parseFloat(m.row5_simple_method) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row5_simple_method_ytd" value="' + (m.row5_simple_method_ytd ? (parseFloat(m.row5_simple_method_ytd) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row5_simple_method_refund) + _refundTd(m.row5_simple_method_refund_ytd) + '</tr>';
  // row 6
  h += '<tr><td style="padding-left:18px">其中：纳税检查调整的销售额</td><td style="text-align:center">6</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row6_exempt_sales" value="' + (m.row6_exempt_sales ? (parseFloat(m.row6_exempt_sales) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row6_exempt_sales_ytd" value="' + (m.row6_exempt_sales_ytd ? (parseFloat(m.row6_exempt_sales_ytd) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row6_exempt_sales_refund) + _refundTd(m.row6_exempt_sales_refund_ytd) + '</tr>';
  // row 7
  h += '<tr><td>（三）免、抵、退办法出口销售额</td><td style="text-align:center">7</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row7_export_exempt" value="' + (m.row7_export_exempt ? (parseFloat(m.row7_export_exempt) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row7_export_exempt_ytd" value="' + (m.row7_export_exempt_ytd ? (parseFloat(m.row7_export_exempt_ytd) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"></td><td class="num"></td></tr>';
  // row 8
  h += '<tr><td>（四）免税销售额</td><td style="text-align:center">8</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row8_tax_free" value="' + (m.row8_tax_free ? (parseFloat(m.row8_tax_free) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row8_tax_free_ytd" value="' + (m.row8_tax_free_ytd ? (parseFloat(m.row8_tax_free_ytd) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"></td><td class="num"></td></tr>';
  // row 9
  h += '<tr><td style="padding-left:18px">其中：免税货物销售额</td><td style="text-align:center">9</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row9_exempt_goods" value="' + (m.row9_exempt_goods ? (parseFloat(m.row9_exempt_goods) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row9_exempt_goods_ytd" value="' + (m.row9_exempt_goods_ytd ? (parseFloat(m.row9_exempt_goods_ytd) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"></td><td class="num"></td></tr>';
  // row 10
  h += '<tr><td style="padding-left:18px">　　　免税劳务销售额</td><td style="text-align:center">10</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row10_exempt_service" value="' + (m.row10_exempt_service ? (parseFloat(m.row10_exempt_service) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row10_exempt_service_ytd" value="' + (m.row10_exempt_service_ytd ? (parseFloat(m.row10_exempt_service_ytd) || '') : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"></td><td class="num"></td></tr>';

  // --- 二、税款计算 ---
  // row 11
  h += '<tr><td rowspan="14" style="text-align:center;vertical-align:middle;font-weight:700;font-size:13px;background:#f7f8fc;writing-mode:vertical-lr;letter-spacing:2px">税款计算</td><td>销项税额</td><td style="text-align:center">11</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row11_output_tax" value="' + (m.row11_output_tax != null ? m.row11_output_tax : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row11_output_tax_ytd" value="' + (m.row11_output_tax_ytd != null ? m.row11_output_tax_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row11_output_tax_refund) + _refundTd(m.row11_output_tax_refund_ytd) + '</tr>';
  // row 12
  h += '<tr><td>进项税额</td><td style="text-align:center">12</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row12_input_tax" value="' + (m.row12_input_tax != null ? m.row12_input_tax : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row12_input_tax_ytd" value="' + (m.row12_input_tax_ytd != null ? m.row12_input_tax_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row12_input_tax_refund) + _refundTd(m.row12_input_tax_refund_ytd) + '</tr>';
  // row 13
  h += '<tr><td>上期留抵税额 <span style="font-size:10px;color:#1a56db;cursor:pointer;white-space:nowrap" onclick="fetchPriorPeriodData()" title="从上期申报表取数">⟳ 取数</span></td><td style="text-align:center">13</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row13_prior_credit" value="' + (m.row13_prior_credit != null ? m.row13_prior_credit : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row13_prior_credit_ytd" value="' + (m.row13_prior_credit_ytd != null ? m.row13_prior_credit_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row13_prior_credit_refund) + _refundTd(m.row13_prior_credit_refund_ytd) + '</tr>';
  // row 14
  h += '<tr><td>进项税额转出</td><td style="text-align:center">14</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row14_input_transfer_out" value="' + (m.row14_input_transfer_out != null ? m.row14_input_transfer_out : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row14_input_transfer_out_ytd" value="' + (m.row14_input_transfer_out_ytd != null ? m.row14_input_transfer_out_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row14_input_transfer_out_refund) + _refundTd(m.row14_input_transfer_out_refund_ytd) + '</tr>';
  // row 15
  h += '<tr><td>免、抵、退应退税额</td><td style="text-align:center">15</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row15_exempt_refund" value="' + (m.row15_exempt_refund != null ? m.row15_exempt_refund : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row15_exempt_refund_ytd" value="' + (m.row15_exempt_refund_ytd != null ? m.row15_exempt_refund_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row15_exempt_refund_refund) + _refundTd(m.row15_exempt_refund_refund_ytd) + '</tr>';
  // row 16
  h += '<tr><td>按适用税率计算的纳税检查应补缴税额</td><td style="text-align:center">16</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row16_actual_deduct_by_item" value="' + (m.row16_actual_deduct_by_item != null ? m.row16_actual_deduct_by_item : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row16_actual_deduct_by_item_ytd" value="' + (m.row16_actual_deduct_by_item_ytd != null ? m.row16_actual_deduct_by_item_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row16_actual_deduct_by_item_refund) + _refundTd(m.row16_actual_deduct_by_item_refund_ytd) + '</tr>';
  // row 17
  h += '<tr style="background:#e8f0fe"><td>应抵扣税额合计</td><td style="text-align:center;font-size:10px;color:#6b7280">17=12+13-14-15+16</td>';
  h += '<td class="num" style="font-weight:700">' + _inp('vat-row17_total_deductible', m.row17_total_deductible) + '</td>';
  h += '<td class="num" style="font-weight:700">' + _inp('vat-row17_total_deductible_ytd', m.row17_total_deductible_ytd) + '</td>';
  h += _refundTd(m.row17_total_deductible_refund) + _refundTd(m.row17_total_deductible_refund_ytd) + '</tr>';
  // row 18
  h += '<tr style="background:#e8f0fe"><td>实际抵扣税额</td><td style="text-align:center;font-size:10px;color:#6b7280">18（如17＜11，则为17，否则为11）</td>';
  h += '<td class="num" style="font-weight:700">' + _inp('vat-row18_actual_deduct', m.row18_actual_deduct) + '</td>';
  h += '<td class="num" style="font-weight:700">' + _inp('vat-row18_actual_deduct_ytd', m.row18_actual_deduct_ytd) + '</td>';
  h += _refundTd(m.row18_actual_deduct_refund) + _refundTd(m.row18_actual_deduct_refund_ytd) + '</tr>';
  // row 19
  h += '<tr style="background:#fef9c4"><td>应纳税额</td><td style="text-align:center;font-size:10px;color:#6b7280">19=11-18</td>';
  h += '<td class="num" style="font-weight:700;color:#d97706">' + _inp('vat-row19_tax_payable', m.row19_tax_payable) + '</td>';
  h += '<td class="num" style="font-weight:700;color:#d97706">' + _inp('vat-row19_tax_payable_ytd', m.row19_tax_payable_ytd) + '</td>';
  h += _refundTd(m.row19_tax_payable_refund) + _refundTd(m.row19_tax_payable_refund_ytd) + '</tr>';
  // row 20
  h += '<tr><td>期末留抵税额</td><td style="text-align:center;font-size:10px;color:#6b7280">20=17-18</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row20_end_credit" value="' + (m.row20_end_credit != null ? m.row20_end_credit : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row20_end_credit_ytd" value="' + (m.row20_end_credit_ytd != null ? m.row20_end_credit_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row20_end_credit_refund) + _refundTd(m.row20_end_credit_refund_ytd) + '</tr>';
  // row 21
  h += '<tr><td>简易计税办法计算的应纳税额</td><td style="text-align:center">21</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row21_simple_tax" value="' + (m.row21_simple_tax != null ? m.row21_simple_tax : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row21_simple_tax_ytd" value="' + (m.row21_simple_tax_ytd != null ? m.row21_simple_tax_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row21_simple_tax_refund) + _refundTd(m.row21_simple_tax_refund_ytd) + '</tr>';
  // row 22
  h += '<tr><td>按简易计税办法计算的纳税检查应补缴税额</td><td style="text-align:center">22</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row22_simple_tax_reduction" value="' + (m.row22_simple_tax_reduction != null ? m.row22_simple_tax_reduction : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row22_simple_tax_reduction_ytd" value="' + (m.row22_simple_tax_reduction_ytd != null ? m.row22_simple_tax_reduction_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row22_simple_tax_reduction_refund) + _refundTd(m.row22_simple_tax_reduction_refund_ytd) + '</tr>';
  // row 23
  h += '<tr><td>应纳税额减征额</td><td style="text-align:center">23</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row23_reduction" value="' + (m.row23_reduction != null ? m.row23_reduction : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row23_reduction_ytd" value="' + (m.row23_reduction_ytd != null ? m.row23_reduction_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row23_reduction_refund) + _refundTd(m.row23_reduction_refund_ytd) + '</tr>';
  // row 24
  h += '<tr style="background:#fef9c4;font-weight:700"><td>应纳税额合计</td><td style="text-align:center;font-size:10px;color:#6b7280">24=19+21-23</td>';
  h += '<td class="num" style="color:#d97706">' + _inp('vat-row24_tax_payable_total', m.row24_tax_payable_total) + '</td>';
  h += '<td class="num" style="color:#d97706">' + _inp('vat-row24_tax_payable_total_ytd', m.row24_tax_payable_total_ytd) + '</td>';
  h += _refundTd(m.row24_tax_payable_total_refund) + _refundTd(m.row24_tax_payable_total_refund_ytd) + '</tr>';

  // --- 三、税款缴纳 ---
  // row 25
  h += '<tr><td rowspan="14" style="text-align:center;vertical-align:middle;font-weight:700;font-size:13px;background:#f7f8fc;writing-mode:vertical-lr;letter-spacing:2px">税款缴纳</td><td>期初未缴税额（多缴为负数） <span style="font-size:10px;color:#1a56db;cursor:pointer;white-space:nowrap" onclick="fetchPriorPeriodData()" title="从上期申报表取数">⟳ 取数</span></td><td style="text-align:center">25</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row25_prior_unpaid" value="' + (m.row25_prior_unpaid != null ? m.row25_prior_unpaid : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row25_prior_unpaid_ytd" value="' + (m.row25_prior_unpaid_ytd != null ? m.row25_prior_unpaid_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row25_prior_unpaid_refund) + _refundTd(m.row25_prior_unpaid_refund_ytd) + '</tr>';
  // row 26
  h += '<tr><td>实收出口开具专用缴款书退税额</td><td style="text-align:center">26</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row26_real_paid_during" value="' + (m.row26_real_paid_during != null ? m.row26_real_paid_during : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row26_real_paid_during_ytd" value="' + (m.row26_real_paid_during_ytd != null ? m.row26_real_paid_during_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row26_real_paid_during_refund) + _refundTd(m.row26_real_paid_during_refund_ytd) + '</tr>';
  // row 27
  h += '<tr><td>本期已缴税额</td><td style="text-align:center;font-size:10px;color:#6b7280">27=28+29+30+31</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row27_installment_prepaid" value="' + (m.row27_installment_prepaid != null ? m.row27_installment_prepaid : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row27_installment_prepaid_ytd" value="' + (m.row27_installment_prepaid_ytd != null ? m.row27_installment_prepaid_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row27_installment_prepaid_refund) + _refundTd(m.row27_installment_prepaid_refund_ytd) + '</tr>';
  // row 28
  h += '<tr><td style="padding-left:18px">①分次预缴税额</td><td style="text-align:center">28</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row28_export_tax_refund" value="' + (m.row28_export_tax_refund != null ? m.row28_export_tax_refund : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row28_export_tax_refund_ytd" value="' + (m.row28_export_tax_refund_ytd != null ? m.row28_export_tax_refund_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row28_export_tax_refund_refund) + _refundTd(m.row28_export_tax_refund_refund_ytd) + '</tr>';
  // row 29
  h += '<tr><td style="padding-left:18px">②出口开具专用缴款书预缴税额</td><td style="text-align:center">29</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row29_remote_prepaid" value="' + (m.row29_remote_prepaid != null ? m.row29_remote_prepaid : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row29_remote_prepaid_ytd" value="' + (m.row29_remote_prepaid_ytd != null ? m.row29_remote_prepaid_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row29_remote_prepaid_refund) + _refundTd(m.row29_remote_prepaid_refund_ytd) + '</tr>';
  // row 30
  h += '<tr><td style="padding-left:18px">③本期缴纳上期应纳税额</td><td style="text-align:center">30</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row30_already_paid_total" value="' + (m.row30_already_paid_total != null ? m.row30_already_paid_total : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row30_already_paid_total_ytd" value="' + (m.row30_already_paid_total_ytd != null ? m.row30_already_paid_total_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row30_already_paid_total_refund) + _refundTd(m.row30_already_paid_total_refund_ytd) + '</tr>';
  // row 31
  h += '<tr><td style="padding-left:18px">④本期缴纳欠缴税额</td><td style="text-align:center">31</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row31_should_pay_refund" value="' + (m.row31_should_pay_refund != null ? m.row31_should_pay_refund : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row31_should_pay_refund_ytd" value="' + (m.row31_should_pay_refund_ytd != null ? m.row31_should_pay_refund_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row31_should_pay_refund_refund) + _refundTd(m.row31_should_pay_refund_refund_ytd) + '</tr>';
  // row 32
  h += '<tr><td>期末未缴税额（多缴为负数）</td><td style="text-align:center;font-size:10px;color:#6b7280">32=24+25+26-27</td>';
  h += '<td class="num">' + _inp('vat-row32_check_tax_should', m.row32_check_tax_should) + '</td>';
  h += '<td class="num">' + _inp('vat-row32_check_tax_should_ytd', m.row32_check_tax_should_ytd) + '</td>';
  h += _refundTd(m.row32_check_tax_should_refund) + _refundTd(m.row32_check_tax_should_refund_ytd) + '</tr>';
  // row 33
  h += '<tr><td style="padding-left:18px">其中：欠缴税额（≥0）</td><td style="text-align:center;font-size:10px;color:#6b7280">33=25+26-27</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row33_check_prepaid" value="' + (m.row33_check_prepaid != null ? m.row33_check_prepaid : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row33_check_prepaid_ytd" value="' + (m.row33_check_prepaid_ytd != null ? m.row33_check_prepaid_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row33_check_prepaid_refund) + _refundTd(m.row33_check_prepaid_refund_ytd) + '</tr>';
  // row 34
  h += '<tr style="background:#fef9c4"><td>本期应补(退)税额</td><td style="text-align:center;font-size:10px;color:#6b7280">34＝24-28-29</td>';
  h += '<td class="num" style="font-weight:700;color:#d97706">' + _inp('vat-row34_should_check', m.row34_should_check) + '</td>';
  h += '<td class="num" style="font-weight:700;color:#d97706">' + _inp('vat-row34_should_check_ytd', m.row34_should_check_ytd) + '</td>';
  h += _refundTd(m.row34_should_check_refund) + _refundTd(m.row34_should_check_refund_ytd) + '</tr>';
  // row 35
  h += '<tr><td>即征即退实际退税额</td><td style="text-align:center">35</td>';
  h += '<td class="num"></td><td class="num"></td>';
  h += '<td class="num"></td><td class="num"></td></tr>';
  // row 36
  h += '<tr><td>期初未缴查补税额</td><td style="text-align:center">36</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row36_prior_unpaid_check" value="' + (m.row36_prior_unpaid_check != null ? m.row36_prior_unpaid_check : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row36_prior_unpaid_check_ytd" value="' + (m.row36_prior_unpaid_check_ytd != null ? m.row36_prior_unpaid_check_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row36_prior_unpaid_check_refund) + _refundTd(m.row36_prior_unpaid_check_refund_ytd) + '</tr>';
  // row 37
  h += '<tr><td>本期入库查补税额</td><td style="text-align:center">37</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row37_check_paid" value="' + (m.row37_check_paid != null ? m.row37_check_paid : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row37_check_paid_ytd" value="' + (m.row37_check_paid_ytd != null ? m.row37_check_paid_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row37_check_paid_refund) + _refundTd(m.row37_check_paid_refund_ytd) + '</tr>';
  // row 38
  h += '<tr><td>期末未缴查补税额</td><td style="text-align:center;font-size:10px;color:#6b7280">38=16+22+36-37</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row38_end_check" value="' + (m.row38_end_check != null ? m.row38_end_check : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row38_end_check_ytd" value="' + (m.row38_end_check_ytd != null ? m.row38_end_check_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row38_end_check_refund) + _refundTd(m.row38_end_check_refund_ytd) + '</tr>';

  // --- 四、附加税费 ---
  // row 39
  h += '<tr><td rowspan="3" style="text-align:center;vertical-align:middle;font-weight:700;font-size:13px;background:#f7f8fc;writing-mode:vertical-lr;letter-spacing:2px">附加税费</td><td>城市维护建设税本期应补（退）税额</td><td style="text-align:center">39</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row39_city_maintenance_tax" value="' + (m.row39_city_maintenance_tax != null ? m.row39_city_maintenance_tax : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row39_city_maintenance_tax_ytd" value="' + (m.row39_city_maintenance_tax_ytd != null ? m.row39_city_maintenance_tax_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row39_city_maintenance_tax_refund) + _refundTd(m.row39_city_maintenance_tax_refund_ytd) + '</tr>';
  // row 40
  h += '<tr><td>教育费附加本期应补（退）费额</td><td style="text-align:center">40</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row40_education_surcharge" value="' + (m.row40_education_surcharge != null ? m.row40_education_surcharge : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row40_education_surcharge_ytd" value="' + (m.row40_education_surcharge_ytd != null ? m.row40_education_surcharge_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row40_education_surcharge_refund) + _refundTd(m.row40_education_surcharge_refund_ytd) + '</tr>';
  // row 41
  h += '<tr><td>地方教育附加本期应补（退）费额</td><td style="text-align:center">41</td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row41_local_education_surcharge" value="' + (m.row41_local_education_surcharge != null ? m.row41_local_education_surcharge : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += '<td class="num"><input type="number" step="0.01" id="vat-row41_local_education_surcharge_ytd" value="' + (m.row41_local_education_surcharge_ytd != null ? m.row41_local_education_surcharge_ytd : '') + '" style="width:100%;text-align:right;font-size:11px;padding:2px 4px" onchange="vatFieldChanged()"></td>';
  h += _refundTd(m.row41_local_education_surcharge_refund) + _refundTd(m.row41_local_education_surcharge_refund_ytd) + '</tr>';

  h += '</tbody></table>';
  return h;
}

// ==================== 附表一：销售情况明细 ====================
function renderSchedule1(data) {
  const s = safeJSON(data.form_sales, {});

  // 输入字段样式
  var inputStyle = 'width:100%;text-align:right;font-size:11px;border:none;background:transparent;padding:2px 4px';

  // 生成可输入的 td (input number)
  function tdInput(row, col, val) {
    var id = 'sch1-row' + row + '_col' + col;
    var v = (val != null && val !== '' && !isNaN(val)) ? ' value="' + parseFloat(val) + '"' : '';
    return '<td class="num"><input type="number" step="0.01" id="' + id + '"' + v + ' style="' + inputStyle + '" onchange="calculateSchedule1()"></td>';
  }

  // 生成可编辑 td（计算结果也可手动修改）
  function tdCalc(colId, val) {
    var v = (val != null && val !== '' && !isNaN(val)) ? parseFloat(val) : 0;
    return '<td class="num"><input type="number" step="0.01" id="' + colId + '" value="' + v + '" style="width:100%;text-align:right;font-size:11px;border:none;background:transparent;padding:2px 4px" onchange="calculateSchedule1()"></td>';
  }

  function tdDash(n) { n = n || 1; var d = '<td class="num"><input type="number" step="0.01" value="" style="width:100%;text-align:right;font-size:11px;border:none;background:transparent;padding:2px 4px"></td>'; return n === 1 ? d : Array(n).fill(d).join(''); }
  // 大类列样式
  var catStyle = 'text-align:center;vertical-align:middle;font-weight:700;font-size:11px;background:#f0f4fa;writing-mode:vertical-lr;letter-spacing:2px;padding:4px 3px';
  var subStyle = 'text-align:center;vertical-align:middle;font-weight:600;font-size:10px;background:#f5f7fb';

  // ---- helper: 生成完整数据行(14个数值列: cols 4-17) ----
  // 销售额/税额按列号顺序: 第1列(销售额) 第2列(税额) ... 交替排列
  // 货物行（无扣除项目）: cols 1-8 输入, cols 9-10 计算, col 11价税合计, cols 12-14=——
  function Rg(row, spS,spT,otS,otT,niS,niT,ckS,ckT) {
    var cells = '';
    // 第1-8列：手动输入
    cells += tdInput(row, 1, spS);
    cells += tdInput(row, 2, spT);
    cells += tdInput(row, 3, otS);
    cells += tdInput(row, 4, otT);
    cells += tdInput(row, 5, niS);
    cells += tdInput(row, 6, niT);
    cells += tdInput(row, 7, ckS);
    cells += tdInput(row, 8, ckT);
    // 第9-10列：计算结果（合计）
    cells += '<td class="num" id="sch1-row' + row + '_col9">——</td>';
    cells += '<td class="num" id="sch1-row' + row + '_col10">——</td>';
    // 第11列：价税合计（计算）
    cells += '<td class="num" id="sch1-row' + row + '_col11">——</td>';
    // 第12-14列：————
    cells += tdDash(3);
    return cells;
  }
  // 服务行（含扣除项目）
  function Rs(row, spS,spT,otS,otT,niS,niT,ckS,ckT, ded, afS,afT) {
    var cells = '';
    // 第1-8列：手动输入
    cells += tdInput(row, 1, spS);
    cells += tdInput(row, 2, spT);
    cells += tdInput(row, 3, otS);
    cells += tdInput(row, 4, otT);
    cells += tdInput(row, 5, niS);
    cells += tdInput(row, 6, niT);
    cells += tdInput(row, 7, ckS);
    cells += tdInput(row, 8, ckT);
    // 第9-10列：计算结果（合计）
    cells += '<td class="num" id="sch1-row' + row + '_col9">——</td>';
    cells += '<td class="num" id="sch1-row' + row + '_col10">——</td>';
    // 第11列：价税合计（计算）
    cells += '<td class="num" id="sch1-row' + row + '_col11">——</td>';
    // 第12列：扣除项目本期实际扣除金额（手动输入）
    cells += tdInput(row, 12, ded);
    // 第13-14列：扣除后（计算）
    cells += '<td class="num" id="sch1-row' + row + '_col13">——</td>';
    cells += '<td class="num" id="sch1-row' + row + '_col14">——</td>';
    return cells;
  }
  // 即征即退服务行: 前8列=——,后6列正常
  function Rj(row, toS,toT,ded,afS,afT) {
    var cells = tdDash(8);
    // 第9-10列：输入（即征即退行的合计列可输入）
    cells += tdInput(row, 9, toS);
    cells += tdInput(row, 10, toT);
    // 第11列：价税合计（计算）
    cells += '<td class="num" id="sch1-row' + row + '_col11">——</td>';
    // 第12列：扣除项目（输入）
    cells += tdInput(row, 12, ded);
    // 第13-14列：扣除后（计算）
    cells += '<td class="num" id="sch1-row' + row + '_col13">——</td>';
    cells += '<td class="num" id="sch1-row' + row + '_col14">——</td>';
    return cells;
  }
  // 即征即退货物行: 前8列=——，后3列=——
  function Rjg(row, toS,toT) {
    var cells = tdDash(8);
    // 第9-10列：输入
    cells += tdInput(row, 9, toS);
    cells += tdInput(row, 10, toT);
    // 第11列：价税合计（计算）
    cells += '<td class="num" id="sch1-row' + row + '_col11">——</td>';
    // 第12-14列：————
    cells += tdDash(3);
    return cells;
  }
  // 全 —— 行
  function RD() { return tdDash(14); }

  return '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税及附加税费申报表附列资料（一）</div>'
    + '<div style="font-size:11px;color:#6b7280;text-align:center;margin-bottom:6px">（本期销售情况明细）</div>'
    + '<div style="overflow-x:auto">'
    + '<style>#sch1-table td,#sch1-table th{white-space:nowrap;}</style>'
    + '<table id="sch1-table" class="vat-form-table" style="font-size:10px;table-layout:fixed;width:1847px">'
    + '<colgroup>'
    + '<col style="width:90px"><col style="width:75px"><col style="width:225px"><col style="width:42px">'  // 项目及栏次 (×1.5)
    + '<col style="width:95px"><col style="width:85px">'    // 专票: 销售额+税额
    + '<col style="width:95px"><col style="width:85px">'    // 其他发票: 销售额+税额
    + '<col style="width:95px"><col style="width:85px">'    // 未开票: 销售额+税额
    + '<col style="width:95px"><col style="width:85px">'    // 纳税检查: 销售额+税额
    + '<col style="width:90px"><col style="width:95px"><col style="width:75px">'   // 合计: 销售额(9=1+3+5+7)+税额(10=2+4+6+8)+价税合计(11=9+10)
    + '<col style="width:158px">'   // 扣除项目(12) ×1.5: 服务、不动产和无形资产扣除项目本期实际扣除金额
    + '<col style="width:105px"><col style="width:170px">'  // 扣除后: 含税销售额(13=11-12)+税额(14=...×税率)
    + '</colgroup>'
    // 90+75+225+42+95+85+95+85+95+85+95+85+90+95+75+158+105+170 = 1847
    + '<thead>'
    + '<tr style="background:#d9e2f3">'
    + '<th colspan="4" rowspan="3">项目及栏次</th>'
    + '<th colspan="2">开具增值税专用发票</th>'
    + '<th colspan="2">开具其他发票</th>'
    + '<th colspan="2">未开具发票</th>'
    + '<th colspan="2">纳税检查调整</th>'
    + '<th colspan="3">合计</th>'
    + '<th rowspan="2">服务、不动产和无形资产<br>扣除项目本期实际扣除金额</th>'
    + '<th colspan="2">扣除后</th>'
    + '</tr>'
    + '<tr style="background:#d9e2f3">'
    + '<th>销售额</th><th>销项(应纳)税额</th>'
    + '<th>销售额</th><th>销项(应纳)税额</th>'
    + '<th>销售额</th><th>销项(应纳)税额</th>'
    + '<th>销售额</th><th>销项(应纳)税额</th>'
    + '<th>销售额</th><th>销项(应纳)税额</th><th>价税合计</th>'
    + '<th>含税(免税)销售额</th><th>销项(应纳)税额</th>'
    + '</tr>'
    + '<tr style="background:#e8edf5">'
    + '<th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th>'
    + '<th style="font-size:9px">9=1+3+5+7</th><th style="font-size:9px">10=2+4+6+8</th><th style="font-size:9px">11=9+10</th>'
    + '<th>12</th>'
    + '<th style="font-size:8px">13=11-12</th>'
    + '<th style="font-size:7px">14=13÷(100%+税率或征收率)×税率或征收率</th>'
    + '</tr></thead><tbody>'

    // ============== 一、一般计税方法计税 (7 rows) ==============
    // Row 1: 13%货物 (rowspan 大类=7, 子类=5)
    + '<tr>'
    + '<td rowspan="7" style="'+catStyle+'">一般计税<br>方法计税</td>'
    + '<td rowspan="5" style="'+subStyle+'">全部<br>征税项目</td>'
    + '<td>13%税率的货物及加工修理修配劳务</td><td style="text-align:center">1</td>'
    + Rg(1,s.row1_13_special_sales,s.row1_13_special_tax,s.row1_13_other_sales,s.row1_13_other_tax,
         s.row1_13_no_invoice_sales,s.row1_13_no_invoice_tax,s.row1_13_check_sales,s.row1_13_check_tax)
    + '</tr>'
    // Row 2: 13%服务
    + '<tr><td>13%税率的服务、不动产和无形资产</td><td style="text-align:center">2</td>'
    + Rs(2,s.row2_13_service_special_sales,s.row2_13_service_special_tax,
         s.row2_13_service_other_sales,s.row2_13_service_other_tax,
         s.row2_13_service_no_invoice_sales,s.row2_13_service_no_invoice_tax,
         s.row2_13_service_check_sales,s.row2_13_service_check_tax,
         s.row2_13_service_deduct||0,s.row2_13_service_after_sales||0,s.row2_13_service_after_tax||0)
    + '</tr>'
    // Row 3: 9%货物
    + '<tr><td>9%税率的货物及加工修理修配劳务</td><td style="text-align:center">3</td>'
    + Rg(3,s.row3_9_special_sales,s.row3_9_special_tax,s.row3_9_other_sales,s.row3_9_other_tax,
         s.row3_9_no_invoice_sales,s.row3_9_no_invoice_tax,s.row3_9_check_sales,s.row3_9_check_tax)
    + '</tr>'
    // Row 4: 9%服务
    + '<tr><td>9%税率的服务、不动产和无形资产</td><td style="text-align:center">4</td>'
    + Rs(4,s.row4_9_service_sales,s.row4_9_service_tax,
         s.row4_9_service_other_sales,s.row4_9_service_other_tax,
         s.row4_9_service_no_invoice_sales,s.row4_9_service_no_invoice_tax,
         s.row4_9_service_check_sales,s.row4_9_service_check_tax,
         s.row4_9_service_deduct||0,s.row4_9_service_after_sales||0,s.row4_9_service_after_tax||0)
    + '</tr>'
    // Row 5: 6%税率
    + '<tr><td>6%税率</td><td style="text-align:center">5</td>'
    + Rs(5,s.row5_6_special_sales,s.row5_6_special_tax,
         s.row5_6_other_sales,s.row5_6_other_tax,
         s.row5_6_no_invoice_sales,s.row5_6_no_invoice_tax,
         s.row5_6_check_sales,s.row5_6_check_tax,
         s.row5_6_deduct||0,s.row5_6_after_sales||0,s.row5_6_after_tax||0)
    + '</tr>'
    // Row 6: 即征即退货物
    + '<tr>'
    + '<td rowspan="2" style="'+subStyle+'">其中：即征<br>即退项目</td>'
    + '<td>即征即退货物及加工修理修配劳务</td><td style="text-align:center">6</td>'
    + Rjg(6,s.row6_refund_goods_total_sales||0,s.row6_refund_goods_total_tax||0)
    + '</tr>'
    // Row 7: 即征即退服务
    + '<tr><td>即征即退服务、不动产和无形资产</td><td style="text-align:center">7</td>'
    + Rj(7,s.row7_refund_service_total_sales||0,s.row7_refund_service_total_tax||0,
         s.row7_refund_service_deduct||0,s.row7_refund_service_after_sales||0,s.row7_refund_service_after_tax||0)
    + '</tr>'

    // ============== 二、简易计税方法计税 (11 rows) ==============
    // Row 8: 6%征收率
    + '<tr>'
    + '<td rowspan="11" style="'+catStyle+'">简易计税<br>方法计税</td>'
    + '<td rowspan="9" style="'+subStyle+'">全部<br>征税项目</td>'
    + '<td>6%征收率</td><td style="text-align:center">8</td>'
    + Rg(8,s.row8_6_collect_sales,s.row8_6_collect_tax,s.row8_6_collect_other_sales,s.row8_6_collect_other_tax,
         s.row8_6_collect_no_invoice_sales,s.row8_6_collect_no_invoice_tax)
    + '</tr>'
    // Row 9: 5%货物
    + '<tr><td>5%征收率的货物及加工修理修配劳务</td><td style="text-align:center">9a</td>'
    + Rg(9,s.row9a_5_goods_sales,s.row9a_5_goods_tax,s.row9a_5_goods_other_sales,s.row9a_5_goods_other_tax,
         s.row9a_5_goods_no_invoice_sales,s.row9a_5_goods_no_invoice_tax)
    + '</tr>'
    // Row 10: 5%服务
    + '<tr><td>5%征收率的服务、不动产和无形资产</td><td style="text-align:center">9b</td>'
    + Rs(10,s.row9b_5_service_sales,s.row9b_5_service_tax,
         s.row9b_5_service_other_sales,s.row9b_5_service_other_tax,
         s.row9b_5_service_no_invoice_sales,s.row9b_5_service_no_invoice_tax,
         s.row9b_5_service_deduct||0,s.row9b_5_service_after_sales||0,s.row9b_5_service_after_tax||0)
    + '</tr>'
    // Row 11: 4%征收率
    + '<tr><td>4%征收率</td><td style="text-align:center">10</td>'
    + Rg(11,s.row10_4_collect_sales,s.row10_4_collect_tax,s.row10_4_collect_other_sales,s.row10_4_collect_other_tax,
         s.row10_4_collect_no_invoice_sales,s.row10_4_collect_no_invoice_tax)
    + '</tr>'
    // Row 12: 3%货物
    + '<tr><td>3%征收率的货物及加工修理修配劳务</td><td style="text-align:center">11</td>'
    + Rg(12,s.row11_3_goods_sales,s.row11_3_goods_tax,s.row11_3_goods_other_sales,s.row11_3_goods_other_tax,
         s.row11_3_goods_no_invoice_sales,s.row11_3_goods_no_invoice_tax)
    + '</tr>'
    // Row 13: 3%服务
    + '<tr><td>3%征收率的服务、不动产和无形资产</td><td style="text-align:center">12</td>'
    + Rs(13,s.row12_3_service_sales,s.row12_3_service_tax,
         s.row12_3_service_other_sales,s.row12_3_service_other_tax,
         s.row12_3_service_no_invoice_sales,s.row12_3_service_no_invoice_tax,
         s.row12_3_service_deduct||0,s.row12_3_service_after_sales||0,s.row12_3_service_after_tax||0)
    + '</tr>'
    // Row 14-16: 预征率 13a/13b/13c
    + '<tr><td>预征率&nbsp;%</td><td style="text-align:center">13a</td>'
    + Rg(14,s.row13a_rate_sales,s.row13a_rate_tax,s.row13a_rate_other_sales,s.row13a_rate_other_tax,
         s.row13a_rate_no_invoice_sales,s.row13a_rate_no_invoice_tax)
    + '</tr>'
    + '<tr><td>预征率&nbsp;%</td><td style="text-align:center">13b</td>'
    + Rg(15,s.row13b_rate_sales,s.row13b_rate_tax,s.row13b_rate_other_sales,s.row13b_rate_other_tax,
         s.row13b_rate_no_invoice_sales,s.row13b_rate_no_invoice_tax)
    + '</tr>'
    + '<tr><td>预征率&nbsp;%</td><td style="text-align:center">13c</td>'
    + Rg(16,s.row13c_rate_sales,s.row13c_rate_tax,s.row13c_rate_other_sales,s.row13c_rate_other_tax,
         s.row13c_rate_no_invoice_sales,s.row13c_rate_no_invoice_tax)
    + '</tr>'
    // Row 17: 即征即退货物
    + '<tr>'
    + '<td rowspan="2" style="'+subStyle+'">其中：即征<br>即退项目</td>'
    + '<td>即征即退货物及加工修理修配劳务</td><td style="text-align:center">14</td>'
    + Rjg(17,s.row14_refund_goods_total_sales||0,s.row14_refund_goods_total_tax||0)
    + '</tr>'
    // Row 18: 即征即退服务
    + '<tr><td>即征即退服务、不动产和无形资产</td><td style="text-align:center">15</td>'
    + Rj(18,s.row15_refund_service_total_sales||0,s.row15_refund_service_total_tax||0,
         s.row15_refund_service_deduct||0,s.row15_refund_service_after_sales||0,s.row15_refund_service_after_tax||0)
    + '</tr>'

    // ============== 三、免抵退税 (2 rows) ==============
    + '<tr>'
    + '<td rowspan="2" style="'+catStyle+'">免抵退税</td>'
    + '<td colspan="2">货物及加工修理修配劳务</td><td style="text-align:center">16</td>' + RD() + '</tr>'
    + '<tr><td colspan="2">服务、不动产和无形资产</td><td style="text-align:center">17</td>' + RD() + '</tr>'

    // ============== 四、免税 (2 rows) ==============
    + '<tr>'
    + '<td rowspan="2" style="'+catStyle+'">免税</td>'
    + '<td colspan="2">货物及加工修理修配劳务</td><td style="text-align:center">18</td>' + RD() + '</tr>'
    + '<tr><td colspan="2">服务、不动产和无形资产</td><td style="text-align:center">19</td>' + RD() + '</tr>'

    + '</tbody></table></div>';
}

// ==================== 附表一计算函数 ====================
function calculateSchedule1() {
  // 行配置：rowNumber: { type: 'goods'|'service'|'refund_goods'|'refund_service', taxRate: 税率 }
  var rowConfig = {
    1: { type: 'goods' },
    2: { type: 'service', taxRate: 0.13 },
    3: { type: 'goods' },
    4: { type: 'service', taxRate: 0.09 },
    5: { type: 'service', taxRate: 0.06 },
    6: { type: 'refund_goods' },
    7: { type: 'refund_service', taxRate: 0.13 },
    8: { type: 'goods' },
    9: { type: 'goods' },
    10: { type: 'service', taxRate: 0.05 },
    11: { type: 'goods' },
    12: { type: 'goods' },
    13: { type: 'service', taxRate: 0.03 },
    14: { type: 'goods' },
    15: { type: 'goods' },
    16: { type: 'goods' },
    17: { type: 'refund_goods' },
    18: { type: 'refund_service' }
  };

  for (var row = 1; row <= 18; row++) {
    var cfg = rowConfig[row];
    if (!cfg) continue;

    // 获取第1-8列的值
    var col1 = parseFloat(document.getElementById('sch1-row' + row + '_col1')?.value) || 0;
    var col2 = parseFloat(document.getElementById('sch1-row' + row + '_col2')?.value) || 0;
    var col3 = parseFloat(document.getElementById('sch1-row' + row + '_col3')?.value) || 0;
    var col4 = parseFloat(document.getElementById('sch1-row' + row + '_col4')?.value) || 0;
    var col5 = parseFloat(document.getElementById('sch1-row' + row + '_col5')?.value) || 0;
    var col6 = parseFloat(document.getElementById('sch1-row' + row + '_col6')?.value) || 0;
    var col7 = parseFloat(document.getElementById('sch1-row' + row + '_col7')?.value) || 0;
    var col8 = parseFloat(document.getElementById('sch1-row' + row + '_col8')?.value) || 0;

    // 第9列 = 第1列 + 第3列 + 第5列 + 第7列
    var col9 = col1 + col3 + col5 + col7;
    // 第10列 = 第2列 + 第4列 + 第6列 + 第8列
    var col10 = col2 + col4 + col6 + col8;
    // 第11列 = 第9列 + 第10列（价税合计）
    var col11 = col9 + col10;

    // 更新第9/10/11列（只读显示）
    var el9 = document.getElementById('sch1-row' + row + '_col9');
    var el10 = document.getElementById('sch1-row' + row + '_col10');
    var el11 = document.getElementById('sch1-row' + row + '_col11');
    if (el9) el9.value = _fm0(col9);
    if (el10) el10.value = _fm0(col10);
    if (el11) el11.value = _fm0(col11);

    // 服务行和即征即退服务行：计算第13/14列
    if (cfg.type === 'service' || cfg.type === 'refund_service') {
      var col12 = parseFloat(document.getElementById('sch1-row' + row + '_col12')?.value) || 0;
      // 第13列 = 第11列 - 第12列
      var col13 = col11 - col12;
      // 第14列 = 第13列 / (100% + 税率) × 税率
      var col14 = 0;
      if (cfg.taxRate && col13 !== 0) {
        col14 = col13 / (1 + cfg.taxRate) * cfg.taxRate;
      }

      var el13 = document.getElementById('sch1-row' + row + '_col13');
      var el14 = document.getElementById('sch1-row' + row + '_col14');
      if (el13) el13.value = _fm0(col13);
      if (el14) el14.value = _fm0(col14);
    }
  }
  // 附表 → 主表同步
  syncMainFromSchedules();
}

// ==================== 附表二：进项税额明细 ====================
function renderSchedule2(data) {
  const inp = safeJSON(data.form_input, {});

  var inputStyle = 'width:100%;text-align:right;font-size:11px;border:none;background:transparent;padding:2px 4px';

  // 份数输入（整数）
  function tdS2Cnt(field, val) {
    var id = 'sch2-' + field;
    var v = (val != null && val !== '' && !isNaN(val)) ? ' value="' + parseInt(val) + '"' : '';
    return '<td class="num"><input type="number" step="1" id="' + id + '"' + v + ' style="width:60px;' + inputStyle + '" onchange="calculateSchedule2()"></td>';
  }
  // 金额/税额输入
  function tdS2Num(field, val) {
    var id = 'sch2-' + field;
    var v = (val != null && val !== '' && !isNaN(val)) ? ' value="' + parseFloat(val).toFixed(2) + '"' : '';
    return '<td class="num"><input type="number" step="0.01" id="' + id + '"' + v + ' style="' + inputStyle + '" onchange="calculateSchedule2()"></td>';
  }
  // 计算结果（可编辑）
  function tdS2Calc(id, val) {
    var v = (val != null && val !== '' && !isNaN(val)) ? parseFloat(val) : 0;
    return '<td class="num"><input type="number" step="0.01" id="' + id + '" value="' + v + '" style="width:100%;text-align:right;font-size:11px;border:none;background:transparent;padding:2px 4px" onchange="calculateSchedule2()"></td>';
  }
  // 份数+金额+税额 三列可编辑
  function s3(cntF, amtF, taxF, cntV, amtV, taxV) {
    return tdS2Cnt(cntF, cntV) + tdS2Num(amtF, amtV) + tdS2Num(taxF, taxV);
  }
  // 份数+税额 两列(无金额列)
  function s2(cntF, taxF, cntV, taxV) {
    return tdS2Cnt(cntF, cntV) + '<td class="num">——</td>' + tdS2Num(taxF, taxV);
  }
  // 仅税额一列
  function s1(field, val) {
    return '<td class="num">——</td><td class="num">——</td>' + tdS2Num(field, val);
  }
  function dash3() { return '<td class="num">——</td><td class="num">——</td><td class="num">——</td>'; }

  return '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税及附加税费申报表附列资料（二）</div>'
    + '<div style="font-size:11px;color:#6b7280;text-align:center;margin-bottom:6px">（本期进项税额明细）</div>'

    // 一、申报抵扣的进项税额
    + '<div style="font-size:12px;font-weight:600;margin-bottom:4px">一、申报抵扣的进项税额</div>'
    + '<table class="vat-form-table" style="table-layout:fixed;width:900px"><colgroup>'
    + '<col style="width:450px"><col style="width:90px"><col style="width:120px"><col style="width:120px"><col style="width:120px"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th>项目</th><th>栏次</th><th>份数</th><th>金额</th><th>税额</th></tr></thead><tbody>'

    // Row 1 = 2+3
    + '<tr><td>（一）认证相符的增值税专用发票</td><td style="text-align:center">1=2+3</td>'
    + tdS2Calc('sch2-row1_certified_count', inp.row1_certified_count)
    + tdS2Calc('sch2-row1_certified_amount', inp.row1_certified_amount)
    + tdS2Calc('sch2-row1_certified_tax', inp.row1_certified_tax) + '</tr>'

    // Row 2
    + '<tr><td style="padding-left:16px">其中：本期认证相符且本期申报抵扣</td><td style="text-align:center">2</td>'
    + s3('row2_certified_curr_count','row2_certified_curr_amount','row2_certified_curr_tax',
        inp.row2_certified_curr_count,inp.row2_certified_curr_amount,inp.row2_certified_curr_tax) + '</tr>'

    // Row 3
    + '<tr><td style="padding-left:16px">　　　前期认证相符且本期申报抵扣</td><td style="text-align:center">3</td>'
    + s3('row3_certified_prior_count','row3_certified_prior_amount','row3_certified_prior_tax',
        inp.row3_certified_prior_count,inp.row3_certified_prior_amount,inp.row3_certified_prior_tax) + '</tr>'

    // Row 4 = 5+6+7+8a+8b
    + '<tr><td>（二）其他扣税凭证</td><td style="text-align:center">4=5+6+7+8a+8b</td>'
    + tdS2Calc('sch2-row4_other_count', inp.row4_other_count)
    + tdS2Calc('sch2-row4_other_amount', inp.row4_other_amount)
    + tdS2Calc('sch2-row4_other_tax', inp.row4_other_tax) + '</tr>'

    // Row 5
    + '<tr><td style="padding-left:16px">其中：海关进口增值税专用缴款书</td><td style="text-align:center">5</td>'
    + s3('row5_customs_count','row5_customs_amount','row5_customs_tax',
        inp.row5_customs_count,inp.row5_customs_amount,inp.row5_customs_tax) + '</tr>'

    // Row 6
    + '<tr><td style="padding-left:16px">　　　农产品收购发票或者销售发票</td><td style="text-align:center">6</td>'
    + s3('row6_agri_count','row6_agri_amount','row6_agri_tax',
        inp.row6_agri_count,inp.row6_agri_amount,inp.row6_agri_tax) + '</tr>'

    // Row 7 (无金额列)
    + '<tr><td style="padding-left:16px">　　　代扣代缴税收缴款凭证</td><td style="text-align:center">7</td>'
    + s2('row7_wht_count','row7_wht_tax',inp.row7_wht_count,inp.row7_wht_tax) + '</tr>'

    // Row 8a (仅税额)
    + '<tr><td style="padding-left:16px">　　　加计扣除农产品进项税额</td><td style="text-align:center">8a</td>'
    + s1('row8a_agri_extra',inp.row8a_agri_extra) + '</tr>'

    // Row 8b
    + '<tr><td style="padding-left:16px">　　　其他</td><td style="text-align:center">8b</td>'
    + s3('row8b_other_count','row8b_other_amount','row8b_other_tax',
        inp.row8b_other_count,inp.row8b_other_amount,inp.row8b_other_tax) + '</tr>'

    // Row 9
    + '<tr><td>（三）本期用于购建不动产的扣税凭证</td><td style="text-align:center">9</td>'
    + s3('row9_real_estate_count','row9_real_estate_amount','row9_real_estate_tax',
        inp.row9_real_estate_count,inp.row9_real_estate_amount,inp.row9_real_estate_tax) + '</tr>'

    // Row 10
    + '<tr><td>（四）本期用于抵扣的旅客运输服务扣税凭证</td><td style="text-align:center">10</td>'
    + s3('row10_travel_count','row10_travel_amount','row10_travel_tax',
        inp.row10_travel_count,inp.row10_travel_amount,inp.row10_travel_tax) + '</tr>'

    // Row 11 (仅税额)
    + '<tr><td>（五）外贸企业进项税额抵扣证明</td><td style="text-align:center">11</td>'
    + s1('row11_foreign_trade_tax',inp.row11_foreign_trade_tax) + '</tr>'

    // Row 12 = 1+4+11
    + '<tr style="background:#f0fdf4;font-weight:700"><td>当期申报抵扣进项税额合计</td><td style="text-align:center">12=1+4+11</td>'
    + tdS2Calc('sch2-row12_total_count', inp.row12_total_count)
    + tdS2Calc('sch2-row12_total_amount', inp.row12_total_amount)
    + tdS2Calc('sch2-row12_total_tax', inp.row12_total_tax) + '</tr>'
    + '</tbody></table>'

    // 二、进项税额转出额
    + '<div style="font-size:12px;font-weight:600;margin:12px 0 4px 0">二、进项税额转出额</div>'
    + '<table class="vat-form-table" style="table-layout:fixed;width:900px"><colgroup>'
    + '<col style="width:700px"><col style="width:100px"><col style="width:100px"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th>项目</th><th>栏次</th><th>税额</th></tr></thead><tbody>'

    // Row 13 = 14+...+23b
    + '<tr><td>本期进项税额转出额</td><td style="text-align:center">13=14至23之和</td>'
    + tdS2Calc('sch2-row13_transfer_out_total', inp.row13_transfer_out_total) + '</tr>'

    + '<tr><td style="padding-left:16px">其中：免税项目用</td><td style="text-align:center">14</td>' + tdS2Num('row14_exempt_transfer', inp.row14_exempt_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　集体福利、个人消费</td><td style="text-align:center">15</td>' + tdS2Num('row15_collective_transfer', inp.row15_collective_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　非正常损失</td><td style="text-align:center">16</td>' + tdS2Num('row16_abnormal_loss', inp.row16_abnormal_loss) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　简易计税方法征税项目用</td><td style="text-align:center">17</td>' + tdS2Num('row17_simple_tax_transfer', inp.row17_simple_tax_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　免抵退税办法不得抵扣的进项税额</td><td style="text-align:center">18</td>' + tdS2Num('row18_exempt_credit_transfer', inp.row18_exempt_credit_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　纳税检查调减进项税额</td><td style="text-align:center">19</td>' + tdS2Num('row19_tax_check_transfer', inp.row19_tax_check_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　红字专用发票信息表注明的进项税额</td><td style="text-align:center">20</td>' + tdS2Num('row20_red_letter_transfer', inp.row20_red_letter_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　上期留抵税额抵减欠税</td><td style="text-align:center">21</td>' + tdS2Num('row21_prior_credit_arrears', inp.row21_prior_credit_arrears) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　上期留抵税额退税</td><td style="text-align:center">22</td>' + tdS2Num('row22_prior_credit_refund', inp.row22_prior_credit_refund) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　异常凭证转出进项税额</td><td style="text-align:center">23a</td>' + tdS2Num('row23a_abnormal_transfer', inp.row23a_abnormal_transfer) + '</tr>'
    + '<tr><td style="padding-left:16px">　　　其他应作进项税额转出的情形</td><td style="text-align:center">23b</td>' + tdS2Num('row23b_other_transfer', inp.row23b_other_transfer) + '</tr>'
    + '</tbody></table>'

    // 三、待抵扣进项税额
    + '<div style="font-size:12px;font-weight:600;margin:12px 0 4px 0">三、待抵扣进项税额</div>'
    + '<table class="vat-form-table" style="table-layout:fixed;width:900px"><colgroup>'
    + '<col style="width:450px"><col style="width:90px"><col style="width:120px"><col style="width:120px"><col style="width:120px"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th>项目</th><th>栏次</th><th>份数</th><th>金额</th><th>税额</th></tr></thead><tbody>'

    // Row 24
    + '<tr><td>（一）认证相符的增值税专用发票</td><td style="text-align:center">24</td>' + dash3() + '</tr>'

    // Row 25
    + '<tr><td style="padding-left:16px">期初已认证相符但未申报抵扣</td><td style="text-align:center">25</td>'
    + s3('row25_pending_begin_count','row25_pending_begin_amount','row25_pending_begin_tax',
        inp.row25_pending_begin_count,inp.row25_pending_begin_amount,inp.row25_pending_begin_tax) + '</tr>'

    // Row 26
    + '<tr><td style="padding-left:16px">本期认证相符且本期未申报抵扣</td><td style="text-align:center">26</td>'
    + s3('row26_pending_curr_count','row26_pending_curr_amount','row26_pending_curr_tax',
        inp.row26_pending_curr_count,inp.row26_pending_curr_amount,inp.row26_pending_curr_tax) + '</tr>'

    // Row 27
    + '<tr><td style="padding-left:16px">期末已认证相符但未申报抵扣</td><td style="text-align:center">27</td>'
    + s3('row27_pending_end_count','row27_pending_end_amount','row27_pending_end_tax',
        inp.row27_pending_end_count,inp.row27_pending_end_amount,inp.row27_pending_end_tax) + '</tr>'

    // Row 28
    + '<tr><td style="padding-left:24px">其中：按照税法规定不允许抵扣</td><td style="text-align:center">28</td>'
    + s3('row28_not_allowed_count','row28_not_allowed_amount','row28_not_allowed_tax',
        inp.row28_not_allowed_count,inp.row28_not_allowed_amount,inp.row28_not_allowed_tax) + '</tr>'

    // Row 29 = 30+31+32+33
    + '<tr><td>（二）其他扣税凭证</td><td style="text-align:center">29=30至33之和</td>'
    + tdS2Calc('sch2-row29_other_pending_count', inp.row29_other_pending_count)
    + tdS2Calc('sch2-row29_other_pending_amount', inp.row29_other_pending_amount)
    + tdS2Calc('sch2-row29_other_pending_tax', inp.row29_other_pending_tax) + '</tr>'

    // Row 30
    + '<tr><td style="padding-left:16px">其中：海关进口增值税专用缴款书</td><td style="text-align:center">30</td>'
    + s3('row30_customs_pending_count','row30_customs_pending_amount','row30_customs_pending_tax',
        inp.row30_customs_pending_count,inp.row30_customs_pending_amount,inp.row30_customs_pending_tax) + '</tr>'

    // Row 31
    + '<tr><td style="padding-left:16px">　　　农产品收购发票或者销售发票</td><td style="text-align:center">31</td>'
    + s3('row31_agri_pending_count','row31_agri_pending_amount','row31_agri_pending_tax',
        inp.row31_agri_pending_count,inp.row31_agri_pending_amount,inp.row31_agri_pending_tax) + '</tr>'

    // Row 32 (无金额列)
    + '<tr><td style="padding-left:16px">　　　代扣代缴税收缴款凭证</td><td style="text-align:center">32</td>'
    + s2('row32_wht_pending_count','row32_wht_pending_tax',inp.row32_wht_pending_count,inp.row32_wht_pending_tax) + '</tr>'

    // Row 33
    + '<tr><td style="padding-left:16px">　　　其他</td><td style="text-align:center">33</td>'
    + s3('row33_other_pending_count','row33_other_pending_amount','row33_other_pending_tax',
        inp.row33_other_pending_count,inp.row33_other_pending_amount,inp.row33_other_pending_tax) + '</tr>'

    // Row 34
    + '<tr><td></td><td style="text-align:center">34</td><td class="num"></td><td class="num"></td><td class="num"></td></tr>'
    + '</tbody></table>'

    // 四、其他
    + '<div style="font-size:12px;font-weight:600;margin:12px 0 4px 0">四、其他</div>'
    + '<table class="vat-form-table" style="table-layout:fixed;width:900px"><colgroup>'
    + '<col style="width:450px"><col style="width:90px"><col style="width:120px"><col style="width:120px"><col style="width:120px"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th>项目</th><th>栏次</th><th>份数</th><th>金额</th><th>税额</th></tr></thead><tbody>'

    // Row 35
    + '<tr><td>本期认证相符的增值税专用发票</td><td style="text-align:center">35</td>'
    + s3('row35_cert_count','row35_cert_amount','row35_cert_tax',
        inp.row35_cert_count,inp.row35_cert_amount,inp.row35_cert_tax) + '</tr>'

    // Row 36 (仅税额)
    + '<tr><td>代扣代缴税额</td><td style="text-align:center">36</td>'
    + s1('row36_wht_total_tax',inp.row36_wht_total_tax) + '</tr>'
    + '</tbody></table>';
}

// ==================== 附表二计算函数 ====================
function calculateSchedule2() {
  // 读取输入值
  function gv(field) {
    var el = document.getElementById('sch2-' + field);
    if (!el) return 0;
    var v = parseFloat(el.value);
    return isNaN(v) ? 0 : v;
  }
  // 更新计算结果显示
  function uCalc(id, val, decimals) {
    if (decimals === undefined) decimals = 2;
    var el = document.getElementById('sch2-' + id);
    if (el) el.value = (val !== 0) ? (decimals === 0 ? val : _fm0(val)) : '';
  }

  // ===== 一、申报抵扣的进项税额 =====
  var r2_cnt = gv('row2_certified_curr_count');
  var r2_amt = gv('row2_certified_curr_amount');
  var r2_tax = gv('row2_certified_curr_tax');

  var r3_cnt = gv('row3_certified_prior_count');
  var r3_amt = gv('row3_certified_prior_amount');
  var r3_tax = gv('row3_certified_prior_tax');

  // Row 1 = 2 + 3
  var r1_cnt = r2_cnt + r3_cnt;
  var r1_amt = r2_amt + r3_amt;
  var r1_tax = r2_tax + r3_tax;
  uCalc('row1_certified_count', r1_cnt, 0);
  uCalc('row1_certified_amount', r1_amt);
  uCalc('row1_certified_tax', r1_tax);

  // Rows 5-8b
  var r5_cnt = gv('row5_customs_count');
  var r5_amt = gv('row5_customs_amount');
  var r5_tax = gv('row5_customs_tax');

  var r6_cnt = gv('row6_agri_count');
  var r6_amt = gv('row6_agri_amount');
  var r6_tax = gv('row6_agri_tax');

  var r7_cnt = gv('row7_wht_count');
  var r7_tax = gv('row7_wht_tax');

  var r8a_tax = gv('row8a_agri_extra');

  var r8b_cnt = gv('row8b_other_count');
  var r8b_amt = gv('row8b_other_amount');
  var r8b_tax = gv('row8b_other_tax');

  // Row 4 = 5+6+7+8a+8b (份数不含8a, 金额不含7/8a, 税额全含)
  var r4_cnt = r5_cnt + r6_cnt + r7_cnt + r8b_cnt;
  var r4_amt = r5_amt + r6_amt + r8b_amt;
  var r4_tax = r5_tax + r6_tax + r7_tax + r8a_tax + r8b_tax;
  uCalc('row4_other_count', r4_cnt, 0);
  uCalc('row4_other_amount', r4_amt);
  uCalc('row4_other_tax', r4_tax);

  // Row 11
  var r11_tax = gv('row11_foreign_trade_tax');

  // Row 12 = 1 + 4 + 11 (份数/金额仅含1+4, 税额含1+4+11)
  var r12_cnt = r1_cnt + r4_cnt;
  var r12_amt = r1_amt + r4_amt;
  var r12_tax = r1_tax + r4_tax + r11_tax;
  uCalc('row12_total_count', r12_cnt, 0);
  uCalc('row12_total_amount', r12_amt);
  uCalc('row12_total_tax', r12_tax);

  // ===== 二、进项税额转出额 =====
  var r14 = gv('row14_exempt_transfer');
  var r15 = gv('row15_collective_transfer');
  var r16 = gv('row16_abnormal_loss');
  var r17 = gv('row17_simple_tax_transfer');
  var r18 = gv('row18_exempt_credit_transfer');
  var r19 = gv('row19_tax_check_transfer');
  var r20 = gv('row20_red_letter_transfer');
  var r21 = gv('row21_prior_credit_arrears');
  var r22 = gv('row22_prior_credit_refund');
  var r23a = gv('row23a_abnormal_transfer');
  var r23b = gv('row23b_other_transfer');

  var r13 = r14 + r15 + r16 + r17 + r18 + r19 + r20 + r21 + r22 + r23a + r23b;
  uCalc('row13_transfer_out_total', r13);

  // ===== 三、待抵扣进项税额 =====
  var r30_cnt = gv('row30_customs_pending_count');
  var r30_amt = gv('row30_customs_pending_amount');
  var r30_tax = gv('row30_customs_pending_tax');

  var r31_cnt = gv('row31_agri_pending_count');
  var r31_amt = gv('row31_agri_pending_amount');
  var r31_tax = gv('row31_agri_pending_tax');

  var r32_cnt = gv('row32_wht_pending_count');
  var r32_tax = gv('row32_wht_pending_tax');

  var r33_cnt = gv('row33_other_pending_count');
  var r33_amt = gv('row33_other_pending_amount');
  var r33_tax = gv('row33_other_pending_tax');

  // Row 29 = 30+31+32+33 (份数不含8a, 金额不含32, 税额全含)
  var r29_cnt = r30_cnt + r31_cnt + r32_cnt + r33_cnt;
  var r29_amt = r30_amt + r31_amt + r33_amt;
  var r29_tax = r30_tax + r31_tax + r32_tax + r33_tax;
  uCalc('row29_other_pending_count', r29_cnt, 0);
  uCalc('row29_other_pending_amount', r29_amt);
  uCalc('row29_other_pending_tax', r29_tax);

  // 附表 → 主表同步
  syncMainFromSchedules();
}

// ==================== 附表三：扣除项目明细 ====================
function renderSchedule3(data) {
  const d = safeJSON(data.form_deduction, {});

  var inputStyle = 'width:100%;text-align:right;font-size:11px;border:none;background:transparent;padding:2px 4px';

  function ti(field, val) {
    var id = 'sch3-' + field;
    var v = (val != null && val !== '' && !isNaN(val)) ? ' value="' + parseFloat(val).toFixed(2) + '"' : '';
    return '<td class="num"><input type="number" step="0.01" id="' + id + '"' + v + ' style="' + inputStyle + '" onchange="calculateSchedule3()"></td>';
  }
  function tc(id, val) {
    var v = (val != null && val !== '' && !isNaN(val)) ? parseFloat(val) : 0;
    return '<td class="num"><input type="number" step="0.01" id="' + id + '" value="' + v + '" style="width:100%;text-align:right;font-size:11px;border:none;background:transparent;padding:2px 4px" onchange="calculateSchedule3()"></td>';
  }

  // 项目名称及字段前缀
  const projects = [
    { name: '13%税率的项目', pf: 'row1_13' },
    { name: '9%税率的项目', pf: 'row2_9' },
    { name: '6%税率的项目（不含金融商品转让）', pf: 'row3_6' },
    { name: '6%税率的金融商品转让项目', pf: 'row4_6_fin' },
    { name: '5%征收率的项目', pf: 'row5_5' },
    { name: '3%征收率的项目', pf: 'row6_3' },
    { name: '免抵退税的项目', pf: 'row7_exempt_credit' },
    { name: '免税的项目', pf: 'row8_exempt' },
  ];

  let html = '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税及附加税费申报表附列资料（三）</div>'
    + '<div style="font-size:11px;color:#6b7280;text-align:center;margin-bottom:6px">（服务、不动产和无形资产扣除项目明细）</div>'
    + '<table class="vat-form-table">'
    + '<colgroup><col><col><col><col><col><col><col><col></colgroup>'
    + '<thead>'
    + '<tr style="background:#d9e2f3"><th rowspan="3" colspan="2">项目及栏次</th>'
    + '<th rowspan="2">本期服务、不动产和无形资产<br>价税合计额（免税销售额）</th>'
    + '<th colspan="5">服务、不动产和无形资产扣除项目</th></tr>'
    + '<tr style="background:#d9e2f3"><th>期初余额</th><th>本期发生额</th><th>本期应扣除金额</th><th>本期实际扣除金额</th><th>期末余额</th></tr>'
    + '<tr style="background:#e8edf5"><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center">3</th><th style="text-align:center;font-size:10px">4=2+3</th><th style="text-align:center;font-size:10px">5（5≤1且5≤4）</th><th style="text-align:center;font-size:10px">6=4-5</th></tr>'
    + '</thead>'
    + '<tbody>';

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const pf = p.pf;
    html += '<tr><td>' + p.name + '</td><td style="text-align:center">' + (i+1) + '</td>'
      + ti(pf + '_price_tax', d[pf + '_price_tax'])        // 列1: 价税合计（可编辑）
      + ti(pf + '_begin', d[pf + '_begin'])                // 列2: 期初余额（可编辑）
      + ti(pf + '_occur', d[pf + '_occur'])                // 列3: 本期发生额（可编辑）
      + tc('sch3-' + pf + '_should', d[pf + '_should'])    // 列4: 应扣除=2+3（计算）
      + ti(pf + '_actual', d[pf + '_actual'])              // 列5: 实际扣除（可编辑）
      + tc('sch3-' + pf + '_end', d[pf + '_end'])          // 列6: 期末余额=4-5（计算）
      + '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

// ==================== 附表三计算函数 ====================
function calculateSchedule3() {
  function gv(field) {
    var el = document.getElementById('sch3-' + field);
    if (!el) return 0;
    var v = parseFloat(el.value);
    return isNaN(v) ? 0 : v;
  }
  function uCalc(id, val) {
    var el = document.getElementById('sch3-' + id);
    if (el) el.value = (val !== 0) ? _fm0(val) : '';
  }

  var prefixes = ['row1_13','row2_9','row3_6','row4_6_fin','row5_5','row6_3','row7_exempt_credit','row8_exempt'];
  for (var i = 0; i < prefixes.length; i++) {
    var pf = prefixes[i];
    var begin = gv(pf + '_begin');
    var occur = gv(pf + '_occur');
    var actual = gv(pf + '_actual');
    var should = begin + occur;
    var end = should - actual;
    uCalc(pf + '_should', should);
    uCalc(pf + '_end', end);
  }
}

// ==================== 附表四：税额抵减情况表 ====================
function renderSchedule4(data) {
  const c = safeJSON(data.form_credit, {});

  var inputStyle = 'width:100%;text-align:right;font-size:11px;border:none;background:transparent;padding:2px 4px';

  function ti(field, val) {
    var id = 'sch4-' + field;
    var v = (val != null && val !== '' && !isNaN(val)) ? ' value="' + parseFloat(val).toFixed(2) + '"' : '';
    return '<td class="num"><input type="number" step="0.01" id="' + id + '"' + v + ' style="' + inputStyle + '" onchange="calculateSchedule4()"></td>';
  }
  function tc(id, val) {
    var v = (val != null && val !== '' && !isNaN(val)) ? parseFloat(val) : 0;
    return '<td class="num"><input type="number" step="0.01" id="sch4-' + id + '" value="' + v + '" style="width:100%;text-align:right;font-size:11px;border:none;background:transparent;padding:2px 4px" onchange="calculateSchedule4()"></td>';
  }

  return '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税及附加税费申报表附列资料（四）</div>'
    + '<div style="font-size:11px;color:#6b7280;text-align:center;margin-bottom:6px">（税额抵减情况表）</div>'

    // 一、税额抵减情况
    + '<div style="font-size:12px;font-weight:600;margin-bottom:4px">一、税额抵减情况</div>'
    + '<table class="vat-form-table" style="table-layout:fixed;width:960px"><colgroup>'
    + '<col style="width:60px"><col style="width:300px"><col style="width:120px"><col style="width:120px"><col style="width:120px"><col style="width:120px"><col style="width:120px"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th rowspan="2">序号</th><th rowspan="2">抵减项目</th><th>期初余额</th><th>本期发生额</th><th>本期应抵减税额</th><th>本期实际抵减税额</th><th>期末余额</th></tr>'
    + '<tr style="background:#e8edf5"><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center;font-size:10px">3=1+2</th><th style="text-align:center;font-size:10px">4≤3</th><th style="text-align:center;font-size:10px">5=3-4</th></tr></thead><tbody>'

    + '<tr><td style="text-align:center">1</td><td style="white-space:nowrap">增值税税控系统专用设备费及技术维护费</td>'
    + ti('tax_control_begin', c.tax_control_begin) + ti('tax_control_occur', c.tax_control_occur)
    + tc('tax_control_should', c.tax_control_should) + ti('tax_control_actual', c.tax_control_actual)
    + tc('tax_control_end', c.tax_control_end) + '</tr>'

    + '<tr><td style="text-align:center">2</td><td style="white-space:nowrap">分支机构预征缴纳税款</td>'
    + ti('branch_begin', c.branch_begin) + ti('branch_occur', c.branch_occur)
    + tc('branch_should', c.branch_should) + ti('branch_actual', c.branch_actual)
    + tc('branch_end', c.branch_end) + '</tr>'

    + '<tr><td style="text-align:center">3</td><td style="white-space:nowrap">建筑服务预征缴纳税款</td>'
    + ti('construction_begin', c.construction_begin) + ti('construction_occur', c.construction_occur)
    + tc('construction_should', c.construction_should) + ti('construction_actual', c.construction_actual)
    + tc('construction_end', c.construction_end) + '</tr>'

    + '<tr><td style="text-align:center">4</td><td style="white-space:nowrap">销售不动产预征缴纳税款</td>'
    + ti('real_estate_begin', c.real_estate_begin) + ti('real_estate_occur', c.real_estate_occur)
    + tc('real_estate_should', c.real_estate_should) + ti('real_estate_actual', c.real_estate_actual)
    + tc('real_estate_end', c.real_estate_end) + '</tr>'

    + '<tr><td style="text-align:center">5</td><td style="white-space:nowrap">出租不动产预征缴纳税款</td>'
    + ti('rental_begin', c.rental_begin) + ti('rental_occur', c.rental_occur)
    + tc('rental_should', c.rental_should) + ti('rental_actual', c.rental_actual)
    + tc('rental_end', c.rental_end) + '</tr>'

    + '</tbody></table>'

    // 二、加计抵减情况
    + '<div style="font-size:12px;font-weight:600;margin:12px 0 4px 0">二、加计抵减情况</div>'
    + '<table class="vat-form-table" style="table-layout:fixed;width:960px"><colgroup>'
    + '<col style="width:60px"><col style="width:180px"><col style="width:120px"><col style="width:120px"><col style="width:120px"><col style="width:120px"><col style="width:120px"><col style="width:120px"></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th rowspan="2">序号</th><th rowspan="2">加计抵减项目</th><th>期初余额</th><th>本期发生额</th><th>本期调减额</th><th>本期可抵减额</th><th>本期实际抵减额</th><th>期末余额</th></tr>'
    + '<tr style="background:#e8edf5"><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center">3</th><th style="text-align:center;font-size:10px">4=1+2-3</th><th style="text-align:center">5</th><th style="text-align:center;font-size:10px">6=4-5</th></tr></thead><tbody>'

    + '<tr><td style="text-align:center">6</td><td>一般项目加计抵减额计算</td>'
    + ti('item1_begin', c.item1_begin) + ti('item1_occur', c.item1_occur) + ti('item1_adjust', c.item1_adjust)
    + tc('item1_can_deduct', c.item1_can_deduct) + ti('item1_actual_deduct', c.item1_actual_deduct)
    + tc('item1_end', c.item1_end) + '</tr>'

    + '<tr><td style="text-align:center">7</td><td>即征即退项目加计抵减额计算</td>'
    + ti('item2_begin', c.item2_begin) + ti('item2_occur', c.item2_occur) + ti('item2_adjust', c.item2_adjust)
    + tc('item2_can_deduct', c.item2_can_deduct) + ti('item2_actual_deduct', c.item2_actual_deduct)
    + tc('item2_end', c.item2_end) + '</tr>'

    // Row 8 = 合计（计算）
    + '<tr style="background:#f0fdf4;font-weight:700"><td style="text-align:center">8</td><td>合计</td>'
    + tc('total_begin', (c.item1_begin || 0) + (c.item2_begin || 0))
    + tc('total_occur', (c.item1_occur || 0) + (c.item2_occur || 0))
    + tc('total_adjust', (c.item1_adjust || 0) + (c.item2_adjust || 0))
    + tc('total_can_deduct', (c.item1_can_deduct || 0) + (c.item2_can_deduct || 0))
    + tc('total_actual_deduct', (c.item1_actual_deduct || 0) + (c.item2_actual_deduct || 0))
    + tc('total_end', (c.item1_end || 0) + (c.item2_end || 0)) + '</tr>'
    + '</tbody></table>';
}

// ==================== 附表四计算函数 ====================
function calculateSchedule4() {
  function gv(field) {
    var el = document.getElementById('sch4-' + field);
    if (!el) return 0;
    var v = parseFloat(el.value);
    return isNaN(v) ? 0 : v;
  }
  function uc(id, val) {
    var el = document.getElementById('sch4-' + id);
    if (el) el.value = (val !== 0) ? _fm0(val) : '';
  }

  // 一、税额抵减: should=1+2, end=3-4
  var items1 = ['tax_control','branch','construction','real_estate','rental'];
  for (var i = 0; i < items1.length; i++) {
    var p = items1[i];
    var begin = gv(p + '_begin');
    var occur = gv(p + '_occur');
    var actual = gv(p + '_actual');
    var should = begin + occur;
    var end = should - actual;
    uc(p + '_should', should);
    uc(p + '_end', end);
  }

  // 二、加计抵减: can_deduct=1+2-3, end=4-5
  var items2 = ['item1','item2'];
  var tBeg=0, tOcc=0, tAdj=0, tCan=0, tAct=0, tEnd=0;
  for (var j = 0; j < items2.length; j++) {
    var p = items2[j];
    var begin = gv(p + '_begin');
    var occur = gv(p + '_occur');
    var adjust = gv(p + '_adjust');
    var actual = gv(p + '_actual_deduct');
    var canDeduct = begin + occur - adjust;
    var end = canDeduct - actual;
    uc(p + '_can_deduct', canDeduct);
    uc(p + '_end', end);

    tBeg += begin; tOcc += occur; tAdj += adjust; tCan += canDeduct; tAct += actual; tEnd += end;
  }
  // Row 8 合计
  uc('total_begin', tBeg);
  uc('total_occur', tOcc);
  uc('total_adjust', tAdj);
  uc('total_can_deduct', tCan);
  uc('total_actual_deduct', tAct);
  uc('total_end', tEnd);

  // 附表 → 主表同步
  syncMainFromSchedules();
}

// ==================== 附表五：附加税费情况表（官方模板还原） ====================
function renderSchedule5(data) {
  const scf = safeJSON(data.form_surcharge, {});
  var T = 'width:1989px;table-layout:fixed;white-space:nowrap';
  var TdStyle = 'overflow:hidden;text-overflow:ellipsis';

  // ---- helpers ----
  var B = 'border:1px solid #a0a0a0', P='padding:2px 3px', bgHead='#d9e2f3', bgSub='#e8edf5';
  function N(id,val,w) {
    var v = (val!=null && val!=='' && !isNaN(val)) ? parseFloat(val) : '';
    return '<input type="number" step="0.01" id="sch5-'+id+'" value="'+v+'" style="width:100%;text-align:right;border:none;background:transparent;font-size:11px;padding:1px 2px" onchange="calculateSchedule5()">';
  }
  function Pct(id,val) {
    var v = (val!=null && !isNaN(val)) ? Math.round(val*100) : '';
    return '<input type="number" step="1" min="0" max="100" id="sch5-'+id+'" value="'+v+'" style="width:100%;text-align:right;border:none;background:transparent;font-size:11px;padding:0 2px" onchange="calculateSchedule5()">';
  }
  function Txt(id,val) {
    return '<input type="text" id="sch5-'+id+'" value="'+(val||'')+'" style="width:100%;border:none;background:transparent;font-size:11px;padding:0 2px;text-align:center">';
  }
  function Calc(id,val) {
    var v = (val!=null && val!=='' && !isNaN(val)) ? parseFloat(val) : '';
    return '<input type="number" step="0.01" id="sch5-'+id+'" value="'+v+'" style="width:100%;text-align:right;border:none;background:transparent;font-size:11px;font-weight:700;padding:1px 2px" onchange="calculateSchedule5()">';
  }
  function Dash() { return '<span style="color:#9ca3af;font-size:11px">——</span>'; }
  function Td(inner,st) {
    return '<td style="'+B+';'+P+';'+TdStyle+';'+(st||'')+'">'+inner+'</td>';
  }
  function Th(inner,st) {
    return '<th style="'+B+';'+P+';'+TdStyle+';'+(st||'')+'">'+inner+'</th>';
  }

  // ---- micro policy data ----
  var microYes = (data.micro_enterprise && data.six_tax_reduction) ? '☑' : '□';
  var fmtDate = function(d) { if(!d) return ''; var p=d.split('-'); return p[0]+'年'+(p[1]||'')+'月'+(p[2]||'')+'日'; };
  var rs = fmtDate(data.reduction_start), re = fmtDate(data.reduction_end);
  var zt = (data.micro_enterprise && data.six_tax_reduction) ? '☑个体工商户　☑小型微利企业' : '□个体工商户　□小型微利企业';

  var html = '';

  // ===== 统一容器 =====
  html += '<div style="max-width:1989px;margin:0 auto">';
  // 标题：同在一行
  html += '<div style="text-align:center;font-size:16px;font-weight:700;padding:6px 0 6px">增值税及附加税费申报表（一般纳税人适用）附列资料（五）（附加税费情况表）</div>';

  // ===== 主表格（含政策行+数据行，无缝隙） =====
  html += '<div style="overflow-x:auto">';
  html += '<style>.sch5-table td,.sch5-table th{overflow:hidden;text-overflow:ellipsis}</style>';
  html += '<table class="vat-form-table sch5-table" style="'+T+';font-size:11px;border-collapse:collapse;border:1px solid #a0a0a0">';

  // colgroup: 16列 — 全部×1.5
  html += '<colgroup>';
  html += '<col style="width:127px"><col style="width:42px">';    // 1税种 2序号
  html += '<col style="width:120px"><col style="width:132px"><col style="width:158px">';  // 3增值税 4免抵 5留抵
  html += '<col style="width:45px"><col style="width:52px">';    // 6-7税率 merged=97px
  html += '<col style="width:165px">';   // 8 应纳税
  html += '<col style="width:127px">';   // 9 减免代码
  html += '<col style="width:120px">';   // 10 减免额
  html += '<col style="width:120px">';   // 11 减征%
  html += '<col style="width:150px">';   // 12 减征额
  html += '<col style="width:128px">';   // 13 试点代码
  html += '<col style="width:120px">';   // 14 抵免
  html += '<col style="width:150px">';   // 15 已缴
  html += '<col style="width:233px">';   // 16 应补退
  html += '</colgroup>';
  // verify: 127+42+120+132+158+45+52+165+127+120+120+150+128+120+150+233 = 1989

  // ===== thead: 表头5行（重排: 原4→1, 原5→2, 原1→3, 原2→4, 原3→5） =====
  html += '<thead>';

  // --- Row 1 (原Row 4): 子列名 ---
  html += '<tr style="background:'+bgSub+';font-size:10px;text-align:center">';
  html += '<th colspan="2" style="'+B+';'+P+'">税（费）种</th>';
  html += '<th style="'+B+';'+P+'">增值税税额</th>';
  html += '<th style="'+B+';'+P+'">增值税免抵税额</th>';
  html += '<th style="'+B+';'+P+'">留抵退税本期扣除额</th>';
  html += '<th colspan="2" style="'+B+';'+P+'">税（费）率（%）</th>';
  html += '<th style="'+B+';'+P+'">本期应纳税（费）额</th>';
  html += '<th style="'+B+';'+P+'">减免性质代码</th>';
  html += '<th style="'+B+';'+P+'">减免税（费）额</th>';
  html += '<th style="'+B+';'+P+'">减征比例（%）</th>';
  html += '<th style="'+B+';'+P+'">减征额</th>';
  html += '<th style="'+B+';'+P+'">减免性质代码</th>';
  html += '<th style="'+B+';'+P+'">本期抵免金额</th>';
  html += '<th style="'+B+';'+P+'">本期已缴税（费）额</th>';
  html += '<th style="'+B+';'+P+'">本期应补（退）税（费）额</th>';
  html += '</tr>';

  // --- Row 2 (原Row 5): 列号/公式 ---
  html += '<tr style="background:#f0f4ff;font-size:9px;color:#6b7280;text-align:center">';
  html += '<td colspan="2" style="'+B+';padding:1px 2px"></td>';
  html += '<td style="'+B+';padding:1px 2px">1</td>';
  html += '<td style="'+B+';padding:1px 2px">2</td>';
  html += '<td style="'+B+';padding:1px 2px">3</td>';
  html += '<td colspan="2" style="'+B+';padding:1px 2px">4</td>';
  html += '<td style="'+B+';padding:1px 2px">5=(1+2-3)×4</td>';
  html += '<td style="'+B+';padding:1px 2px">6</td>';
  html += '<td style="'+B+';padding:1px 2px">7</td>';
  html += '<td style="'+B+';padding:1px 2px">8</td>';
  html += '<td style="'+B+';padding:1px 2px">9=(5-7)×8</td>';
  html += '<td style="'+B+';padding:1px 2px">10</td>';
  html += '<td style="'+B+';padding:1px 2px">11</td>';
  html += '<td style="'+B+';padding:1px 2px">12</td>';
  html += '<td style="'+B+';padding:1px 2px">13=5-7-9-11-12</td>';
  html += '</tr>';

  // --- Row 3 (原Row 1): 小微企业政策 ---
  var polCols = 'border:1px solid #a0a0a0;padding:2px 4px;white-space:nowrap';
  html += '<tr style="background:#fefce8;font-size:11px">';
  html += '<td colspan="6" style="'+polCols+'">本期是否适用小微企业"六税两费"减免政策</td>';
  html += '<td colspan="2" style="'+polCols+';text-align:center">'+microYes+'是　'+(microYes=='☑'?'□':'□')+'否</td>';
  html += '<td colspan="3" style="'+polCols+'">减免政策适用主体</td>';
  html += '<td colspan="5" style="'+polCols+'">'+zt+'</td>';
  html += '</tr>';

  // --- Row 4 (原Row 2): 起止时间 ---
  html += '<tr style="background:#fefce8;font-size:11px">';
  html += '<td colspan="6" style="'+polCols+'">适用减免政策起止时间</td>';
  html += '<td colspan="2" style="'+polCols+'">'+(rs||'　　年　月　日')+'</td>';
  html += '<td colspan="3" style="'+polCols+';text-align:center">至</td>';
  html += '<td colspan="5" style="'+polCols+'">'+(re||'　　年　月　日')+'</td>';
  html += '</tr>';

  // --- Row 5 (原Row 3): 主分组（rowspan已移除，每行独立） ---
  html += '<tr style="background:'+bgHead+';font-size:11px;font-weight:600;text-align:center">';
  html += '<th colspan="2" style="'+B+';'+P+';vertical-align:middle">税（费）种</th>';
  html += '<th colspan="3" style="'+B+';'+P+'">计税（费）依据</th>';
  html += '<th colspan="2" style="'+B+';'+P+';vertical-align:middle">税（费）率（%）</th>';
  html += '<th style="'+B+';'+P+';vertical-align:middle">本期应纳税（费）额</th>';
  html += '<th colspan="2" style="'+B+';'+P+'">本期减免税（费）额</th>';
  html += '<th colspan="2" style="'+B+';'+P+'">小微企业"六税两费"减免政策</th>';
  html += '<th colspan="2" style="'+B+';'+P+'">试点建设培育产教融合型企业</th>';
  html += '<th style="'+B+';'+P+';vertical-align:middle">本期已缴税（费）额</th>';
  html += '<th style="'+B+';'+P+';vertical-align:middle">本期应补（退）税（费）额</th>';
  html += '</tr>';

  html += '</thead>';

  // ===== tbody: 数据行 =====
  html += '<tbody>';

  // --- 数据行辅助 ---
  function row(name,seq,pf,opts) {
    opts = opts || {};
    var dash13 = opts.dash13, dash14 = opts.dash14, isTotal = opts.isTotal;
    var r = '<tr'+(isTotal?' style="background:#f0fdf4;font-weight:700"':'')+'>';
    r += Td(name,'') + Td(seq,'text-align:center;font-weight:600');

    if (isTotal) {
      r += Td(Dash()) + Td(Dash()) + Td(Dash());
      r += '<td colspan="2" style="'+B+';'+P+';text-align:center">'+Dash()+'</td>';
      r += Td(Calc(pf+'_tax',scf[pf+'_tax']));
      r += Td(Dash());
      r += Td(Calc(pf+'_reduction',scf[pf+'_reduction']));
      r += Td(Dash());
      r += Td(Calc(pf+'_six_tax_reduction',scf[pf+'_six_tax_reduction']));
      r += Td(Dash());
      r += Td(Calc(pf+'_edu_pilot',scf[pf+'_edu_pilot']));
      r += Td(Calc(pf+'_paid',scf[pf+'_paid']));
      r += Td(Calc(pf+'_final',scf[pf+'_final']));
    } else {
      r += Td(N(pf+'_base',scf[pf+'_base']));
      r += Td(N(pf+'_exempt_credit',scf[pf+'_exempt_credit']));
      r += Td(N(pf+'_vat_refund_deduct',scf[pf+'_vat_refund_deduct']));
      r += '<td colspan="2" style="'+B+';'+P+'">'+Pct(pf+'_rate',scf[pf+'_rate'])+'</td>';
      r += Td(Calc(pf+'_tax',scf[pf+'_tax']));
      r += Td(Txt(pf+'_reduction_code',scf[pf+'_reduction_code']));
      r += Td(N(pf+'_reduction_amount',scf[pf+'_reduction_amount']));
      r += Td(Pct(pf+'_reduction_rate',scf[pf+'_reduction_rate']));
      r += Td(Calc(pf+'_six_tax_amount',scf[pf+'_six_tax_amount']));
      r += Td(dash13 ? Dash() : Txt(pf+'_edu_pilot_code',scf[pf+'_edu_pilot_code']));
      r += Td(dash14 ? Dash() : N(pf+'_edu_pilot_amount',scf[pf+'_edu_pilot_amount']));
      r += Td(N(pf+'_paid',scf[pf+'_paid']));
      r += Td(Calc(pf+'_final',scf[pf+'_final']));
    }
    r += '</tr>';
    return r;
  }

  html += row('城市维护建设税','1','city',{dash13:true,dash14:true});
  html += row('教育费附加','2','edu');
  html += row('地方教育附加','3','local_edu');
  html += row('合计','4','total',{isTotal:true});

  // ===== 产教融合 & 留抵退税（Row 12-17） =====
  function pilotRow(s1,s2,seq,col1) {
    var r = '<tr style="background:#dbeafe;font-size:11px">';
    if (s1) {
      r += '<td '+(s2?'rowspan="3"':'')+' colspan="5" style="'+B+';'+P+';text-align:left;font-weight:600">'+s1+'</td>';
      r += '<td '+(s2?'rowspan="3"':'')+' colspan="2" style="'+B+';'+P+';text-align:center">□是 □否</td>';
    }
    r += '<td colspan="5" style="'+B+';'+P+';text-align:left">'+col1+'</td>';
    r += '<td colspan="2" style="'+B+';'+P+';text-align:center;font-weight:600;font-size:13px">'+seq+'</td>';
    r += '<td colspan="2" style="'+B+';'+P+'">'+N('sch5_pilot_'+seq,scf['pilot_'+seq])+'</td>';
    r += '</tr>';
    return r;
  }
  html += pilotRow('本期是否适用试点建设培育产教融合型企业抵免政策',true,'5','当期新增投资额');
  html += pilotRow('',false,'6','上期留抵可抵免金额');
  html += pilotRow('',false,'7','结转下期可抵免金额');

  function vatRefundRow(s1,s2,seq,col1) {
    var r = '<tr style="background:#dbeafe;font-size:11px">';
    if (s1) {
      r += '<td '+(s2?'rowspan="3"':'')+' colspan="7" style="'+B+';'+P+';text-align:left;font-weight:600">'+s1+'</td>';
    }
    r += '<td colspan="5" style="'+B+';'+P+';text-align:left">'+col1+'</td>';
    r += '<td colspan="2" style="'+B+';'+P+';text-align:center;font-weight:600;font-size:13px">'+seq+'</td>';
    r += '<td colspan="2" style="'+B+';'+P+'">'+N('sch5_vat_refund_'+seq,scf['vat_refund_'+seq])+'</td>';
    r += '</tr>';
    return r;
  }
  html += vatRefundRow('可用于扣除的增值税留抵退税额使用情况',true,'8','当期新增可用于扣除的留抵退税额');
  html += vatRefundRow('',false,'9','上期结存可用于扣除的留抵退税额');
  html += vatRefundRow('',false,'10','结转下期可用于扣除的留抵退税额');

  html += '</tbody></table></div>';
  html += '</div>';  // 关闭统一外层容器
  return html;
}

// ==================== 附表五计算函数 ====================
function calculateSchedule5() {
  function gv(field) {
    var el = document.getElementById('sch5-' + field);
    if (!el) return 0;
    var v = parseFloat(el.value);
    return isNaN(v) ? 0 : v;
  }
  function uc(id, val) {
    var el = document.getElementById('sch5-' + id);
    if (el) el.value = (val !== 0) ? _fm0(val) : '';
  }

  var types = ['city','edu','local_edu'];
  var totalTax = 0, totalRed = 0, totalSix = 0, totalPilot = 0, totalPaid = 0, totalFinal = 0;

  for (var i = 0; i < types.length; i++) {
    var pf = types[i];
    var base = gv(pf + '_base');
    var exempt = gv(pf + '_exempt_credit');
    var refund = gv(pf + '_vat_refund_deduct');
    var ratePct = gv(pf + '_rate') / 100;  // 输入的是百分比值（如7% → 输入7 → /100=0.07）
    var redAmt = gv(pf + '_reduction_amount');
    var sixRate = gv(pf + '_reduction_rate') / 100;
    var pilotAmt = gv(pf + '_edu_pilot_amount');
    var paid = gv(pf + '_paid');

    // 5 = (1+2-3) × 4
    var tax = (base + exempt - refund) * ratePct;
    // 9 = (5-7) × 8
    var sixAmt = (tax - redAmt) * sixRate;
    // 13 = 5-7-9-11-12
    var final = tax - redAmt - sixAmt - pilotAmt - paid;

    uc(pf + '_tax', tax);
    uc(pf + '_six_tax_amount', sixAmt);
    uc(pf + '_final', final);

    totalTax += tax;
    totalRed += redAmt;
    totalSix += sixAmt;
    totalPilot += pilotAmt;
    totalPaid += paid;
    totalFinal += final;
  }

  // 合计行
  uc('total_tax', totalTax);
  uc('total_reduction', totalRed);
  uc('total_six_tax_reduction', totalSix);
  uc('total_edu_pilot', totalPilot);
  uc('total_paid', totalPaid);
  uc('total_final', totalFinal);

  // 附表 → 主表同步
  syncMainFromSchedules();
}


function renderReductionForm(data) {
  const r = safeJSON(data.form_reduction, {});

  var inputStyle = 'width:100%;text-align:right;font-size:11px;border:none;background:transparent;padding:2px 4px';

  function trd(field, val) {
    var id = 'red-' + field;
    var v = (val != null && val !== '' && !isNaN(val)) ? ' value="' + parseFloat(val).toFixed(2) + '"' : '';
    return '<td class="num"><input type="number" step="0.01" id="' + id + '"' + v + ' style="' + inputStyle + '" onchange="calculateReductionForm()"></td>';
  }
  function trc(id, val) {
    var v = (val != null && val !== '' && !isNaN(val)) ? parseFloat(val) : 0;
    return '<td class="num"><input type="number" step="0.01" id="red-' + id + '" value="' + v + '" style="width:100%;text-align:right;font-size:11px;border:none;background:transparent;padding:2px 4px" onchange="calculateReductionForm()"></td>';
  }

  let html = '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税减免税申报明细表</div>';

  // 一、减税项目
  html += '<div style="font-size:12px;font-weight:600;margin-bottom:4px">一、减税项目</div>';
  html += '<table class="vat-form-table"><colgroup><col><col><col><col><col><col><col></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th rowspan="2">减税性质代码及名称</th><th rowspan="2">栏次</th><th>期初余额</th><th>本期发生额</th><th>本期应抵减税额</th><th>本期实际抵减税额</th><th>期末余额</th></tr>'
    + '<tr style="background:#e8edf5"><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center;font-size:10px">3=1+2</th><th style="text-align:center;font-size:10px">4≤3</th><th style="text-align:center;font-size:10px">5=3-4</th></tr></thead>';

  const taxReductionItems = r.tax_reduction_items || r.reduction_items || [];
  if (taxReductionItems.length === 0) {
    html += '<tbody><tr><td>合计</td><td style="text-align:center">1</td>'
      + trd('tax_red_begin', r.tax_reduction_1_begin) + trd('tax_red_occur', r.tax_reduction_1_occur)
      + trc('tax_red_should', r.tax_reduction_1_should) + trd('tax_red_actual', r.tax_reduction_1_actual)
      + trc('tax_red_end', r.tax_reduction_1_end) + '</tr></tbody>';
  } else {
    html += '<tbody>';
    taxReductionItems.forEach((item, i) => {
      html += '<tr><td>' + escapeHtml(item.name || ('减税项目' + (i + 1))) + '</td><td style="text-align:center">' + (i + 1) + '</td>'
        + trd('tax_red_' + i + '_begin', item.begin_balance) + trd('tax_red_' + i + '_occur', item.current_amount)
        + trc('tax_red_' + i + '_should', item.should_reduce) + trd('tax_red_' + i + '_actual', item.actual_reduce)
        + trc('tax_red_' + i + '_end', item.end_balance) + '</tr>';
    });
    html += '</tbody>';
  }
  html += '</table>';

  // 二、免税项目
  html += '<div style="font-size:12px;font-weight:600;margin:12px 0 4px 0">二、免税项目</div>';
  html += '<table class="vat-form-table"><colgroup><col><col><col><col><col><col><col></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th rowspan="2">免税性质代码及名称</th><th rowspan="2">栏次</th><th>免征增值税<br>项目销售额</th><th>免税销售额扣除项目<br>本期实际扣除金额</th><th>扣除后免税销售额</th><th>免税销售额<br>对应的进项税额</th><th>免税额</th></tr>'
    + '<tr style="background:#e8edf5"><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center;font-size:10px">3=1-2</th><th style="text-align:center">4</th><th style="text-align:center">5</th></tr></thead><tbody>';

  const exemptItems = r.exempt_items || [];
  if (exemptItems.length === 0) {
    html += '<tr><td>合　计</td><td style="text-align:center">1</td>'
      + trd('exempt_1_sales', r.exempt_7_sales) + trd('exempt_1_deduction', r.exempt_7_deduction)
      + trc('exempt_1_after', r.exempt_7_after) + trd('exempt_1_input_tax', r.exempt_7_input_tax)
      + trc('exempt_1_amount', r.exempt_7_amount) + '</tr>'
      + '<tr><td>出口免税</td><td style="text-align:center">2</td>'
      + trd('exempt_2_sales', r.exempt_8_sales) + '<td class="num">——</td>'
      + trc('exempt_2_after', '') + '<td class="num">——</td>'
      + trd('exempt_2_amount', r.exempt_8_amount) + '</tr>'
      + '<tr><td style="padding-left:16px">其中：跨境服务</td><td style="text-align:center">3</td>'
      + trd('exempt_3_sales', r.exempt_9_sales) + '<td class="num">——</td>'
      + trc('exempt_3_after', '') + '<td class="num">——</td>'
      + trd('exempt_3_amount', r.exempt_9_amount) + '</tr>';
  } else {
    exemptItems.forEach((item, i) => {
      html += '<tr><td>' + escapeHtml(item.name || '') + '</td><td style="text-align:center">' + (i + 1) + '</td>'
        + trd('exempt_' + i + '_sales', item.exempt_sales) + trd('exempt_' + i + '_deduction', item.deduction_amount)
        + trc('exempt_' + i + '_after', item.after_deduction) + trd('exempt_' + i + '_input_tax', item.input_tax)
        + trc('exempt_' + i + '_amount', item.exempt_amount) + '</tr>';
    });
  }
  html += '</tbody></table>';

  return html;
}

// ==================== 减免税明细表计算函数 ====================
function calculateReductionForm() {
  function gv(field) {
    var el = document.getElementById('red-' + field);
    if (!el) return 0;
    var v = parseFloat(el.value);
    return isNaN(v) ? 0 : v;
  }
  function uc(id, val) {
    var el = document.getElementById('red-' + id);
    if (el) el.value = (val !== 0) ? _fm0(val) : '';
  }

  // 一、减税项目: 3=1+2, 5=3-4
  // 单行合计模式
  var begin = gv('tax_red_begin');
  var occur = gv('tax_red_occur');
  var actual = gv('tax_red_actual');
  if (begin !== 0 || occur !== 0 || actual !== 0) {
    uc('tax_red_should', begin + occur);
    uc('tax_red_end', begin + occur - actual);
  }
  // 多行模式（最多10行）
  for (var i = 0; i < 10; i++) {
    var b = gv('tax_red_' + i + '_begin');
    var o = gv('tax_red_' + i + '_occur');
    var a = gv('tax_red_' + i + '_actual');
    if (b === 0 && o === 0 && a === 0) continue;
    uc('tax_red_' + i + '_should', b + o);
    uc('tax_red_' + i + '_end', b + o - a);
  }

  // 二、免税项目: 3=1-2
  // Row 1
  var s1 = gv('exempt_1_sales');
  var d1 = gv('exempt_1_deduction');
  var i1 = gv('exempt_1_input_tax');
  uc('exempt_1_after', s1 - d1);
  uc('exempt_1_amount', (s1 - d1) * 0.13);  // 默认13%税率换算

  // Row 2 (出口免税)
  var s2 = gv('exempt_2_sales');
  uc('exempt_2_after', s2);
  // Row 3 (跨境)
  var s3 = gv('exempt_3_sales');
  uc('exempt_3_after', s3);

  // 表间数据同步（附表 → 主表）
  syncMainFromSchedules();
}

// ==================== 表间数据逻辑：附表 → 主表自动填列 ====================
function syncMainFromSchedules() {
  // 判断主表是否已渲染在 DOM 中
  var mainFormExists = !!document.getElementById('vat-row1_sales');

  // Helper: 读取 DOM 元素的值（span 文本或 input 值）
  function readVal(fullId) {
    var el = document.getElementById(fullId);
    if (!el) return 0;
    var v = parseFloat(el.value); return isNaN(v) ? 0 : v;
  }

  // Helper: 同时更新主表 DOM 和 vatCurrentData 缓存
  function syncMainVal(id, val) {
    if (val === 0 || isNaN(val)) return;
    var v = parseFloat(val).toFixed(2);

    // 更新主表 DOM（如果可见）
    if (mainFormExists) {
      var el = document.getElementById('vat-' + id);
      if (el) el.value = v;
    }

    // 更新 vatCurrentData 缓存（跨页签持久化）
    if (vatCurrentData) {
      var fm = safeJSON(vatCurrentData.form_main, {});
      fm[id] = parseFloat(v);
      vatCurrentData.form_main = JSON.stringify(fm);
    }
  }

  // ====== 1. 附表一 → 主表 ======
  // 一般计税方法销售额/税额: rows 1-5
  //   goods rows: 1,3 → col9=销售额, col10=税额
  //   service rows: 2,4,5 → col13=扣除后销售额, col14=扣除后税额
  var generalSales = 0, generalTax = 0;
  [1, 3].forEach(function(r) {
    generalSales += readVal('sch1-row' + r + '_col9');
    generalTax  += readVal('sch1-row' + r + '_col10');
  });
  [2, 4, 5].forEach(function(r) {
    generalSales += readVal('sch1-row' + r + '_col13');
    generalTax  += readVal('sch1-row' + r + '_col14');
  });
  if (generalSales !== 0) syncMainVal('row1_sales', generalSales);
  if (generalTax  !== 0) syncMainVal('row11_output_tax', generalTax);

  // 简易计税方法销售额/税额: rows 8-16
  //   goods rows: 8,9,11,12,14,15,16 → col9, col10
  //   service rows: 10,13 → col13, col14
  var simpleSales = 0, simpleTax = 0;
  [8, 9, 11, 12, 14, 15, 16].forEach(function(r) {
    simpleSales += readVal('sch1-row' + r + '_col9');
    simpleTax  += readVal('sch1-row' + r + '_col10');
  });
  [10, 13].forEach(function(r) {
    simpleSales += readVal('sch1-row' + r + '_col13');
    simpleTax  += readVal('sch1-row' + r + '_col14');
  });
  if (simpleSales !== 0) syncMainVal('row5_simple_method', simpleSales);
  if (simpleTax  !== 0) syncMainVal('row21_simple_tax', simpleTax);

  // ====== 2. 附表二 → 主表 ======
  var inputTax = readVal('sch2-row12_total_tax');
  if (inputTax !== 0) syncMainVal('row12_input_tax', inputTax);

  var transferOut = readVal('sch2-row13_transfer_out_total');
  if (transferOut !== 0) syncMainVal('row14_input_transfer_out', transferOut);

  // ====== 3. 附表四 → 主表 row23 ======
  var reduction = 0;
  ['tax_control', 'branch', 'construction', 'real_estate', 'rental'].forEach(function(item) {
    reduction += readVal('sch4-' + item + '_actual');
  });
  if (reduction !== 0) syncMainVal('row23_reduction', reduction);

  // ====== 4. 附表五 → 主表 row39/40/41 ======
  var cityFinal = readVal('sch5-city_final');
  if (cityFinal !== 0) syncMainVal('row39_city_maintenance_tax', cityFinal);

  var eduFinal = readVal('sch5-edu_final');
  if (eduFinal !== 0) syncMainVal('row40_education_surcharge', eduFinal);

  var localFinal = readVal('sch5-local_edu_final');
  if (localFinal !== 0) syncMainVal('row41_local_education_surcharge', localFinal);

  // 主表重算（仅 DOM 存在时）
  if (mainFormExists) calculateVATMainForm();
}
