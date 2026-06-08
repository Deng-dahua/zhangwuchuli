// ========== 文化事业建设费申报模块 ==========

var ccfPeriod = '';
var ccfData = null;
var ccfDeductions = [];

// 主表行定义（栏次1-19）
const CCF_ROWS = [
  { key: 'taxable_income',                 label: '应征收入',                     calc: null },
  { key: 'tax_exempt_income',             label: '免征收入',                     calc: null },
  { key: 'deduction_beginning',           label: '减除项目期初金额',             calc: null },
  { key: 'deduction_current_period',       label: '减除项目本期发生额',           calc: null },
  { key: 'taxable_income_deduction',      label: '应征收入减除额',               calc: null },
  { key: 'tax_exempt_deduction',          label: '免征收入减除额',               calc: null },
  { key: 'deduction_ending_balance',       label: '减除项目期末余额',             calc: '3+4-5-6' },
  { key: 'taxable_sales',                 label: '计费销售额',                     calc: '1-5' },
  { key: 'fee_rate',                      label: '费率',                         calc: null },
  { key: 'payable_fee',                   label: '应缴费额',                     calc: '8×9' },
  { key: 'unpaid_beginning',              label: '期初未缴费额',                 calc: null },
  { key: 'paid_current_period',            label: '本期已缴费额',                 calc: '13+14+15' },
  { key: 'prepaid',                       label: '其中：本期预缴费额',           calc: null },
  { key: 'paid_last_period',              label: '本期缴纳上期费额',             calc: null },
  { key: 'paid_arrears',                 label: '本期缴纳欠费额',               calc: null },
  { key: 'unpaid_ending',               label: '期末未缴费额',                 calc: '10+11-12' },
  { key: 'arrears',                       label: '其中：欠缴费额',               calc: '11-14-15' },
  { key: 'fill_refund',                   label: '本期应补（退）费额',           calc: '10-13' },
  { key: 'inspected_supplement',          label: '本期检查已补缴费额',           calc: null },
];

// ============ 主渲染 ===========

