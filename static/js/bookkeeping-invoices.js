// ==================== 记账发票 ====================

let biTab = 'all'; // all / zpt / ppt
let biFilter = { category: '', keyword: '', dateFrom: '', dateTo: '' };

function onBIPeriodQuery(clear) {
  if (clear) { biFilter.dateFrom = ''; biFilter.dateTo = ''; }
  else {
    var p = getModulePeriod('bi');
    if (!p) { biFilter.dateFrom = ''; biFilter.dateTo = ''; }
    else { var r = periodToDateRange(p); biFilter.dateFrom = r.from; biFilter.dateTo = r.to; }
  }
  renderBookkeepingInvoices();
}

async function renderBookkeepingInvoices(container) {
  let el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  if (!el || !el.isConnected) {
    el = document.getElementById('content-area');
    if (!el) { console.error('[BI] content-area 不存在，放弃渲染'); return; }
  }
  el.style.display = '';
  el.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af">加载中…</div>';
  try {
    const [inv, stats] = await Promise.all([
      api('/api/bookkeeping-invoices?is_posted=true'),
      api('/api/bookkeeping-invoices/stats?is_posted=true' + (biTab !== 'all' ? '&tab=' + biTab : ''))
    ]);
    const fmt = n => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
    let html = '';

    html += '<div class="stat-grid-invoice">';
    html += '<div class="stat-card"><div class="stat-value">' + stats.total_count + '</div><div class="stat-label">发票总数</div></div>';
    html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_amt) + '</div><div class="stat-label">金额合计</div></div>';
    html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_raw_tax) + '</div><div class="stat-label">税额合计</div></div>';
    html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_amount) + '</div><div class="stat-label">价税合计</div></div>';
    html += '</div>';

    html += '<div class="toolbar" style="flex-wrap:wrap;">';
    html += '<div class="toolbar-left" style="flex:1 1 100%;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
    var biPeriod = biFilter.dateFrom ? biFilter.dateFrom.slice(0,7) : currentPeriod;
    var biParts = biPeriod ? biPeriod.split('-') : [];
    html += buildPeriodSelectorHtml('bi', biParts[0] || '', biParts[1] || '', 'onBIPeriodQuery');
    html += '<button class="btn-toolbar-danger" id="biBatchDelBtn" onclick="batchDeleteBookkeepingInvoices()">批量删除</button>';
    html += '<div class="tab-btn-group">';
    const biTabs = [['all', '全部'], ['zpt', '专票'], ['ppt', '普票']];
    biTabs.forEach(([t, label]) => {
      html += '<button class="tab-btn ' + (biTab === t ? 'active' : '') + '" onclick="biTab=\'' + t + '\';renderBookkeepingInvoices()">' + label + '</button>';
    });
    html += '</div></div></div>';

    setTimeout(fitInvoiceStatFonts, 50);
    let items = inv.items || [];
    // 票种筛选
    if (biTab === 'zpt') items = items.filter(i => i.invoice_category && (i.invoice_category.includes('专用发票')));
    if (biTab === 'ppt') items = items.filter(i => i.invoice_category && (i.invoice_category.includes('普通发票')));
    if (biFilter.dateFrom) {
      const dFrom = biFilter.dateFrom.length === 10 && biFilter.dateFrom.includes('/') ? biFilter.dateFrom.replace(/\//g, '-') : biFilter.dateFrom;
      items = items.filter(i => i.invoice_date && i.invoice_date >= dFrom);
    }
    if (biFilter.dateTo) {
      const dTo = biFilter.dateTo.length === 10 && biFilter.dateTo.includes('/') ? biFilter.dateTo.replace(/\//g, '-') : biFilter.dateTo;
      items = items.filter(i => i.invoice_date && i.invoice_date <= dTo);
    }
    if (biFilter.keyword) {
      const kw = biFilter.keyword.toLowerCase();
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
    html += '<th style="width:36px"><input type="checkbox" id="biSelectAll" onclick="toggleBiSelectAll()" title="全选"></th>';
    html += '<th>发票代码</th><th>发票号码</th><th>数电发票号码</th><th>销方识别号</th><th>销方名称</th><th>购方识别号</th><th>购买方名称</th><th>开票日期</th><th>税收分类编码</th><th>特定业务类型</th><th>货物或应税劳务名称</th><th>规格型号</th><th>单位</th><th style="text-align:right">数量</th><th style="text-align:right">单价</th><th style="text-align:right">金额</th><th style="text-align:right">税率</th><th style="text-align:right">税额</th><th style="text-align:right">价税合计</th><th>发票来源</th><th>发票票种</th><th>发票状态</th><th>是否正数发票</th><th>发票风险等级</th><th>开票人</th><th>备注</th><th>凭证号</th><th>操作</th>';
    html += '</tr></thead><tbody>';

    if (items.length === 0) {
      html += '<tr><td colspan="28" style="text-align:center;color:#9ca3af;padding:40px">暂无记账发票记录</td></tr>';
    } else {
      // 按发票三号分组（同取得发票）
      const biGroups = [];
      let biCur = null;
      items.forEach(i => {
        const biKey = (i.invoice_code||'') + '|' + (i.invoice_no||'') + '|' + (i.digital_invoice_no||'');
        if (!biCur || biCur.key !== biKey) {
          biCur = { key: biKey, items: [] };
          biGroups.push(biCur);
        }
        biCur.items.push(i);
      });
      biGroups.forEach(g => {
        const biAllIds = g.items.map(i => i.id).join(',');
        const biRowspan = g.items.length;
        g.items.forEach((i, idx) => {
        const stCls = i.status === STATUS.NORMAL ? 'badge-green' : 'badge-gray';
        const posText = i.is_positive === true ? '是' : i.is_positive === false ? '否' : '-';
        html += '<tr>';
        if (idx === 0) {
          html += '<td style="text-align:center" rowspan="' + biRowspan + '"><input type="checkbox" class="bi-check" data-ids="' + biAllIds + '" onchange="updateBiBatchBtn()"></td>';
        }
        html += '<td>' + (i.invoice_code || '-') + '</td>';
        html += '<td><a href="javascript:void(0)" style="color:#1d4ed8;font-weight:500;text-decoration:none" onclick="showBookkeepingDetail(' + i.id + ')">' + (i.invoice_no || '-') + '</a></td>';
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
        // 凭证号（同三号合并 rowspan）
        if (idx === 0) {
          html += '<td rowspan="' + biRowspan + '">' + (i.voucher_no ? '<a href="javascript:void(0)" onclick="showVoucherDetail(\'' + i.voucher_no + '\')" style="color:#1d4ed8;font-weight:500;text-decoration:none;border-bottom:1px dashed #1d4ed8;cursor:pointer">' + i.voucher_no + '</a>' : '-') + '</td>';
        }
        html += '<td style="white-space:nowrap">';
        html += '<button class="btn btn-sm btn-secondary" onclick="showBookkeepingInvoiceForm(' + i.id + ')">编辑</button>';
        html += '<button class="btn btn-sm btn-danger" onclick="deleteBookkeepingInvoice(' + i.id + ')">删除</button>';
        html += '</td>';
        html += '</tr>';
      });
    });
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  } catch (e) {
    console.error('[BI]', e);
    toast(e.message, 'error');
    if (el) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280">'
        + '<p style="margin-bottom:16px">页面加载异常：' + escapeHtml(e.message) + '</p>'
        + '<button class="btn btn-primary" onclick="renderBookkeepingInvoices()">重新加载</button></div>';
    }
  }
}

async function deleteBookkeepingInvoice(id) {
  if (!confirm('确认删除该记账发票？')) return;
  try {
    const result = await api('/api/bookkeeping-invoices/' + id, { method: 'DELETE' });
    toast(result.message, 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
  navigateTo('bookkeeping-invoices');
}

function toggleBiSelectAll() {
  const all = document.getElementById('biSelectAll');
  document.querySelectorAll('.bi-check').forEach(cb => cb.checked = all.checked);
  updateBiBatchBtn();
}

// 从已勾选的.bi-check中收集全部发票ID（兼容 data-ids 合并行）
function getCheckedBiIds() {
  const ids = [];
  document.querySelectorAll('.bi-check:checked').forEach(cb => {
    if (cb.dataset.ids) {
      cb.dataset.ids.split(',').forEach(id => { const n = parseInt(id); if (n) ids.push(n); });
    } else if (cb.dataset.id) {
      const n = parseInt(cb.dataset.id); if (n) ids.push(n);
    }
  });
  return ids;
}

function updateBiBatchBtn() {
  const checked = document.querySelectorAll('.bi-check:checked');
  const count = checked.length;
  const delBtn = document.getElementById('biBatchDelBtn');
  if (delBtn) {
    delBtn.textContent = count > 0 ? '批量删除（' + count + '）' : '批量删除';
    delBtn.disabled = count === 0;
  }
  const selectAll = document.getElementById('biSelectAll');
  if (selectAll) {
    const boxes = document.querySelectorAll('.bi-check');
    const checkedBoxes = document.querySelectorAll('.bi-check:checked');
    selectAll.checked = boxes.length > 0 && boxes.length === checkedBoxes.length;
    selectAll.indeterminate = checkedBoxes.length > 0 && checkedBoxes.length < boxes.length;
  }
}

async function batchDeleteBookkeepingInvoices() {
  const ids = getCheckedBiIds();
  if (ids.length === 0) return;
  if (!confirm('确认删除选中的 ' + ids.length + ' 条记账发票？此操作不可恢复。')) return;
  try {
    const result = await api('/api/bookkeeping-invoices/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids)
    });
    toast(result.message, 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
  navigateTo('bookkeeping-invoices');
}

async function showBookkeepingDetail(id) {
  try {
    const i = await api('/api/bookkeeping-invoices/' + id);
    const fmt = n => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
    let html = '<div class="modal-header"><h3>记账发票详情</h3><button class="modal-close" onclick="closeModal()">×</button></div>';
    html += '<div class="modal-body" style="max-height:70vh;overflow-y:auto">';

    html += '<div class="payment-form-section"><div class="payment-form-section-title">📋 基本信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>发票代码：</b>' + (i.invoice_code || '-') + '</div>';
    html += '<div><b>发票号码：</b>' + (i.invoice_no || '-') + '</div>';
    html += '<div><b>数电发票号码：</b>' + (i.digital_invoice_no || '-') + '</div>';
    html += '<div><b>开票日期：</b>' + (i.invoice_date || '-') + '</div>';
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

async function showBookkeepingInvoiceForm(id) {
  let data = {};
  if (id) {
    data = await api('/api/bookkeeping-invoices/' + id);
  }
  const isEdit = !!id;
  let html = '<div class="modal-header"><h3>' + (isEdit ? '编辑记账发票' : '新增记账发票') + '</h3><button class="modal-close" onclick="closeModal()">×</button></div>';
  html += '<div class="modal-body" style="max-height:70vh;overflow-y:auto">';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">📋 发票基本信息</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">发票代码</label><input class="form-input" id="bi-invoice-code" value="' + (data.invoice_code || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">发票号码</label><input class="form-input" id="bi-invoice-no" value="' + (data.invoice_no || '-') + '" ' + (isEdit ? 'readonly' : '') + '></div>';
  html += '</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">数电发票号码</label><input class="form-input" id="bi-digital-invoice-no" value="' + (data.digital_invoice_no || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">开票日期</label><input type="date" class="form-input" id="bi-invoice-date" value="' + (data.invoice_date || '') + '"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">🏢 销方信息</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">销方识别号</label><input class="form-input" id="bi-seller-taxno" value="' + (data.seller_tax_no || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">销方名称</label><input class="form-input" id="bi-seller-name" value="' + (data.seller_name || '') + '"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">🏢 购方信息</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">购方识别号</label><input class="form-input" id="bi-buyer-taxno" value="' + (data.buyer_tax_no || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">购买方名称</label><input class="form-input" id="bi-buyer-name" value="' + (data.buyer_name || '') + '"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">🏷️ 分类信息</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">税收分类编码</label><input class="form-input" id="bi-tax-category-code" value="' + (data.tax_category_code || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">特定业务类型</label><input class="form-input" id="bi-specific-business-type" value="' + (data.specific_business_type || '') + '"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">📦 货物明细</div>';
  html += '<div class="form-group"><label class="form-label">货物或应税劳务名称</label><input class="form-input" id="bi-goods-name" value="' + (data.goods_name || '') + '"></div>';
  html += '<div class="form-grid-4">';
  html += '<div class="form-group"><label class="form-label">规格型号</label><input class="form-input" id="bi-spec" value="' + (data.spec || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">单位</label><input class="form-input" id="bi-unit" value="' + (data.unit || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">数量</label><input type="number" step="any" class="form-input" id="bi-qty" value="' + (data.quantity || 0) + '" onchange="calcBiTotal()"></div>';
  html += '<div class="form-group"><label class="form-label">单价</label><input type="number" step="any" class="form-input" id="bi-price" value="' + (data.unit_price || 0) + '" onchange="calcBiTotal()"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">💰 金额信息</div>';
  html += '<div class="form-grid-3">';
  html += '<div class="form-group"><label class="form-label">金额（不含税）</label><input type="number" step="any" class="form-input" id="bi-amount" value="' + (data.amount || 0) + '" onchange="calcBiTax()"></div>';
  html += '<div class="form-group"><label class="form-label">税率（%）</label><input type="number" step="any" class="form-input" id="bi-taxrate" value="' + (data.tax_rate || 0) + '" onchange="calcBiTax()"></div>';
  html += '<div class="form-group"><label class="form-label">税额</label><input type="number" step="any" class="form-input" id="bi-taxamount" value="' + (data.tax_amount || 0) + '" onchange="calcBiAmount()"></div>';
  html += '</div>';
  html += '<div class="form-grid-1">';
  html += '<div class="form-group"><label class="form-label">价税合计</label><input type="number" step="any" class="form-input" id="bi-total" value="' + (data.total_amount || 0) + '" readonly style="background:#f0f9ff;font-weight:600;font-size:16px"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">📄 发票属性</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">发票票种</label><select class="form-input" id="bi-category">';
  ['增值税专用发票', '增值税普通发票', '电子普通发票', '其他'].forEach(t => {
    html += '<option value="' + t + '"' + (data.invoice_category === t ? ' selected' : '') + '>' + t + '</option>';
  });
  html += '</select></div>';
  html += '<div class="form-group"><label class="form-label">发票状态</label><select class="form-input" id="bi-status">';
  [STATUS.NORMAL, STATUS.VOID, STATUS.RED].forEach(s => {
    html += '<option value="' + s + '"' + (data.status === s ? ' selected' : '') + '>' + s + '</option>';
  });
  html += '</select></div>';
  html += '</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">发票来源</label><input class="form-input" id="bi-source" value="' + (data.invoice_source || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">发票风险等级</label><select class="form-input" id="bi-risk-level">';
  ['', STATUS.RISK_NORMAL, STATUS.FOLLOW_ATTENTION, STATUS.RISK_ABNORMAL].forEach(r => {
    html += '<option value="' + r + '"' + (data.invoice_risk_level === r ? ' selected' : '') + '>' + (r || '--') + '</option>';
  });
  html += '</select></div>';
  html += '</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">是否正数发票</label><select class="form-input" id="bi-is-positive">';
  html += '<option value="1"' + (data.is_positive !== false ? ' selected' : '') + '>是</option>';
  html += '<option value="0"' + (data.is_positive === false ? ' selected' : '') + '>否</option>';
  html += '</select></div>';
  html += '<div class="form-group"><label class="form-label">开票人</label><input class="form-input" id="bi-issuer" value="' + (data.issuer || '') + '"></div>';
  html += '</div></div>';

  html += '<div class="payment-form-section"><div class="payment-form-section-title">📝 备注</div>';
  html += '<div class="form-group"><label class="form-label">备注</label><textarea class="form-input" id="bi-remark" rows="2" style="width:100%">' + (data.remark || '') + '</textarea></div>';
  html += '</div>';

  html += '</div>';
  html += '<div class="modal-footer">';
  html += '<button class="btn btn-secondary" onclick="closeModal()">取消</button>';
  html += '<button class="btn btn-primary" onclick="saveBookkeepingInvoice(' + (id || 0) + ')">保存</button>';
  html += '</div>';
  showModal(html);
}

function calcBiTax() {
  const amount = parseFloat(document.getElementById('bi-amount').value) || 0;
  const rate = parseFloat(document.getElementById('bi-taxrate').value) || 0;
  const tax = amount * rate / 100;
  document.getElementById('bi-taxamount').value = tax.toFixed(2);
  document.getElementById('bi-total').value = (amount + tax).toFixed(2);
}

function calcBiAmount() {
  const tax = parseFloat(document.getElementById('bi-taxamount').value) || 0;
  const amount = parseFloat(document.getElementById('bi-amount').value) || 0;
  document.getElementById('bi-total').value = (amount + tax).toFixed(2);
}

function calcBiTotal() {
  const qty = parseFloat(document.getElementById('bi-qty').value) || 0;
  const price = parseFloat(document.getElementById('bi-price').value) || 0;
  document.getElementById('bi-amount').value = (qty * price).toFixed(2);
  calcBiTax();
}

async function saveBookkeepingInvoice(id) {
  try {
    const body = {
      invoice_code: document.getElementById('bi-invoice-code').value.trim(),
      invoice_no: document.getElementById('bi-invoice-no').value.trim(),
      digital_invoice_no: document.getElementById('bi-digital-invoice-no').value.trim(),
      seller_tax_no: document.getElementById('bi-seller-taxno').value.trim(),
      seller_name: document.getElementById('bi-seller-name').value.trim(),
      buyer_tax_no: document.getElementById('bi-buyer-taxno').value.trim(),
      buyer_name: document.getElementById('bi-buyer-name').value.trim(),
      invoice_date: document.getElementById('bi-invoice-date').value,
      tax_category_code: document.getElementById('bi-tax-category-code').value.trim(),
      specific_business_type: document.getElementById('bi-specific-business-type').value.trim(),
      goods_name: document.getElementById('bi-goods-name').value.trim(),
      spec: document.getElementById('bi-spec').value.trim(),
      unit: document.getElementById('bi-unit').value.trim(),
      quantity: parseFloat(document.getElementById('bi-qty').value) || 0,
      unit_price: parseFloat(document.getElementById('bi-price').value) || 0,
      amount: parseFloat(document.getElementById('bi-amount').value) || 0,
      tax_rate: parseFloat(document.getElementById('bi-taxrate').value) || 0,
      tax_amount: parseFloat(document.getElementById('bi-taxamount').value) || 0,
      total_amount: parseFloat(document.getElementById('bi-total').value) || 0,
      invoice_source: document.getElementById('bi-source').value.trim(),
      invoice_category: document.getElementById('bi-category').value,
      status: document.getElementById('bi-status').value,
      is_positive: document.getElementById('bi-is-positive').value === '1',
      invoice_risk_level: document.getElementById('bi-risk-level').value,
      issuer: document.getElementById('bi-issuer').value.trim(),
      remark: document.getElementById('bi-remark').value.trim()
    };
    let result;
    if (id) {
      result = await api('/api/bookkeeping-invoices/' + id, { method: 'PUT', body });
    } else {
      result = await api('/api/bookkeeping-invoices', { method: 'POST', body });
    }
    toast(result.message || '保存成功', 'success');
    closeModal();
    navigateTo('bookkeeping-invoices');
  } catch (e) {
    toast(e.message, 'error');
  }
}
