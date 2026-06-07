// ==================== 社会保险费页面 ====================
let ssDeclarations = [];
let ssFilterPeriod = '';

// ==================== 主渲染（列表页） ====================
async function renderSocialSecurity(container) {
  const el = container || document.getElementById('content-area');
  if (!el) return;
    el.innerHTML = '<div id="ss-stats-row" style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px"></div>'
    + '<div class="toolbar"><div class="toolbar-left">'
    + '<button class="btn btn-primary" onclick="showSSCreateModal()">＋ 新建申报</button> '
    + '<button class="btn btn-outline" onclick="showSSImportModal()">导入Excel</button>'
    + '<button class="btn btn-info" onclick="generateSSPaymentVoucher()" style="background:#7c3aed">⚡ 生成缴纳凭证</button>'
    + '</div>'
    + '<div class="toolbar-right"><input type="month" class="form-control" id="ss-filter-period" value="' + ssFilterPeriod + '" onchange="ssFilterPeriod=this.value;renderSocialSecurity()" style="width:160px" placeholder="选择期间"></div></div>'
    + '<div id="ss-list-table"></div>'
    + '<div id="ss-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeSSModal()"><div class="modal modal-xl" id="ss-modal-inner" style="max-width:1200px"></div></div>';
  await loadSSDeclarationList();
}

// ==================== 列表加载 ====================
async function loadSSDeclarationList() {
  try {
    let url = '/api/social-security/declarations';
    if (ssFilterPeriod) url += '?period=' + encodeURIComponent(ssFilterPeriod);
    const res = await api(url);
    ssDeclarations = res.items || [];
  } catch (e) { ssDeclarations = []; handleError(e, '加载社会保险费'); }
  renderSSStats();
  renderSSTable();
}

async function renderSSStats() {
  const el = document.getElementById('ss-stats-row'); if (!el) return;
  let stats = { total_declarations: ssDeclarations.length, total_details: 0, total_company_amount: 0, total_personal_amount: 0, total_amount: 0 };
  try {
    const url = '/api/social-security/stats' + (ssFilterPeriod ? '?period=' + encodeURIComponent(ssFilterPeriod) : '');
    const res = await api(url);
    stats = res;
  } catch (e) { /* use defaults */ }
  el.innerHTML = '<div class="stat-card"><div class="stat-label">申报记录</div><div class="stat-value">' + stats.total_declarations + '</div><div class="stat-sub">份申报表</div></div>'
    + '<div class="stat-card"><div class="stat-label">参保人数</div><div class="stat-value">' + stats.total_details + '</div><div class="stat-sub">人次</div></div>'
    + '<div class="stat-card"><div class="stat-label">单位缴纳</div><div class="stat-value" style="color:#db2777">' + fmt(stats.total_company_amount) + '</div><div class="stat-sub">合计</div></div>'
    + '<div class="stat-card"><div class="stat-label">个人缴纳</div><div class="stat-value" style="color:#d97706">' + fmt(stats.total_personal_amount) + '</div><div class="stat-sub">合计</div></div>'
    + '<div class="stat-card"><div class="stat-label">应收合计</div><div class="stat-value" style="color:#059669">' + fmt(stats.total_amount) + '</div><div class="stat-sub">单位+个人</div></div>';
}