function renderCulturalConstructionFee(container) {
  var defYear = new Date().getFullYear();
  var defMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  if (typeof currentPeriod !== 'undefined' && currentPeriod && currentPeriod.indexOf('-') !== -1) {
    var parts = currentPeriod.split('-');
    defYear = parseInt(parts[0]);
    defMonth = parts[1];
  }
  var defPeriod = defYear + '-' + defMonth;

  var yearOpts = '';
  for (var y = defYear - 5; y <= defYear + 1; y++) {
    yearOpts += '<option value="' + y + '"' + (y === defYear ? ' selected' : '') + '>' + y + '年</option>';
  }

  container.innerHTML =
    '<div class="module-page">' +
      '<div class="toolbar" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">' +
        '<div class="period-selector-bar" style="display:inline-flex;">' +
          '<div class="period-stepper">' +
            '<select id="ccf-year" class="period-selector-year">' + yearOpts + '</select>' +
            '<div class="stepper-arrows">' +
              '<button class="stepper-btn stepper-up" type="button" onclick="stepCcfYear(1)">▲</button>' +
              '<button class="stepper-btn stepper-down" type="button" onclick="stepCcfYear(-1)">▼</button>' +
            '</div>' +
          '</div>' +
          '<div class="period-stepper">' +
            '<select id="ccf-month" class="period-selector-month">' +
              '<option value="01"' + (defMonth === '01' ? ' selected' : '') + '>01月</option>' +
              '<option value="02"' + (defMonth === '02' ? ' selected' : '') + '>02月</option>' +
              '<option value="03"' + (defMonth === '03' ? ' selected' : '') + '>03月</option>' +
              '<option value="04"' + (defMonth === '04' ? ' selected' : '') + '>04月</option>' +
              '<option value="05"' + (defMonth === '05' ? ' selected' : '') + '>05月</option>' +
              '<option value="06"' + (defMonth === '06' ? ' selected' : '') + '>06月</option>' +
              '<option value="07"' + (defMonth === '07' ? ' selected' : '') + '>07月</option>' +
              '<option value="08"' + (defMonth === '08' ? ' selected' : '') + '>08月</option>' +
              '<option value="09"' + (defMonth === '09' ? ' selected' : '') + '>09月</option>' +
              '<option value="10"' + (defMonth === '10' ? ' selected' : '') + '>10月</option>' +
              '<option value="11"' + (defMonth === '11' ? ' selected' : '') + '>11月</option>' +
              '<option value="12"' + (defMonth === '12' ? ' selected' : '') + '>12月</option>' +
            '</select>' +
            '<div class="stepper-arrows">' +
              '<button class="stepper-btn stepper-up" type="button" onclick="stepCcfMonth(1)">▲</button>' +
              '<button class="stepper-btn stepper-down" type="button" onclick="stepCcfMonth(-1)">▼</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="ccfRefresh()">查询</button>' +
        '<button class="btn btn-success" onclick="ccfSave()">保存</button>' +
        '<button class="btn btn-secondary" onclick="ccfAutoCalculate()">自动计算</button>' +
        '<button class="btn btn-danger" onclick="ccfDelete()">删除</button>' +
      '</div>' +

      // 主表
      '<div id="ccf-main-table-wrap" style="margin-bottom:24px;">' +
        '<table class="data-table" style="font-size:13px;width:100%;max-width:960px;">' +
          '<thead>' +
            '<tr><th rowspan="2">项 目</th><th colspan="2">本月（期）数</th><th colspan="2">本年累计</th></tr>' +
            '<tr><th>数值</th><th>数值</th><th>数值</th><th>数值</th></tr>' +
          '</thead>' +
          '<tbody id="ccf-main-tbody">' + _ccfBuildMainRows() + '</tbody>' +
        '</table>' +
      '</div>' +

      // 应税服务扣除项目清单
      '<div id="ccf-deductions-wrap">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<h3 style="margin:0;">应税服务扣除项目清单</h3>' +
          '<button class="btn btn-sm btn-success" onclick="ccfAddDeduction()">＋ 添加扣除项目</button>' +
        '</div>' +
        '<table class="data-table" style="font-size:13px;width:100%;">' +
          '<thead>' +
            '<tr>' +
              '<th>开票方纳税人识别号</th>' +
              '<th>开票方单位名称</th>' +
              '<th>服务项目名称</th>' +
              '<th>凭证种类</th>' +
              '<th>凭证号码</th>' +
              '<th>金额</th>' +
              '<th>操作</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody id="ccf-deductions-tbody"></tbody>' +
          '<tfoot>' +
            '<tr style="font-weight:700;background:#f0f9ff;">' +
              '<td colspan="5" style="text-align:right;">合计</td>' +
              '<td id="ccf-deductions-total">0.00</td>' +
              '<td></td>' +
            '</tr>' +
          '</tfoot>' +
        '</table>' +
      '</div>' +
    '</div>';

  ccfPeriod = defPeriod;
  ccfRefresh();
}

// ============ 期间步进 ============

function stepCcfYear(delta) {
  var yearSel = document.getElementById('ccf-year');
  if (!yearSel) return;
  var opts = Array.from(yearSel.options).map(function(o) { return parseInt(o.value); });
  var cur = parseInt(yearSel.value);
  var idx = opts.indexOf(cur);
  var next = idx + delta;
  if (next >= 0 && next < opts.length) yearSel.value = opts[next];
  var monSel = document.getElementById('ccf-month');
  if (monSel) ccfPeriod = yearSel.value + '-' + monSel.value;
  ccfRefresh();
}

function stepCcfMonth(delta) {
  var yearSel = document.getElementById('ccf-year');
  var monSel = document.getElementById('ccf-month');
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
  ccfPeriod = (yearSel ? yearSel.value : y) + '-' + monSel.value;
  ccfRefresh();
}

// ============ 主表行构建 ============

function _ccfBuildMainRows() {
  var html = '';
  for (var i = 0; i < CCF_ROWS.length; i++) {
    var row = CCF_ROWS[i];
    var cls = i % 2 === 1 ? 'alt-row' : '';
    html += '<tr class="' + cls + '">';
    html += '<td>' + (i + 1) + '. ' + row.label;
    if (row.calc) html += '<br><span style="color:#888;font-size:11px;">(' + row.calc + ')</span>';
    html += '</td>';
    // 本月数：数值
    html += '<td><input type="number" step="0.01" id="ccf-curr-' + row.key + '" style="width:110px;" oninput="ccfOnMainInput()"></td>';
    // 本年累计：数值（用独立ID避免混淆）
    html += '<td><input type="number" step="0.01" id="ccf-ytd-' + row.key + '" style="width:110px;" oninput="ccfOnMainInput()"></td>';
    // 后两列：本月数 + 本年累计（每个栏次有两列数据）
    // 根据PDF实际结构：本月（期）数 为一列，本年累计 为一列
    // 重新调整：<thead> 是 项目 | 本月（期）数 | 本年累计
    // 所以每行只有两个输入框：本月数 + 本年累计
    // 刚才写错了，<thead> 是 colspan=2 两列，所以 tbody 每行也是两列数据
    html += '</tr>';
  }
  // 重新构建：正确的表格结构
  return _ccfBuildMainRowsCorrect();
}

