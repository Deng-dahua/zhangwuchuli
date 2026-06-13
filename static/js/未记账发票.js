// ==================== 未记账发票 ====================

let ubiTab = 'all'; // all / zpt / ppt
let ubiFilter = { category: '', keyword: '', dateFrom: '', dateTo: '' };

async function renderUnbookkeptInvoices(container) {
  let el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  if (!el || !el.isConnected) {
    el = document.getElementById('content-area');
    if (!el) { console.error('[UBI] content-area 不存在，放弃渲染'); return; }
  }
  el.style.display = '';
  el.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af">加载中…</div>';
  try {
    var params = new URLSearchParams();
    params.set('is_posted', 'false');
    var tabQs = ubiTab !== 'all' ? '&tab=' + ubiTab : '';
    const [inv, stats] = await Promise.all([
      api('/api/bookkeeping-invoices?is_posted=false'),
      api('/api/bookkeeping-invoices/stats?is_posted=false' + tabQs)
    ]);
    const fmt = n => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
    let html = '';

    html += '<div class="stat-grid-invoice">';
    html += '<div class="stat-card"><div class="stat-value">' + stats.total_count + '</div><div class="stat-label">未记账发票数</div></div>';
    html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_amt) + '</div><div class="stat-label">金额合计</div></div>';
    html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_raw_tax) + '</div><div class="stat-label">税额合计</div></div>';
    html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_amount) + '</div><div class="stat-label">价税合计</div></div>';
    html += '</div>';

    html += '<div class="toolbar" style="flex-wrap:wrap;">';
    html += '<div class="toolbar-left" style="flex:1 1 100%;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
    var ubiPeriod = ubiFilter.dateFrom ? ubiFilter.dateFrom.slice(0,7) : currentPeriod;
    var ubiParts = ubiPeriod ? ubiPeriod.split('-') : [];
    html += buildPeriodSelectorHtml('ubi', ubiParts[0] || '', ubiParts[1] || '', 'onUBIPeriodQuery');
    html += '<button class="btn-toolbar" id="ubiBatchGenBtn" onclick="batchGenerateUBIVouchers()">生成凭证</button>';
    html += '<div class="tab-btn-group">';
    const ubiTabs = [['all', '全部'], ['zpt', '专票'], ['ppt', '普票']];
    ubiTabs.forEach(([t, label]) => {
      html += '<button class="tab-btn ' + (ubiTab === t ? 'active' : '') + '" onclick="ubiTab=\'' + t + '\';renderUnbookkeptInvoices()">' + label + '</button>';
    });
    html += '</div></div></div>';

    setTimeout(fitInvoiceStatFonts, 50);
    let items = inv.items || [];
    if (ubiTab === 'zpt') items = items.filter(i => i.invoice_category && (i.invoice_category.includes('专用发票')));
    if (ubiTab === 'ppt') items = items.filter(i => i.invoice_category && (i.invoice_category.includes('普通发票')));
    if (ubiFilter.dateFrom) {
      const dFrom = ubiFilter.dateFrom.length === 10 && ubiFilter.dateFrom.includes('/') ? ubiFilter.dateFrom.replace(/\//g, '-') : ubiFilter.dateFrom;
      items = items.filter(i => i.invoice_date && i.invoice_date >= dFrom);
    }
    if (ubiFilter.dateTo) {
      const dTo = ubiFilter.dateTo.length === 10 && ubiFilter.dateTo.includes('/') ? ubiFilter.dateTo.replace(/\//g, '-') : ubiFilter.dateTo;
      items = items.filter(i => i.invoice_date && i.invoice_date <= dTo);
    }
    if (ubiFilter.keyword) {
      const kw = ubiFilter.keyword.toLowerCase();
      items = items.filter(i =>
        (i.invoice_no && i.invoice_no.toLowerCase().includes(kw)) ||
        (i.invoice_code && i.invoice_code.toLowerCase().includes(kw)) ||
        (i.digital_invoice_no && i.digital_invoice_no.toLowerCase().includes(kw)) ||
        (i.seller_name && i.seller_name.toLowerCase().includes(kw)) ||
        (i.buyer_name && i.buyer_name.toLowerCase().includes(kw)) ||
        (i.goods_name && i.goods_name.toLowerCase().includes(kw))
      );
    }

    // 表格
    html += '<div class="table-wrap" style="flex:1;overflow:auto;padding-bottom:15px"><table><thead><tr>';
    html += '<th style="width:36px"><input type="checkbox" id="ubiSelectAll" onclick="toggleUbiSelectAll()" title="全选"></th>';
    html += '<th>发票代码</th><th>发票号码</th><th>数电发票号码</th><th>销方识别号</th><th>销方名称</th><th>购方识别号</th><th>购买方名称</th><th>开票日期</th><th>税收分类编码</th><th>特定业务类型</th><th>货物或应税劳务名称</th><th>规格型号</th><th>单位</th><th style="text-align:right">数量</th><th style="text-align:right">单价</th><th style="text-align:right">金额</th><th style="text-align:right">税率</th><th style="text-align:right">税额</th><th style="text-align:right">价税合计</th><th>发票来源</th><th>发票票种</th><th>发票状态</th><th>是否正数发票</th><th>发票风险等级</th><th>开票人</th><th>备注</th><th>生成凭证</th>';
    html += '</tr></thead><tbody>';

    if (items.length === 0) {
      html += '<tr><td colspan="26" style="text-align:center;color:#9ca3af;padding:40px">暂无未记账发票记录</td></tr>';
    } else {
      // 按发票三号分组（同取得发票）
      const ubiGroups = [];
      let ubiCur = null;
      items.forEach(i => {
        const ubiKey = (i.invoice_code||'') + '|' + (i.invoice_no||'') + '|' + (i.digital_invoice_no||'');
        if (!ubiCur || ubiCur.key !== ubiKey) {
          ubiCur = { key: ubiKey, items: [] };
          ubiGroups.push(ubiCur);
        }
        ubiCur.items.push(i);
      });
      ubiGroups.forEach(g => {
        const ubiAllIds = g.items.map(i => i.id).join(',');
        const ubiRowspan = g.items.length;
        g.items.forEach((i, idx) => {
        const stCls = i.status === STATUS.NORMAL ? 'badge-green' : 'badge-gray';
        const posText = i.is_positive === true ? '是' : i.is_positive === false ? '否' : '-';
        html += '<tr>';
        if (idx === 0) {
          html += '<td style="text-align:center" rowspan="' + ubiRowspan + '"><input type="checkbox" class="ubi-check" data-ids="' + ubiAllIds + '" onchange="updateUbiBatchBtn()"></td>';
        }
        html += '<td>' + (i.invoice_code || '-') + '</td>';
        html += '<td><a href="javascript:void(0)" style="color:#1d4ed8;font-weight:500;text-decoration:none" onclick="showUnbookkeptDetail(' + i.id + ')">' + (i.invoice_no || '-') + '</a></td>';
        html += '<td>' + (i.digital_invoice_no || '-') + '</td>';
        html += '<td>' + (i.seller_tax_no || '-') + '</td>';
        html += '<td>' + (i.seller_name || '-') + '</td>';
        html += '<td>' + (i.buyer_tax_no || '-') + '</td>';
        html += '<td>' + (i.buyer_name || '-') + '</td>';
        html += '<td>' + i.invoice_date + '</td>';
        html += '<td>' + (i.tax_category_code || '-') + '</td>';
        html += '<td>' + (i.specific_business_type || '-') + '</td>';
        html += '<td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(i.goods_name || '') + '">' + escapeHtml(i.goods_name || '-') + '</td>';
        html += '<td>' + (i.spec || '-') + '</td>';
        html += '<td>' + (i.unit || '-') + '</td>';
        html += '<td style="text-align:right">' + (i.quantity != null ? i.quantity : '-') + '</td>';
        html += '<td style="text-align:right">' + (i.unit_price != null ? i.unit_price.toFixed(2) : '-') + '</td>';
        html += '<td style="text-align:right">' + fmt(i.amount) + '</td>';
        html += '<td style="text-align:right">' + (i.tax_rate || 0) + '%</td>';
        html += '<td style="text-align:right">' + fmt(i.tax_amount) + '</td>';
        html += '<td style="text-align:right;font-weight:600">' + fmt(i.total_amount) + '</td>';
        html += '<td>' + (i.invoice_source || '-') + '</td>';
        html += '<td>' + (i.invoice_category || '-') + '</td>';
        html += '<td><span class="' + stCls + '">' + i.status + '</span></td>';
        html += '<td>' + posText + '</td>';
        html += '<td>' + (i.invoice_risk_level || '-') + '</td>';
        html += '<td>' + (i.issuer || '-') + '</td>';
        html += '<td style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(i.remark || '') + '">' + escapeHtml(i.remark || '-') + '</td>';
        // 生成凭证（同三号合并，按钮也在头行 rowspan）
        if (idx === 0) {
          html += '<td style="text-align:center" rowspan="' + ubiRowspan + '"><button class="btn btn-primary btn-sm" style="font-size:12px" onclick="generateUBIVoucherGroup(\'' + ubiAllIds + '\')">生成凭证</button></td>';
        }
        html += '</tr>';
      });
    });
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  } catch (e) {
    console.error('[UBI]', e);
    toast(e.message, 'error');
    if (el) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280">'
        + '<p style="margin-bottom:16px">页面加载异常：' + escapeHtml(e.message) + '</p>'
        + '<button class="btn btn-primary" onclick="renderUnbookkeptInvoices()">重新加载</button></div>';
    }
  }
}

