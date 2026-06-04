// ==================== 多公司支持 ====================
// 全局变量 currentCompanyId/currentCompanyName/allCompanies 已在 core.js 声明

// ==================== 启动 ====================

async function loadCompanies() {
  try {
    allCompanies = await fetch('/api/companies').then(r => r.json());
    const display = document.getElementById('company-name-display');
    if (allCompanies.length > 0) {
      const cur = allCompanies.find(c => c.id === currentCompanyId) || allCompanies[0];
      currentCompanyName = cur.name;
      if (display) display.textContent = currentCompanyName;
    }
  } catch (e) {
    console.error('加载公司列表失败', e);
  }
}

function switchCompany() {
  // 顶部栏不再显示下拉选择器，切换账套请使用「退出本账套」回到选择页
  const cur = allCompanies.find(c => c.id === currentCompanyId);
  if (cur) {
    currentCompanyName = cur.name;
    const display = document.getElementById('company-name-display');
    if (display) display.textContent = currentCompanyName;
  }
}

// ==================== 公司信息 ====================
async function showCompanyManager(container) {
  var el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  try {
    const c = await fetch('/api/company?company_id=' + currentCompanyId).then(r => r.json());
    if (!c || !c.company_name) { el.innerHTML = '<div class="empty-state">暂无公司信息</div>'; return; }

    let html = '';
    html += '<div style="display:flex;justify-content:flex-end;margin-bottom:12px">';
    html += '<button class="btn btn-primary" onclick="showCompanyEditForm()">编辑公司信息</button>';
    html += '</div>';

    html += '<div class="detail-grid">';
    html += _detailRow('ID', c.id);
    html += _detailRow('公司全称', c.company_name);
    html += _detailRow('统一社会信用代码', c.uscc || '--');
    html += _detailRow('注册资本', c.registered_capital ? '¥' + c.registered_capital.toLocaleString() : '--');
    html += _detailRow('成立日期', c.established_date || '--');
    html += _detailRow('法定代表人', c.legal_representative || '--');
    html += _detailRow('法定代表人身份证', c.legal_representative_id || '--');
    html += _detailRow('注册地址', c.address || '--');
    html += _detailRow('经营范围', c.business_scope || '--');
    html += '</div>';

    html += '<div class="card-title" style="margin-top:24px">股东信息</div>';
    if (c.shareholders && c.shareholders.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>姓名/公司名称</th><th>身份证号/统一社会信用代码</th><th>持股比例(%)</th><th>认缴出资额</th></tr></thead><tbody>';
      for (const s of c.shareholders) {
        html += '<tr><td>' + s.name + '</td><td>' + (s.id_number || '--') + '</td><td>' + (s.ratio || '--') + '</td><td>' + (s.contribution_amount ? '¥' + s.contribution_amount.toLocaleString() : '--') + '</td></tr>';
      }
      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state" style="padding:12px">暂无股东信息</div>';
    }

    html += '<div class="card-title" style="margin-top:24px">董事信息</div>';
    if (c.directors && c.directors.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>姓名</th><th>身份证号</th></tr></thead><tbody>';
      for (const d of c.directors) {
        html += '<tr><td>' + d.name + '</td><td>' + (d.id_number || '--') + '</td></tr>';
      }
      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state" style="padding:12px">暂无董事信息</div>';
    }

    html += '<div class="card-title" style="margin-top:24px">监事信息</div>';
    if (c.supervisors && c.supervisors.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>姓名</th><th>身份证号</th></tr></thead><tbody>';
      for (const s of c.supervisors) {
        html += '<tr><td>' + s.name + '</td><td>' + (s.id_number || '--') + '</td></tr>';
      }
      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state" style="padding:12px">暂无监事信息</div>';
    }

    html += '<div class="card-title" style="margin-top:24px">财务负责人信息</div>';
    if (c.finance_contacts && c.finance_contacts.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>姓名</th><th>身份证号</th></tr></thead><tbody>';
      for (const f of c.finance_contacts) {
        html += '<tr><td>' + f.name + '</td><td>' + (f.id_number || '--') + '</td></tr>';
      }
      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state" style="padding:12px">暂无财务负责人信息</div>';
    }

    el.innerHTML = html;
  } catch (e) {
    toast(e.message, 'error');
  }
}

function _detailRow(label, value) {
  return '<div class="detail-row"><span class="detail-label">' + label + '</span><span class="detail-value">' + value + '</span></div>';
}

