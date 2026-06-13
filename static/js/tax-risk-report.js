// ==================== 涉税风险分析报告 ====================
var taxRiskReportData = null;
var taxRiskLoading = false;

function renderTaxRiskReport(container) {
  window.currentModule = '涉税风险分析报告';

  container.innerHTML = ''
    + '<div class="risk-report-container">'
    + '<div class="risk-report-header">'
    + '<h2>涉税风险分析报告</h2>'
    + '<p class="risk-report-subtitle">基于账务数据、发票合规、税负水平、成本结构、政策执行等维度综合分析</p>'
    + '<div id="tr-period-bar" style="display:flex;align-items:center;gap:4px;margin-top:12px"></div>'
    + '</div>'
    // 涉税资料上传区
    + '<div id="risk-docs-section" style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:12px 16px;margin-bottom:16px">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
    + '<span style="font-weight:600;font-size:14px">上传涉税分析资料</span>'
    + '<div style="display:flex;gap:8px">'
    + '<label class="btn-toolbar" style="background:var(--blue-500);color:#fff;border-color:var(--blue-500);cursor:pointer">'
    + '<input type="file" id="risk-docs-input" multiple style="display:none" onchange="uploadRiskDocs()">上传资料</label>'
    + '<button class="btn-toolbar" onclick="analyzeAllRiskDocs()" style="background:#059669;color:#fff">一键分析资料</button>'
    + '</div></div>'
    + '<div id="risk-docs-list" style="font-size:12px;color:var(--gray-500)">暂无上传资料</div>'
    + '</div>'
    + '<div id="risk-summary-cards" class="risk-summary-cards"></div>'
    + '<div id="risk-report-body" class="risk-report-body"></div>'
    + '<div id="risk-docs-report"></div>'
    + '</div>';

  // 构建标准期间栏 + 按钮：清除 → 生成/刷新 → 下载 → 删除
  setTimeout(function() {
    _buildStandardPeriodBar('tr-', {
      onQuery: loadTaxRiskReport,
      onClear: function() {
        taxRiskReportData = null;
        document.getElementById('risk-report-body').innerHTML = '';
        document.getElementById('risk-summary-cards').innerHTML = '';
      }
    });
    var trBar = document.getElementById('tr-period-bar');
    if (!trBar) return;
    var clearBtn = trBar.querySelector('.std-clear-btn');
    if (!clearBtn) return;

    // 生成/刷新按钮
    var refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn-toolbar';
    refreshBtn.id = 'risk-refresh-btn';
    refreshBtn.textContent = '生成/刷新报告';
    refreshBtn.addEventListener('click', loadTaxRiskReport);
    clearBtn.parentNode.insertBefore(refreshBtn, clearBtn.nextSibling);

    // 下载按钮
    var downloadWrap = document.createElement('span');
    downloadWrap.innerHTML = '<div class="download-dropdown" style="display:inline-block;position:relative">'
      + '<button class="btn-toolbar" id="risk-download-btn" style="display:none">下载报告</button>'
      + '<div class="download-menu" style="display:none;position:absolute;top:100%;right:0;background:#fff;border:1px solid var(--gray-200);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:100;min-width:120px">'
      + '<div data-fmt="pdf" style="padding:8px 16px;cursor:pointer" onmouseover="this.style.background=\'var(--gray-50)\'" onmouseout="this.style.background=\'\'">PDF 下载</div>'
      + '<div data-fmt="docx" style="padding:8px 16px;cursor:pointer" onmouseover="this.style.background=\'var(--gray-50)\'" onmouseout="this.style.background=\'\'">Word 下载</div>'
      + '<div data-fmt="pptx" style="padding:8px 16px;cursor:pointer" onmouseover="this.style.background=\'var(--gray-50)\'" onmouseout="this.style.background=\'\'">PPT 下载</div>'
      + '</div></div>';
    clearBtn.parentNode.insertBefore(downloadWrap, refreshBtn.nextSibling);

    // 删除按钮
    var deleteWrap = document.createElement('span');
    deleteWrap.id = 'risk-delete-btn-wrap';
    deleteWrap.style.display = 'none';
    deleteWrap.innerHTML = '<button class="btn-toolbar" id="risk-delete-btn" style="color:#dc2626;border-color:#fca5a5;background:#fef2f2">删除报告</button>';
    clearBtn.parentNode.insertBefore(deleteWrap, downloadWrap.nextSibling);

    // 最后更新时间
    var spacer = document.createElement('span');
    spacer.style.marginLeft = '8px';
    spacer.innerHTML = '<span id="risk-last-update" style="color:var(--gray-400);font-size:12px"></span>';
    trBar.appendChild(spacer);

    // 下载按钮下拉菜单
    var downloadBtn = document.getElementById('risk-download-btn');
    var downloadMenu = trBar.querySelector('.download-menu');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (downloadMenu) downloadMenu.style.display = downloadMenu.style.display === 'block' ? 'none' : 'block';
      });
    }
    if (downloadMenu) {
      downloadMenu.querySelectorAll('[data-fmt]').forEach(function(item) {
        item.addEventListener('click', function(e) {
          e.stopPropagation();
          downloadMenu.style.display = 'none';
          downloadTaxRiskReport(item.getAttribute('data-fmt'));
        });
      });
    }
    document.addEventListener('click', function() { if (downloadMenu) downloadMenu.style.display = 'none'; });

    // 删除按钮事件
    var delBtn = document.getElementById('risk-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', function() {
        if (!confirm('确定要删除当前报告吗？')) return;
        taxRiskReportData = null;
        document.getElementById('risk-report-body').innerHTML = '';
        document.getElementById('risk-summary-cards').innerHTML = '';
        document.getElementById('risk-delete-btn-wrap').style.display = 'none';
        if (downloadBtn) downloadBtn.style.display = 'none';
        toast('报告已删除', 'success');
      });
    }
  }, 100);

  // 自动加载
  if (!taxRiskReportData) {
    loadTaxRiskReport();
  } else {
    renderTaxRiskReportData(taxRiskReportData);
  }
}

