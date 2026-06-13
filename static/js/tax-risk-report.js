// ==================== 涉税风险分析报告 V5 ====================
// 61 个分析维度：账务数据 / 发票合规 / 发票深度 / 成本结构 / 财税票比对 /
// 配比弹性 / 隐匿虚增 / 税负水平 / 城建税 / 房产税 / 个人所得税 / 印花税 /
// 纳税调整 / 收入时点 / 政策执行 / 资金往来 / 薪酬合规 /
// 客户穿透 / 供应商穿透 / 财务健康 / 企业信用 / 行业专项 / 良好实践 /
// 经营实质(18项) / 增值税专项(5项) / 发票异常(3项) / 费用匹配(3项) /
// 企业所得税(4项) / 薪酬福利(3项) / 其他风险(2项)

var taxRiskReportData = null;
var taxRiskLoading = false;

function renderTaxRiskReport(container) {
  window.currentModule = '涉税风险分析报告';

  container.innerHTML = ''
    + '<div class="risk-report-container">'
    + '<div class="risk-report-header">'
    + '<div id="tr-period-bar" style="display:flex;align-items:center;gap:4px;margin-top:12px"></div>'
    + '</div>'
    + '<div id="risk-summary-cards" class="risk-summary-cards"></div>'
    + '<div id="risk-report-body" class="risk-report-body"></div>'
    + '</div>';

  _buildStandardPeriodBar('tr-', { onQuery: loadTaxRiskReport, onClear: function() { loadTaxRiskReport(); } });

  // 按钮顺序：清除 → 生成/刷新报告（btn-toolbar 样式）
  var trBar = document.getElementById('tr-period-bar');
  if (trBar) {
    var queryBtn = trBar.querySelector('.std-query-btn');
    if (queryBtn) queryBtn.remove();
    var clearBtn = trBar.querySelector('.std-clear-btn');
    // 在清除按钮后插入生成/刷新报告按钮
    if (clearBtn) {
      var refreshBtn = document.createElement('button');
      refreshBtn.className = 'btn-toolbar';
      refreshBtn.id = 'risk-refresh-btn';
      refreshBtn.textContent = '生成/刷新报告';
      refreshBtn.addEventListener('click', loadTaxRiskReport);
      clearBtn.parentNode.insertBefore(refreshBtn, clearBtn.nextSibling);
    }
    // 下载报告按钮（下拉菜单）
    var downloadWrap = document.createElement('span');
    downloadWrap.style.marginRight = '8px';
    downloadWrap.innerHTML = '<div class="download-dropdown" style="display:inline-block;position:relative">'
      + '<button class="btn-toolbar" id="risk-download-btn" style="display:none">下载报告</button>'
      + '<div class="download-menu" style="display:none;position:absolute;top:100%;right:0;background:#fff;border:1px solid var(--gray-200);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:100;min-width:120px">'
      + '<div data-fmt="pdf" style="padding:8px 16px;cursor:pointer;font-size:13px;color:var(--gray-700)" onmouseover="this.style.background=\'var(--gray-50)\'" onmouseout="this.style.background=\'\'">📄 PDF 下载</div>'
      + '<div data-fmt="docx" style="padding:8px 16px;cursor:pointer;font-size:13px;color:var(--gray-700)" onmouseover="this.style.background=\'var(--gray-50)\'" onmouseout="this.style.background=\'\'">📝 Word 下载</div>'
      + '<div data-fmt="pptx" style="padding:8px 16px;cursor:pointer;font-size:13px;color:var(--gray-700)" onmouseover="this.style.background=\'var(--gray-50)\'" onmouseout="this.style.background=\'\'">📊 PPT 下载</div>'
      + '</div></div>';
    clearBtn.parentNode.insertBefore(downloadWrap, clearBtn);

    var spacer = document.createElement('span');
    spacer.style.marginLeft = '16px';
    spacer.innerHTML = '<span id="risk-last-update" style="color:var(--gray-400);font-size:12px"></span>'
      + ''
      + '<span id="risk-delete-btn-wrap" style="margin-left:16px;display:none">'
      + '<button class="btn-toolbar" id="risk-delete-btn" style="color:#dc2626;border-color:#fca5a5;background:#fef2f2">删除报告</button>'
      + '</span>';
    trBar.appendChild(spacer);

    // 下载菜单交互
    setTimeout(function() {
      var downloadBtn = document.getElementById('risk-download-btn');
      var downloadMenu = document.querySelector('.download-menu');
      if (downloadBtn && downloadMenu) {
        downloadBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          downloadMenu.style.display = downloadMenu.style.display === 'none' ? '' : 'none';
        });
        downloadMenu.querySelectorAll('[data-fmt]').forEach(function(item) {
          item.addEventListener('click', function() {
            var fmt = this.getAttribute('data-fmt');
            downloadReport(fmt);
            downloadMenu.style.display = 'none';
          });
        });
        document.addEventListener('click', function() { downloadMenu.style.display = 'none'; });
      }
    }, 100);
  }

  // 每次进入模块都重新加载，避免切换公司后显示旧数据缓存
  taxRiskReportData = null;
  loadTaxRiskReport();
}

