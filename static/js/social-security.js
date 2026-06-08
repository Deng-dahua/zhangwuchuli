// ========== 社会保险费模块（参照公积金模块布局）==========

var ssPeriod = '';
var ssStats = {};

// 险种定义
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

// ============ 期间步进（与公积金模块同款）============
function stepSsYear(delta) {
  const yearSel = document.getElementById('ss-year');
  if (!yearSel) return;
  const opts = Array.from(yearSel.options).map(function(o) { return parseInt(o.value); });
  const cur = parseInt(yearSel.value);
  const idx = opts.indexOf(cur);
  const next = idx + delta;
  if (next >= 0 && next < opts.length) yearSel.value = opts[next];
  const monthSel = document.getElementById('ss-month');
  if (monthSel) ssPeriod = yearSel.value + '-' + monthSel.value;
  ssRefresh();
}

function stepSsMonth(delta) {
  const yearSel = document.getElementById('ss-year');
  const monSel = document.getElementById('ss-month');
  if (!monSel) return;
  var y = parseInt(yearSel ? yearSel.value : new Date().getFullYear());
  var m = parseInt(monSel.value) + delta;
  if (m > 12) { m = 1; y++; }
  if (m < 1) { m = 12; y--; }
  if (yearSel) {
    var yearOpts = Array.from(yearSel.options).map(function(o) { return parseInt(o.value); });
    if (yearOpts.length > 0 && yearOpts.indexOf(y) !== -1) yearSel.value = y;
  }
  monSel.value = String(m).padStart(2, '0');
  ssPeriod = yearSel.value + '-' + monSel.value;
  ssRefresh();
}

function ssClearPeriod() {
  var yearSel = document.getElementById('ss-year');
  var monthSel = document.getElementById('ss-month');
  if (!yearSel || !monthSel) return;
  var now = new Date();
  var cy = now.getFullYear();
  var cm = String(now.getMonth() + 1).padStart(2, '0');
  var yearOpts = Array.from(yearSel.options).map(function(o) { return parseInt(o.value); });
  if (yearOpts.indexOf(cy) !== -1) yearSel.value = cy;
  monthSel.value = cm;
  ssPeriod = yearSel.value + '-' + monthSel.value;
  ssRefresh();
}