async function loadTaxRiskReport() {
  if (taxRiskLoading) return;
  taxRiskLoading = true;
  var btn = document.getElementById('risk-refresh-btn');
  var icon = document.getElementById('risk-refresh-icon');
  if (btn) { btn.disabled = true; }
  if (icon) { icon.className = 'spin'; icon.textContent = '⏳'; }

  try {
    // 从期间选择器获取值
    var fy = document.getElementById('tr-from-y');
    var fm = document.getElementById('tr-from-m');
    var ty = document.getElementById('tr-to-y');
    var tm = document.getElementById('tr-to-m');
    var from = ((fy && fy.value) || '2025') + '-' + ((fm && fm.value) || '01');
    var to = ((ty && ty.value) || '2025') + '-' + ((tm && tm.value) || '12');
    var url = '/api/tax-risk/report?company_id=' + (typeof currentCompanyId !== 'undefined' ? currentCompanyId : 1) + '&period_from=' + from + '&period_to=' + to;
    taxRiskReportData = await api(url);
    renderTaxRiskReportData(taxRiskReportData);
    // 报告生成后显示下载和删除按钮
    var dw = document.getElementById('risk-delete-btn-wrap');
    if (dw) dw.style.display = '';
    var db = document.getElementById('risk-download-btn');
    if (db) db.style.display = '';
    var now = new Date();
    var ts = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0')
      + '-' + String(now.getDate()).padStart(2,'0') + ' '
      + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    var el = document.getElementById('risk-last-update');
    if (el) el.textContent = '最近更新: ' + ts;
  } catch (err) {
    toast('风险报告加载失败: ' + (err.message || err), 'error');
  } finally {
    taxRiskLoading = false;
    if (btn) { btn.disabled = false; }
    if (icon) { icon.className = ''; icon.textContent = '🔄'; }
  }
}

function renderTaxRiskReportData(data) {
  if (!data || !data.results) {
    document.getElementById('risk-report-body').innerHTML
      = '<div class="risk-empty">暂无风险分析数据，请点击「生成报告」</div>';
    return;
  }

  // 汇总卡片
  renderSummaryCards(data.summary, data.period_start, data.period_end);

  // 分类渲染
  var body = document.getElementById('risk-report-body');
  var categories = {};
  for (var i = 0; i < data.results.length; i++) {
    var r = data.results[i];
    var cat = r.category || '其他';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r);
  }

  var catOrder = ['良好实践', '账务数据', '发票合规', '成本结构', '税负水平', '政策执行', '资金与往来', '薪酬合规'];
  var html = '';

  for (var c = 0; c < catOrder.length; c++) {
    var catName = catOrder[c];
    var items = categories[catName];
    if (!items || items.length === 0) continue;
    html += renderCategorySection(catName, items);
  }

  // 若有未出现在 catOrder 的分类
  for (var cat in categories) {
    if (catOrder.indexOf(cat) >= 0) continue;
    html += renderCategorySection(cat, categories[cat]);
  }

  body.innerHTML = html || '<div class="risk-empty">未发现明显风险事项</div>';
}

