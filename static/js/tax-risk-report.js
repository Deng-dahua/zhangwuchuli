// ==================== 娑夌◣椋庨櫓鍒嗘瀽鎶ュ憡 V5 ====================
// 61 涓垎鏋愮淮搴︼細璐﹀姟鏁版嵁 / 鍙戠エ鍚堣 / 鍙戠エ娣卞害 / 鎴愭湰缁撴瀯 / 璐㈢◣绁ㄦ瘮瀵?/
// 閰嶆瘮寮规€?/ 闅愬尶铏氬 / 绋庤礋姘村钩 / 鍩庡缓绋?/ 鎴夸骇绋?/ 涓汉鎵€寰楃◣ / 鍗拌姳绋?/
// 绾崇◣璋冩暣 / 鏀跺叆鏃剁偣 / 鏀跨瓥鎵ц / 璧勯噾寰€鏉?/ 钖叕鍚堣 /
// 瀹㈡埛绌块€?/ 渚涘簲鍟嗙┛閫?/ 璐㈠姟鍋ュ悍 / 浼佷笟淇＄敤 / 琛屼笟涓撻」 / 鑹ソ瀹炶返 /
// 缁忚惀瀹炶川(18椤? / 澧炲€肩◣涓撻」(5椤? / 鍙戠エ寮傚父(3椤? / 璐圭敤鍖归厤(3椤? /
// 浼佷笟鎵€寰楃◣(4椤? / 钖叕绂忓埄(3椤? / 鍏朵粬椋庨櫓(2椤?

var taxRiskReportData = null;
var taxRiskLoading = false;