async function loadTaxRiskReport() {
  if (taxRiskLoading) return;
  taxRiskLoading = true;
  var btn = document.getElementById('risk-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 分析中...'; }

  try {
    var cid = (typeof currentCompanyId !== 'undefined') ? currentCompanyId : 1;
    // 使用 _getPeriodRange 获取标准格式 YYYY-MM-DD（当月第一天/最后一天）
    var range = (typeof _getPeriodRange === 'function') ? _getPeriodRange('tr-') : null;
    var from = range ? range.from : ((typeof _readPeriod === 'function') ? _readPeriod('tr-from') : '');
    var to = range ? range.to : ((typeof _readPeriod === 'function') ? _readPeriod('tr-to') : '');

    // 【关键】先确保规则已同步到服务器
    await syncRulesToServer();

    var url = '/api/tax-risk/report?company_id=' + cid;
    if (from) url += '&period_from=' + from;
    if (to) url += '&period_to=' + to;
    taxRiskReportData = await api(url);
    renderTaxRiskReportData(taxRiskReportData);
    // 报告生成后显示「删除报告」和「下载报告」按钮
    var delWrap = document.getElementById('risk-delete-btn-wrap');
    if (delWrap) delWrap.style.display = '';
    var downloadBtn = document.getElementById('risk-download-btn');
    if (downloadBtn) downloadBtn.style.display = '';
    var delBtn = document.getElementById('risk-delete-btn');
    if (delBtn && !delBtn._bound) {
      delBtn._bound = true;
      delBtn.addEventListener('click', function() {
        if (!confirm('确定要删除当前报告吗？')) return;
        taxRiskReportData = null;
        document.getElementById('risk-report-body').innerHTML = '';
        document.getElementById('risk-summary-cards').innerHTML = '';
        var d = document.getElementById('risk-delete-btn-wrap');
        if (d) d.style.display = 'none';
        var db = document.getElementById('risk-download-btn');
        if (db) db.style.display = 'none';
        toast('报告已删除', 'success');
      });
    }
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
    if (btn) { btn.disabled = false; btn.textContent = '生成/刷新报告'; }
  }
}

// 将本地规则同步到服务器（供后端分析使用）
async function syncRulesToServer() {
  try {
    var rules = null;
    // 从 localStorage 获取规则
    if (typeof taxRiskRulesData !== 'undefined' && taxRiskRulesData && taxRiskRulesData.length > 0) {
      rules = taxRiskRulesData;
    } else {
      var stored = localStorage.getItem('taxRiskRulesData');
      if (stored) {
        rules = JSON.parse(stored);
      }
    }
    if (rules && rules.length > 0) {
      await fetch('/api/tax-risk-rules/save-local', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(rules)
      });
      console.log('[报告] 规则已同步到服务器，共 ' + rules.length + ' 条');
    }
  } catch(e) {
    console.warn('[报告] 规则同步失败（后端可能未就绪）:', e.message);
  }
}