function renderSummaryCards(summary, ps, pe) {
  var el = document.getElementById('risk-summary-cards');
  if (!el || !summary) return;

  var levelColor = {
    '高风险': '#dc2626', '中风险': '#f59e0b',
    '低风险': '#3b82f6', '良好': '#10b981'
  };
  var levelBg = {
    '高风险': '#fef2f2', '中风险': '#fffbeb',
    '低风险': '#eff6ff', '良好': '#ecfdf5'
  };
  var overall = summary.overall_risk_level || '良好';

  el.innerHTML = ''
    + '<div class="risk-card overall" style="border-color:' + (levelColor[overall] || '#10b981') + ';background:' + (levelBg[overall] || '#ecfdf5') + '">'
    + '<div class="risk-card-label">综合风险等级</div>'
    + '<div class="risk-card-value" style="color:' + (levelColor[overall] || '#10b981') + '">' + overall + '</div>'
    + '<div class="risk-card-sub">分析期间：' + escapeHtml(ps || '-') + ' ~ ' + escapeHtml(pe || '-') + '</div>'
    + '</div>'
    + '<div class="risk-card high" style="border-color:#dc2626">'
    + '<div class="risk-card-label">高风险</div>'
    + '<div class="risk-card-value" style="color:#dc2626">' + (summary.high_risk_count || 0) + '</div>'
    + '<div class="risk-card-sub">项</div></div>'
    + '<div class="risk-card mid" style="border-color:#f59e0b">'
    + '<div class="risk-card-label">中风险</div>'
    + '<div class="risk-card-value" style="color:#f59e0b">' + (summary.mid_risk_count || 0) + '</div>'
    + '<div class="risk-card-sub">项</div></div>'
    + '<div class="risk-card low" style="border-color:#3b82f6">'
    + '<div class="risk-card-label">低风险</div>'
    + '<div class="risk-card-value" style="color:#3b82f6">' + (summary.low_risk_count || 0) + '</div>'
    + '<div class="risk-card-sub">项</div></div>'
    + '<div class="risk-card good" style="border-color:#10b981">'
    + '<div class="risk-card-label">良好事项</div>'
    + '<div class="risk-card-value" style="color:#10b981">' + (summary.good_count || 0) + '</div>'
    + '<div class="risk-card-sub">项</div></div>'
    + '<div class="risk-card total" style="border-color:#6b7280">'
    + '<div class="risk-card-label">总计检查项</div>'
    + '<div class="risk-card-value" style="color:#6b7280">' + (summary.total_items || 0) + '</div>'
    + '<div class="risk-card-sub">项</div></div>';
}

function renderCategorySection(catName, items) {
  var icon = items[0] ? (items[0].category_icon || '📋') : '📋';
  var h = '<div class="risk-category">';
  h += '<div class="risk-category-header"><span class="risk-cat-icon">' + icon + '</span> ' + escapeHtml(catName) + ' <span class="risk-cat-count">' + items.length + '项</span></div>';
  for (var i = 0; i < items.length; i++) {
    h += renderRiskItem(items[i], i);
  }
  h += '</div>';
  return h;
}