// ============ 主渲染 ============
async function renderSocialSecurity(container) {
  // 默认期间：与顶栏 currentPeriod 一致
  var defYear = new Date().getFullYear();
  var defMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  if (typeof currentPeriod !== 'undefined' && currentPeriod && currentPeriod.indexOf('-') !== -1) {
    var parts = currentPeriod.split('-');
    defYear = parseInt(parts[0]);
    defMonth = parts[1];
  }
  var ssDefPeriod = defYear + '-' + defMonth;

  var yearOpts = '';
  for (var y = defYear - 5; y <= defYear + 1; y++) {
    yearOpts += '<option value="' + y + '"' + (y === defYear ? ' selected' : '') + '>' + y + '年</option>';
  }

  container.innerHTML =
    '<div class="module-page">'
    + '<div class="stats-row" id="ss-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;"></div>'
    + '<div class="toolbar">'
      + '<div class="toolbar-left" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
        + '<div class="period-selector-bar" style="display:inline-flex">'
          + '<div class="period-stepper">'
            + '<select id="ss-year" class="period-selector-year">' + yearOpts + '</select>'
            + '<div class="stepper-arrows">'
              + '<button class="stepper-btn stepper-up" type="button" onclick="stepSsYear(1)">▲</button>'
              + '<button class="stepper-btn stepper-down" type="button" onclick="stepSsYear(-1)">▼</button>'
            + '</div>'
          + '</div>'
          + '<div class="period-stepper">'
            + '<select id="ss-month" class="period-selector-month">'
            + '<option value="01"' + (defMonth === '01' ? ' selected' : '') + '>01月</option>'
            + '<option value="02"' + (defMonth === '02' ? ' selected' : '') + '>02月</option>'
            + '<option value="03"' + (defMonth === '03' ? ' selected' : '') + '>03月</option>'
            + '<option value="04"' + (defMonth === '04' ? ' selected' : '') + '>04月</option>'
            + '<option value="05"' + (defMonth === '05' ? ' selected' : '') + '>05月</option>'
            + '<option value="06"' + (defMonth === '06' ? ' selected' : '') + '>06月</option>'
            + '<option value="07"' + (defMonth === '07' ? ' selected' : '') + '>07月</option>'
            + '<option value="08"' + (defMonth === '08' ? ' selected' : '') + '>08月</option>'
            + '<option value="09"' + (defMonth === '09' ? ' selected' : '') + '>09月</option>'
            + '<option value="10"' + (defMonth === '10' ? ' selected' : '') + '>10月</option>'
            + '<option value="11"' + (defMonth === '11' ? ' selected' : '') + '>11月</option>'
            + '<option value="12"' + (defMonth === '12' ? ' selected' : '') + '>12月</option>'
            + '</select>'
            + '<div class="stepper-arrows">'
              + '<button class="stepper-btn stepper-up" type="button" onclick="stepSsMonth(1)">▲</button>'
              + '<button class="stepper-btn stepper-down" type="button" onclick="stepSsMonth(-1)">▼</button>'
            + '</div>'
          + '</div>'
        + '</div>'
        + '<button class="btn btn-primary" onclick="ssRefresh()">查询</button>'
        + '<button class="btn btn-secondary" onclick="ssClearPeriod()">清除</button>'
        + '<button class="btn btn-success" onclick="ssAddNew()">新增社会保险费</button>'
        + '<button class="btn btn-secondary" onclick="triggerSSImport()">导入文件</button>'
        + '<input type="file" id="ss-import-file" accept=".xlsx,.xls" style="display:none" onchange="handleSSImportFile(event)">'
        + '<button class="btn btn-success" onclick="generateSSVoucher()">生成凭证</button>'
        + '<button class="btn btn-danger" onclick="deleteSSDeclaration()">删除报表</button>'
      + '</div>'
    + '</div>'
    + '<div class="table-wrap" style="max-height:calc(100vh - 260px);overflow:auto;">'
    + '<table class="data-table" id="ss-table">'
      + '<thead><tr>'
        + '<th>姓名</th>'
        + '<th>身份证号</th>'
        + '<th>人员类别</th>'
        + '<th>缴费工资</th>'
        + '<th>个人社保合计</th>'
        + '<th>单位社保合计</th>'
        + '<th>应收合计</th>'
        + '<th>操作</th>'
      + '</tr></thead>'
      + '<tbody id="ss-tbody"></tbody>'
    + '</table>'
    + '</div>'
    + '</div>';

  // 设置默认期间并加载数据
  ssPeriod = ssDefPeriod;
  var yearSel2 = document.getElementById('ss-year');
  var monthSel2 = document.getElementById('ss-month');
  if (yearSel2) yearSel2.value = defYear;
  if (monthSel2) monthSel2.value = defMonth;
  // 绑定期间变化事件
  if (yearSel2) yearSel2.addEventListener('change', function() { ssPeriod = yearSel2.value + '-' + monthSel2.value; ssRefresh(); });
  if (monthSel2) monthSel2.addEventListener('change', function() { ssPeriod = yearSel2.value + '-' + monthSel2.value; ssRefresh(); });
  ssRefresh();
}

// ============ 数据加载 ============
async function ssRefresh() {
  var yearSel = document.getElementById('ss-year');
  var monthSel = document.getElementById('ss-month');
  if (yearSel && monthSel) ssPeriod = yearSel.value + '-' + monthSel.value;
  if (!currentCompanyId) return;

  try {
    // 加载申报表列表
    var declsUrl = '/api/social-security/declarations';
    if (ssPeriod) declsUrl += '?period=' + encodeURIComponent(ssPeriod);
    var declsRes = await api(declsUrl);
    var decls = declsRes.items || [];

    // 加载统计
    var statsUrl = '/api/social-security/stats';
    if (ssPeriod) statsUrl += '?period=' + encodeURIComponent(ssPeriod);
    var stats = await api(statsUrl);
    ssStats = stats;
    ssRenderStats(stats);

    // 收集所有明细
    var allDetails = [];
    for (var i = 0; i < decls.length; i++) {
      try {
        var full = await api('/api/social-security/declarations/' + decls[i].id);
        var details = full.details || [];
        // 附上 declaration_id
        details.forEach(function(d) { d._declaration_id = decls[i].id; });
        allDetails = allDetails.concat(details);
      } catch(e) {}
    }
    ssRenderTable(allDetails);
  } catch (e) {
    console.error(e);
  }
}