function renderTaxRiskReportData(data) {
  if (!data || !data.results) {
    document.getElementById('risk-report-body').innerHTML
      = '<div class="risk-empty">暂无风险分析数据，请点击「生成报告」</div>';
    return;
  }

  // 汇总卡片 + 财务指标
  renderSummaryCards(data.summary, data.period_start, data.period_end, data.metrics, data.rules_applied, data.rules_count);

  // 佐证材料汇总（如有）
  if (data.required_evidence_summary && data.required_evidence_summary.length > 0) {
    renderEvidenceSummary(data.required_evidence_summary);
  }

  // 分类渲染
  var body = document.getElementById('risk-report-body');
  var categories = {};
  for (var i = 0; i < data.results.length; i++) {
    var r = data.results[i];
    var cat = r.category || '其他';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r);
  }

  // 完整54个分类排序（经营实质稽查级+增值税专项排最前）
  var catOrder = [
    '经营实质',
    '增值税专项',
    '合同风险',
    '发票异常',
    '费用匹配',
    '企业所得税',
    '薪酬福利',
    '良好实践',
    '财税票比对', '配比弹性', '隐匿虚增', '纳税调整', '收入时点',
    '账务数据', '发票合规', '发票深度', '成本结构',
    '税负水平', '城建税', '房产税', '个人所得税', '印花税',
    '政策执行', '资金往来', '薪酬合规',
    '客户穿透', '供应商穿透', '财务健康', '企业信用', '行业专项',
    '其他风险'
  ];
  var html = '';

  for (var c = 0; c < catOrder.length; c++) {
    var catName = catOrder[c];
    var items = categories[catName];
    delete categories[catName];
    if (!items || items.length === 0) continue;
    html += renderCategorySection(catName, items);
  }

  // 未在 catOrder 中的分类放最后
  for (var cat in categories) {
    html += renderCategorySection(cat, categories[cat]);
  }

  body.innerHTML = html || '<div class="risk-empty">未发现明显风险事项</div>';
}

function renderSummaryCards(summary, ps, pe, metrics, rulesApplied, rulesCount) {
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
  // overall_risk_level 为 null/undefined 时表示无数据，不默认显示"良好"
  var overall = summary.overall_risk_level || null;
  var overallLabel = overall || '暂无数据';
  var overallColor = overall ? (levelColor[overall] || '#10b981') : '#9ca3af';
  var overallBg   = overall ? (levelBg[overall]   || '#ecfdf5') : '#f3f4f6';

  var rulesBadge = '';
  if (rulesApplied && rulesCount > 0) {
    rulesBadge = '<span style="display:inline-block;margin-left:8px;padding:2px 8px;background:#eef2ff;color:#6366f1;border-radius:4px;font-size:11px;font-weight:500;">基于 ' + rulesCount + ' 条规则</span>';
  } else {
    rulesBadge = '<span style="display:inline-block;margin-left:8px;padding:2px 8px;background:#fef3c7;color:#92400e;border-radius:4px;font-size:11px;">未加载规则</span>';
  }

  el.innerHTML = ''
    + '<div class="risk-card overall" style="border-color:' + overallColor + ';background:' + overallBg + '">'
    + '<div class="risk-card-label">综合风险等级' + rulesBadge + '</div>'
    + '<div class="risk-card-value" style="color:' + overallColor + '">' + overallLabel + '</div>'
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

  // （财务指标栏已移除）
}