function renderRiskItem(r, idx) {
  var urgencyBadge = '';
  if (r.urgency === '紧急') {
    urgencyBadge = '<span class="urgency-badge urgent">紧急</span>';
  } else if (r.urgency === '提醒') {
    urgencyBadge = '<span class="urgency-badge warning">提醒</span>';
  } else if (r.urgency === '建议') {
    urgencyBadge = '<span class="urgency-badge suggest">建议</span>';
  }

  var levelClass = '';
  if (r.risk_level === '高风险') levelClass = 'item-high';
  else if (r.risk_level === '中风险') levelClass = 'item-mid';
  else if (r.risk_level === '低风险') levelClass = 'item-low';
  else if (r.risk_level === '良好') levelClass = 'item-good';

  return '<div class="risk-item ' + levelClass + '">'
    + '<div class="risk-item-header">'
    + '<span class="risk-item-level" style="background:' + (r.risk_color || '#6b7280') + '">' + escapeHtml(r.risk_level) + '</span>'
    + '<span class="risk-item-title">' + escapeHtml(r.item) + '</span>'
    + urgencyBadge
    + '</div>'
    + '<div class="risk-item-detail">' + escapeHtml(r.detail) + '</div>'
    + '<div class="risk-item-suggestion">'
    + '<span class="suggestion-label">💡 建议：</span>' + escapeHtml(r.suggestion)
    + '</div>'
    + '</div>';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function downloadTaxRiskReport(format) {
  if (!taxRiskReportData) { toast('请先生成报告', 'error'); return; }
  var cid = typeof currentCompanyId !== 'undefined' ? currentCompanyId : 1;
  var url = '/api/tax-risk/download-report?company_id=' + cid + '&format=' + format;
  // 使用 hidden iframe 触发下载
  var iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  setTimeout(function() { document.body.removeChild(iframe); }, 5000);
  toast('报告下载中...', 'success');
}

// ── 涉税资料上传与分析 ──

function refreshRiskDocsList() {
  api('/api/tax-risk-docs/list').then(function(docs) {
    var el = document.getElementById('risk-docs-list');
    if (!el) return;
    if (!docs || docs.length === 0) {
      el.innerHTML = '暂无上传资料';
      return;
    }
    el.innerHTML = docs.map(function(d) {
      var size = d.size > 1024 ? (d.size/1024).toFixed(1)+'KB' : d.size+'B';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9">'
        + '<span>' + escapeHtml(d.original_name) + ' <span style="color:var(--gray-400)">' + size + '</span></span>'
        + '<span style="color:var(--gray-400);font-size:11px">' + d.uploaded_at.substring(0,10) + '</span>'
        + '<span style="color:#dc2626;cursor:pointer;font-size:11px" onclick="delRiskDoc(' + d.id + ')">删除</span>'
        + '</div>';
    }).join('');
  }).catch(function(e) { console.error(e); });
}

function uploadRiskDocs() {
  var input = document.getElementById('risk-docs-input');
  if (!input || !input.files.length) return;
  var form = new FormData();
  for (var i = 0; i < input.files.length; i++) {
    form.append('files', input.files[i]);
  }
  api('/api/tax-risk-docs/upload', { method: 'POST', body: form }).then(function(r) {
    if (r.ok) { toast('已上传 ' + r.uploaded.length + ' 个文件', 'success'); refreshRiskDocsList(); }
    input.value = '';
  }).catch(function(e) { toast('上传失败', 'error'); });
}

function delRiskDoc(id) {
  if (!confirm('确定删除此文件？')) return;
  api('/api/tax-risk-docs/' + id, { method: 'DELETE' }).then(function(r) {
    if (r.ok) { toast('已删除', 'success'); refreshRiskDocsList(); }
  });
}

function analyzeAllRiskDocs() {
  var btn = event.target;
  btn.disabled = true;
  btn.textContent = '分析中...';
  var reportDiv = document.getElementById('risk-docs-report');
  if (reportDiv) reportDiv.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400)">分析中，请稍候...</div>';

  api('/api/tax-risk-docs/analyze', { method: 'POST' }).then(function(r) {
    btn.disabled = false;
    btn.textContent = '一键分析资料';
    if (!r.ok) { toast(r.message || '分析失败', 'error'); return; }
    renderDocsReport(r.report);
  }).catch(function(e) {
    btn.disabled = false;
    btn.textContent = '一键分析资料';
    toast('分析失败', 'error');
  });
}

