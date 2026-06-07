// ==================== 固定资产 ====================
async function renderFixedAssets(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML = '<div class="card" style="margin-bottom:0">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn btn-success" onclick="depreciateAll()">计提本月折旧</button>' +
        '<button class="btn btn-primary" onclick="showFixedAssetForm()">新增资产</button>' +
      '</div>' +
    '</div>' +
    '<div class="table-wrap" id="fa-table">\u52a0\u8f7d\u4e2d...</div>' +
  '</div>';
  await loadFixedAssets();
}

async function loadFixedAssets() {
  try {
    const data = await api('/api/fixed-assets');
    let tbody = '';
    for (const a of data) {
      const statusBadge = a.usage_status === 'active'
        ? '<span class="badge badge-active">\u5728\u7528</span>'
        : '<span class="badge badge-deprecated">\u505c\u7528</span>';
      tbody += '<tr>' +
        '<td>' + a.asset_code + '</td>' +
        '<td>' + a.asset_name + '</td>' +
        '<td>' + (a.category || '') + '</td>' +
        '<td class="num">\uffe5' + fmt(a.original_value) + '</td>' +
        '<td class="num">\uffe5' + fmt(a.accumulated_depreciation) + '</td>' +
        '<td class="num">\uffe5' + fmt(a.net_value) + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn btn-sm btn-secondary" onclick="showFixedAssetForm(' + a.id + ')">\u7f16\u8f91</button>' +
          '<button class="btn btn-sm btn-danger" onclick="deleteFixedAsset(' + a.id + ')">\u5220\u9664</button>' +
        '</td>' +
      '</tr>';
    }
    document.getElementById('fa-table').innerHTML = '<table>' +
      '<thead><tr><th>\u8d44\u4ea7\u7f16\u7801</th><th>\u8d44\u4ea7\u540d\u79f0</th><th>\u7c7b\u522b</th><th class="num">\u539f\u503c</th><th class="num">\u7d2f\u8ba1\u6298\u65e7</th><th class="num">\u51c0\u503c</th><th>\u72b6\u6001</th><th>\u64cd\u4f5c</th></tr></thead>' +
      '<tbody>' + (tbody || '<tr><td colspan="8"><div class="empty-state"><p>\u6682\u65e0\u56fa\u5b9a\u8d44\u4ea7</p></div></td></tr>') + '</tbody>' +
      '</table>';
  } catch (e) {
    document.getElementById('fa-table').innerHTML = '<p style="color:var(--danger)">' + e.message + '</p>';
  }
}