function formatNum(n) {
  if (!n) return '0';
  if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(2) + '亿';
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + '万';
  return n.toFixed(2);
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

  // 冲突已解决标签
  var conflictBadge = '';
  if (r._conflict_resolved) {
    conflictBadge = '<span class="conflict-resolved-badge" title="已确认冲突场景" style="display:inline-block;margin-left:6px;padding:2px 8px;background:#e0f2fe;color:#0369a1;border-radius:10px;font-size:11px">已评估</span>';
  }

  // 冲突场景UI
  var conflictHtml = '';
  if (r.conflict_scenarios && r.conflict_scenarios.length > 0) {
    conflictHtml = '<div class="conflict-scenarios-section">'
      + '<div class="conflict-title">⚠️ 存在可能的降级/排除场景，请确认：</div>';
    for (var s = 0; s < r.conflict_scenarios.length; s++) {
      var sc = r.conflict_scenarios[s];
      var scId = sc.id || '';
      var isResolved = r._conflict_resolved && r._saved_answers && r._saved_answers[scId];
      var isEliminate = sc.effect === 'eliminate';
      var effectLabel = isEliminate ? '完全排除风险' : '风险降级';
      var effectColor = isEliminate ? '#10b981' : '#f59e0b';

      conflictHtml += '<div class="conflict-scenario-item" style="margin-top:8px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px">';
      conflictHtml += '<div class="conflict-question" style="font-size:13px;color:#92400e;margin-bottom:8px;line-height:1.6">' + escapeHtml(sc.question) + '</div>';

      if (isResolved) {
        // 已解决状态
        var answer = r._saved_answers[scId];
        conflictHtml += '<div style="font-size:12px;color:#0369a1;margin-top:4px">✓ 已确认' + (answer.note ? '：' + escapeHtml(answer.note) : '') + '</div>';
        conflictHtml += '<button class="conflict-reset-btn" onclick="resetConflict(\'' + escapeAttr(r.item) + '\',\'' + escapeAttr(scId) + '\')" '
          + 'style="margin-top:6px;padding:2px 10px;font-size:11px;background:none;border:1px solid #cbd5e1;border-radius:4px;color:var(--gray-500);cursor:pointer">撤销</button>';
      } else {
        // 未解决状态
        conflictHtml += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
        conflictHtml += '<button class="conflict-confirm-btn" onclick="resolveConflict(\'' + escapeAttr(r.item) + '\',\'' + escapeAttr(scId) + '\',false)" '
          + 'style="padding:4px 14px;font-size:12px;background:#fef2f2;border:1px solid #fca5a5;border-radius:4px;color:#dc2626;cursor:pointer">确认风险</button>';
        conflictHtml += '<button class="conflict-eliminate-btn" onclick="resolveConflict(\'' + escapeAttr(r.item) + '\',\'' + escapeAttr(scId) + '\',true)" '
          + 'style="padding:4px 14px;font-size:12px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:4px;color:#059669;cursor:pointer">' + effectLabel + '</button>';
        conflictHtml += '</div>';
      }
      conflictHtml += '</div>';
    }
    conflictHtml += '</div>';
  }

  return '<div class="risk-item ' + levelClass + '">'
    + '<div class="risk-item-header">'
    + '<span class="risk-item-level" style="background:' + (r.risk_color || '#6b7280') + '">' + escapeHtml(r.risk_level) + '</span>'
    + '<span class="risk-item-title">' + escapeHtml(r.item) + '</span>'
    + urgencyBadge
    + conflictBadge
    + '</div>'
    + '<div class="risk-item-detail">' + escapeHtml(r.detail) + '</div>'
    + '<div class="risk-item-suggestion">'
    + '<span class="suggestion-label">💡 建议：</span>' + escapeHtml(r.suggestion)
    + '</div>'
    + (r.required_evidence && r.required_evidence.length > 0 ? renderEvidenceList(r.required_evidence, r.risk_level) : '')
    + conflictHtml
    + '</div>';
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
}