function onUBIPeriodQuery(clear) {
  if (clear) { ubiFilter.dateFrom = ''; ubiFilter.dateTo = ''; }
  else {
    var p = getModulePeriod('ubi');
    if (!p) { ubiFilter.dateFrom = ''; ubiFilter.dateTo = ''; }
    else { var r = periodToDateRange(p); ubiFilter.dateFrom = r.from; ubiFilter.dateTo = r.to; }
  }
  renderUnbookkeptInvoices();
}

async function deleteUnbookkeptInvoice(id) {
  if (!confirm('确认删除该未记账发票？')) return;
  try {
    const result = await api('/api/bookkeeping-invoices/' + id, { method: 'DELETE' });
    toast(result.message, 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
  navigateTo('未记账发票');
}

function toggleUbiSelectAll() {
  const all = document.getElementById('ubiSelectAll');
  document.querySelectorAll('.ubi-check').forEach(cb => cb.checked = all.checked);
  updateUbiBatchBtn();
}

// 从已勾选的.ubi-check中收集全部发票ID（兼容 data-ids 合并行）
function getCheckedUbiIds() {
  const ids = [];
  document.querySelectorAll('.ubi-check:checked').forEach(cb => {
    if (cb.dataset.ids) {
      cb.dataset.ids.split(',').forEach(id => { const n = parseInt(id); if (n) ids.push(n); });
    } else if (cb.dataset.id) {
      const n = parseInt(cb.dataset.id); if (n) ids.push(n);
    }
  });
  return ids;
}

function updateUbiBatchBtn() {
  const checked = document.querySelectorAll('.ubi-check:checked');
  const count = checked.length;
  const selectAll = document.getElementById('ubiSelectAll');
  if (selectAll) {
    const boxes = document.querySelectorAll('.ubi-check');
    const checkedBoxes = document.querySelectorAll('.ubi-check:checked');
    selectAll.checked = boxes.length > 0 && boxes.length === checkedBoxes.length;
    selectAll.indeterminate = checkedBoxes.length > 0 && checkedBoxes.length < boxes.length;
  }
}

async function batchDeleteUnbookkeptInvoices() {
  const ids = getCheckedUbiIds();
  if (ids.length === 0) return;
  if (!confirm('确认删除选中的 ' + ids.length + ' 条未记账发票？此操作不可恢复。')) return;
  try {
    const result = await api('/api/bookkeeping-invoices/batch-delete?only_unposted=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids)
    });
    toast(result.message, 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
  navigateTo('未记账发票');
}

async function showUnbookkeptDetail(id) {
  try {
    const i = await api('/api/bookkeeping-invoices/' + id);
    const fmt = n => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
    let html = '<div class="modal-header"><h3>未记账发票详情</h3><button class="modal-close" onclick="closeModal()">×</button></div>';
    html += '<div class="modal-body" style="max-height:70vh;overflow-y:auto">';

    html += '<div class="payment-form-section"><div class="payment-form-section-title">📋 基本信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>发票代码：</b>' + (i.invoice_code || '-') + '</div>';
    html += '<div><b>发票号码：</b>' + (i.invoice_no || '-') + '</div>';
    html += '<div><b>数电发票号码：</b>' + (i.digital_invoice_no || '-') + '</div>';
    html += '<div><b>开票日期：</b>' + (i.invoice_date || '-') + '</div>';
    html += '<div><b>凭证状态：</b><span style="color:' + (i.voucher_no ? '#059669' : '#d97706') + ';font-weight:600">' + (i.voucher_no ? '已记账 (' + i.voucher_no + ')' : '未记账') + '</span></div>';
    html += '</div></div>';

    html += '<div class="payment-form-section"><div class="payment-form-section-title">🏢 销方信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>销方识别号：</b>' + (i.seller_tax_no || '-') + '</div>';
    html += '<div><b>销方名称：</b>' + (i.seller_name || '-') + '</div>';
    html += '</div></div>';

    html += '<div class="payment-form-section"><div class="payment-form-section-title">🏢 购方信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>购方识别号：</b>' + (i.buyer_tax_no || '-') + '</div>';
    html += '<div><b>购买方名称：</b>' + (i.buyer_name || '-') + '</div>';
    html += '</div></div>';

    html += '<div class="payment-form-section"><div class="payment-form-section-title">🏷️ 分类信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>税收分类编码：</b>' + (i.tax_category_code || '-') + '</div>';
    html += '<div><b>特定业务类型：</b>' + (i.specific_business_type || '-') + '</div>';
    html += '</div></div>';

    html += '<div class="payment-form-section"><div class="payment-form-section-title">📦 货物明细</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>货物或应税劳务名称：</b>' + (i.goods_name || '-') + '</div>';
    html += '<div><b>规格型号：</b>' + (i.spec || '-') + '</div>';
    html += '<div><b>单位：</b>' + (i.unit || '-') + '</div>';
    html += '<div><b>数量：</b>' + i.quantity + '</div>';
    html += '<div><b>单价：</b>¥' + fmt(i.unit_price) + '</div>';
    html += '</div></div>';

    html += '<div class="payment-form-section"><div class="payment-form-section-title">💰 金额信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>金额（不含税）：</b>¥' + fmt(i.amount) + '</div>';
    html += '<div><b>税率：</b>' + i.tax_rate + '%</div>';
    html += '<div><b>税额：</b>¥' + fmt(i.tax_amount) + '</div>';
    html += '<div><b>价税合计：</b><span style="font-weight:700;font-size:16px;color:#1d4ed8">¥' + fmt(i.total_amount) + '</span></div>';
    html += '</div></div>';

    html += '<div class="payment-form-section"><div class="payment-form-section-title">📄 发票属性</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>发票票种：</b>' + (i.invoice_category || '-') + '</div>';
    html += '<div><b>发票状态：</b>' + i.status + '</div>';
    html += '<div><b>发票来源：</b>' + (i.invoice_source || '-') + '</div>';
    html += '<div><b>发票风险等级：</b>' + (i.invoice_risk_level || '-') + '</div>';
    html += '<div><b>是否正数发票：</b>' + (i.is_positive ? '是' : '否') + '</div>';
    html += '<div><b>开票人：</b>' + (i.issuer || '-') + '</div>';
    html += '</div></div>';

    if (i.remark) {
      html += '<div class="payment-form-section"><div class="payment-form-section-title">📝 备注</div><div>' + i.remark + '</div></div>';
    }

    html += '<div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn btn-secondary" onclick="closeModal()">关闭</button></div>';
    showModal(html);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function showUnbookkeptInvoiceForm(id) {
  let data = {};
  if (id) {
    data = await api('/api/bookkeeping-invoices/' + id);
  }
  const isEdit = !!id;
  let html = '<div class="modal-header"><h3>' + (isEdit ? '编辑未记账发票' : '新增未记账发票') + '</h3><button class="modal-close" onclick="closeModal()">×</button></div>';
  html += '<div class="modal-body" style="max-height:70vh;overflow-y:auto">';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">📋 发票基本信息</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">发票代码</label><input class="form-input" id="ubi-invoice-code" value="' + (data.invoice_code || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">发票号码</label><input class="form-input" id="ubi-invoice-no" value="' + (data.invoice_no || '-') + '" ' + (isEdit ? 'readonly' : '') + '></div>';
  html += '</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">数电发票号码</label><input class="form-input" id="ubi-digital-invoice-no" value="' + (data.digital_invoice_no || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">开票日期</label><input type="date" class="form-input" id="ubi-invoice-date" value="' + (data.invoice_date || '') + '"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">🏢 销方信息</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">销方识别号</label><input class="form-input" id="ubi-seller-taxno" value="' + (data.seller_tax_no || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">销方名称</label><input class="form-input" id="ubi-seller-name" value="' + (data.seller_name || '') + '"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">🏢 购方信息</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">购方识别号</label><input class="form-input" id="ubi-buyer-taxno" value="' + (data.buyer_tax_no || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">购买方名称</label><input class="form-input" id="ubi-buyer-name" value="' + (data.buyer_name || '') + '"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">🏷️ 分类信息</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">税收分类编码</label><input class="form-input" id="ubi-tax-category-code" value="' + (data.tax_category_code || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">特定业务类型</label><input class="form-input" id="ubi-specific-business-type" value="' + (data.specific_business_type || '') + '"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">📦 货物明细</div>';
  html += '<div class="form-group"><label class="form-label">货物或应税劳务名称</label><input class="form-input" id="ubi-goods-name" value="' + (data.goods_name || '') + '"></div>';
  html += '<div class="form-grid-4">';
  html += '<div class="form-group"><label class="form-label">规格型号</label><input class="form-input" id="ubi-spec" value="' + (data.spec || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">单位</label><input class="form-input" id="ubi-unit" value="' + (data.unit || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">数量</label><input type="number" step="any" class="form-input" id="ubi-qty" value="' + (data.quantity || 0) + '" onchange="calcUbiTotal()"></div>';
  html += '<div class="form-group"><label class="form-label">单价</label><input type="number" step="any" class="form-input" id="ubi-price" value="' + (data.unit_price || 0) + '" onchange="calcUbiTotal()"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">💰 金额信息</div>';
  html += '<div class="form-grid-3">';
  html += '<div class="form-group"><label class="form-label">金额（不含税）</label><input type="number" step="any" class="form-input" id="ubi-amount" value="' + (data.amount || 0) + '" onchange="calcUbiTax()"></div>';
  html += '<div class="form-group"><label class="form-label">税率（%）</label><input type="number" step="any" class="form-input" id="ubi-taxrate" value="' + (data.tax_rate || 0) + '" onchange="calcUbiTax()"></div>';
  html += '<div class="form-group"><label class="form-label">税额</label><input type="number" step="any" class="form-input" id="ubi-taxamount" value="' + (data.tax_amount || 0) + '" onchange="calcUbiAmount()"></div>';
  html += '</div>';
  html += '<div class="form-grid-1">';
  html += '<div class="form-group"><label class="form-label">价税合计</label><input type="number" step="any" class="form-input" id="ubi-total" value="' + (data.total_amount || 0) + '" readonly style="background:#f0f9ff;font-weight:600;font-size:16px"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">📄 发票属性</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">发票票种</label><select class="form-input" id="ubi-category">';
  ['增值税专用发票', '增值税普通发票', '电子普通发票', '其他'].forEach(t => {
    html += '<option value="' + t + '"' + (data.invoice_category === t ? ' selected' : '') + '>' + t + '</option>';
  });
  html += '</select></div>';
  html += '<div class="form-group"><label class="form-label">发票状态</label><select class="form-input" id="ubi-status">';
  [STATUS.NORMAL, STATUS.VOID, STATUS.RED].forEach(s => {
    html += '<option value="' + s + '"' + (data.status === s ? ' selected' : '') + '>' + s + '</option>';
  });
  html += '</select></div>';
  html += '</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">发票来源</label><input class="form-input" id="ubi-source" value="' + (data.invoice_source || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">发票风险等级</label><select class="form-input" id="ubi-risk-level">';
  ['', STATUS.RISK_NORMAL, STATUS.FOLLOW_ATTENTION, STATUS.RISK_ABNORMAL].forEach(r => {
    html += '<option value="' + r + '"' + (data.invoice_risk_level === r ? ' selected' : '') + '>' + (r || '--') + '</option>';
  });
  html += '</select></div>';
  html += '</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">是否正数发票</label><select class="form-input" id="ubi-is-positive">';
  html += '<option value="1"' + (data.is_positive !== false ? ' selected' : '') + '>是</option>';
  html += '<option value="0"' + (data.is_positive === false ? ' selected' : '') + '>否</option>';
  html += '</select></div>';
  html += '<div class="form-group"><label class="form-label">开票人</label><input class="form-input" id="ubi-issuer" value="' + (data.issuer || '') + '"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">📝 备注</div>';
  html += '<div class="form-group"><label class="form-label">备注</label><textarea class="form-input" id="ubi-remark" rows="2" style="width:100%">' + (data.remark || '') + '</textarea></div>';
  html += '</div>';

  html += '</div>';
  html += '<div class="modal-footer">';
  html += '<button class="btn btn-secondary" onclick="closeModal()">取消</button>';
  html += '<button class="btn btn-primary" onclick="saveUnbookkeptInvoice(' + (id || 0) + ')">保存</button>';
  html += '</div>';
  showModal(html);
}

function calcUbiTax() {
  const amount = parseFloat(document.getElementById('ubi-amount').value) || 0;
  const rate = parseFloat(document.getElementById('ubi-taxrate').value) || 0;
  const tax = amount * rate / 100;
  document.getElementById('ubi-taxamount').value = tax.toFixed(2);
  document.getElementById('ubi-total').value = (amount + tax).toFixed(2);
}

function calcUbiAmount() {
  const tax = parseFloat(document.getElementById('ubi-taxamount').value) || 0;
  const amount = parseFloat(document.getElementById('ubi-amount').value) || 0;
  document.getElementById('ubi-total').value = (amount + tax).toFixed(2);
}

function calcUbiTotal() {
  const qty = parseFloat(document.getElementById('ubi-qty').value) || 0;
  const price = parseFloat(document.getElementById('ubi-price').value) || 0;
  document.getElementById('ubi-amount').value = (qty * price).toFixed(2);
  calcUbiTax();
}

async function saveUnbookkeptInvoice(id) {
  try {
    const body = {
      invoice_code: document.getElementById('ubi-invoice-code').value.trim(),
      invoice_no: document.getElementById('ubi-invoice-no').value.trim(),
      digital_invoice_no: document.getElementById('ubi-digital-invoice-no').value.trim(),
      seller_tax_no: document.getElementById('ubi-seller-taxno').value.trim(),
      seller_name: document.getElementById('ubi-seller-name').value.trim(),
      buyer_tax_no: document.getElementById('ubi-buyer-taxno').value.trim(),
      buyer_name: document.getElementById('ubi-buyer-name').value.trim(),
      invoice_date: document.getElementById('ubi-invoice-date').value,
      tax_category_code: document.getElementById('ubi-tax-category-code').value.trim(),
      specific_business_type: document.getElementById('ubi-specific-business-type').value.trim(),
      goods_name: document.getElementById('ubi-goods-name').value.trim(),
      spec: document.getElementById('ubi-spec').value.trim(),
      unit: document.getElementById('ubi-unit').value.trim(),
      quantity: parseFloat(document.getElementById('ubi-qty').value) || 0,
      unit_price: parseFloat(document.getElementById('ubi-price').value) || 0,
      amount: parseFloat(document.getElementById('ubi-amount').value) || 0,
      tax_rate: parseFloat(document.getElementById('ubi-taxrate').value) || 0,
      tax_amount: parseFloat(document.getElementById('ubi-taxamount').value) || 0,
      total_amount: parseFloat(document.getElementById('ubi-total').value) || 0,
      invoice_source: document.getElementById('ubi-source').value.trim(),
      invoice_category: document.getElementById('ubi-category').value,
      status: document.getElementById('ubi-status').value,
      is_positive: document.getElementById('ubi-is-positive').value === '1',
      invoice_risk_level: document.getElementById('ubi-risk-level').value,
      issuer: document.getElementById('ubi-issuer').value.trim(),
      remark: document.getElementById('ubi-remark').value.trim()
    };
    let result;
    if (id) {
      result = await api('/api/bookkeeping-invoices/' + id, { method: 'PUT', body });
    } else {
      result = await api('/api/bookkeeping-invoices', { method: 'POST', body });
    }
    toast(result.message || '保存成功', 'success');
    closeModal();
    navigateTo('未记账发票');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function generateUBIVoucher(id) {
  if (!confirm('确认为该发票生成凭证？\n\n将记入当期（' + (currentPeriod || '当前') + '）序时账。')) return;
  try {
    let url = '/api/bookkeeping-invoices/batch-generate-voucher';
    if (currentPeriod) url += '?period=' + encodeURIComponent(currentPeriod);
    const result = await api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([id])
    });
    toast(result.message || '生成凭证成功', 'success');
  } catch (e) { toast(e.message, 'error'); }
  navigateTo('未记账发票');
}

async function generateUBIVoucherGroup(allIds) {
  const ids = allIds.split(',').map(Number).filter(n => n);
  if (ids.length === 0) return;
  if (!confirm('确认为该组 ' + ids.length + ' 条发票生成凭证？\n\n将记入当期（' + (currentPeriod || '当前') + '）序时账。')) return;
  try {
    let url = '/api/bookkeeping-invoices/batch-generate-voucher';
    if (currentPeriod) url += '?period=' + encodeURIComponent(currentPeriod);
    const result = await api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids)
    });
    toast(result.message || '生成凭证成功', 'success');
    navigateTo('未记账发票');
  } catch (e) { toast(e.message, 'error'); }
}

async function batchGenerateUBIVouchers() {
  const ids = getCheckedUbiIds();
  if (ids.length === 0) { toast('请先选择发票', 'warning'); return; }
  if (!confirm('确认为选中的 ' + ids.length + ' 条发票生成凭证？\n\n将记入当期（' + (currentPeriod || '当前') + '）序时账。')) return;
  try {
    let url = '/api/bookkeeping-invoices/batch-generate-voucher';
    if (currentPeriod) url += '?period=' + encodeURIComponent(currentPeriod);
    const result = await api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids)
    });
    toast(result.message || '生成凭证成功', 'success');
    navigateTo('未记账发票');
  } catch (e) {
    toast(e.message, 'error');
  }
}
