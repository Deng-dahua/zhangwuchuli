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
    + '<div id="risk-summary-cards" class="risk-summary-cards"></div>'
    + '<div id="risk-report-body" class="risk-report-body"></div>'
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