function renderEvidenceList(evidence, level) {
  var cls = '';
  if (level === '高风险') cls = 'evidence-urgent';
  else if (level === '中风险') cls = 'evidence-warn';
  else cls = 'evidence-info';
  var html = '<div class="evidence-box ' + cls + '">'
    + '<div class="evidence-title">📋 需提供的佐证材料（税务稽查应对）：</div>'
    + '<ol class="evidence-list">';
  for (var i = 0; i < evidence.length; i++) {
    html += '<li>' + escapeHtml(evidence[i]) + '</li>';
  }
  html += '</ol></div>';
  return html;
}

function renderEvidenceSummary(summaryItems) {
  var body = document.getElementById('risk-report-body');
  var html = '<div class="risk-category evidence-summary-category">'
    + '<div class="risk-category-header">'
    + '<span class="risk-cat-icon">📋</span> 佐证材料清单汇总'
    + ' <span class="risk-cat-count">' + summaryItems.length + '项</span>'
    + '<span style="font-size:11px;color:#f59e0b;margin-left:8px">（税务稽查应对必备）</span>'
    + '</div>'
    + '<div class="evidence-summary-list">';
  for (var i = 0; i < summaryItems.length; i++) {
    var item = summaryItems[i];
    var levelClass = '';
    if (item.risk_level === '高风险') levelClass = 'evidence-urgent-tag';
    else if (item.risk_level === '中风险') levelClass = 'evidence-warn-tag';
    else levelClass = 'evidence-info-tag';
    html += '<div class="evidence-summary-item">'
      + '<span class="evidence-seq">' + (i + 1) + '</span>'
      + '<span class="evidence-desc">' + escapeHtml(item.item) + '</span>'
      + '<span class="evidence-related ' + levelClass + '">' + escapeHtml(item.related_dimension) + '</span>'
      + '</div>';
  }
  html += '</div></div>';
  body.innerHTML = html + (body.innerHTML || '');
}

function downloadReport(format) {
  if (!taxRiskReportData) { toast('请先生成报告', 'error'); return; }
  var cid = (typeof currentCompanyId !== 'undefined') ? currentCompanyId : 1;
  var range = (typeof _getPeriodRange === 'function') ? _getPeriodRange('tr-') : null;
  var from = range ? range.from : '';
  var to = range ? range.to : '';
  var url = '/api/tax-risk/report/download?company_id=' + cid + '&format=' + format;
  if (from) url += '&period_from=' + from;
  if (to) url += '&period_to=' + to;
  var a = document.createElement('a');
  a.href = url;
  a.download = 'tax_risk_report.' + (format === 'docx' ? 'docx' : format === 'pptx' ? 'pptx' : 'pdf');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast('报告下载中...', 'success');
}

function resolveConflict(riskItem, conflictId, confirmed) {
  var cid = (typeof currentCompanyId !== 'undefined') ? currentCompanyId : 1;
  fetch('/api/tax-risk/report/conflict-answers?company_id=' + cid, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ risk_item: riskItem, conflict_id: conflictId, confirmed: confirmed, answer_note: '' })
  }).then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.status === 'ok') {
      toast(confirmed ? '风险已降级/排除' : '风险已确认', 'success');
      // 刷新当前风险项显示
      loadTaxRiskReport();
    }
  }).catch(function(err) {
    toast('操作失败: ' + (err.message || err), 'error');
  });
}

function resetConflict(riskItem, conflictId) {
  var cid = (typeof currentCompanyId !== 'undefined') ? currentCompanyId : 1;
  fetch('/api/tax-risk/report/conflict-answers/reset?company_id=' + cid, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ risk_item: riskItem, conflict_id: conflictId })
  }).then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.status === 'ok') {
      toast('冲突答案已重置', 'success');
      loadTaxRiskReport();
    }
  }).catch(function(err) {
    toast('重置失败: ' + (err.message || err), 'error');
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