async function showFixedAssetForm(assetId) {
  assetId = assetId || null;
  let html = '<div class="modal-title">' + (assetId ? '\u7f16\u8f91\u56fa\u5b9a\u8d44\u4ea7' : '\u65b0\u589e\u56fa\u5b9a\u8d44\u4ea7') + '</div>';
  html += '<form id="fa-form" class="form-grid">';
  const faFields = [
    ['asset_code', '\u8d44\u4ea7\u7f16\u7801', 'text', 'required'],
    ['asset_name', '\u8d44\u4ea7\u540d\u79f0', 'text', 'required'],
    ['category', '\u8d44\u4ea7\u7c7b\u522b', 'text', ''],
    ['specification', '\u89c4\u683c\u578b\u53f7', 'text', ''],
    ['location', '\u4f7f\u7528\u5730\u70b9', 'text', ''],
    ['department', '\u4f7f\u7528\u90e8\u95e8', 'text', ''],
    ['owner', '\u8d23\u4efb\u4eba', 'text', ''],
    ['original_value', '\u539f\u503c', 'number', 'required step=0.01'],
    ['residual_value_rate', '\u6b8b\u503c\u7387(%)', 'number', 'step=0.01', '5'],
    ['depreciation_years', '\u6298\u65e7\u5e74\u9650', 'number', 'step=1', '5'],
    ['depreciation_method', '\u6298\u65e7\u65b9\u6cd5', 'select', '["\u76f4\u7ebf\u6cd5","\u52a0\u901f\u6298\u65e7\u6cd5"]', '直线法'],
    ['start_use_date', '\u5f00\u59cb\u4f7f\u7528\u65e5\u671f', 'date', 'required'],
    ['usage_status', '\u4f7f\u7528\u72b6\u6001', 'select', '["active","deprecated"]', 'active'],
  ];
  for (const f of faFields) {
    const [k, label, type, extra, def] = f;
    html += '<div class="form-group"><label>' + (label || '') + '</label>';
    if (type === 'select') {
      const opts = JSON.parse(extra);
      html += '<select class="form-control" name="' + k + '">';
      for (const o of opts) {
        html += '<option value="' + o + '"' + (def === o ? ' selected' : '') + '>' + o + '</option>';
      }
      html += '</select>';
    } else if (type === 'number') {
      html += '<input type="number" class="form-control" name="' + k + '" ' + (extra || '') + ' value="' + (def || '') + '">';
    } else {
      html += '<input type="' + type + '" class="form-control" name="' + k + '" ' + (extra || '') + ' value="' + (def || '') + '">';
    }
    html += '</div>';
  }
  html += '</form>';
  html += '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="closeModal()">\u53d6\u6d88</button>' +
    '<button class="btn btn-primary" onclick="saveFixedAsset(' + (assetId || 'null') + ')">\u4fdd\u5b58</button>' +
    '</div>';
  showModal(html);
  if (assetId) {
    try {
      const a = await api('/api/fixed-assets/' + assetId);
      for (const f of faFields) {
        const el = document.querySelector('#fa-form [name="' + f[0] + '"]');
        if (el) el.value = a[f[0]] != null ? a[f[0]] : '';
      }
    } catch (e) {}
  }
}