// ============ 统计卡片 ============
function ssRenderStats(stats) {
  var el = document.getElementById('ss-stats');
  if (!el) return;
  var cards = [
    { label: '参保人数', value: stats.total_details || 0 },
    { label: '单位缴纳合计', value: '\u00a5' + (stats.total_company_amount || 0).toLocaleString() },
    { label: '个人缴纳合计', value: '\u00a5' + (stats.total_personal_amount || 0).toLocaleString() },
    { label: '应收合计', value: '\u00a5' + (stats.total_amount || 0).toLocaleString() },
  ];
  el.innerHTML = cards.map(function(c) {
    return '<div class="stat-card"><div class="stat-label">' + c.label + '</div><div class="stat-value">' + c.value + '</div></div>';
  }).join('');
}

// ============ 扁平表格 ============
function ssRenderTable(items) {
  var tbody = document.getElementById('ss-tbody');
  if (!tbody) return;
  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#999;">暂无数据</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(function(item) {
    // 计算个人/单位/应收合计
    var insMap = {};
    (item.insurance_items || []).forEach(function(i) { insMap[i.code || i.name] = i; });
    var personalAmount = 0, companyAmount = 0;
    SS_INSURANCE_LIST.forEach(function(ins) {
      var it = insMap[ins.code] || insMap[ins.name];
      var amt = it ? (it.amount || 0) : 0;
      if (ins.type === 'unit') companyAmount += amt;
      else personalAmount += amt;
    });
    var totalAmount = personalAmount + companyAmount;

    return '<tr>'
      + '<td>' + escapeHtml(item.employee_name || '-') + '</td>'
      + '<td>' + escapeHtml(item.id_number || '-') + '</td>'
      + '<td>' + escapeHtml(item.category || '在职人员') + '</td>'
      + '<td class="num">' + (item.salary_base || 0).toLocaleString() + '</td>'
      + '<td class="num" style="color:#d97706">' + personalAmount.toLocaleString() + '</td>'
      + '<td class="num" style="color:#db2777">' + companyAmount.toLocaleString() + '</td>'
      + '<td class="num" style="font-weight:600;color:#059669">' + totalAmount.toLocaleString() + '</td>'
      + '<td>'
        + '<button class="btn btn-sm btn-outline" onclick="ssShowDetail(' + item.id + ',' + item._declaration_id + ')">查看</button>'
        + '<button class="btn btn-sm btn-danger" onclick="ssDelete(' + item.id + ')">删除</button>'
      + '</td>'
      + '</tr>';
  }).join('');
}

// ============ 查看/编辑明细弹窗（按 Excel 模板展示险种）============
async function ssShowDetail(detailId, declarationId) {
  try {
    var decl = await api('/api/social-security/declarations/' + declarationId);
    var detail = (decl.details || []).find(function(d) { return d.id === detailId; });
    if (!detail) { toast('未找到明细', 'error'); return; }

    var insMap = {};
    (detail.insurance_items || []).forEach(function(i) { insMap[i.code || i.name] = i; });

    var insRows = '';
    var personalTotal = 0, companyTotal = 0;
    SS_INSURANCE_LIST.forEach(function(ins) {
      var it = insMap[ins.code] || insMap[ins.name] || { amount: 0, rate: '' };
      var amt = it.amount || 0;
      if (ins.type === 'unit') companyTotal += amt;
      else personalTotal += amt;
      insRows += '<tr>'
        + '<td>' + escapeHtml(ins.name) + '<br><span style="color:#6b7280;font-size:11px">' + (ins.type === 'unit' ? '单位' : '个人') + '</span></td>'
        + '<td class="num">' + (it.rate || '-') + '</td>'
        + '<td class="num">' + amt.toLocaleString() + '</td>'
        + '</tr>';
    });

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'ss-detail-modal';
    modal.innerHTML = '<div class="modal" style="max-width:720px;max-height:90vh;overflow-y:auto">'
      + '<div class="modal-header"><h3>参保明细 — ' + escapeHtml(detail.employee_name || '') + '</h3><button class="modal-close" onclick="closeModal(\'ss-detail-modal\')">&times;</button></div>'
      + '<div class="modal-body">'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">'
          + '<div><span style="color:#6b7280;font-size:12px">姓名</span><div style="font-weight:600">' + escapeHtml(detail.employee_name || '-') + '</div></div>'
          + '<div><span style="color:#6b7280;font-size:12px">身份证号</span><div>' + escapeHtml(detail.id_number || '-') + '</div></div>'
          + '<div><span style="color:#6b7280;font-size:12px">人员类别</span><div>' + escapeHtml(detail.category || '在职人员') + '</div></div>'
          + '<div><span style="color:#6b7280;font-size:12px">缴费工资</span><div>' + (detail.salary_base || 0).toLocaleString() + '</div></div>'
          + '<div><span style="color:#d97706;font-size:12px">个人合计</span><div style="font-weight:600;color:#d97706">' + personalTotal.toLocaleString() + '</div></div>'
          + '<div><span style="color:#db2777;font-size:12px">单位合计</span><div style="font-weight:600;color:#db2777">' + companyTotal.toLocaleString() + '</div></div>'
        + '</div>'
        + '<h4 style="font-size:14px;margin-bottom:8px">险种明细</h4>'
        + '<div style="max-height:400px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px">'
        + '<table class="data-table" style="font-size:12px"><thead><tr><th>险种</th><th style="width:80px">费率</th><th style="width:100px">应缴费额</th></tr></thead><tbody>'
        + insRows
        + '<tr style="font-weight:600;background:#fef3c7"><td>合计</td><td>-</td><td>' + (personalTotal + companyTotal).toLocaleString() + '</td></tr>'
        + '</tbody></table></div>'
      + '</div>'
      + '<div class="modal-footer">'
        + '<button class="btn btn-outline" onclick="closeModal(\'ss-detail-modal\')">关闭</button>'
        + '<button class="btn btn-primary" onclick="closeModal(\'ss-detail-modal\');ssShowEdit(' + detailId + ',' + declarationId + ')">编辑</button>'
      + '</div></div>';
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    modal.addEventListener('click', function(e) {
      if (e.target === modal) { closeModal('ss-detail-modal'); }
    });
  } catch (e) {
    console.error('ssShowDetail error:', e);
  }
}