function renderTaxRiskReport(container) {
  window.currentModule = '娑夌◣椋庨櫓鍒嗘瀽鎶ュ憡';

  container.innerHTML = ''
    + '<div class="risk-report-container">'
    + '<div class="risk-report-header">'
    + '<div id="tr-period-bar" style="display:flex;align-items:center;gap:4px;margin-top:12px"></div>'
    + '</div>'
    + '<div id="risk-summary-cards" class="risk-summary-cards"></div>'
    + '<div id="risk-report-body" class="risk-report-body"></div>'
    + '</div>';

  _buildStandardPeriodBar('tr-', { onQuery: loadTaxRiskReport, onClear: function() { loadTaxRiskReport(); } });

  // 鎸夐挳椤哄簭锛氭竻闄?鈫?鐢熸垚/鍒锋柊鎶ュ憡 鈫?涓嬭浇鎶ュ憡
  var trBar = document.getElementById('tr-period-bar');
  if (trBar) {
    var queryBtn = trBar.querySelector('.std-query-btn');
    if (queryBtn) queryBtn.remove();
    var clearBtn = trBar.querySelector('.std-clear-btn');
    // 鍦ㄦ竻闄ゆ寜閽悗鎻掑叆鐢熸垚/鍒锋柊鎶ュ憡鎸夐挳
    if (clearBtn) {
      var refreshBtn = document.createElement('button');
      refreshBtn.className = 'btn-toolbar';
      refreshBtn.id = 'risk-refresh-btn';
      refreshBtn.textContent = '鐢熸垚/鍒锋柊鎶ュ憡';
      refreshBtn.addEventListener('click', loadTaxRiskReport);
      clearBtn.parentNode.insertBefore(refreshBtn, clearBtn.nextSibling);
    }
    // 涓嬭浇鎶ュ憡鎸夐挳锛堝湪鐢熸垚/鍒锋柊鎸夐挳鍚庨潰锛?    var downloadWrap = document.createElement('span');
    downloadWrap.style.marginRight = '8px';
    downloadWrap.innerHTML = '<div class="download-dropdown" style="display:inline-block;position:relative">'
      + '<button class="btn-toolbar" id="risk-download-btn" style="display:none">涓嬭浇鎶ュ憡</button>'
      + '<div class="download-menu" style="display:none;position:absolute;top:100%;right:0;background:#fff;border:1px solid var(--gray-200);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:100;min-width:120px">'
      + '<div data-fmt="pdf" style="padding:8px 16px;cursor:pointer;font-size:13px;color:var(--gray-700)" onmouseover="this.style.background=\'var(--gray-50)\'" onmouseout="this.style.background=\'\'">馃搫 PDF 涓嬭浇</div>'
      + '<div data-fmt="docx" style="padding:8px 16px;cursor:pointer;font-size:13px;color:var(--gray-700)" onmouseover="this.style.background=\'var(--gray-50)\'" onmouseout="this.style.background=\'\'">馃摑 Word 涓嬭浇</div>'
      + '<div data-fmt="pptx" style="padding:8px 16px;cursor:pointer;font-size:13px;color:var(--gray-700)" onmouseover="this.style.background=\'var(--gray-50)\'" onmouseout="this.style.background=\'\'">馃搳 PPT 涓嬭浇</div>'
      + '</div></div>';
    clearBtn.parentNode.insertBefore(downloadWrap, refreshBtn.nextSibling);

    // 鍒犻櫎鎶ュ憡鎸夐挳锛堜笅杞芥寜閽悗闈級
    var deleteWrap = document.createElement('span');
    deleteWrap.id = 'risk-delete-btn-wrap';
    deleteWrap.style.marginLeft = '16px';
    deleteWrap.style.display = 'none';
    deleteWrap.innerHTML = '<button class="btn-toolbar" id="risk-delete-btn" style="color:#dc2626;border-color:#fca5a5;background:#fef2f2">鍒犻櫎鎶ュ憡</button>';
    clearBtn.parentNode.insertBefore(deleteWrap, downloadWrap.nextSibling);

    var spacer = document.createElement('span');
    spacer.style.marginLeft = '16px';
    spacer.innerHTML = '<span id="risk-last-update" style="color:var(--gray-400);font-size:12px"></span>';
    trBar.appendChild(spacer);

    // 涓嬭浇鑿滃崟浜や簰
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

  // 姣忔杩涘叆妯″潡閮介噸鏂板姞杞斤紝閬垮厤鍒囨崲鍏徃鍚庢樉绀烘棫鏁版嵁缂撳瓨
  taxRiskReportData = null;
  loadTaxRiskReport();
}

async function loadTaxRiskReport() {
  if (taxRiskLoading) return;
  taxRiskLoading = true;
  var btn = document.getElementById('risk-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = '鈴?鍒嗘瀽涓?..'; }

  try {
    var cid = (typeof currentCompanyId !== 'undefined') ? currentCompanyId : 1;
    // 浣跨敤 _getPeriodRange 鑾峰彇鏍囧噯鏍煎紡 YYYY-MM-DD锛堝綋鏈堢涓€澶?鏈€鍚庝竴澶╋級
    var range = (typeof _getPeriodRange === 'function') ? _getPeriodRange('tr-') : null;
    var from = range ? range.from : ((typeof _readPeriod === 'function') ? _readPeriod('tr-from') : '');
    var to = range ? range.to : ((typeof _readPeriod === 'function') ? _readPeriod('tr-to') : '');

    // 銆愬叧閿€戝厛纭繚瑙勫垯宸插悓姝ュ埌鏈嶅姟鍣?    await syncRulesToServer();

    var url = '/api/tax-risk/report?company_id=' + cid;
    if (from) url += '&period_from=' + from;
    if (to) url += '&period_to=' + to;
    taxRiskReportData = await api(url);
    renderTaxRiskReportData(taxRiskReportData);
    // 鎶ュ憡鐢熸垚鍚庢樉绀恒€屽垹闄ゆ姤鍛娿€嶅拰銆屼笅杞芥姤鍛娿€嶆寜閽?    var delWrap = document.getElementById('risk-delete-btn-wrap');
    if (delWrap) delWrap.style.display = '';
    var downloadBtn = document.getElementById('risk-download-btn');
    if (downloadBtn) downloadBtn.style.display = '';
    var delBtn = document.getElementById('risk-delete-btn');
    if (delBtn && !delBtn._bound) {
      delBtn._bound = true;
      delBtn.addEventListener('click', function() {
        if (!confirm('纭畾瑕佸垹闄ゅ綋鍓嶆姤鍛婂悧锛?)) return;
        taxRiskReportData = null;
        document.getElementById('risk-report-body').innerHTML = '';
        document.getElementById('risk-summary-cards').innerHTML = '';
        var d = document.getElementById('risk-delete-btn-wrap');
        if (d) d.style.display = 'none';
        var db = document.getElementById('risk-download-btn');
        if (db) db.style.display = 'none';
        toast('鎶ュ憡宸插垹闄?, 'success');
      });
    }
    var now = new Date();
    var ts = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0')
      + '-' + String(now.getDate()).padStart(2,'0') + ' '
      + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    var el = document.getElementById('risk-last-update');
    if (el) el.textContent = '鏈€杩戞洿鏂? ' + ts;
  } catch (err) {
    toast('椋庨櫓鎶ュ憡鍔犺浇澶辫触: ' + (err.message || err), 'error');
  } finally {
    taxRiskLoading = false;
    if (btn) { btn.disabled = false; btn.textContent = '鐢熸垚/鍒锋柊鎶ュ憡'; }
  }
}

// 灏嗘湰鍦拌鍒欏悓姝ュ埌鏈嶅姟鍣紙渚涘悗绔垎鏋愪娇鐢級
async function syncRulesToServer() {
  try {
    var rules = null;
    // 浠?localStorage 鑾峰彇瑙勫垯
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
      console.log('[鎶ュ憡] 瑙勫垯宸插悓姝ュ埌鏈嶅姟鍣紝鍏?' + rules.length + ' 鏉?);
    }
  } catch(e) {
    console.warn('[鎶ュ憡] 瑙勫垯鍚屾澶辫触锛堝悗绔彲鑳芥湭灏辩华锛?', e.message);
  }
}

function renderTaxRiskReportData(data) {
  if (!data || !data.results) {
    document.getElementById('risk-report-body').innerHTML
      = '<div class="risk-empty">鏆傛棤椋庨櫓鍒嗘瀽鏁版嵁锛岃鐐瑰嚮銆岀敓鎴愭姤鍛娿€?/div>';
    return;
  }

  // 姹囨€诲崱鐗?+ 璐㈠姟鎸囨爣
  renderSummaryCards(data.summary, data.period_start, data.period_end, data.metrics, data.rules_applied, data.rules_count);

  // 浣愯瘉鏉愭枡姹囨€伙紙濡傛湁锛?  if (data.required_evidence_summary && data.required_evidence_summary.length > 0) {
    renderEvidenceSummary(data.required_evidence_summary);
  }

  // 鍒嗙被娓叉煋
  var body = document.getElementById('risk-report-body');
  var categories = {};
  for (var i = 0; i < data.results.length; i++) {
    var r = data.results[i];
    var cat = r.category || '鍏朵粬';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r);
  }

  // 瀹屾暣54涓垎绫绘帓搴忥紙缁忚惀瀹炶川绋芥煡绾?澧炲€肩◣涓撻」鎺掓渶鍓嶏級
  var catOrder = [
    '缁忚惀瀹炶川',
    '澧炲€肩◣涓撻」',
    '鍚堝悓椋庨櫓',
    '鍙戠エ寮傚父',
    '璐圭敤鍖归厤',
    '浼佷笟鎵€寰楃◣',
    '钖叕绂忓埄',
    '鑹ソ瀹炶返',
    '璐㈢◣绁ㄦ瘮瀵?, '閰嶆瘮寮规€?, '闅愬尶铏氬', '绾崇◣璋冩暣', '鏀跺叆鏃剁偣',
    '璐﹀姟鏁版嵁', '鍙戠エ鍚堣', '鍙戠エ娣卞害', '鎴愭湰缁撴瀯',
    '绋庤礋姘村钩', '鍩庡缓绋?, '鎴夸骇绋?, '涓汉鎵€寰楃◣', '鍗拌姳绋?,
    '鏀跨瓥鎵ц', '璧勯噾寰€鏉?, '钖叕鍚堣',
    '瀹㈡埛绌块€?, '渚涘簲鍟嗙┛閫?, '璐㈠姟鍋ュ悍', '浼佷笟淇＄敤', '琛屼笟涓撻」',
    '鍏朵粬椋庨櫓'
  ];
  var html = '';

  for (var c = 0; c < catOrder.length; c++) {
    var catName = catOrder[c];
    var items = categories[catName];
    delete categories[catName];
    if (!items || items.length === 0) continue;
    html += renderCategorySection(catName, items);
  }

  // 鏈湪 catOrder 涓殑鍒嗙被鏀炬渶鍚?  for (var cat in categories) {
    html += renderCategorySection(cat, categories[cat]);
  }

  body.innerHTML = html || '<div class="risk-empty">鏈彂鐜版槑鏄鹃闄╀簨椤?/div>';
}

function renderSummaryCards(summary, ps, pe, metrics, rulesApplied, rulesCount) {
  var el = document.getElementById('risk-summary-cards');
  if (!el || !summary) return;

  var levelColor = {
    '楂橀闄?: '#dc2626', '涓闄?: '#f59e0b',
    '浣庨闄?: '#3b82f6', '鑹ソ': '#10b981'
  };
  var levelBg = {
    '楂橀闄?: '#fef2f2', '涓闄?: '#fffbeb',
    '浣庨闄?: '#eff6ff', '鑹ソ': '#ecfdf5'
  };
  // overall_risk_level 涓?null/undefined 鏃惰〃绀烘棤鏁版嵁锛屼笉榛樿鏄剧ず"鑹ソ"
  var overall = summary.overall_risk_level || null;
  var overallLabel = overall || '鏆傛棤鏁版嵁';
  var overallColor = overall ? (levelColor[overall] || '#10b981') : '#9ca3af';
  var overallBg   = overall ? (levelBg[overall]   || '#ecfdf5') : '#f3f4f6';

  var rulesBadge = '';
  if (rulesApplied && rulesCount > 0) {
    rulesBadge = '<span style="display:inline-block;margin-left:8px;padding:2px 8px;background:#eef2ff;color:#6366f1;border-radius:4px;font-size:11px;font-weight:500;">鍩轰簬 ' + rulesCount + ' 鏉¤鍒?/span>';
  } else {
    rulesBadge = '<span style="display:inline-block;margin-left:8px;padding:2px 8px;background:#fef3c7;color:#92400e;border-radius:4px;font-size:11px;">鏈姞杞借鍒?/span>';
  }

  el.innerHTML = ''
    + '<div class="risk-card overall" style="border-color:' + overallColor + ';background:' + overallBg + '">'
    + '<div class="risk-card-label">缁煎悎椋庨櫓绛夌骇' + rulesBadge + '</div>'
    + '<div class="risk-card-value" style="color:' + overallColor + '">' + overallLabel + '</div>'
    + '<div class="risk-card-sub">鍒嗘瀽鏈熼棿锛? + escapeHtml(ps || '-') + ' ~ ' + escapeHtml(pe || '-') + '</div>'
    + '</div>'
    + '<div class="risk-card high" style="border-color:#dc2626">'
    + '<div class="risk-card-label">楂橀闄?/div>'
    + '<div class="risk-card-value" style="color:#dc2626">' + (summary.high_risk_count || 0) + '</div>'
    + '<div class="risk-card-sub">椤?/div></div>'
    + '<div class="risk-card mid" style="border-color:#f59e0b">'
    + '<div class="risk-card-label">涓闄?/div>'
    + '<div class="risk-card-value" style="color:#f59e0b">' + (summary.mid_risk_count || 0) + '</div>'
    + '<div class="risk-card-sub">椤?/div></div>'
    + '<div class="risk-card low" style="border-color:#3b82f6">'
    + '<div class="risk-card-label">浣庨闄?/div>'
    + '<div class="risk-card-value" style="color:#3b82f6">' + (summary.low_risk_count || 0) + '</div>'
    + '<div class="risk-card-sub">椤?/div></div>'
    + '<div class="risk-card good" style="border-color:#10b981">'
    + '<div class="risk-card-label">鑹ソ浜嬮」</div>'
    + '<div class="risk-card-value" style="color:#10b981">' + (summary.good_count || 0) + '</div>'
    + '<div class="risk-card-sub">椤?/div></div>'
    + '<div class="risk-card total" style="border-color:#6b7280">'
    + '<div class="risk-card-label">鎬昏妫€鏌ラ」</div>'
    + '<div class="risk-card-value" style="color:#6b7280">' + (summary.total_items || 0) + '</div>'
    + '<div class="risk-card-sub">椤?/div></div>';

  // 锛堣储鍔℃寚鏍囨爮宸茬Щ闄わ級
}

function formatNum(n) {
  if (!n) return '0';
  if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(2) + '浜?;
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + '涓?;
  return n.toFixed(2);
}

function renderCategorySection(catName, items) {
  var icon = items[0] ? (items[0].category_icon || '馃搵') : '馃搵';
  var h = '<div class="risk-category">';
  h += '<div class="risk-category-header"><span class="risk-cat-icon">' + icon + '</span> ' + escapeHtml(catName) + ' <span class="risk-cat-count">' + items.length + '椤?/span></div>';
  for (var i = 0; i < items.length; i++) {
    h += renderRiskItem(items[i], i);
  }
  h += '</div>';
  return h;
}

function renderRiskItem(r, idx) {
  var urgencyBadge = '';
  if (r.urgency === '绱ф€?) {
    urgencyBadge = '<span class="urgency-badge urgent">绱ф€?/span>';
  } else if (r.urgency === '鎻愰啋') {
    urgencyBadge = '<span class="urgency-badge warning">鎻愰啋</span>';
  } else if (r.urgency === '寤鸿') {
    urgencyBadge = '<span class="urgency-badge suggest">寤鸿</span>';
  }

  var levelClass = '';
  if (r.risk_level === '楂橀闄?) levelClass = 'item-high';
  else if (r.risk_level === '涓闄?) levelClass = 'item-mid';
  else if (r.risk_level === '浣庨闄?) levelClass = 'item-low';
  else if (r.risk_level === '鑹ソ') levelClass = 'item-good';

  // 鍐茬獊宸茶В鍐虫爣绛?  var conflictBadge = '';
  if (r._conflict_resolved) {
    conflictBadge = '<span class="conflict-resolved-badge" title="宸茬‘璁ゅ啿绐佸満鏅? style="display:inline-block;margin-left:6px;padding:2px 8px;background:#e0f2fe;color:#0369a1;border-radius:10px;font-size:11px">宸茶瘎浼?/span>';
  }

  // 鍐茬獊鍦烘櫙UI
  var conflictHtml = '';
  if (r.conflict_scenarios && r.conflict_scenarios.length > 0) {
    conflictHtml = '<div class="conflict-scenarios-section">'
      + '<div class="conflict-title">鈿狅笍 瀛樺湪鍙兘鐨勯檷绾?鎺掗櫎鍦烘櫙锛岃纭锛?/div>';
    for (var s = 0; s < r.conflict_scenarios.length; s++) {
      var sc = r.conflict_scenarios[s];
      var scId = sc.id || '';
      var isResolved = r._conflict_resolved && r._saved_answers && r._saved_answers[scId];
      var isEliminate = sc.effect === 'eliminate';
      var effectLabel = isEliminate ? '瀹屽叏鎺掗櫎椋庨櫓' : '椋庨櫓闄嶇骇';
      var effectColor = isEliminate ? '#10b981' : '#f59e0b';

      conflictHtml += '<div class="conflict-scenario-item" style="margin-top:8px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px">';
      conflictHtml += '<div class="conflict-question" style="font-size:13px;color:#92400e;margin-bottom:8px;line-height:1.6">' + escapeHtml(sc.question) + '</div>';

      if (isResolved) {
        // 宸茶В鍐崇姸鎬?        var answer = r._saved_answers[scId];
        conflictHtml += '<div style="font-size:12px;color:#0369a1;margin-top:4px">鉁?宸茬‘璁? + (answer.note ? '锛? + escapeHtml(answer.note) : '') + '</div>';
        conflictHtml += '<button class="conflict-reset-btn" onclick="resetConflict(\'' + escapeAttr(r.item) + '\',\'' + escapeAttr(scId) + '\')" '
          + 'style="margin-top:6px;padding:2px 10px;font-size:11px;background:none;border:1px solid #cbd5e1;border-radius:4px;color:var(--gray-500);cursor:pointer">鎾ら攢</button>';
      } else {
        // 鏈В鍐崇姸鎬?        conflictHtml += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
        conflictHtml += '<button class="conflict-confirm-btn" onclick="resolveConflict(\'' + escapeAttr(r.item) + '\',\'' + escapeAttr(scId) + '\',false)" '
          + 'style="padding:4px 14px;font-size:12px;background:#fef2f2;border:1px solid #fca5a5;border-radius:4px;color:#dc2626;cursor:pointer">纭椋庨櫓</button>';
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
    + '<span class="suggestion-label">馃挕 寤鸿锛?/span>' + escapeHtml(r.suggestion)
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
  if (level === '楂橀闄?) cls = 'evidence-urgent';
  else if (level === '涓闄?) cls = 'evidence-warn';
  else cls = 'evidence-info';
  var html = '<div class="evidence-box ' + cls + '">'
    + '<div class="evidence-title">馃搵 闇€鎻愪緵鐨勪綈璇佹潗鏂欙紙绋庡姟绋芥煡搴斿锛夛細</div>'
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
    + '<span class="risk-cat-icon">馃搵</span> 浣愯瘉鏉愭枡娓呭崟姹囨€?
    + ' <span class="risk-cat-count">' + summaryItems.length + '椤?/span>'
    + '<span style="font-size:11px;color:#f59e0b;margin-left:8px">锛堢◣鍔＄ń鏌ュ簲瀵瑰繀澶囷級</span>'
    + '</div>'
    + '<div class="evidence-summary-list">';
  for (var i = 0; i < summaryItems.length; i++) {
    var item = summaryItems[i];
    var levelClass = '';
    if (item.risk_level === '楂橀闄?) levelClass = 'evidence-urgent-tag';
    else if (item.risk_level === '涓闄?) levelClass = 'evidence-warn-tag';
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
  if (!taxRiskReportData) { toast('璇峰厛鐢熸垚鎶ュ憡', 'error'); return; }
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
  toast('鎶ュ憡涓嬭浇涓?..', 'success');
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
      toast(confirmed ? '椋庨櫓宸查檷绾?鎺掗櫎' : '椋庨櫓宸茬‘璁?, 'success');
      // 鍒锋柊褰撳墠椋庨櫓椤规樉绀?      loadTaxRiskReport();
    }
  }).catch(function(err) {
    toast('鎿嶄綔澶辫触: ' + (err.message || err), 'error');
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
      toast('鍐茬獊绛旀宸查噸缃?, 'success');
      loadTaxRiskReport();
    }
  }).catch(function(err) {
    toast('閲嶇疆澶辫触: ' + (err.message || err), 'error');
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