function _ccfBuildMainRowsCorrect() {
  // 重新定义：thead 是 <tr><th rowspan="2">项目</th><th colspan="2">本月（期）数</th><th colspan="2">本年累计</th></tr>
  // 所以每行有：项目 + 本月数 + 本年累计 = 3个td，但 colspan=2 意味着本月数和本年累计各占2列？
  // 根据PDF：实际上 本月（期）数 和 本年累计 下面没有子列，就是各一列
  // 让我重新看PDF输出：
  // "应征收入 1 304,937.44 1,918,049.33"
  // 所以结构是：项目 | 本月数 | 本年累计
  // thead 应该是：<tr><th rowspan="2">项目</th><th colspan="2">本月（期）数 本年累计</th></tr> 不对
  // 实际上是：项目(1列) | 本月数(1列) | 本年累计(1列)
  // 之前写的 thead 有问题，但先不管 thead，把 tbody 每行 render 成 项目+本月数+本年累计 三列

  // 重新 render：简单结构，每行3个数据单元格
  var html = '';
  for (var i = 0; i < CCF_ROWS.length; i++) {
    var row = CCF_ROWS[i];
    var cls = i % 2 === 1 ? 'alt-row' : '';
    html += '<tr class="' + cls + '">';
    html += '<td>' + (i + 1) + '. ' + row.label;
    if (row.calc) html += '<br><span style="color:#888;font-size:11px;">(' + row.calc + ')</span>';
    html += '</td>';
    html += '<td><input type="number" step="0.01" id="ccf-curr-' + row.key + '" value="0.00" style="width:120px;" oninput="ccfOnMainInput()"></td>';
    html += '<td><input type="number" step="0.01" id="ccf-ytd-' + row.key + '" value="0.00" style="width:120px;" oninput="ccfOnMainInput()"></td>';
    html += '</tr>';
  }
  return html;
}

// ============ 数据加载 ============

async function ccfRefresh() {
  var yearSel = document.getElementById('ccf-year');
  var monSel = document.getElementById('ccf-month');
  if (yearSel && monSel) {
    ccfPeriod = yearSel.value + '-' + monSel.value;
  }
  if (!ccfPeriod) return;

  try {
    var data = await api('/api/cultural-construction-fee/declarations?period=' + ccfPeriod);
    var items = data.items || [];
    if (items.length > 0) {
      ccfData = items[0];
      _ccfFillMainTable(ccfData);
      await _ccfLoadDeductions(ccfData.id);
    } else {
      ccfData = null;
      _ccfClearMainTable();
      _ccfRenderDeductions([]);
    }
  } catch (e) {
    console.error('文化事业建设费刷新失败：', e);
  }
}

function _ccfFillMainTable(data) {
  for (var i = 0; i < CCF_ROWS.length; i++) {
    var row = CCF_ROWS[i];
    var elCurr = document.getElementById('ccf-curr-' + row.key);
    var elYtd = document.getElementById('ccf-ytd-' + row.key);
    if (elCurr) elCurr.value = parseFloat(data[row.key + '_current'] || 0).toFixed(2);
    if (elYtd) elYtd.value = parseFloat(data[row.key + '_ytd'] || 0).toFixed(2);
  }
}

function _ccfClearMainTable() {
  for (var i = 0; i < CCF_ROWS.length; i++) {
    var row = CCF_ROWS[i];
    var elCurr = document.getElementById('ccf-curr-' + row.key);
    var elYtd = document.getElementById('ccf-ytd-' + row.key);
    if (elCurr) elCurr.value = '0.00';
    if (elYtd) elYtd.value = '0.00';
  }
}

// =========== 扣除项目清单 ===========