// ============ 编辑明细 ============
async function ssShowEdit(detailId, declarationId) {
  try {
    var decl = await api('/api/social-security/declarations/' + declarationId);
    var detail = (decl.details || []).find(function(d) { return d.id === detailId; });
    if (!detail) { toast('未找到明细', 'error'); return; }

    var im = {};
    (detail.insurance_items || []).forEach(function(i) { im[i.code || i.name] = i; });

    var insHtml = '';
    SS_INSURANCE_LIST.forEach(function(ins) {
      var it = im[ins.code] || im[ins.name] || { amount: 0, rate: '' };
      insHtml += '<tr>'
        + '<td style="padding:4px;font-size:12px">' + escapeHtml(ins.name) + '<br><span style="color:#6b7280;font-size:11px">' + (ins.type === 'unit' ? '单位' : '个人') + '</span></td>'
        + '<td style="padding:4px"><input type="text" class="form-control ss-edit-rate" data-code="' + ins.code + '" value="' + escapeHtml(String(it.rate || '')) + '" placeholder="如 16%" style="width:80px;padding:4px;font-size:12px"></td>'
        + '<td style="padding:4px"><input type="number" step="0.01" class="form-control ss-edit-amount" data-code="' + ins.code + '" value="' + (it.amount || 0) + '" style="width:100px;padding:4px;font-size:12px"></td>'
        + '</tr>';
    });

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'ss-edit-modal';
    modal.innerHTML = '<div class="modal" style="max-width:720px;max-height:90vh;overflow-y:auto">'
      + '<div class="modal-header"><h3>编辑参保明细 — ' + escapeHtml(detail.employee_name || '') + '</h3><button class="modal-close" onclick="closeModal(\'ss-edit-modal\')">&times;</button></div>'
      + '<div class="modal-body">'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">'
          + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">姓名 <span style="color:red">*</span></label>'
          + '<input type="text" class="form-control" id="ss-edit-name" value="' + escapeHtml(detail.employee_name || '') + '"></div>'
          + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">身份证号</label>'
          + '<input type="text" class="form-control" id="ss-edit-idno" value="' + escapeHtml(detail.id_number || '') + '"></div>'
          + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">人员类别</label>'
          + '<select class="form-control" id="ss-edit-cat"><option value="在职人员"' + (detail.category === '在职人员' ? ' selected' : '') + '>在职人员</option><option value="退休人员"' + (detail.category === '退休人员' ? ' selected' : '') + '>退休人员</option><option value="家属统筹人员"' + (detail.category === '家属统筹人员' ? ' selected' : '') + '>家属统筹人员</option></select></div>'
          + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">缴费工资</label>'
          + '<input type="number" step="0.01" class="form-control" id="ss-edit-salary" value="' + (detail.salary_base || 0) + '"></div>'
        + '</div>'
        + '<h4 style="font-size:14px;margin:12px 0 8px">险种明细</h4>'
        + '<div style="max-height:300px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px">'
        + '<table class="data-table" style="font-size:12px"><thead><tr><th>险种</th><th style="width:100px">费率</th><th style="width:120px">应缴费额</th></tr></thead><tbody>'
        + insHtml
        + '</tbody></table></div>'
      + '</div>'
      + '<div class="modal-footer">'
        + '<button class="btn btn-outline" onclick="closeModal(\'ss-edit-modal\')">取消</button>'
        + '<button class="btn btn-primary" onclick="ssDoEdit(' + detailId + ',' + declarationId + ')">保存</button>'
      + '</div></div>';
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    modal.addEventListener('click', function(e) {
      if (e.target === modal) { closeModal('ss-edit-modal'); }
    });
  } catch (e) {
    console.error('ssShowEdit error:', e);
  }
}