function renderSSTable() {
  const el = document.getElementById('ss-list-table'); if (!el) return;
  let html = '<div class="table-wrap"><table class="data-table"><thead><tr><th>税款所属期</th><th>参保人数</th><th>状态</th><th>备注</th><th>更新时间</th><th>操作</th></tr></thead><tbody>';
  if (ssDeclarations.length === 0) {
    html += '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af">暂无申报记录，点击「＋ 新建申报」或「导入Excel」创建</td></tr>';
  } else {
    ssDeclarations.forEach(d => {
      const badge = {'草稿':'<span class="badge badge-draft">草稿</span>','已确认':'<span class="badge badge-posted">已确认</span>'}[d.status] || d.status;
      html += '<tr><td><strong>' + escapeHtml(d.period) + '</strong></td>'
        + '<td>' + (d.detail_count || 0) + ' 人</td>'
        + '<td>' + badge + '</td>'
        + '<td>' + escapeHtml(d.note || '-') + '</td>'
        + '<td>' + (d.updated_at ? new Date(d.updated_at).toLocaleString('zh-CN') : '-') + '</td>'
        + '<td class="col-action"><button class="btn btn-sm btn-outline" onclick="openSSDetail(' + d.id + ')">📋 查看详情</button> '
        + '<button class="btn btn-sm btn-info" onclick="generateSSAccrualJournal(' + d.id + ')" style="background:#10b981;color:#fff">📝 生成计提凭证</button> '
        + '<button class="btn btn-sm btn-danger" onclick="deleteSSDeclaration(' + d.id + ',\'' + escJs(d.period) + '\')">🗑</button></td></tr>';
    });
  }
  html += '</tbody></table></div>'; el.innerHTML = html;
}

// ==================== 新建 ====================
function showSSCreateModal() {
  const now = new Date();
  const defaultPeriod = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('ss-modal').style.display = 'flex';
  document.getElementById('ss-modal-inner').innerHTML = '<h2 style="margin:0 0 20px 0;font-size:18px">＋ 新建社会保险费</h2>'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">费款所属期 <span style="color:red">*</span></label>'
    + '<input type="month" class="form-control" id="ss-period" value="' + defaultPeriod + '" style="width:200px"></div>'
    + '<div class="form-group" style="margin-top:12px"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">备注</label>'
    + '<input type="text" class="form-control" id="ss-note" placeholder="可选" style="width:100%"></div>'
    + '<div style="margin-top:24px;display:flex;gap:10px;justify-content:flex-end">'
    + '<button class="btn btn-outline" onclick="closeSSModal()">取消</button>'
    + '<button class="btn btn-primary" onclick="createSSDeclaration()">保存</button></div>';
}

async function createSSDeclaration() {
  const period = document.getElementById('ss-period')?.value;
  const note = document.getElementById('ss-note')?.value;
  if (!period) { alert('请选择费款所属期'); return; }
  try {
    await api('/api/social-security/declarations', {
      method: 'POST',
      body: JSON.stringify({ period: period, note: note || '', details: [] })
    });
    closeSSModal();
    await renderSocialSecurity();
  } catch (e) { handleError(e, '创建申报'); }
}