function renderDocsReport(rpt) {
  var reportDiv = document.getElementById('risk-docs-report');
  if (!reportDiv || !rpt) return;

  var lc = rpt.overall_level === '高风险' ? '#dc2626' : (rpt.overall_level === '中风险' ? '#f59e0b' : '#059669');
  var lb = rpt.overall_level === '高风险' ? '#fef2f2' : (rpt.overall_level === '中风险' ? '#fffbeb' : '#ecfdf5');

  var html = '<div style="background:#fff;border:1px solid var(--gray-200);border-radius:8px;padding:20px;margin-top:16px">'
    + '<div style="border-bottom:2px solid var(--gray-100);padding-bottom:16px;margin-bottom:16px">'
    + '<h2 style="margin:0 0 8px 0;font-size:20px">资料综合涉税风险分析报告</h2>'
    + '<p style="margin:4px 0;color:var(--gray-500);font-size:13px">'
    + '分析 ' + rpt.files_count + ' 份文件 / 使用 ' + rpt.rules_used + ' 条规则 / 识别 ' + rpt.total_risks + ' 项风险</p>'
    + '<div style="display:flex;gap:16px;align-items:center;margin-top:12px">'
    + '<span>综合风险等级：</span>'
    + '<span style="display:inline-block;padding:4px 16px;background:' + lb + ';color:' + lc + ';border-radius:6px;font-weight:700;font-size:16px">' + rpt.overall_level + '</span>'
    + '</div></div>'
    + '<div style="background:#f8fafc;border-radius:6px;padding:12px 16px;margin-bottom:16px">'
    + '<b>综合分析摘要</b><p style="margin:8px 0 0 0;font-size:13px;color:var(--gray-600);line-height:1.6">' + escapeHtml(rpt.summary_text || '') + '</p></div>'
    + '<div style="display:flex;gap:12px;margin-bottom:16px">'
    + '<div style="flex:1;background:#fef2f2;border-radius:6px;padding:12px;text-align:center"><div style="font-size:24px;font-weight:700;color:#dc2626">' + rpt.high_risk + '</div><div style="font-size:12px">高风险</div></div>'
    + '<div style="flex:1;background:#fffbeb;border-radius:6px;padding:12px;text-align:center"><div style="font-size:24px;font-weight:700;color:#f59e0b">' + rpt.mid_risk + '</div><div style="font-size:12px">中风险</div></div>'
    + '<div style="flex:1;background:#ecfdf5;border-radius:6px;padding:12px;text-align:center"><div style="font-size:24px;font-weight:700;color:#059669">' + rpt.low_risk + '</div><div style="font-size:12px">低风险</div></div>'
    + '</div>';

  // 阶段2: 统计表格
  if (rpt.stats && Object.keys(rpt.stats).length > 0) {
    html += '<div style="margin:16px 0"><b style="font-size:15px">数据统计分析</b></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:12px">';
    Object.keys(rpt.stats).forEach(function(k) {
      html += '<div style="background:#f8fafc;border-radius:6px;padding:8px 12px;text-align:center"><div style="font-size:11px;color:var(--gray-500)">' + escapeHtml(k) + '</div><div style="font-size:16px;font-weight:700">' + escapeHtml(String(rpt.stats[k])) + '</div></div>';
    });
    html += '</div>';
  }

  // 阶段3: 交叉比对
  if (rpt.cross_findings && rpt.cross_findings.length > 0) {
    html += '<div style="margin:16px 0"><b style="font-size:15px">数据交叉比对发现</b></div>';
    rpt.cross_findings.forEach(function(f) {
      var cfColor = f.level === '高风险' ? '#dc2626' : (f.level === '中风险' ? '#f59e0b' : '#059669');
      html += '<div style="margin-bottom:6px;padding:10px 12px;background:#f0f9ff;border-left:3px solid #3b82f6;border-radius:4px">'
        + '<span style="display:inline-block;padding:1px 6px;background:' + cfColor + ';color:#fff;border-radius:3px;font-size:11px;margin-right:8px">' + f.level + '</span>'
        + '<b>' + escapeHtml(f.type || '') + '</b>'
        + '<div style="font-size:12px;color:var(--gray-600);margin-top:4px">' + escapeHtml(f.detail || '') + '</div>'
        + '</div>';
    });
  }

  // 阶段4: 详细发现
  html += '<div style="margin:16px 0"><b style="font-size:15px">详细风险发现（按风险程度排序）</b></div>';
  if (rpt.all_findings && rpt.all_findings.length > 0) {
    rpt.all_findings.forEach(function(f, i) {
      var color = f.level === '高风险' ? '#dc2626' : (f.level === '中风险' ? '#f59e0b' : '#6b7280');
      var bg = f.level === '高风险' ? '#fef2f2' : (f.level === '中风险' ? '#fffbeb' : '#f9fafb');
      var border = f.level === '高风险' ? '#fecaca' : (f.level === '中风险' ? '#fde68a' : '#e5e7eb');
      html += '<div style="margin-bottom:8px;padding:12px;background:' + bg + ';border-left:3px solid ' + border + ';border-radius:4px">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        + '<span style="font-weight:700">#' + (i+1) + '</span>'
        + '<span style="display:inline-block;padding:1px 8px;background:' + color + ';color:#fff;border-radius:3px;font-size:11px">' + f.level + '</span>'
        + '<span style="font-size:11px;color:var(--gray-400)">规则ID:' + (f.rule_id || '-') + ' | 分:' + (f.score || '-') + '</span>'
        + '</div>'
        + '<div style="font-weight:600;font-size:14px;margin-bottom:4px">' + escapeHtml(f.item || '') + '</div>'
        + '<div style="font-size:12px;color:var(--gray-500)">' + escapeHtml((f.detail || '').substring(0,150)) + '</div>'
        + '<div style="font-size:11px;color:var(--gray-400);margin-top:4px">关键词: ' + (f.keywords || []).join(' / ') + '</div>'
        + '</div>';
    });
  } else {
    html += '<p style="color:var(--gray-400);text-align:center;padding:20px">未发现涉税风险线索</p>';
  }

  html += '</div>';
  reportDiv.innerHTML = html;
}

setTimeout(refreshRiskDocsList, 500);