async function ssDoEdit(detailId, declarationId) {
  var name = (document.getElementById('ss-edit-name') || {}).value;
  if (!name) { alert('请填写姓名'); return; }
  var insuranceItems = [];
  SS_INSURANCE_LIST.forEach(function(ins) {
    var rateEl = document.querySelector('.ss-edit-rate[data-code="' + ins.code + '"]');
    var amountEl = document.querySelector('.ss-edit-amount[data-code="' + ins.code + '"]');
    var rate = rateEl ? rateEl.value : '';
    var amount = parseFloat(amountEl ? amountEl.value : 0) || 0;
    insuranceItems.push({ code: ins.code, name: ins.name, type: ins.type, rate: rate, amount: amount });
  });

  var body = {
    employee_name: name,
    id_number: (document.getElementById('ss-edit-idno') || {}).value || '',
    category: (document.getElementById('ss-edit-cat') || {}).value || '在职人员',
    salary_base: parseFloat((document.getElementById('ss-edit-salary') || {}).value) || 0,
    insurance_items: insuranceItems,
  };

  try {
    await api('/api/social-security/details/' + detailId + '?company_id=' + currentCompanyId, {
      method: 'PUT', body: JSON.stringify(body)
    });
    closeModal('ss-edit-modal');
    ssRefresh();
  } catch (e) { handleError(e, '保存社保明细'); }
}

// ============ 删除 ============
async function ssDelete(id) {
  if (!confirm('确认删除此条参保记录？')) return;
  try {
    await api('/api/social-security/details/' + id + '?company_id=' + currentCompanyId, { method: 'DELETE' });
    ssRefresh();
  } catch (e) { handleError(e, '删除参保记录'); }
}

// ============ 导入文件 ============
function triggerSSImport() {
  var input = document.getElementById('ss-import-file');
  if (input) input.click();
}

async function handleSSImportFile(event) {
  var file = event.target.files[0];
  if (!file) return;
  var formData = new FormData();
  formData.append('file', file);
  var url = '/api/social-security/import?company_id=' + currentCompanyId + '&period=' + ssPeriod;
  try {
    var result = await api(url, { method: 'POST', body: formData, headers: {} });
    toast(result.message || '导入成功', 'success');
    ssRefresh();
  } catch (e) { handleError(e, '导入文件'); }
  event.target.value = '';
}

// ============ 生成凭证 ============
async function generateSSVoucher() {
  if (!confirm('确认生成当前期间(' + ssPeriod + ')的社保凭证？')) return;
  try {
    var result = await api('/api/social-security/generate-payment-journals?company_id=' + currentCompanyId + '&period=' + ssPeriod, {
      method: 'POST'
    });
    toast(result.message || '凭证生成成功', 'success');
    ssRefresh();
  } catch (e) { handleError(e, '生成凭证'); }
}

// ============ 删除报表 ============
async function deleteSSDeclaration() {
  if (!confirm('确认删除当前期间(' + ssPeriod + ')的全部申报记录？此操作不可恢复！')) return;
  try {
    var decls = await api('/api/social-security/declarations?company_id=' + currentCompanyId + '&period=' + ssPeriod);
    if (!decls || decls.length === 0) { toast('当前期间无申报记录', 'warning'); return; }
    for (var i = 0; i < decls.length; i++) {
      await api('/api/social-security/declarations/' + decls[i].id + '?company_id=' + currentCompanyId, { method: 'DELETE' });
    }
    toast('申报记录已删除', 'success');
    ssRefresh();
  } catch (e) { handleError(e, '删除报表'); }
}