// ==================== 查看详情 ====================
async function openSSDetail(id) {
  try {
    const decl = await api('/api/social-security/declarations/' + id);
    if (!decl) return;

    let detailsHtml = '';
    if (decl.details && decl.details.length > 0) {
      // Group by category
      const groups = {};
      decl.details.forEach(d => {
        const cat = d.category || '在职人员';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(d);
      });

      // Insurance header names
      const insuranceNames = decl.details[0]?.insurance_items?.map(i => i.name) || [];

      detailsHtml = '<div style="overflow-x:auto">';
      for (const [cat, items] of Object.entries(groups)) {
        const catTotal = items.reduce((s, d) => s + (d.total_amount || 0), 0);
        const catPersonal = items.reduce((s, d) => s + (d.personal_amount || 0), 0);
        const catCompany = items.reduce((s, d) => s + (d.company_amount || 0), 0);

        detailsHtml += '<h4 style="margin:16px 0 8px;padding:8px 12px;background:#f3f4f6;border-radius:4px">' + escapeHtml(cat) + '（' + items.length + ' 人，应收合计 ' + fmt(catTotal) + '）</h4>';
        detailsHtml += '<table class="data-table" style="font-size:12px"><thead><tr>'
          + '<th>序号</th><th>姓名</th><th>证件号码</th><th>所属期</th><th>缴费工资</th><th>个人合计</th><th>单位合计</th><th>应收金额</th>';
        // Insurance items columns
        if (insuranceNames.length > 0) {
          insuranceNames.forEach(name => {
            detailsHtml += '<th>' + escapeHtml(name) + '</th>';
          });
        }
        detailsHtml += '</tr></thead><tbody>';
        items.forEach(d => {
          const periodStr = (d.period_start || '') + '~' + (d.period_end || '');
          detailsHtml += '<tr>'
            + '<td>' + (d.seq || '') + '</td>'
            + '<td>' + escapeHtml(d.employee_name || '') + '</td>'
            + '<td>' + escapeHtml(d.id_number || '') + '</td>'
            + '<td>' + escapeHtml(periodStr) + '</td>'
            + '<td class="num">' + fmt(d.salary_base) + '</td>'
            + '<td class="num" style="color:#d97706">' + fmt(d.personal_amount) + '</td>'
            + '<td class="num" style="color:#db2777">' + fmt(d.company_amount) + '</td>'
            + '<td class="num" style="font-weight:600">' + fmt(d.total_amount) + '</td>';
          if (insuranceNames.length > 0) {
            insuranceNames.forEach(name => {
              const item = (d.insurance_items || []).find(i => i.name === name);
              detailsHtml += '<td class="num">' + (item ? fmt(item.amount) : '-') + '</td>';
            });
          }
          detailsHtml += '</tr>';
        });
        // Subtotal row
        detailsHtml += '<tr style="font-weight:600;background:#f9fafb">'
          + '<td colspan="4">小计</td>'
          + '<td class="num">-</td>'
          + '<td class="num" style="color:#d97706">' + fmt(catPersonal) + '</td>'
          + '<td class="num" style="color:#db2777">' + fmt(catCompany) + '</td>'
          + '<td class="num">' + fmt(catTotal) + '</td>';
        if (insuranceNames.length > 0) {
          insuranceNames.forEach(name => {
            const totalAmt = items.reduce((s, d) => {
              const item = (d.insurance_items || []).find(i => i.name === name);
              return s + (item ? item.amount : 0);
            }, 0);
            detailsHtml += '<td class="num">' + fmt(totalAmt) + '</td>';
          });
        }
        detailsHtml += '</tr>';
        detailsHtml += '</tbody></table>';
      }
      detailsHtml += '</div>';
    } else {
      detailsHtml = '<div style="text-align:center;padding:40px;color:#9ca3af">暂无申报明细，请通过导入Excel添加</div>';
    }

    document.getElementById('ss-modal').style.display = 'flex';
    document.getElementById('ss-modal-inner').innerHTML = '<h2 style="margin:0 0 12px 0;font-size:18px">📋 社会保险费详情 — ' + escapeHtml(decl.period) + '</h2>'
      + '<div style="display:flex;gap:12px;margin-bottom:16px;align-items:center">'
      + '<span class="badge ' + (decl.status === '已确认' ? 'badge-posted' : 'badge-draft') + '">' + escapeHtml(decl.status) + '</span>'
      + '<span style="color:#6b7280;font-size:13px">' + (decl.note ? '备注：' + escapeHtml(decl.note) : '') + '</span>'
      + '</div>'
      + detailsHtml
      + '<div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end">'
      + '<button class="btn btn-outline" onclick="closeSSModal()">关闭</button></div>';
  } catch (e) { handleError(e, '加载详情'); }
}

// ==================== 删除 ====================
async function deleteSSDeclaration(id, period) {
  if (!confirm('确定要删除 ' + period + ' 的社会保险费记录？')) return;
  try {
    await api('/api/social-security/declarations/' + id, { method: 'DELETE' });
    await renderSocialSecurity();
  } catch (e) { handleError(e, '删除申报'); }
}

