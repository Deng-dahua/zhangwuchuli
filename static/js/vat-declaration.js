// ==================== 增值税申报页面 ====================
// 按官方《增值税及附加税费申报表（一般纳税人适用）》009-1-1.xls 模板渲染
let vatDeclarations = [];
let vatSelectedId = null;
let vatActivePage = 'main'; // 默认主表
let vatFilterPeriod = '';
let vatInlineDisplayId = null;
let vatCurrentData = null;

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
    + '<button class="btn btn-primary" onclick="showVATCreateModal()" style="font-size:13px">+ 创建「' + period + '」申报表</button>'
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
async function loadVATDeclarationList() {
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
  const el = document.getElementById('vat-stats-row'); if (!el) return;
  // 从当前选中的申报表取数据
  let main = {};
  let scf = {};
  if (vatCurrentData) {
    try {
      main = typeof vatCurrentData.form_main === 'string' ? JSON.parse(vatCurrentData.form_main) : (vatCurrentData.form_main || {});
    } catch (e) { /* skip */ }
    try {
      scf = typeof vatCurrentData.form_surcharge === 'string' ? JSON.parse(vatCurrentData.form_surcharge) : (vatCurrentData.form_surcharge || {});
    } catch (e) { /* skip */ }
  }
  const vatTax = main.row19_tax_payable || 0;
  const endCredit = main.row20_end_credit || 0;
  const cityTax = scf.city_tax || main.row39_city_maintenance_tax || 0;
  const eduTax = scf.edu_tax || main.row40_education_surcharge || 0;
  const localEdu = scf.local_edu_tax || main.row41_local_education_surcharge || 0;
  const totalSurcharge = vatTax + cityTax + eduTax + localEdu;

  function card(label, value, color) {
    var c = color || '#1a56db';
    return '<div class="stat-card"><div class="stat-label">' + label + '</div><div class="stat-value" style="color:' + c + '">' + fmt(value) + '</div></div>';
  }

  el.style.gridTemplateColumns = 'repeat(6, 1fr)';
  el.innerHTML = card('应纳增值税', vatTax, '#d97706')
    + card('期末留抵税额', endCredit, '#059669')
    + card('应纳城市维护建设税', cityTax, '#7c3aed')
    + card('应纳教育费附加', eduTax, '#2563eb')
    + card('应纳地方教育附加', localEdu, '#0891b2')
    + card('应纳税费合计', totalSurcharge, '#dc2626');
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

  const main = (typeof data.form_main === 'string') ? JSON.parse(data.form_main) : (data.form_main || {});

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
  if (!v || parseFloat(v) === 0) return '<td class="num"></td>';
  return '<td class="num">' + parseFloat(v).toFixed(2) + '</td>';
}


// ==================== VAT 工具栏（时间栏+按钮） ====================
function renderVATToolbar(yearOpts, monthOpts) {
  var btnStyle = 'padding:4px 12px;font-size:12px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#374151;cursor:pointer;white-space:nowrap';
  var dangerBtnStyle = 'padding:4px 12px;font-size:12px;border-radius:6px;border:1px solid #fca5a5;background:#fff;color:#dc2626;cursor:pointer;white-space:nowrap';
  return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #e5e7eb;flex-wrap:wrap">'
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
    + '<button style="' + btnStyle + '" onclick="onVATDetailPeriodChange()" title="按所选期间查询">🔍 查询</button>'
    + '<button style="' + btnStyle + '" onclick="vatClearFilter()" title="清除筛选条件">✖ 清除</button>'
    + '<button style="' + btnStyle + '" onclick="vatImportFile()" title="导入增值税申报数据">📥 导入文件</button>'
    + '<button style="' + btnStyle + '" onclick="vatGenerateVoucher()" title="生成增值税相关凭证">📝 生成凭证</button>'
    + '<button style="' + dangerBtnStyle + '" onclick="vatDeleteCurrent()" title="删除当前申报表">🗑 删除报表</button>'
    + '</div>';
}

function vatClearFilter() {
  vatFilterPeriod = '';
  vatCurrentData = null;
  loadVATDeclarationList();
}