// ============ 新增参保人员 ============
async function ssAddNew() {
  try {
    // 先确保当前期间有申报记录
    var decls = await api('/api/social-security/declarations?company_id=' + currentCompanyId + '&period=' + ssPeriod);
    var declId;
    if (!decls || decls.length === 0) {
      var decl = await api('/api/social-security/declarations?company_id=' + currentCompanyId + '&period=' + ssPeriod, {
        method: 'POST',
        body: JSON.stringify({ period: ssPeriod, status: '草稿', details: [] }),
        headers: { 'Content-Type': 'application/json' }
      });
      declId = decl.id;
    } else {
      declId = decls[0].id;
    }

    // 弹窗输入新员工信息
    var insHtml = '';
    SS_INSURANCE_LIST.forEach(function(ins) {
      insHtml += '<tr>'
        + '<td>' + escapeHtml(ins.name) + '</td>'
        + '<td><input type="text" class="form-control ss-edit-rate" data-code="' + ins.code + '" placeholder="费率" style="width:80px"></td>'
        + '<td><input type="number" step="0.01" class="form-control ss-edit-amount" data-code="' + ins.code + '" placeholder="0.00" style="width:120px"></td>'
        + '</tr>';
    });

    var modal = document.createElement('div');
    modal.id = 'ss-add-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal" style="max-width:720px;max-height:90vh;overflow-y:auto">'
      + '<div class="modal-header"><h3>新增参保明细</h3><button class="modal-close" onclick="closeModal(\'ss-add-modal\')">&times;</button></div>'
      + '<div class="modal-body">'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">'
          + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">姓名 <span style="color:red">*</span></label>'
          + '<input type="text" class="form-control" id="ss-add-name"></div>'
          + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">身份证号</label>'
          + '<input type="text" class="form-control" id="ss-add-idno"></div>'
          + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">人员类别</label>'
          + '<select class="form-control" id="ss-add-cat"><option value="在职人员" selected>在职人员</option><option value="退休人员">退休人员</option><option value="家属统筹人员">家属统筹人员</option></select></div>'
          + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">缴费工资</label>'
          + '<input type="number" step="0.01" class="form-control" id="ss-add-salary" value="0"></div>'
        + '</div>'
        + '<h4 style="font-size:14px;margin:12px 0 8px">险种明细</h4>'
        + '<div style="max-height:300px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px">'
        + '<table class="data-table" style="font-size:12px"><thead><tr><th>险种</th><th style="width:100px">费率</th><th style="width:120px">应缴费额</th></tr></thead><tbody>'
        + insHtml
        + '</tbody></table></div>'
      + '</div>'
      + '<div class="modal-footer">'
        + '<button class="btn btn-outline" onclick="closeModal(\'ss-add-modal\')">取消</button>'
        + '<button class="btn btn-primary" onclick="ssDoAdd(' + declId + ')">保存</button>'
      + '</div></div>';
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    modal.addEventListener('click', function(e) {
      if (e.target === modal) { closeModal('ss-add-modal'); }
    });
  } catch (e) { handleError(e, '打开新增窗口'); }
}

async function ssDoAdd(declarationId) {
  var name = (document.getElementById('ss-add-name') || {}).value;
  if (!name) { alert('请填写姓名'); return; }
  var insuranceItems = [];
  SS_INSURANCE_LIST.forEach(function(ins) {
    var rateEl = document.querySelector('.ss-edit-rate[data-code="' + ins.code + '"]');
    var amountEl = document.querySelector('.ss-edit-amount[data-code="' + ins.code + '"]');
    var rate = rateEl ? rateEl.value : '';
    var amount = parseFloat(amountEl ? amountEl.value : 0) || 0;
    insuranceItems.push({ code: ins.code, name: ins.name, type: ins.type, rate: rate, amount: amount });
  });

  var body = {
    employee_name: name,
    id_number: (document.getElementById('ss-add-idno') || {}).value || '',
    category: (document.getElementById('ss-add-cat') || {}).value || '在职人员',
    salary_base: parseFloat((document.getElementById('ss-add-salary') || {}).value) || 0,
    insurance_items: insuranceItems,
  };

  try {
    await api('/api/social-security/declarations/' + declarationId + '/details?company_id=' + currentCompanyId, {
      method: 'POST', body: JSON.stringify(body)
    });
    closeModal('ss-add-modal');
    ssRefresh();
  } catch (e) { handleError(e, '新增参保明细'); }
}