async function _ccfLoadDeductions(declarationId) {
  try {
    var resp = await api('/api/cultural-construction-fee/declarations/' + declarationId);
    ccfDeductions = resp.deductions || [];
    _ccfRenderDeductions(ccfDeductions);
  } catch (e) {
    console.error(e);
    ccfDeductions = [];
    _ccfRenderDeductions([]);
  }
}

function _ccfRenderDeductions(items) {
  var tbody = document.getElementById('ccf-deductions-tbody');
  if (!tbody) return;
  var html = '';
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    var d = items[i];
    var amt = parseFloat(d.amount || 0);
    total += amt;
    html += '<tr>';
    html += '<td><input type="text" value="' + _escH(d.invoice_supplier_tax_no || '') + '" data-seq="' + d.seq + '" data-field="invoice_supplier_tax_no" class="ccf-ded-input" style="width:120px;"></td>';
    html += '<td><input type="text" value="' + _escH(d.invoice_supplier_name || '') + '" data-seq="' + d.seq + '" data-field="invoice_supplier_name" class="ccf-ded-input" style="width:140px;"></td>';
    html += '<td><input type="text" value="' + _escH(d.service_item_name || '') + '" data-seq="' + d.seq + '" data-field="service_item_name" class="ccf-ded-input" style="width:120px;"></td>';
    html += '<td><input type="text" value="' + _escH(d.voucher_type || '') + '" data-seq="' + d.seq + '" data-field="voucher_type" class="ccf-ded-input" style="width:80px;"></td>';
    html += '<td><input type="text" value="' + _escH(d.voucher_no || '') + '" data-seq="' + d.seq + '" data-field="voucher_no" class="ccf-ded-input" style="width:100px;"></td>';
    html += '<td><input type="number" step="0.01" value="' + amt.toFixed(2) + '" data-seq="' + d.seq + '" data-field="amount" class="ccf-ded-input" style="width:100px;" onchange="ccfOnDeductionChange()"></td>';
    html += '<td>';
    html += '<button class="btn btn-sm btn-outline" onclick="ccfSaveDeduction(' + d.seq + ')">保存</button> ';
    html += '<button class="btn btn-sm btn-danger" onclick="ccfDeleteDeduction(' + d.seq + ')">删除</button>';
    html += '</td>';
    html += '</tr>';
  }
  tbody.innerHTML = html;
  var totalEl = document.getElementById('ccf-deductions-total');
  if (totalEl) totalEl.textContent = total.toFixed(2);
}

function _escH(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function ccfAddDeduction() {
  var seq = ccfDeductions.length + 1;
  ccfDeductions.push({ seq: seq, invoice_supplier_tax_no: '', invoice_supplier_name: '', service_item_name: '', voucher_type: '', voucher_no: '', amount: 0 });
  _ccfRenderDeductions(ccfDeductions);
}

async function ccfSaveDeduction(seq) {
  _ccfSyncDeductionsFromDOM();
  await ccfSave();
  if (ccfData && ccfData.id) await _ccfLoadDeductions(ccfData.id);
}

async function ccfDeleteDeduction(seq) {
  if (!confirm('确定删除该扣除项目？')) return;
  ccfDeductions = ccfDeductions.filter(function(d) { return d.seq !== seq; });
  for (var i = 0; i < ccfDeductions.length; i++) ccfDeductions[i].seq = i + 1;
  _ccfRenderDeductions(ccfDeductions);
  if (ccfData && ccfData.id) await ccfSave();
}

function _ccfSyncDeductionsFromDOM() {
  var inputs = document.querySelectorAll('.ccf-ded-input');
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    var seq = parseInt(inp.getAttribute('data-seq'));
    var field = inp.getAttribute('data-field');
    var d = null;
    for (var j = 0; j < ccfDeductions.length; j++) { if (ccfDeductions[j].seq === seq) { d = ccfDeductions[j]; break; } }
    if (!d) continue;
    d[field] = field === 'amount' ? parseFloat(inp.value || 0) : inp.value;
  }
}

function ccfOnDeductionChange() {
  _ccfSyncDeductionsFromDOM();
  var total = 0;
  for (var i = 0; i < ccfDeductions.length; i++) total += parseFloat(ccfDeductions[i].amount || 0);
  var totalEl = document.getElementById('ccf-deductions-total');
  if (totalEl) totalEl.textContent = total.toFixed(2);
}

// =========== 保存 / 删除 ===========