// ==================== 导入 Excel ====================
function showSSImportModal() {
  const defaultPeriod = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  document.getElementById('ss-modal').style.display = 'flex';
  document.getElementById('ss-modal-inner').innerHTML = '<h2 style="margin:0 0 20px 0;font-size:18px">导入社会保险费Excel</h2>'
    + '<div style="margin-bottom:16px;padding:12px;background:#fef3c7;border-radius:6px;font-size:13px;color:#92400e">'
    + '支持"日常申报明细表"格式的Excel文件（.xlsx / .xls）</div>'
    + '<div class="form-group"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">费款所属期 <span style="color:red">*</span></label>'
    + '<input type="month" class="form-control" id="ss-import-period" value="' + defaultPeriod + '" style="width:200px"></div>'
    + '<div class="form-group" style="margin-top:12px"><label class="form-label" style="display:block;margin-bottom:4px;font-size:13px">选择文件 <span style="color:red">*</span></label>'
    + '<input type="file" class="form-control" id="ss-import-file" accept=".xlsx,.xls" style="width:100%"></div>'
    + '<div id="ss-import-result" style="margin-top:12px"></div>'
    + '<div style="margin-top:24px;display:flex;gap:10px;justify-content:flex-end">'
    + '<button class="btn btn-outline" onclick="closeSSModal()">取消</button>'
    + '<button class="btn btn-primary" onclick="doSSImport()">开始导入</button></div>';
}

async function doSSImport() {
  const period = document.getElementById('ss-import-period')?.value;
  const fileInput = document.getElementById('ss-import-file');
  const resultEl = document.getElementById('ss-import-result');

  if (!period) { alert('请选择费款所属期'); return; }
  if (!fileInput?.files?.length) { alert('请选择文件'); return; }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  resultEl.innerHTML = '<div style="padding:8px;color:#6b7280">⏳ 正在导入...</div>';
  try {
    const res = await api('/api/social-security/import?period=' + encodeURIComponent(period), {
      method: 'POST',
      body: formData,
      headers: {} // no Content-Type for FormData
    });
    if (res.imported > 0) {
      resultEl.innerHTML = '<div style="padding:8px;background:#ecfdf5;color:#065f46;border-radius:4px">✅ 成功导入 ' + res.imported + ' 条记录' + (res.errors?.length ? '<br><small style="color:#dc2626">警告: ' + res.errors.join('; ') + '</small>' : '') + '</div>';
      setTimeout(() => { closeSSModal(); renderSocialSecurity(); }, 1500);
    } else {
      resultEl.innerHTML = '<div style="padding:8px;background:#fef2f2;color:#dc2626;border-radius:4px">❌ 导入失败：未识别到有效数据' + (res.errors?.length ? '<br>' + res.errors.join('<br>') : '') + '</div>';
    }
  } catch (e) {
    handleError(e, '导入社会保险费');
    resultEl.innerHTML = '<div style="padding:8px;background:#fef2f2;color:#dc2626;border-radius:4px">❌ 导入失败</div>';
  }
}

// ==================== 凭证生成 ====================

async function generateSSPaymentVoucher() {
  if (!confirm('将根据银行流水智能匹配社保缴纳记录并生成凭证，确定？')) return;
  try {
    const result = await api('/api/social-security/generate-payment-journals?company_id=' + currentCompanyId, {
      method: 'POST'
    });
    alert('生成成功！共匹配 ' + (result.generated || 0) + ' 张凭证');
    // 刷新序时账
    if (typeof loadJePage === 'function') loadJePage(1);
  } catch (e) {
    alert('生成失败：' + e.message);
  }
}

async function generateSSAccrualJournal(id) {
  if (!confirm('确认为此申报表生成社保计提凭证？')) return;
  try {
    const result = await api('/api/social-security/declarations/' + id + '/generate-accrual-journal?company_id=' + currentCompanyId, {
      method: 'POST'
    });
    alert('生成成功！共 ' + (result.generated || 0) + ' 张凭证');
    // 刷新序时账
    if (typeof loadJePage === 'function') loadJePage(1);
  } catch (e) {
    alert('生成失败：' + e.message);
  }
}

// ==================== 模态框 ====================
function closeSSModal() {
  document.getElementById('ss-modal').style.display = 'none';
}