// ==================== 公司编辑弹窗 ====================
async function showCompanyEditForm() {
  let c = {};
  try { c = await fetch('/api/company?company_id=' + currentCompanyId).then(r => r.json()); } catch(e) {}

  let html = '<div class="modal-title">编辑公司信息</div>';
  html += '<form id="company-edit-form" class="form-grid">';
  html += '<div class="form-group"><label>公司全称 *</label><input type="text" class="form-control" name="company_name" value="' + (c.company_name || '') + '" required></div>';
  html += '<div class="form-group"><label>统一社会信用代码</label><input type="text" class="form-control" name="uscc" value="' + (c.uscc || '') + '"></div>';
  html += '<div class="form-group"><label>注册资本</label><input type="number" step="0.01" class="form-control" name="registered_capital" value="' + (c.registered_capital || '') + '"></div>';
  html += '<div class="form-group"><label>成立日期</label><input type="date" class="form-control" name="established_date" value="' + (c.established_date || '') + '"></div>';
  html += '<div class="form-group"><label>法定代表人</label><input type="text" class="form-control" name="legal_representative" value="' + (c.legal_representative || '') + '"></div>';
  html += '<div class="form-group"><label>法定代表人身份证</label><input type="text" class="form-control" name="legal_representative_id" value="' + (c.legal_representative_id || '') + '"></div>';
  html += '<div class="form-group"><label>注册地址</label><input type="text" class="form-control" name="address" value="' + (c.address || '') + '"></div>';
  html += '<div class="form-group" style="grid-column:1/-1"><label>经营范围</label><textarea class="form-control" name="business_scope" rows="2">' + (c.business_scope || '') + '</textarea></div>';
  html += '</form>';

  html += _buildPersonSection('shareholders', '股东信息', c.shareholders || [], ['姓名/公司名称', '身份证号/统一社会信用代码', '持股比例(%)', '认缴出资额']);
  html += _buildPersonSection('directors', '董事信息', c.directors || [], ['姓名', '身份证号']);
  html += _buildPersonSection('supervisors', '监事信息', c.supervisors || [], ['姓名', '身份证号']);
  html += _buildPersonSection('finance_contacts', '财务负责人', c.finance_contacts || [], ['姓名', '身份证号']);

  html += '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="saveCompanyDetail()">保存</button>' +
    '</div>';
  showModal(html);
}

function _buildPersonSection(key, title, items, headers) {
  let h = '<div style="margin-top:16px"><strong>' + title + '</strong>';
  h += '<table style="width:100%;margin-top:8px;border-collapse:collapse" id="tbl-' + key + '"><thead><tr>';
  for (const th of headers) { h += '<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:13px">' + th + '</th>'; }
  h += '<th style="width:50px"></th></tr></thead><tbody></tbody></table>';
  h += '<button type="button" class="btn btn-sm btn-secondary" style="margin-top:8px" onclick="addPersonRow(\'' + key + '\', ' + JSON.stringify(headers) + ')">＋ 添加</button>';
  h += '</div>';
  setTimeout(function() {
    for (const item of items) { addPersonRow(key, headers, item); }
  }, 10);
  return h;
}

function addPersonRow(key, headers, data) {
  data = data || {};
  const tbody = document.querySelector('#tbl-' + key + ' tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  let h = '';
  for (const th of headers) {
    const fk = th === '持股比例(%)' ? 'ratio' : th === '认缴出资额' ? 'contribution_amount' : th === '联系电话' ? 'phone' : (th === '身份证号' || th === '身份证号/统一社会信用代码') ? 'id_number' : 'name';
    h += '<td style="padding:4px 8px"><input class="form-control" value="' + (data[fk] || '') + '" style="font-size:13px"></td>';
  }
  h += '<td><button class="btn btn-sm btn-danger" onclick="this.closest(\'tr\').remove()" style="padding:2px 8px">×</button></td>';
  tr.innerHTML = h;
  tbody.appendChild(tr);
}

function _collectPersonData(key, headers) {
  const tbody = document.querySelector('#tbl-' + key + ' tbody');
  if (!tbody) return [];
  const items = [];
  tbody.querySelectorAll('tr').forEach(function(tr) {
    const item = {};
    const inputs = tr.querySelectorAll('input');
    headers.forEach(function(th, i) {
      const fk = th === '持股比例(%)' ? 'ratio' : th === '认缴出资额' ? 'contribution_amount' : th === '联系电话' ? 'phone' : (th === '身份证号' || th === '身份证号/统一社会信用代码') ? 'id_number' : 'name';
      let val = inputs[i] ? inputs[i].value.trim() : '';
      if (fk === 'ratio' || fk === 'contribution_amount') val = parseFloat(val) || null;
      item[fk] = val || null;
    });
    if (item.name) items.push(item);
  });
  return items;
}

async function saveCompanyDetail() {
  const form = document.getElementById('company-edit-form');
  const body = {};
  new FormData(form).forEach(function(v, k) { if (v) body[k] = v; });
  if (body.registered_capital) body.registered_capital = parseFloat(body.registered_capital);

  body.shareholders = _collectPersonData('shareholders', ['姓名/公司名称', '身份证号/统一社会信用代码', '持股比例(%)', '认缴出资额']);
  body.directors = _collectPersonData('directors', ['姓名', '身份证号']);
  body.supervisors = _collectPersonData('supervisors', ['姓名', '身份证号']);
  body.finance_contacts = _collectPersonData('finance_contacts', ['姓名', '身份证号']);

  try {
    await fetch('/api/company?company_id=' + currentCompanyId, {
      method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    closeModal();
    toast('保存成功', 'success');
    showCompanyManager(container);
  } catch(e) { toast(e.message, 'error'); }
}
async function deleteCompany(id) {
  if (!confirm('\u786e\u8ba4\u5220\u9664\u8be5\u516c\u53f8\u8d26\u5957\uff1f\u6b64\u64cd\u4f5c\u4e0d\u53ef\u6062\u590d\uff01')) return;
  try {
    await fetch('/api/companies/' + id, { method: 'DELETE' });
    toast('\u5220\u9664\u6210\u529f', 'success');
    // 如果删除的是当前账套，退出到公司选择页
    if (id === currentCompanyId) {
      localStorage.removeItem('lastCompanyId');
      localStorage.removeItem('lastCompanyName');
      localStorage.removeItem('lastPage');
      currentCompanyId = 1;
      currentCompanyName = '';
      const companies = await loadCompaniesRaw();
      window._companiesForPick = companies || [];
      showCompanyPick(companies);
      return;
    }
    await loadCompanies();
    showCompanyManager(container);
  } catch (e) {
    toast(e.message, 'error');
  }
}