function _ccfCollectMainData() {
  var data = {};
  for (var i = 0; i < CCF_ROWS.length; i++) {
    var row = CCF_ROWS[i];
    var elCurr = document.getElementById('ccf-curr-' + row.key);
    var elYtd = document.getElementById('ccf-ytd-' + row.key);
    data[row.key + '_current'] = elCurr ? parseFloat(elCurr.value || 0) : 0;
    data[row.key + '_ytd'] = elYtd ? parseFloat(elYtd.value || 0) : 0;
  }
  return data;
}

async function ccfSave() {
  _ccfSyncDeductionsFromDOM();
  var yearSel = document.getElementById('ccf-year');
  var monSel = document.getElementById('ccf-month');
  if (!yearSel || !monSel) { toast('请选择期间'); return; }
  var period = yearSel.value + '-' + monSel.value;
  var mainData = _ccfCollectMainData();
  var payload = JSON.parse(JSON.stringify(mainData));
  payload.period = period;
  payload.status = '已确认';
  payload.deductions = ccfDeductions;
  try {
    var result;
    if (ccfData && ccfData.id) {
      result = await api('/api/cultural-construction-fee/declarations/' + ccfData.id + '?company_id=' + currentCompanyId, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      result = await api('/api/cultural-construction-fee/declarations?company_id=' + currentCompanyId, { method: 'POST', body: JSON.stringify(payload) });
      if (result.id) ccfData = { id: result.id };
    }
    toast('保存成功');
    await ccfRefresh();
  } catch (e) { toast('保存失败：' + (e.message || e)); }
}

async function ccfDelete() {
  if (!ccfData || !ccfData.id) { toast('没有可删除的申报记录'); return; }
  if (!confirm('确定删除当前期间的文化事业建设费申报记录？')) return;
  try {
    await api('/api/cultural-construction-fee/declarations/' + ccfData.id + '?company_id=' + currentCompanyId, { method: 'DELETE' });
    toast('删除成功');
    ccfData = null;
    _ccfClearMainTable();
    _ccfRenderDeductions([]);
  } catch (e) { toast('删除失败：' + (e.message || e)); }
}

// =========== 自动计算 ==========

async function ccfAutoCalculate() {
  if (!ccfData || !ccfData.id) {
    await ccfSave();
    if (!ccfData || !ccfData.id) { toast('请先保存申报记录'); return; }
  }
  try {
    await api('/api/cultural-construction-fee/declarations/' + ccfData.id + '/auto-calculate?company_id=' + currentCompanyId, { method: 'POST' });
    toast('自动计算完成');
    await ccfRefresh();
  } catch (e) { toast('自动计算失败：' + (e.message || e)); }
}

function ccfOnMainInput() {
  var g = function(id) { var el = document.getElementById(id); return el ? parseFloat(el.value || 0) : 0; };
  var s = function(id, v) { var el = document.getElementById(id); if (el) el.value = v.toFixed(2); };
  // 栏次7 = 3+4-5-6
  s('ccf-curr-deduction_ending_balance', g('ccf-curr-deduction_beginning') + g('ccf-curr-deduction_current_period') - g('ccf-curr-taxable_income_deduction') - g('ccf-curr-tax_exempt_deduction'));
  // 栏次8 = 1-5
  s('ccf-curr-taxable_sales', g('ccf-curr-taxable_income') - g('ccf-curr-taxable_income_deduction'));
  // 栏次10 = 8*9
  s('ccf-curr-payable_fee', g('ccf-curr-taxable_sales') * (g('ccf-curr-fee_rate') || 0.03));
  // 栏次12 = 13+14+15
  s('ccf-curr-paid_current_period', g('ccf-curr-prepaid') + g('ccf-curr-paid_last_period') + g('ccf-curr-paid_arrears'));
  // 栏次16 = 10+11-12
  s('ccf-curr-unpaid_ending', g('ccf-curr-payable_fee') + g('ccf-curr-unpaid_beginning') - g('ccf-curr-paid_current_period'));
  // 栏次17 = 11-14-15
  s('ccf-curr-arrears', g('ccf-curr-unpaid_beginning') - g('ccf-curr-paid_last_period') - g('ccf-curr-paid_arrears'));
  // 栏次18 = 10-13
  s('ccf-curr-fill_refund', g('ccf-curr-payable_fee') - g('ccf-curr-prepaid'));
}