async function saveFixedAsset(id) {
  const form = document.getElementById('fa-form');
  const body = {};
  new FormData(form).forEach(function(v, k) {
    if (v !== '' && v !== undefined) {
      body[k] = (['original_value','residual_value_rate','depreciation_years'].includes(k)) ? parseFloat(v) : v;
    }
  });
  try {
    if (id && id !== 'null') {
      await api('/api/fixed-assets/' + id, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/fixed-assets', { method: 'POST', body: JSON.stringify(body) });
    }
    closeModal();
    toast('\u4fdd\u5b58\u6210\u529f', 'success');
    await loadFixedAssets();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteFixedAsset(id) {
  if (!confirm('\u786e\u8ba4\u5220\u9664\u8be5\u56fa\u5b9a\u8d44\u4ea7\uff1f')) return;
  try {
    await api('/api/fixed-assets/' + id, { method: 'DELETE' });
    toast('\u5220\u9664\u6210\u529f', 'success');
    await loadFixedAssets();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function depreciateAll() {
  if (!confirm('\u786e\u8ba4\u5bf9\u5168\u90e8\u5728\u7528\u56fa\u5b9a\u8d44\u4ea7\u8ba1\u63d0\u672c\u6708\u6298\u65e7\uff1f')) return;
  try {
    const res = await api('/api/fixed-assets/depreciate', { method: 'POST', body: JSON.stringify({period: currentPeriod}) });
    toast('\u6298\u65e7\u5b8c\u6210\uff0c\u5171\u5904\u7406 ' + (res.depreciated_count || 0) + ' \u9879\u8d44\u4ea7', 'success');
    await loadFixedAssets();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ==================== 无形资产 ====================
async function renderIntangibleAssets(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML = '<div class="card" style="margin-bottom:0">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn btn-success" onclick="amortizeAll()">摊销本月</button>' +
        '<button class="btn btn-primary" onclick="showIntangibleAssetForm()">新增资产</button>' +
      '</div>' +
    '</div>' +
    '<div class="table-wrap" id="ia-table">\u52a0\u8f7d\u4e2d...</div>' +
  '</div>';
  await loadIntangibleAssets();
}

async function loadIntangibleAssets() {
  try {
    const data = await api('/api/intangible-assets');
    let tbody = '';
    for (const a of data) {
      const statusBadge = a.usage_status === 'active'
        ? '<span class="badge badge-active">\u5728\u7528</span>'
        : '<span class="badge badge-deprecated">\u505c\u7528</span>';
      tbody += '<tr>' +
        '<td>' + a.asset_code + '</td>' +
        '<td>' + a.asset_name + '</td>' +
        '<td>' + (a.category || '') + '</td>' +
        '<td class="num">\uffe5' + fmt(a.original_value) + '</td>' +
        '<td class="num">\uffe5' + fmt(a.accumulated_amortization) + '</td>' +
        '<td class="num">\uffe5' + fmt(a.net_value) + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn btn-sm btn-secondary" onclick="showIntangibleAssetForm(' + a.id + ')">\u7f16\u8f91</button>' +
          '<button class="btn btn-sm btn-danger" onclick="deleteIntangibleAsset(' + a.id + ')">\u5220\u9664</button>' +
        '</td>' +
      '</tr>';
    }
    document.getElementById('ia-table').innerHTML = '<table>' +
      '<thead><tr><th>\u8d44\u4ea7\u7f16\u7801</th><th>\u8d44\u4ea7\u540d\u79f0</th><th>\u7c7b\u522b</th><th class="num">\u539f\u503c</th><th class="num">\u7d2f\u8ba1\u644a\u9500</th><th class="num">\u51c0\u503c</th><th>\u72b6\u6001</th><th>\u64cd\u4f5c</th></tr></thead>' +
      '<tbody>' + (tbody || '<tr><td colspan="8"><div class="empty-state"><p>\u6682\u65e0\u65e0\u5f62\u8d44\u4ea7</p></div></td></tr>') + '</tbody>' +
      '</table>';
  } catch (e) {
    document.getElementById('ia-table').innerHTML = '<p style="color:var(--danger)">' + e.message + '</p>';
  }
}

async function showIntangibleAssetForm(assetId) {
  assetId = assetId || null;
  let html = '<div class="modal-title">' + (assetId ? '\u7f16\u8f91\u65e0\u5f62\u8d44\u4ea7' : '\u65b0\u589e\u65e0\u5f62\u8d44\u4ea7') + '</div>';
  html += '<form id="ia-form" class="form-grid">';
  const iaFields = [
    ['asset_code', '\u8d44\u4ea7\u7f16\u7801', 'text', 'required'],
    ['asset_name', '\u8d44\u4ea7\u540d\u79f0', 'text', 'required'],
    ['category', '\u8d44\u4ea7\u7c7b\u522b', 'text', ''],
    ['original_value', '\u539f\u503c', 'number', 'required step=0.01'],
    ['residual_value_rate', '\u6b8b\u503c\u7387(%)', 'number', 'step=0.01', '5'],
    ['amortization_years', '\u644a\u9500\u5e74\u9650', 'number', 'step=1', '5'],
    ['amortization_method', '\u644a\u9500\u65b9\u6cd5', 'select', '["\u76f4\u7ebf\u6cd5"]', '直线法'],
    ['start_use_date', '\u5f00\u59cb\u4f7f\u7528\u65e5\u671f', 'date', 'required'],
    ['usage_status', '\u4f7f\u7528\u72b6\u6001', 'select', '["active","deprecated"]', 'active'],
  ];
  for (const f of iaFields) {
    const [k, label, type, extra, def] = f;
    html += '<div class="form-group"><label>' + label + '</label>';
    if (type === 'select') {
      const opts = JSON.parse(extra);
      html += '<select class="form-control" name="' + k + '">';
      for (const o of opts) {
        html += '<option value="' + o + '"' + (def === o ? ' selected' : '') + '>' + o + '</option>';
      }
      html += '</select>';
    } else if (type === 'number') {
      html += '<input type="number" class="form-control" name="' + k + '" ' + (extra || '') + ' value="' + (def || '') + '">';
    } else {
      html += '<input type="' + type + '" class="form-control" name="' + k + '" ' + (extra || '') + ' value="' + (def || '') + '">';
    }
    html += '</div>';
  }
  html += '</form>';
  html += '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="closeModal()">\u53d6\u6d88</button>' +
    '<button class="btn btn-primary" onclick="saveIntangibleAsset(' + (assetId || 'null') + ')">\u4fdd\u5b58</button>' +
    '</div>';
  showModal(html);
  if (assetId) {
    try {
      const a = await api('/api/intangible-assets/' + assetId);
      for (const f of iaFields) {
        const el = document.querySelector('#ia-form [name="' + f[0] + '"]');
        if (el) el.value = a[f[0]] != null ? a[f[0]] : '';
      }
    } catch (e) {}
  }
}

async function saveIntangibleAsset(id) {
  const form = document.getElementById('ia-form');
  const body = {};
  new FormData(form).forEach(function(v, k) {
    if (v !== '' && v !== undefined) {
      body[k] = (['original_value','residual_value_rate','amortization_years'].includes(k)) ? parseFloat(v) : v;
    }
  });
  try {
    if (id && id !== 'null') {
      await api('/api/intangible-assets/' + id, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/intangible-assets', { method: 'POST', body: JSON.stringify(body) });
    }
    closeModal();
    toast('\u4fdd\u5b58\u6210\u529f', 'success');
    await loadIntangibleAssets();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteIntangibleAsset(id) {
  if (!confirm('\u786e\u8ba4\u5220\u9664\u8be5\u65e0\u5f62\u8d44\u4ea7\uff1f')) return;
  try {
    await api('/api/intangible-assets/' + id, { method: 'DELETE' });
    toast('\u5220\u9664\u6210\u529f', 'success');
    await loadIntangibleAssets();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function amortizeAll() {
  if (!confirm('\u786e\u8ba4\u5bf9\u5168\u90e8\u5728\u7528\u65e0\u5f62\u8d44\u4ea7\u644a\u9500\u672c\u6708\uff1f')) return;
  try {
    const res = await api('/api/intangible-assets/amortize', { method: 'POST', body: JSON.stringify({period: currentPeriod}) });
    toast('\u644a\u9500\u5b8c\u6210\uff0c\u5171\u5904\u7406 ' + (res.amortized_count || 0) + ' \u9879\u8d44\u4ea7', 'success');
    await loadIntangibleAssets();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ==================== 库存管理 ====================
let inventoryTxPage = 1;

async function renderInventory(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML =
    '<div class="card" style="margin-bottom:16px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-primary" onclick="showInventoryItemForm()">新增存货</button>' +
          '<button class="btn btn-secondary" onclick="showInventoryTxForm()">录入收发记录</button>' +
        '</div>' +
      '</div>' +
      '<div class="table-wrap" id="inv-table">\u52a0\u8f7d\u4e2d...</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">最近收发记录</div>' +
      '<div class="table-wrap" id="inv-tx-table"></div>' +
      '<div class="pagination" id="inv-tx-pagination"></div>' +
    '</div>';
  await Promise.all([loadInventoryItems(), loadInventoryTransactions()]);
}

async function loadInventoryItems() {
  try {
    const data = await api('/api/inventory-items');
    let tbody = '';
    for (const a of data) {
      tbody += '<tr>' +
        '<td>' + a.item_code + '</td>' +
        '<td>' + a.item_name + '</td>' +
        '<td>' + (a.specification || '') + '</td>' +
        '<td>' + (a.unit || '') + '</td>' +
        '<td class="num">' + (a.quantity_on_hand != null ? fmt(a.quantity_on_hand) : '-') + '</td>' +
        '<td class="num">\uffe5' + (a.total_cost != null ? fmt(a.total_cost) : '-') + '</td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn btn-sm btn-secondary" onclick="showInventoryItemForm(' + a.id + ')">\u7f16\u8f91</button>' +
          '<button class="btn btn-sm btn-danger" onclick="deleteInventoryItem(' + a.id + ')">\u5220\u9664</button>' +
        '</td>' +
      '</tr>';
    }
    document.getElementById('inv-table').innerHTML = '<table>' +
      '<thead><tr><th>\u5b58\u8d27\u7f16\u7801</th><th>\u540d\u79f0</th><th>\u89c4\u683c</th><th>\u5355\u4f4d</th><th class="num">\u7ed3\u5b58\u6570\u91cf</th><th class="num">\u7ed3\u5b58\u6210\u672c</th><th>\u64cd\u4f5c</th></tr></thead>' +
      '<tbody>' + (tbody || '<tr><td colspan="7"><div class="empty-state"><p>\u6682\u65e0\u5b58\u8d27\u6863\u6848</p></div></td></tr>') + '</tbody>' +
      '</table>';
  } catch (e) {
    document.getElementById('inv-table').innerHTML = '<p style="color:var(--danger)">' + e.message + '</p>';
  }
}

async function showInventoryItemForm(itemId) {
  itemId = itemId || null;
  let html = '<div class="modal-title">' + (itemId ? '\u7f16\u8f91\u5b58\u8d27' : '\u65b0\u589e\u5b58\u8d27') + '</div>';
  html += '<form id="inv-form" class="form-grid">';
  const invFields = [
    ['item_code', '\u5b58\u8d27\u7f16\u7801', 'text', 'required'],
    ['item_name', '\u5b58\u8d27\u540d\u79f0', 'text', 'required'],
    ['specification', '\u89c4\u683c\u578b\u53f7', 'text', ''],
    ['unit', '\u5355\u4f4d', 'text', ''],
    ['category', '\u7c7b\u522b', 'text', ''],
    ['warehouse', '\u4ed3\u5e93\u4f4d\u7f6e', 'text', ''],
  ];
  for (const f of invFields) {
    html += '<div class="form-group"><label>' + f[1] + '</label>';
    html += '<input type="text" class="form-control" name="' + f[0] + '" ' + f[3] + '>';
    html += '</div>';
  }
  html += '</form>';
  html += '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="closeModal()">\u53d6\u6d88</button>' +
    '<button class="btn btn-primary" onclick="saveInventoryItem(' + (itemId || 'null') + ')">\u4fdd\u5b58</button>' +
    '</div>';
  showModal(html);
  if (itemId) {
    try {
      const a = await api('/api/inventory-items/' + itemId);
      for (const f of invFields) {
        const el = document.querySelector('#inv-form [name="' + f[0] + '"]');
        if (el) el.value = a[f[0]] || '';
      }
    } catch (e) {}
  }
}

async function saveInventoryItem(id) {
  const form = document.getElementById('inv-form');
  const body = {};
  new FormData(form).forEach(function(v, k) { if (v) body[k] = v; });
  try {
    if (id && id !== 'null') {
      await api('/api/inventory-items/' + id, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/inventory-items', { method: 'POST', body: JSON.stringify(body) });
    }
    closeModal();
    toast('\u4fdd\u5b58\u6210\u529f', 'success');
    await loadInventoryItems();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteInventoryItem(id) {
  if (!confirm('\u786e\u8ba4\u5220\u9664\u8be5\u5b58\u8d27\u6863\u6848\uff1f')) return;
  try {
    await api('/api/inventory-items/' + id, { method: 'DELETE' });
    toast('\u5220\u9664\u6210\u529f', 'success');
    await loadInventoryItems();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function showInventoryTxForm() {
  let items = [];
  try { items = await api('/api/inventory-items'); } catch (e) {}
  let html = '<div class="modal-title">录入收发记录</div>';
  html += '<form id="inv-tx-form" class="form-grid">';
  html += '<div class="form-group"><label>\u5b58\u8d27*</label><select class="form-control" name="inventory_item_id" required><option value="">-- \u9009\u62e9\u5b58\u8d27 --</option>';
  for (const it of items) {
    html += '<option value="' + it.id + '">' + it.item_code + ' ' + it.item_name + '</option>';
  }
  html += '</select></div>';
  const txFieldDefs = {
    tx_type: ['\u7c7b\u578b', 'select', [["receipt","\u5165\u5e93"],["issue","\u51fa\u5e93"],["adjust","\u8c03\u6574"]]],
    tx_date: ['\u65e5\u671f', 'date', null],
    quantity: ['\u6570\u91cf', 'number', 'required step=0.01'],
    unit_price: ['\u5355\u4ef7', 'number', 'step=0.01'],
    reference_no: ['\u5355\u636e\u53f7', 'text', null],
    warehouse: ['\u4ed3\u5e93', 'text', null],
    notes: ['\u5907\u6ce8', 'text', null],
  };
  for (const [k, [label, type, extra]] of Object.entries(txFieldDefs)) {
    html += '<div class="form-group"><label>' + label + '</label>';
    if (type === 'select') {
      html += '<select class="form-control" name="' + k + '" required>';
      for (const [val, txt] of extra) {
        html += '<option value="' + val + '">' + txt + '</option>';
      }
      html += '</select>';
    } else if (type === 'number') {
      html += '<input type="number" class="form-control" name="' + k + '" ' + (extra || '') + '>';
    } else {
      html += '<input type="' + type + '" class="form-control" name="' + k + '" ' + (extra || '') + '>';
    }
    html += '</div>';
  }
  html += '</form>';
  html += '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="closeModal()">\u53d6\u6d88</button>' +
    '<button class="btn btn-primary" onclick="saveInventoryTx()">\u4fdd\u5b58</button>' +
    '</div>';
  showModal(html);
}

async function saveInventoryTx() {
  const form = document.getElementById('inv-tx-form');
  const body = {};
  new FormData(form).forEach(function(v, k) {
    if (v !== '' && v !== undefined) {
      body[k] = (['quantity','unit_price'].includes(k)) ? parseFloat(v) : v;
    }
  });
  try {
    await api('/api/inventory-transactions', { method: 'POST', body: JSON.stringify(body) });
    closeModal();
    toast('\u6536\u53d1\u8bb0\u5f55\u5df2\u4fdd\u5b58', 'success');
    await Promise.all([loadInventoryItems(), loadInventoryTransactions()]);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function loadInventoryTransactions(page) {
  page = page || 1;
  inventoryTxPage = page;
  try {
    const data = await api('/api/inventory-transactions?page=' + page + '&page_size=15');
    const items = data.data || data;
    const total = data.total || 0;
    let tbody = '';
    for (const t of items) {
      let typeBadge;
      if (t.tx_type === 'receipt') typeBadge = '<span class="badge badge-active">\u5165\u5e93</span>';
      else if (t.tx_type === 'issue') typeBadge = '<span class="badge badge-pending">\u51fa\u5e93</span>';
      else typeBadge = '<span class="badge badge-deprecated">\u8c03\u6574</span>';
      tbody += '<tr>' +
        '<td>' + (t.tx_date || '') + '</td>' +
        '<td>' + typeBadge + '</td>' +
        '<td>' + (t.item_code || '') + ' ' + (t.item_name || '') + '</td>' +
        '<td class="num">' + (t.quantity != null ? fmt(t.quantity) : '-') + '</td>' +
        '<td class="num">' + (t.unit_price != null ? fmt(t.unit_price) : '-') + '</td>' +
        '<td class="num">' + (t.total_amount != null ? fmt(t.total_amount) : '-') + '</td>' +
        '<td>' + (t.reference_no || '') + '</td>' +
      '</tr>';
    }
    document.getElementById('inv-tx-table').innerHTML = '<table>' +
      '<thead><tr><th>\u65e5\u671f</th><th>\u7c7b\u578b</th><th>\u5b58\u8d27</th><th class="num">\u6570\u91cf</th><th class="num">\u5355\u4ef7</th><th class="num">\u91d1\u989d</th><th>\u5355\u636e\u53f7</th></tr></thead>' +
      '<tbody>' + (tbody || '<tr><td colspan="7"><div class="empty-state"><p>\u6682\u65e0\u6536\u53d1\u8bb0\u5f55</p></div></td></tr>') + '</tbody>' +
      '</table>';
    const totalPages = Math.ceil(total / 15);
    if (totalPages > 1) {
      let pages = '<span style="color:var(--gray-500)">\u5171 ' + total + ' \u6761</span>';
      for (let i = 1; i <= totalPages; i++) {
        pages += '<button class="page-btn ' + (i === page ? 'active' : '') + '" onclick="loadInventoryTransactions(' + i + ')">' + i + '</button>';
      }
      document.getElementById('inv-tx-pagination').innerHTML = pages;
    }
  } catch (e) {
    document.getElementById('inv-tx-table').innerHTML = '<p style="color:var(--danger)">' + e.message + '</p>';
  }
}