function vatImportFile() {
  toast('请先通过侧边栏【开具发票】【取得发票】【进项抵扣】【银行流水】导入数据，系统会自动生成申报表', 'info');
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


function renderMainForm(data) {
  const m = (typeof data.form_main === 'string') ? JSON.parse(data.form_main) : (data.form_main || {});
  const s = (typeof data.form_surcharge === 'string') ? JSON.parse(data.form_surcharge) : (data.form_surcharge || {});

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
  h += '<td class="num">' + _fmt2(m.row1_sales) + '</td>';
  h += '<td class="num">' + _fmt2(m.row1_sales_ytd) + '</td>';
  h += _fmtDash(m.row1_sales_refund) + _fmtDash(m.row1_sales_refund_ytd) + '</tr>';
  // row 2
  h += '<tr><td style="padding-left:18px">其中：应税货物销售额</td><td style="text-align:center">2</td>';
  h += '<td class="num">' + _fmt0_2(m.row2_other_invoice) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row2_other_invoice_ytd) + '</td>';
  h += _fmtDash(m.row2_other_invoice_refund) + _fmtDash(m.row2_other_invoice_refund_ytd) + '</tr>';
  // row 3
  h += '<tr><td style="padding-left:18px">　　　应税劳务销售额</td><td style="text-align:center">3</td>';
  h += '<td class="num">' + _fmt0_2(m.row3_no_invoice) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row3_no_invoice_ytd) + '</td>';
  h += _fmtDash(m.row3_no_invoice_refund) + _fmtDash(m.row3_no_invoice_refund_ytd) + '</tr>';
  // row 4
  h += '<tr><td style="padding-left:18px">　　　纳税检查调整的销售额</td><td style="text-align:center">4</td>';
  h += '<td class="num">' + _fmt0_2(m.row4_tax_check) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row4_tax_check_ytd) + '</td>';
  h += _fmtDash(m.row4_tax_check_refund) + _fmtDash(m.row4_tax_check_refund_ytd) + '</tr>';
  // row 5
  h += '<tr><td>（二）按简易办法计税销售额</td><td style="text-align:center">5</td>';
  h += '<td class="num">' + _fmt0_2(m.row5_simple_method) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row5_simple_method_ytd) + '</td>';
  h += _fmtDash(m.row5_simple_method_refund) + _fmtDash(m.row5_simple_method_refund_ytd) + '</tr>';
  // row 6
  h += '<tr><td style="padding-left:18px">其中：纳税检查调整的销售额</td><td style="text-align:center">6</td>';
  h += '<td class="num">' + _fmt0_2(m.row6_exempt_sales) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row6_exempt_sales_ytd) + '</td>';
  h += _fmtDash(m.row6_exempt_sales_refund) + _fmtDash(m.row6_exempt_sales_refund_ytd) + '</tr>';
  // row 7
  h += '<tr><td>（三）免、抵、退办法出口销售额</td><td style="text-align:center">7</td>';
  h += '<td class="num">' + _fmt0_2(m.row7_export_exempt) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row7_export_exempt_ytd) + '</td>';
  h += '<td class="num"></td><td class="num"></td></tr>';
  // row 8
  h += '<tr><td>（四）免税销售额</td><td style="text-align:center">8</td>';
  h += '<td class="num">' + _fmt0_2(m.row8_tax_free) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row8_tax_free_ytd) + '</td>';
  h += '<td class="num"></td><td class="num"></td></tr>';
  // row 9
  h += '<tr><td style="padding-left:18px">其中：免税货物销售额</td><td style="text-align:center">9</td>';
  h += '<td class="num">' + _fmt0_2(m.row9_exempt_goods) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row9_exempt_goods_ytd) + '</td>';
  h += '<td class="num"></td><td class="num"></td></tr>';
  // row 10
  h += '<tr><td style="padding-left:18px">　　　免税劳务销售额</td><td style="text-align:center">10</td>';
  h += '<td class="num">' + _fmt0_2(m.row10_exempt_service) + '</td>';
  h += '<td class="num">' + _fmt0_2(m.row10_exempt_service_ytd) + '</td>';
  h += '<td class="num"></td><td class="num"></td></tr>';

  // --- 二、税款计算 ---
  // row 11
  h += '<tr><td rowspan="14" style="text-align:center;vertical-align:middle;font-weight:700;font-size:13px;background:#f7f8fc;writing-mode:vertical-lr;letter-spacing:2px">税款计算</td><td>销项税额</td><td style="text-align:center">11</td>';
  h += '<td class="num">' + _fmt2(m.row11_output_tax) + '</td>';
  h += '<td class="num">' + _fmt2(m.row11_output_tax_ytd) + '</td>';
  h += _fmtDash(m.row11_output_tax_refund) + _fmtDash(m.row11_output_tax_refund_ytd) + '</tr>';
  // row 12
  h += '<tr><td>进项税额</td><td style="text-align:center">12</td>';
  h += '<td class="num">' + _fmt2(m.row12_input_tax) + '</td>';
  h += '<td class="num">' + _fmt2(m.row12_input_tax_ytd) + '</td>';
  h += _fmtDash(m.row12_input_tax_refund) + _fmtDash(m.row12_input_tax_refund_ytd) + '</tr>';
  // row 13
  h += '<tr><td>上期留抵税额</td><td style="text-align:center">13</td>';
  h += '<td class="num">' + _fmt2(m.row13_prior_credit) + '</td>';
  h += '<td class="num">' + _fmt2(m.row13_prior_credit_ytd) + '</td>';
  h += _fmtDash(m.row13_prior_credit_refund) + _fmtDash(m.row13_prior_credit_refund_ytd) + '</tr>';
  // row 14
  h += '<tr><td>进项税额转出</td><td style="text-align:center">14</td>';
  h += '<td class="num">' + _fmt2(m.row14_input_transfer_out) + '</td>';
  h += '<td class="num">' + _fmt2(m.row14_input_transfer_out_ytd) + '</td>';
  h += _fmtDash(m.row14_input_transfer_out_refund) + _fmtDash(m.row14_input_transfer_out_refund_ytd) + '</tr>';
  // row 15
  h += '<tr><td>免、抵、退应退税额</td><td style="text-align:center">15</td>';
  h += '<td class="num">' + _fmt2(m.row15_exempt_refund) + '</td>';
  h += '<td class="num">' + _fmt2(m.row15_exempt_refund_ytd) + '</td>';
  h += _fmtDash(m.row15_exempt_refund_refund) + _fmtDash(m.row15_exempt_refund_refund_ytd) + '</tr>';
  // row 16
  h += '<tr><td>按适用税率计算的纳税检查应补缴税额</td><td style="text-align:center">16</td>';
  h += '<td class="num">' + _fmt2(m.row16_actual_deduct_by_item) + '</td>';
  h += '<td class="num">' + _fmt2(m.row16_actual_deduct_by_item_ytd) + '</td>';
  h += _fmtDash(m.row16_actual_deduct_by_item_refund) + _fmtDash(m.row16_actual_deduct_by_item_refund_ytd) + '</tr>';
  // row 17
  h += '<tr style="background:#e8f0fe"><td>应抵扣税额合计</td><td style="text-align:center;font-size:10px;color:#6b7280">17=12+13-14-15+16</td>';
  h += '<td class="num" style="font-weight:700">' + _fmt2(m.row17_total_deductible) + '</td>';
  h += '<td class="num" style="font-weight:700">' + _fmt2(m.row17_total_deductible_ytd) + '</td>';
  h += _fmtDash(m.row17_total_deductible_refund) + _fmtDash(m.row17_total_deductible_refund_ytd) + '</tr>';
  // row 18
  h += '<tr style="background:#e8f0fe"><td>实际抵扣税额</td><td style="text-align:center;font-size:10px;color:#6b7280">18（如17＜11，则为17，否则为11）</td>';
  h += '<td class="num" style="font-weight:700">' + _fmt2(m.row18_actual_deduct) + '</td>';
  h += '<td class="num" style="font-weight:700">' + _fmt2(m.row18_actual_deduct_ytd) + '</td>';
  h += _fmtDash(m.row18_actual_deduct_refund) + _fmtDash(m.row18_actual_deduct_refund_ytd) + '</tr>';
  // row 19
  h += '<tr style="background:#fef9c4"><td>应纳税额</td><td style="text-align:center;font-size:10px;color:#6b7280">19=11-18</td>';
  h += '<td class="num" style="font-weight:700;color:#d97706">' + _fmt2(m.row19_tax_payable) + '</td>';
  h += '<td class="num" style="font-weight:700;color:#d97706">' + _fmt2(m.row19_tax_payable_ytd) + '</td>';
  h += _fmtDash(m.row19_tax_payable_refund) + _fmtDash(m.row19_tax_payable_refund_ytd) + '</tr>';
  // row 20
  h += '<tr><td>期末留抵税额</td><td style="text-align:center;font-size:10px;color:#6b7280">20=17-18</td>';
  h += '<td class="num">' + _fmt2(m.row20_end_credit) + '</td>';
  h += '<td class="num">' + _fmt2(m.row20_end_credit_ytd) + '</td>';
  h += _fmtDash(m.row20_end_credit_refund) + _fmtDash(m.row20_end_credit_refund_ytd) + '</tr>';
  // row 21
  h += '<tr><td>简易计税办法计算的应纳税额</td><td style="text-align:center">21</td>';
  h += '<td class="num">' + _fmt2(m.row21_simple_tax) + '</td>';
  h += '<td class="num">' + _fmt2(m.row21_simple_tax_ytd) + '</td>';
  h += _fmtDash(m.row21_simple_tax_refund) + _fmtDash(m.row21_simple_tax_refund_ytd) + '</tr>';
  // row 22
  h += '<tr><td>按简易计税办法计算的纳税检查应补缴税额</td><td style="text-align:center">22</td>';
  h += '<td class="num">' + _fmt2(m.row22_simple_tax_reduction) + '</td>';
  h += '<td class="num">' + _fmt2(m.row22_simple_tax_reduction_ytd) + '</td>';
  h += _fmtDash(m.row22_simple_tax_reduction_refund) + _fmtDash(m.row22_simple_tax_reduction_refund_ytd) + '</tr>';
  // row 23
  h += '<tr><td>应纳税额减征额</td><td style="text-align:center">23</td>';
  h += '<td class="num">' + _fmt2(m.row23_reduction) + '</td>';
  h += '<td class="num">' + _fmt2(m.row23_reduction_ytd) + '</td>';
  h += _fmtDash(m.row23_reduction_refund) + _fmtDash(m.row23_reduction_refund_ytd) + '</tr>';
  // row 24
  h += '<tr style="background:#fef9c4;font-weight:700"><td>应纳税额合计</td><td style="text-align:center;font-size:10px;color:#6b7280">24=19+21-23</td>';
  h += '<td class="num" style="color:#d97706">' + _fmt2(m.row24_tax_payable_total) + '</td>';
  h += '<td class="num" style="color:#d97706">' + _fmt2(m.row24_tax_payable_total_ytd) + '</td>';
  h += _fmtDash(m.row24_tax_payable_total_refund) + _fmtDash(m.row24_tax_payable_total_refund_ytd) + '</tr>';

  // --- 三、税款缴纳 ---
  // row 25
  h += '<tr><td rowspan="14" style="text-align:center;vertical-align:middle;font-weight:700;font-size:13px;background:#f7f8fc;writing-mode:vertical-lr;letter-spacing:2px">税款缴纳</td><td>期初未缴税额（多缴为负数）</td><td style="text-align:center">25</td>';
  h += '<td class="num">' + _fmt2(m.row25_prior_unpaid) + '</td>';
  h += '<td class="num">' + _fmt2(m.row25_prior_unpaid_ytd) + '</td>';
  h += _fmtDash(m.row25_prior_unpaid_refund) + _fmtDash(m.row25_prior_unpaid_refund_ytd) + '</tr>';
  // row 26
  h += '<tr><td>实收出口开具专用缴款书退税额</td><td style="text-align:center">26</td>';
  h += '<td class="num">' + _fmt2(m.row26_real_paid_during) + '</td>';
  h += '<td class="num">' + _fmt2(m.row26_real_paid_during_ytd) + '</td>';
  h += _fmtDash(m.row26_real_paid_during_refund) + _fmtDash(m.row26_real_paid_during_refund_ytd) + '</tr>';
  // row 27
  h += '<tr><td>本期已缴税额</td><td style="text-align:center;font-size:10px;color:#6b7280">27=28+29+30+31</td>';
  h += '<td class="num">' + _fmt2(m.row27_installment_prepaid) + '</td>';
  h += '<td class="num">' + _fmt2(m.row27_installment_prepaid_ytd) + '</td>';
  h += _fmtDash(m.row27_installment_prepaid_refund) + _fmtDash(m.row27_installment_prepaid_refund_ytd) + '</tr>';
  // row 28
  h += '<tr><td style="padding-left:18px">①分次预缴税额</td><td style="text-align:center">28</td>';
  h += '<td class="num">' + _fmt2(m.row28_export_tax_refund) + '</td>';
  h += '<td class="num">' + _fmt2(m.row28_export_tax_refund_ytd) + '</td>';
  h += _fmtDash(m.row28_export_tax_refund_refund) + _fmtDash(m.row28_export_tax_refund_refund_ytd) + '</tr>';
  // row 29
  h += '<tr><td style="padding-left:18px">②出口开具专用缴款书预缴税额</td><td style="text-align:center">29</td>';
  h += '<td class="num">' + _fmt2(m.row29_remote_prepaid) + '</td>';
  h += '<td class="num">' + _fmt2(m.row29_remote_prepaid_ytd) + '</td>';
  h += _fmtDash(m.row29_remote_prepaid_refund) + _fmtDash(m.row29_remote_prepaid_refund_ytd) + '</tr>';
  // row 30
  h += '<tr><td style="padding-left:18px">③本期缴纳上期应纳税额</td><td style="text-align:center">30</td>';
  h += '<td class="num">' + _fmt2(m.row30_already_paid_total) + '</td>';
  h += '<td class="num">' + _fmt2(m.row30_already_paid_total_ytd) + '</td>';
  h += _fmtDash(m.row30_already_paid_total_refund) + _fmtDash(m.row30_already_paid_total_refund_ytd) + '</tr>';
  // row 31
  h += '<tr><td style="padding-left:18px">④本期缴纳欠缴税额</td><td style="text-align:center">31</td>';
  h += '<td class="num">' + _fmt2(m.row31_should_pay_refund) + '</td>';
  h += '<td class="num">' + _fmt2(m.row31_should_pay_refund_ytd) + '</td>';
  h += _fmtDash(m.row31_should_pay_refund_refund) + _fmtDash(m.row31_should_pay_refund_refund_ytd) + '</tr>';
  // row 32
  h += '<tr><td>期末未缴税额（多缴为负数）</td><td style="text-align:center;font-size:10px;color:#6b7280">32=24+25+26-27</td>';
  h += '<td class="num">' + _fmt2(m.row32_check_tax_should) + '</td>';
  h += '<td class="num">' + _fmt2(m.row32_check_tax_should_ytd) + '</td>';
  h += _fmtDash(m.row32_check_tax_should_refund) + _fmtDash(m.row32_check_tax_should_refund_ytd) + '</tr>';
  // row 33
  h += '<tr><td style="padding-left:18px">其中：欠缴税额（≥0）</td><td style="text-align:center;font-size:10px;color:#6b7280">33=25+26-27</td>';
  h += '<td class="num">' + _fmt2(m.row33_check_prepaid) + '</td>';
  h += '<td class="num">' + _fmt2(m.row33_check_prepaid_ytd) + '</td>';
  h += _fmtDash(m.row33_check_prepaid_refund) + _fmtDash(m.row33_check_prepaid_refund_ytd) + '</tr>';
  // row 34
  h += '<tr style="background:#fef9c4"><td>本期应补(退)税额</td><td style="text-align:center;font-size:10px;color:#6b7280">34＝24-28-29</td>';
  h += '<td class="num" style="font-weight:700;color:#d97706">' + _fmt2(m.row34_should_check) + '</td>';
  h += '<td class="num" style="font-weight:700;color:#d97706">' + _fmt2(m.row34_should_check_ytd) + '</td>';
  h += _fmtDash(m.row34_should_check_refund) + _fmtDash(m.row34_should_check_refund_ytd) + '</tr>';
  // row 35
  h += '<tr><td>即征即退实际退税额</td><td style="text-align:center">35</td>';
  h += '<td class="num"></td><td class="num"></td>';
  h += '<td class="num"></td><td class="num"></td></tr>';
  // row 36
  h += '<tr><td>期初未缴查补税额</td><td style="text-align:center">36</td>';
  h += '<td class="num">' + _fmt2(m.row36_prior_unpaid_check) + '</td>';
  h += '<td class="num">' + _fmt2(m.row36_prior_unpaid_check_ytd) + '</td>';
  h += _fmtDash(m.row36_prior_unpaid_check_refund) + _fmtDash(m.row36_prior_unpaid_check_refund_ytd) + '</tr>';
  // row 37
  h += '<tr><td>本期入库查补税额</td><td style="text-align:center">37</td>';
  h += '<td class="num">' + _fmt2(m.row37_check_paid) + '</td>';
  h += '<td class="num">' + _fmt2(m.row37_check_paid_ytd) + '</td>';
  h += _fmtDash(m.row37_check_paid_refund) + _fmtDash(m.row37_check_paid_refund_ytd) + '</tr>';
  // row 38
  h += '<tr><td>期末未缴查补税额</td><td style="text-align:center;font-size:10px;color:#6b7280">38=16+22+36-37</td>';
  h += '<td class="num">' + _fmt2(m.row38_end_check) + '</td>';
  h += '<td class="num">' + _fmt2(m.row38_end_check_ytd) + '</td>';
  h += _fmtDash(m.row38_end_check_refund) + _fmtDash(m.row38_end_check_refund_ytd) + '</tr>';

  // --- 四、附加税费 ---
  // row 39
  h += '<tr><td rowspan="3" style="text-align:center;vertical-align:middle;font-weight:700;font-size:13px;background:#f7f8fc;writing-mode:vertical-lr;letter-spacing:2px">附加税费</td><td>城市维护建设税本期应补（退）税额</td><td style="text-align:center">39</td>';
  h += '<td class="num">' + _fmt2(m.row39_city_maintenance_tax) + '</td>';
  h += '<td class="num">' + _fmt2(m.row39_city_maintenance_tax_ytd) + '</td>';
  h += _fmtDash(m.row39_city_maintenance_tax_refund) + _fmtDash(m.row39_city_maintenance_tax_refund_ytd) + '</tr>';
  // row 40
  h += '<tr><td>教育费附加本期应补（退）费额</td><td style="text-align:center">40</td>';
  h += '<td class="num">' + _fmt2(m.row40_education_surcharge) + '</td>';
  h += '<td class="num">' + _fmt2(m.row40_education_surcharge_ytd) + '</td>';
  h += _fmtDash(m.row40_education_surcharge_refund) + _fmtDash(m.row40_education_surcharge_refund_ytd) + '</tr>';
  // row 41
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
  function tdDash(n) { n = n || 1; var d = '<td class="num"></td>'; return n === 1 ? d : Array(n).fill(d).join(''); }
  // 大类列样式
  var catStyle = 'text-align:center;vertical-align:middle;font-weight:700;font-size:11px;background:#f0f4fa;writing-mode:vertical-lr;letter-spacing:2px;padding:4px 3px';
  var subStyle = 'text-align:center;vertical-align:middle;font-weight:600;font-size:10px;background:#f5f7fb';

  // ---- helper: 生成完整数据行(14个数值列: cols 4-17) ----
  // 销售额/税额按列号顺序: 第1列(销售额) 第2列(税额) ... 交替排列
  // 货物行（无扣除项目）: cols 4-13 正常, col 14价税合计, cols 15-17=——
  function Rg(spS,spT,otS,otT,niS,niT,ckS,ckT,toS,toT) {
    var pt = (parseFloat(toS||0))+(parseFloat(toT||0));
    return td(spS)+td(spT)+td(otS)+td(otT)+td(niS)+td(niT)+td(ckS)+td(ckT)+td(toS)+td(toT)
          +'<td class="num">'+_fm0(pt)+'</td>'
          +tdDash(3);
  }
  // 服务行（含扣除项目）
  function Rs(spS,spT,otS,otT,niS,niT,ckS,ckT,toS,toT,ded,afS,afT) {
    return td(spS)+td(spT)+td(otS)+td(otT)+td(niS)+td(niT)+td(ckS)+td(ckT)+td(toS)+td(toT)
          +'<td class="num">'+_fm0((parseFloat(toS||0))+(parseFloat(toT||0)))+'</td>'
          +td(ded)+td(afS)+td(afT);
  }
  // 即征即退服务行: 前8列=——,后6列正常
  function Rj(toS,toT,ded,afS,afT) {
    var pt = (parseFloat(toS||0))+(parseFloat(toT||0));
    return tdDash(8)
          +td(toS)+td(toT)+'<td class="num">'+_fm0(pt)+'</td>'
          +td(ded)+td(afS)+td(afT);
  }
  // 即征即退货物行: 前8列=——，后3列=——
  function Rjg(toS,toT) {
    var pt = (parseFloat(toS||0))+(parseFloat(toT||0));
    return tdDash(8)+td(toS)+td(toT)+'<td class="num">'+_fm0(pt)+'</td>'+tdDash(3);
  }
  // 全 —— 行
  function RD() { return tdDash(14); }

  return '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税及附加税费申报表附列资料（一）</div>'
    + '<div style="font-size:11px;color:#6b7280;text-align:center;margin-bottom:6px">（本期销售情况明细）</div>'
    + '<div style="overflow-x:auto">'
    + '<style>#sch1-table td,#sch1-table th{white-space:nowrap;}</style>'
    + '<table id="sch1-table" class="vat-form-table" style="font-size:10px">'
    + '<colgroup>'
    + '<col><col><col><col><col><col><col><col><col><col>'
    + '<col><col><col><col><col><col><col><col></colgroup>'
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
    + '<th style="font-size:8px">14=13÷(100%+税率或征收率)×税率或征收率</th>'
    + '</tr></thead><tbody>'

    // ============== 一、一般计税方法计税 (7 rows) ==============
    // Row 1: 13%货物 (rowspan 大类=7, 子类=5)
    + '<tr>'
    + '<td rowspan="7" style="'+catStyle+'">一般计税<br>方法计税</td>'
    + '<td rowspan="5" style="'+subStyle+'">全部征税项目</td>'
    + '<td>13%税率的货物及加工修理修配劳务</td><td style="text-align:center">1</td>'
    + Rg(s.row1_13_special_sales,s.row1_13_special_tax,s.row1_13_other_sales,s.row1_13_other_tax,
         s.row1_13_no_invoice_sales,s.row1_13_no_invoice_tax,s.row1_13_check_sales,s.row1_13_check_tax,
         s.row1_13_total_sales,s.row1_13_total_tax)
    + '</tr>'
    // Row 2: 13%服务
    + '<tr><td>13%税率的服务、不动产和无形资产</td><td style="text-align:center">2</td>'
    + Rs(s.row2_13_service_special_sales,s.row2_13_service_special_tax,
         s.row2_13_service_other_sales,s.row2_13_service_other_tax,
         s.row2_13_service_no_invoice_sales,s.row2_13_service_no_invoice_tax,
         s.row2_13_service_check_sales,s.row2_13_service_check_tax,
         s.row2_13_service_total_sales,s.row2_13_service_total_tax,
         s.row2_13_service_deduct||0,s.row2_13_service_after_sales||0,s.row2_13_service_after_tax||0)
    + '</tr>'
    // Row 3: 9%货物
    + '<tr><td>9%税率的货物及加工修理修配劳务</td><td style="text-align:center">3</td>'
    + Rg(s.row3_9_special_sales,s.row3_9_special_tax,s.row3_9_other_sales,s.row3_9_other_tax,
         s.row3_9_no_invoice_sales,s.row3_9_no_invoice_tax,s.row3_9_check_sales,s.row3_9_check_tax,
         s.row3_9_total_sales,s.row3_9_total_tax)
    + '</tr>'
    // Row 4: 9%服务
    + '<tr><td>9%税率的服务、不动产和无形资产</td><td style="text-align:center">4</td>'
    + Rs(s.row4_9_service_sales,s.row4_9_service_tax,
         s.row4_9_service_other_sales,s.row4_9_service_other_tax,
         s.row4_9_service_no_invoice_sales,s.row4_9_service_no_invoice_tax,
         s.row4_9_service_check_sales,s.row4_9_service_check_tax,
         s.row4_9_service_total_sales,s.row4_9_service_total_tax,
         s.row4_9_service_deduct||0,s.row4_9_service_after_sales||0,s.row4_9_service_after_tax||0)
    + '</tr>'
    // Row 5: 6%税率
    + '<tr><td>6%税率</td><td style="text-align:center">5</td>'
    + Rs(s.row5_6_special_sales,s.row5_6_special_tax,
         s.row5_6_other_sales,s.row5_6_other_tax,
         s.row5_6_no_invoice_sales,s.row5_6_no_invoice_tax,
         s.row5_6_check_sales,s.row5_6_check_tax,
         s.row5_6_total_sales,s.row5_6_total_tax,
         s.row5_6_deduct||0,s.row5_6_after_sales||0,s.row5_6_after_tax||0)
    + '</tr>'
    // Row 6: 即征即退货物
    + '<tr>'
    + '<td rowspan="2" style="'+subStyle+'">其中：即征即退项目</td>'
    + '<td>即征即退货物及加工修理修配劳务</td><td style="text-align:center">6</td>'
    + Rjg(s.row6_refund_goods_total_sales||0,s.row6_refund_goods_total_tax||0)
    + '</tr>'
    // Row 7: 即征即退服务
    + '<tr><td>即征即退服务、不动产和无形资产</td><td style="text-align:center">7</td>'
    + Rj(s.row7_refund_service_total_sales||0,s.row7_refund_service_total_tax||0,
         s.row7_refund_service_deduct||0,s.row7_refund_service_after_sales||0,s.row7_refund_service_after_tax||0)
    + '</tr>'

    // ============== 二、简易计税方法计税 (11 rows) ==============
    // Row 8: 6%征收率
    + '<tr>'
    + '<td rowspan="11" style="'+catStyle+'">简易计税<br>方法计税</td>'
    + '<td rowspan="9" style="'+subStyle+'">全部征税项目</td>'
    + '<td>6%征收率</td><td style="text-align:center">8</td>'
    + Rg(s.row8_6_collect_sales,s.row8_6_collect_tax,s.row8_6_collect_other_sales,s.row8_6_collect_other_tax,
         s.row8_6_collect_no_invoice_sales,s.row8_6_collect_no_invoice_tax,
         s.row8_6_collect_check_sales,s.row8_6_collect_check_tax,
         s.row8_6_collect_total_sales,s.row8_6_collect_total_tax)
    + '</tr>'
    // Row 9: 5%货物
    + '<tr><td>5%征收率的货物及加工修理修配劳务</td><td style="text-align:center">9a</td>'
    + Rg(s.row9a_5_goods_sales,s.row9a_5_goods_tax,s.row9a_5_goods_other_sales,s.row9a_5_goods_other_tax,
         s.row9a_5_goods_no_invoice_sales,s.row9a_5_goods_no_invoice_tax,
         s.row9a_5_goods_check_sales,s.row9a_5_goods_check_tax,
         s.row9a_5_goods_total_sales,s.row9a_5_goods_total_tax)
    + '</tr>'
    // Row 10: 5%服务
    + '<tr><td>5%征收率的服务、不动产和无形资产</td><td style="text-align:center">9b</td>'
    + Rs(s.row9b_5_service_sales,s.row9b_5_service_tax,
         s.row9b_5_service_other_sales,s.row9b_5_service_other_tax,
         s.row9b_5_service_no_invoice_sales,s.row9b_5_service_no_invoice_tax,
         s.row9b_5_service_check_sales,s.row9b_5_service_check_tax,
         s.row9b_5_service_total_sales,s.row9b_5_service_total_tax,
         s.row9b_5_service_deduct||0,s.row9b_5_service_after_sales||0,s.row9b_5_service_after_tax||0)
    + '</tr>'
    // Row 11: 4%征收率
    + '<tr><td>4%征收率</td><td style="text-align:center">10</td>'
    + Rg(s.row10_4_collect_sales,s.row10_4_collect_tax,s.row10_4_collect_other_sales,s.row10_4_collect_other_tax,
         s.row10_4_collect_no_invoice_sales,s.row10_4_collect_no_invoice_tax,
         s.row10_4_collect_check_sales,s.row10_4_collect_check_tax,
         s.row10_4_collect_total_sales,s.row10_4_collect_total_tax)
    + '</tr>'
    // Row 12: 3%货物
    + '<tr><td>3%征收率的货物及加工修理修配劳务</td><td style="text-align:center">11</td>'
    + Rg(s.row11_3_goods_sales,s.row11_3_goods_tax,s.row11_3_goods_other_sales,s.row11_3_goods_other_tax,
         s.row11_3_goods_no_invoice_sales,s.row11_3_goods_no_invoice_tax,
         s.row11_3_goods_check_sales,s.row11_3_goods_check_tax,
         s.row11_3_goods_total_sales,s.row11_3_goods_total_tax)
    + '</tr>'
    // Row 13: 3%服务
    + '<tr><td>3%征收率的服务、不动产和无形资产</td><td style="text-align:center">12</td>'
    + Rs(s.row12_3_service_sales,s.row12_3_service_tax,
         s.row12_3_service_other_sales,s.row12_3_service_other_tax,
         s.row12_3_service_no_invoice_sales,s.row12_3_service_no_invoice_tax,
         s.row12_3_service_check_sales,s.row12_3_service_check_tax,
         s.row12_3_service_total_sales,s.row12_3_service_total_tax,
         s.row12_3_service_deduct||0,s.row12_3_service_after_sales||0,s.row12_3_service_after_tax||0)
    + '</tr>'
    // Row 14-16: 预征率 13a/13b/13c
    + '<tr><td>预征率&nbsp;%</td><td style="text-align:center">13a</td>'
    + Rg(s.row13a_rate_sales,s.row13a_rate_tax,s.row13a_rate_other_sales,s.row13a_rate_other_tax,
         s.row13a_rate_no_invoice_sales,s.row13a_rate_no_invoice_tax,
         s.row13a_rate_check_sales,s.row13a_rate_check_tax,
         s.row13a_rate_total_sales,s.row13a_rate_total_tax)
    + '</tr>'
    + '<tr><td>预征率&nbsp;%</td><td style="text-align:center">13b</td>'
    + Rg(s.row13b_rate_sales,s.row13b_rate_tax,s.row13b_rate_other_sales,s.row13b_rate_other_tax,
         s.row13b_rate_no_invoice_sales,s.row13b_rate_no_invoice_tax,
         s.row13b_rate_check_sales,s.row13b_rate_check_tax,
         s.row13b_rate_total_sales,s.row13b_rate_total_tax)
    + '</tr>'
    + '<tr><td>预征率&nbsp;%</td><td style="text-align:center">13c</td>'
    + Rg(s.row13c_rate_sales,s.row13c_rate_tax,s.row13c_rate_other_sales,s.row13c_rate_other_tax,
         s.row13c_rate_no_invoice_sales,s.row13c_rate_no_invoice_tax,
         s.row13c_rate_check_sales,s.row13c_rate_check_tax,
         s.row13c_rate_total_sales,s.row13c_rate_total_tax)
    + '</tr>'
    // Row 17: 即征即退货物
    + '<tr>'
    + '<td rowspan="2" style="'+subStyle+'">其中：即征即退项目</td>'
    + '<td>即征即退货物及加工修理修配劳务</td><td style="text-align:center">14</td>'
    + Rjg(s.row14_refund_goods_total_sales||0,s.row14_refund_goods_total_tax||0)
    + '</tr>'
    // Row 18: 即征即退服务
    + '<tr><td>即征即退服务、不动产和无形资产</td><td style="text-align:center">15</td>'
    + Rj(s.row15_refund_service_total_sales||0,s.row15_refund_service_total_tax||0,
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

// ==================== 附表二：进项税额明细 ====================
function renderSchedule2(data) {
  const inp = (typeof data.form_input === 'string') ? JSON.parse(data.form_input) : (data.form_input || {});

  function tdNum(v) { return '<td class="num">' + _fm0(v) + '</td>'; }
  function tdDash() { return '<td class="num"></td>'; }
  function tdCnt(v) { return '<td class="num">' + ((v === 0 || v === null || v === undefined) ? '' : v) + '</td>'; }

  return '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税及附加税费申报表附列资料（二）</div>'
    + '<div style="font-size:11px;color:#6b7280;text-align:center;margin-bottom:6px">（本期进项税额明细）</div>'

    // 一、申报抵扣的进项税额
    + '<div style="font-size:12px;font-weight:600;margin-bottom:4px">一、申报抵扣的进项税额</div>'
    + '<table class="vat-form-table"><colgroup><col><col><col><col><col></colgroup>'
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
    + '<td class="num">' + ((inp.row1_certified_count || 0) + (inp.row4_other_count || 0) || '') + '</td>'
    + '<td class="num">' + _fmt((inp.row1_certified_amount || 0) + (inp.row4_other_amount || 0)) + '</td>'
    + '<td class="num">' + _fmt((inp.row1_certified_tax || 0) + (inp.row4_other_tax || 0) + (inp.row11_foreign_trade_tax || 0)) + '</td></tr>'
    + '</tbody></table>'

    // 二、进项税额转出额
    + '<div style="font-size:12px;font-weight:600;margin:12px 0 4px 0">二、进项税额转出额</div>'
    + '<table class="vat-form-table"><colgroup><col><col><col></colgroup>'
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
    + '<table class="vat-form-table"><colgroup><col><col><col><col><col></colgroup>'
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
    + '<table class="vat-form-table"><colgroup><col><col><col><col><col></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th>项目</th><th>栏次</th><th>份数</th><th>金额</th><th>税额</th></tr></thead><tbody>'
    + '<tr><td>本期认证相符的增值税专用发票</td><td style="text-align:center">35</td>' + tdCnt(inp.row35_cert_count) + tdNum(inp.row35_cert_amount) + tdNum(inp.row35_cert_tax) + '</tr>'
    + '<tr><td>代扣代缴税额</td><td style="text-align:center">36</td>' + tdDash() + tdDash() + tdNum(inp.row36_wht_total_tax) + '</tr>'
    + '</tbody></table>';
}

// ==================== 附表三：扣除项目明细 ====================
function renderSchedule3(data) {
  const d = (typeof data.form_deduction === 'string') ? JSON.parse(data.form_deduction) : (data.form_deduction || {});

  function td(v) { return '<td class="num">' + _fm0(v) + '</td>'; }

  // 项目名称列表（按行）
  const projects = [
    '13%税率的项目',
    '9%税率的项目',
    '6%税率的项目（不含金融商品转让）',
    '6%税率的金融商品转让项目',
    '5%征收率的项目',
    '3%征收率的项目',
    '免抵退税的项目',
    '免税的项目',
  ];

  const rows = [
    { price_tax: d.row1_13_price_tax, begin: d.row1_13_begin, occur: d.row1_13_occur, should: d.row1_13_should, actual: d.row1_13_actual, end: d.row1_13_end },
    { price_tax: d.row2_9_price_tax, begin: d.row2_9_begin, occur: d.row2_9_occur, should: d.row2_9_should, actual: d.row2_9_actual, end: d.row2_9_end },
    { price_tax: d.row3_6_price_tax, begin: d.row3_6_begin, occur: d.row3_6_occur, should: d.row3_6_should, actual: d.row3_6_actual, end: d.row3_6_end },
    { price_tax: d.row4_6_fin_price_tax, begin: d.row4_6_fin_begin, occur: d.row4_6_fin_occur, should: d.row4_6_fin_should, actual: d.row4_6_fin_actual, end: d.row4_6_fin_end },
    { price_tax: d.row5_5_price_tax, begin: d.row5_5_begin, occur: d.row5_5_occur, should: d.row5_5_should, actual: d.row5_5_actual, end: d.row5_5_end },
    { price_tax: d.row6_3_price_tax, begin: d.row6_3_begin, occur: d.row6_3_occur, should: d.row6_3_should, actual: d.row6_3_actual, end: d.row6_3_end },
    { price_tax: d.row7_exempt_credit_price_tax, begin: d.row7_exempt_credit_begin, occur: d.row7_exempt_credit_occur, should: d.row7_exempt_credit_should, actual: d.row7_exempt_credit_actual, end: d.row7_exempt_credit_end },
    { price_tax: d.row8_exempt_price_tax, begin: d.row8_exempt_begin, occur: d.row8_exempt_occur, should: d.row8_exempt_should, actual: d.row8_exempt_actual, end: d.row8_exempt_end },
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
    const r = rows[i];
    html += '<tr><td>' + projects[i] + '</td><td style="text-align:center">' + (i+1) + '</td>'
      + td(r.price_tax) + td(r.begin) + td(r.occur) + td(r.should) + td(r.actual) + td(r.end)
      + '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

// ==================== 附表四：税额抵减情况表 ====================
function renderSchedule4(data) {
  const c = (typeof data.form_credit === 'string') ? JSON.parse(data.form_credit) : (data.form_credit || {});
  function td(v) { return '<td class="num">' + _fm0(v) + '</td>'; }

  return '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税及附加税费申报表附列资料（四）</div>'
    + '<div style="font-size:11px;color:#6b7280;text-align:center;margin-bottom:6px">（税额抵减情况表）</div>'

    // 一、税额抵减情况
    + '<div style="font-size:12px;font-weight:600;margin-bottom:4px">一、税额抵减情况</div>'
    + '<table class="vat-form-table" style=""><colgroup><col><col><col><col><col><col><col></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th rowspan="2">序号</th><th rowspan="2">抵减项目</th><th>期初余额</th><th>本期发生额</th><th>本期应抵减税额</th><th>本期实际抵减税额</th><th>期末余额</th></tr>'
    + '<tr style="background:#e8edf5"><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center;font-size:10px">3=1+2</th><th style="text-align:center;font-size:10px">4≤3</th><th style="text-align:center;font-size:10px">5=3-4</th></tr></thead><tbody>'
    + '<tr><td style="text-align:center">1</td><td style="white-space:nowrap">增值税税控系统专用设备费及技术维护费</td>' + td(c.tax_control_begin) + td(c.tax_control_occur) + td(c.tax_control_should) + td(c.tax_control_actual) + td(c.tax_control_end) + '</tr>'
    + '<tr><td style="text-align:center">2</td><td style="white-space:nowrap">分支机构预征缴纳税款</td>' + td(c.branch_begin) + td(c.branch_occur) + td(c.branch_should) + td(c.branch_actual) + td(c.branch_end) + '</tr>'
    + '<tr><td style="text-align:center">3</td><td style="white-space:nowrap">建筑服务预征缴纳税款</td>' + td(c.construction_begin) + td(c.construction_occur) + td(c.construction_should) + td(c.construction_actual) + td(c.construction_end) + '</tr>'
    + '<tr><td style="text-align:center">4</td><td style="white-space:nowrap">销售不动产预征缴纳税款</td>' + td(c.real_estate_begin) + td(c.real_estate_occur) + td(c.real_estate_should) + td(c.real_estate_actual) + td(c.real_estate_end) + '</tr>'
    + '<tr><td style="text-align:center">5</td><td style="white-space:nowrap">出租不动产预征缴纳税款</td>' + td(c.rental_begin) + td(c.rental_occur) + td(c.rental_should) + td(c.rental_actual) + td(c.rental_end) + '</tr>'
    + '</tbody></table>'

    // 二、加计抵减情况
    + '<div style="font-size:12px;font-weight:600;margin:12px 0 4px 0">二、加计抵减情况</div>'
    + '<table class="vat-form-table" style=""><colgroup><col><col><col><col><col><col><col><col></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th rowspan="2">序号</th><th rowspan="2">加计抵减项目</th><th>期初余额</th><th>本期发生额</th><th>本期调减额</th><th>本期可抵减额</th><th>本期实际抵减额</th><th>期末余额</th></tr>'
    + '<tr style="background:#e8edf5"><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center">3</th><th style="text-align:center;font-size:10px">4=1+2-3</th><th style="text-align:center">5</th><th style="text-align:center;font-size:10px">6=4-5</th></tr></thead><tbody>'
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

// ==================== 附表五：附加税费情况表（16列统一大表格，按Excel模板列对齐） ====================
function renderSchedule5(data) {
  const scf = (typeof data.form_surcharge === 'string') ? JSON.parse(data.form_surcharge) : (data.form_surcharge || {});
  function td(v) { return '<td class="num">' + _fmt(v) + '</td>'; }
  function td0(v) { return '<td class="num">' + _fm0(v) + '</td>'; }
  function tdDash() { return '<td class="num">——</td>'; }
  function tdTxt(v) { return '<td>' + (v || '') + '</td>'; }
  function tdPct(v) { return '<td class="num">' + ((v||0)*100).toFixed(0) + '%</td>'; }

  var html = '';
  html += '<div style="overflow-x:auto"><table class="vat-form-table" style="font-size:10px">';
  html += '<colgroup>';
  for (var i = 0; i < 16; i++) html += '<col>';
  html += '</colgroup>';

  // === 第1行：标题（模板A1:C1空白+F1:P1标题） ===
  html += '<tr>';
  html += '<td colspan="3" style="border:none;background:white"></td>';
  html += '<td style="border:none;background:white"></td>';
  html += '<td style="border:none;background:white"></td>';
  html += '<td colspan="11" style="text-align:center;font-size:13px;font-weight:700;padding:6px 0">增值税及附加税费申报表（一般纳税人适用）附列资料（五）</td>';
  html += '</tr>';

  // === 第2行：副标题（模板A1:C1+F2:H2空白+I2:P2副标题） ===
  html += '<tr>';
  html += '<td colspan="3" style="border:none;background:white"></td>';
  html += '<td style="border:none;background:white"></td>';
  html += '<td style="border:none;background:white"></td>';
  html += '<td colspan="3" style="border:none;background:white"></td>';
  html += '<td colspan="8" style="text-align:center;font-size:11px;color:#6b7280;padding-bottom:6px">（附加税费情况表）</td>';
  html += '</tr>';

  // === 第3-4行：小微企业六税两费减免政策信息 ===
  html += '<tr style="background:#d9e2f3">';
  html += '<td colspan="6" rowspan="2" style="text-align:left;padding-left:4px">本期是否适用小微企业"六税两费"减免政策</td>';
  html += '<td colspan="2" rowspan="2">□是 □否</td>';
  html += '<td colspan="3">减免政策适用主体</td>';
  html += '<td colspan="5">□个体工商户 □小型微利企业</td>';
  html += '</tr>';
  html += '<tr style="background:#d9e2f3">';
  html += '<td colspan="3">适用减免政策起止时间</td>';
  html += '<td colspan="5">年 月 至 年 月</td>';
  html += '</tr>';

  // === 第5-6行：表头 ===
  html += '<thead><tr style="background:#d9e2f3">';
  html += '<th colspan="2" rowspan="2">税（费）种</th>';
  html += '<th colspan="3">计税（费）依据</th>';
  html += '<th colspan="2" rowspan="2">税（费）<br>率（%）</th>';
  html += '<th rowspan="2">本期应纳税<br>（费）额</th>';
  html += '<th colspan="2">本期减免税<br>（费）额</th>';
  html += '<th colspan="2">小微企业"六税两费"<br>减免政策</th>';
  html += '<th colspan="2">试点建设培育<br>产教融合型企业</th>';
  html += '<th rowspan="2">本期已缴<br>税（费）额</th>';
  html += '<th rowspan="2">本期应补（退）<br>税（费）额</th>';
  html += '</tr>';

  html += '<tr style="background:#d9e2f3">';
  html += '<th>增值税税额</th><th>增值税<br>免抵税额</th><th>留抵退税<br>本期扣除额</th>';
  html += '<th>减免性质<br>代码</th><th>减免税<br>（费）额</th>';
  html += '<th>减征比例<br>（%）</th><th>减征额</th>';
  html += '<th>减免性质<br>代码</th><th>本期抵免<br>金额</th>';
  html += '</tr></thead>';

  // === 数据行 ===
  function surRow(name, seq, base, exempt, refund, rate, tax,
                  redCode, redAmt, sixRate, sixAmt, pilotCode, pilotAmt, paid, final, isTotal) {
    if (isTotal) {
      return '<tr style="background:#f0fdf4;font-weight:700"><td>' + name + '</td><td style="text-align:center">' + seq + '</td>'
        + tdDash() + tdDash() + tdDash() + '<td colspan="2" class="num">——</td>'
        + td(tax) + tdDash() + td0(redAmt)
        + tdDash() + td0(sixAmt)
        + tdDash() + td0(pilotAmt) + td0(paid) + td0(final) + '</tr>';
    }
    return '<tr><td>' + name + '</td><td style="text-align:center">' + seq + '</td>'
      + td(base) + td0(exempt) + td0(refund)
      + '<td colspan="2" class="num">' + ((rate||0)*100).toFixed(0) + '%</td>'
      + td(tax)
      + tdTxt(redCode) + td0(redAmt)
      + tdPct(sixRate) + td0(sixAmt)
      + tdTxt(pilotCode) + td0(pilotAmt) + td0(paid) + td0(final) + '</tr>';
  }

  html += '<tbody>';
  html += surRow('城市维护建设税', 1, scf.city_base, scf.vat_exempt_credit, scf.vat_refund_deduct,
           scf.city_rate, scf.city_tax, scf.city_reduction_code, scf.city_reduction_amount,
           scf.city_reduction_rate, scf.city_six_tax_amount,
           scf.city_edu_pilot_code, scf.city_edu_pilot_amount, scf.city_paid, scf.city_final);
  html += surRow('教育费附加', 2, scf.edu_base, scf.edu_exempt_credit, scf.edu_vat_refund_deduct,
           scf.edu_rate, scf.edu_tax, scf.edu_reduction_code, scf.edu_reduction_amount,
           scf.edu_reduction_rate, scf.edu_six_tax_amount,
           scf.edu_edu_pilot_code, scf.edu_edu_pilot_amount, scf.edu_paid, scf.edu_final);
  html += surRow('地方教育附加', 3, scf.local_edu_base, scf.local_edu_exempt_credit, scf.local_edu_vat_refund_deduct,
           scf.local_edu_rate, scf.local_edu_tax, scf.local_edu_reduction_code, scf.local_edu_reduction_amount,
           scf.local_edu_reduction_rate, scf.local_edu_six_tax_amount,
           scf.local_edu_edu_pilot_code, scf.local_edu_edu_pilot_amount, scf.local_edu_paid, scf.local_edu_final);
  html += surRow('合计', 4, null, null, null, null, scf.total_tax,
           null, scf.total_reduction, null, scf.total_six_tax_reduction,
           null, scf.total_edu_pilot, scf.total_paid, scf.total_final, true);
  html += '</tbody>';

  // === 第12-14行：产教融合抵免政策（模板：A:E=政策名 F:G=□是□否 H:M=项目名 N=编号 O:P=空） ===
  html += '<tr style="background:#d9e2f3">';
  html += '<td colspan="5" rowspan="3" style="text-align:left;padding-left:4px">本期是否适用试点建设培育产教融合型企业抵免政策</td>';
  html += '<td colspan="2" rowspan="3">□是<br>□否</td>';
  html += '<td colspan="6">当期新增投资额</td>';
  html += '<td style="text-align:center">5</td>';
  html += '<td colspan="2" style="border:none;background:white"></td>';
  html += '</tr>';
  html += '<tr style="background:#d9e2f3">';
  html += '<td colspan="6">上期留抵可抵免金额</td>';
  html += '<td style="text-align:center">6</td>';
  html += '<td colspan="2" style="border:none;background:white"></td>';
  html += '</tr>';
  html += '<tr style="background:#d9e2f3">';
  html += '<td colspan="6">结转下期可抵免金额</td>';
  html += '<td style="text-align:center">7</td>';
  html += '<td colspan="2" style="border:none;background:white"></td>';
  html += '</tr>';

  // === 第15-17行：留抵退税额使用情况（模板：A:G=政策名 H:M=项目名 N=编号 O:P=空） ===
  html += '<tr style="background:#d9e2f3">';
  html += '<td colspan="7" rowspan="3" style="text-align:left;padding-left:4px">可用于扣除的增值税留抵退税额使用情况</td>';
  html += '<td colspan="6">当期新增可用于扣除的留抵退税额</td>';
  html += '<td style="text-align:center">8</td>';
  html += '<td colspan="2" style="border:none;background:white"></td>';
  html += '</tr>';
  html += '<tr style="background:#d9e2f3">';
  html += '<td colspan="6">上期结存可用于扣除的留抵退税额</td>';
  html += '<td style="text-align:center">9</td>';
  html += '<td colspan="2" style="border:none;background:white"></td>';
  html += '</tr>';
  html += '<tr style="background:#d9e2f3">';
  html += '<td colspan="6">结转下期可用于扣除的留抵退税额</td>';
  html += '<td style="text-align:center">10</td>';
  html += '<td colspan="2" style="border:none;background:white"></td>';
  html += '</tr>';

  html += '</table></div>';
  return html;
}


function renderReductionForm(data) {
  const r = (typeof data.form_reduction === 'string') ? JSON.parse(data.form_reduction) : (data.form_reduction || {});
  function td(v) { return '<td class="num">' + _fm0(v) + '</td>'; }

  let html = '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:4px">增值税减免税申报明细表</div>';

  // 一、减税项目
  html += '<div style="font-size:12px;font-weight:600;margin-bottom:4px">一、减税项目</div>';
  html += '<table class="vat-form-table"><colgroup><col><col><col><col><col><col><col></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th rowspan="2">减税性质代码及名称</th><th rowspan="2">栏次</th><th>期初余额</th><th>本期发生额</th><th>本期应抵减税额</th><th>本期实际抵减税额</th><th>期末余额</th></tr>'
    + '<tr style="background:#e8edf5"><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center;font-size:10px">3=1+2</th><th style="text-align:center;font-size:10px">4≤3</th><th style="text-align:center;font-size:10px">5=3-4</th></tr></thead>';

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
  html += '<table class="vat-form-table"><colgroup><col><col><col><col><col><col><col></colgroup>'
    + '<thead><tr style="background:#d9e2f3"><th rowspan="2">免税性质代码及名称</th><th rowspan="2">栏次</th><th>免征增值税<br>项目销售额</th><th>免税销售额扣除项目<br>本期实际扣除金额</th><th>扣除后免税销售额</th><th>免税销售额<br>对应的进项税额</th><th>免税额</th></tr>'
    + '<tr style="background:#e8edf5"><th style="text-align:center">1</th><th style="text-align:center">2</th><th style="text-align:center;font-size:10px">3=1-2</th><th style="text-align:center">4</th><th style="text-align:center">5</th></tr></thead><tbody>';

  const exemptItems = r.exempt_items || [];
  if (exemptItems.length === 0) {
    html += '<tr><td>合　计</td><td style="text-align:center">1</td>' + td(r.exempt_7_sales) + td(r.exempt_7_deduction) + td(r.exempt_7_after) + td(r.exempt_7_input_tax) + td(r.exempt_7_amount) + '</tr>'
      + '<tr><td>出口免税</td><td style="text-align:center">2</td>' + td(r.exempt_8_sales) + '<td class="num"></td><td class="num"></td><td class="num"></td><td class="num">' + _fm0(r.exempt_8_amount) + '</td></tr>'
      + '<tr><td style="padding-left:16px">其中：跨境服务</td><td style="text-align:center">3</td>' + td(r.exempt_9_sales) + '<td class="num"></td><td class="num"></td><td class="num"></td><td class="num">' + _fm0(r.exempt_9_amount) + '</td></tr>';
  } else {
    exemptItems.forEach((item, i) => {
      html += '<tr><td>' + escapeHtml(item.name || '') + '</td><td style="text-align:center">' + (i + 1) + '</td>'
        + td(item.exempt_sales) + td(item.deduction_amount) + td(item.after_deduction) + td(item.input_tax) + td(item.exempt_amount) + '</tr>';
    });
  }
  html += '</tbody></table>';

  return html;
}
