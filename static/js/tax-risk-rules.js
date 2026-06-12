// ==================== 涉税风险分析规则管理模块 V2 ====================
// 功能：左侧纯文本输入 → 系统自动解析整理 → 右侧结构化展示
// 布局：左侧纯输入框 + 右侧规则显示区
// 作者：AI助手 | 更新：2026-06-12

var taxRiskRulesData = [];

// ══════════════════════════════════════════════════════════════
//  一、规则分类与关键词映射（用于自动分类）
// ══════════════════════════════════════════════════════════════
var RULE_CATEGORY_KEYWORDS = {
  '账务数据': ['借贷', '凭证', '折旧', '摊销', '序时账', '科目', '余额'],
  '发票合规': ['进项', '销项', '发票', '税号', '作废', '红冲', '抵扣', '失控', '异常'],
  '发票深度': ['税率', '敏感', '代开', '零税额', '顶额'],
  '成本结构': ['毛利率', '成本', '费用率', '招待费', '费用占比'],
  '财税票比对': ['比对', '不一致', '差异', '财报收入', '申报收入'],
  '配比弹性': ['变动率', '弹性', '环比', '同比', '波动'],
  '隐匿虚增': ['其他应收', '存货', '预收', '应付', '挂账'],
  '税负水平': ['税负率', '增值税', 'CCF', '减征'],
  '城建税': ['城建税', '城市维护建设税'],
  '房产税': ['房产税', '从价', '从租', '房屋', '租金'],
  '个人所得税': ['个税', '工资薪金', '劳务', '股息', '股东借款', '代扣'],
  '印花税': ['印花税', '合同'],
  '纳税调整': ['调增', '调减', '招待费', '广宣', '福利费', '减值'],
  '收入时点': ['四季度', '年底', '突击开票', '收入确认'],
  '政策执行': ['社保', '公积金', '结账'],
  '资金往来': ['银行', '应收', '应付', '现金', '存款'],
  '薪酬合规': ['起征点', '5000', '个税起征'],
  '客户穿透': ['客户', '集中度', '大客户'],
  '供应商穿透': ['供应商', '采购', '供货'],
  '财务健康': ['资产负债', '流动比率', '净利润', '亏损'],
  '企业信用': ['空壳', '信用', '经营场所'],
  '行业专项': ['行业', '对比', '电费', '制造'],
  '良好实践': ['良好', '规范', '完整', '正确'],
  '经营实质': ['运输', '仓库', '仓储', '包装', '广告费', '产能', '设备'],
  '增值税专项': ['零申报', '留抵', '退税', '无票销售', '进项转出'],
  '发票异常': ['代开', '顶额', '敏感业务', '不匹配'],
  '费用匹配': ['油费', '车辆', '运输费', '合理性'],
  '企业所得税': ['减值', '出资', '利息', '不征税', '暂估'],
  '薪酬福利': ['福利费', '社保基数', '未分配利润'],
  '其他风险': ['互开', '投资性房地产']
};

var RISK_LEVEL_COLORS = {
  '高风险': '#dc2626',
  '中风险': '#f59e0b',
  '低风险': '#3b82f6',
  '良好': '#10b981'
};

var RISK_LEVEL_ICONS = {
  '高风险': '🔴',
  '中风险': '🟡',
  '低风险': '🔵',
  '良好': '🟢'
};

// ══════════════════════════════════════════════════════════════
//  二、主渲染函数
// ══════════════════════════════════════════════════════════════
function renderTaxRiskRules(container) {
  window.currentModule = '涉税风险分析规则';

  container.innerHTML = ''
    + '<div class="risk-rules-container">'
    // 顶部标题栏
    + '<div class="risk-rules-header">'
    + '<div class="risk-rules-title">'
    + '<h2>涉税风险分析规则管理</h2>'
    + '<p>收集和整理涉税风险分析规则，用于编制涉税风险分析报告</p>'
    + '</div>'
    + '<div class="risk-rules-toolbar">'
    + '<button class="btn-toolbar btn-primary" id="btn-load-default-rules" onclick="loadDefaultTaxRiskRules()">📥 加载61条默认规则</button>'
    + '<button class="btn-toolbar" onclick="exportTaxRiskRules()">📤 导出规则</button>'
    + '<button class="btn-toolbar" onclick="importTaxRiskRules()">📥 导入规则</button>'
    + '<button class="btn-toolbar" onclick="clearAllRules()">🗑️ 清空规则</button>'
    + '<button class="btn-toolbar" onclick="uploadLocalRulesToServer()" style="background:#8b5cf6;color:#fff">📤 上传规则到服务器</button>'
    + '</div>'
    + '</div>'
    // 主体：左侧输入区 + 右侧显示区
    + '<div class="risk-rules-body">'
    // 左侧：纯文本输入框
    + '<div class="risk-rules-input" id="risk-rules-input">'
    + '<div class="input-panel-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">'
    + '<div>'
    + '<h3 style="margin:0 0 4px 0;">📝 规则信息输入</h3>'
    + '<span class="input-panel-hint">自由输入涉税风险规则描述，系统自动解析整理</span>'
    + '</div>'
    + '<div style="display:flex;gap:8px;">'
    + '<button class="btn btn-primary" onclick="parseAndAddRules()">🔍 解析并添加</button>'
    + '<button class="btn btn-cancel" onclick="document.getElementById(\'rule-input-text\').value=\'\'">🧹 清空输入</button>'
    + '</div>'
    + '</div>'
    + '<div class="input-panel-body">'
    + '<textarea class="form-textarea" id="rule-input-text" rows="18" placeholder="请在此输入涉税风险规则描述...\n\n例如：\n1. 借贷不平衡——以下期间借贷方金额不相等，会导致报表数据失真。评分9分，高风险。建议逐月排查序时账。\n\n2. 存在风险进项发票——有进项发票被标记为疑点/异常/失控。评分9分，高风险。建议立即核实。\n\n3. 毛利率偏低——毛利率低于5%。评分5分，中风险。建议分析成本构成。\n\n也可以一次输入多条规则，用换行或数字序号分隔。"></textarea>'
    + '<div style="margin-top:8px;font-size:11px;color:var(--gray-400);">'
    + '💡 提示：输入规则描述后点击"解析并添加"，系统会自动提取分类、评分、等级等信息。'
    + '</div>'
    + '</div>'
    + '<div class="input-panel-footer">'
    + '<span style="font-size:12px;color:var(--gray-500);">支持多条规则同时输入，用换行或数字序号分隔</span>'
    + '</div>'
    + '</div>'
    // 右侧：规则显示区
    + '<div class="risk-rules-display" id="risk-rules-display">'
    + '<div class="display-panel-header">'
    + '<h3>📋 规则显示区</h3>'
    + '<div class="display-panel-toolbar">'
    + '<input type="text" class="search-input" id="risk-rules-search" placeholder="🔍 搜索规则..." oninput="filterTaxRiskRules()">'
    + '<select class="filter-select" id="risk-rules-filter-category" onchange="filterTaxRiskRules()">'
    + '<option value="">全部分类</option>'
    + '</select>'
    + '<select class="filter-select" id="risk-rules-filter-level" onchange="filterTaxRiskRules()">'
    + '<option value="">全部等级</option>'
    + '<option value="高风险">🔴 高风险</option>'
    + '<option value="中风险">🟡 中风险</option>'
    + '<option value="低风险">🔵 低风险</option>'
    + '<option value="良好">🟢 良好</option>'
    + '</select>'
    + '</div>'
    + '</div>'
    + '<div class="display-panel-body" id="risk-rules-list">'
    + '<div class="risk-rules-empty">暂无规则数据，请在左侧输入区添加规则，或点击"加载61条默认规则"</div>'
    + '</div>'
    + '<div class="display-panel-footer">'
    + '<span id="risk-rules-stats">共 0 条规则</span>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '</div>';

  // 加载规则
  loadTaxRiskRules();
}

// ══════════════════════════════════════════════════════════════
//  三、加载规则（localStorage优先，否则加载默认61条）
// ══════════════════════════════════════════════════════════════
async function loadTaxRiskRules() {
  // 【自动清理旧格式缓存】如果缓存数据只有1-5条，可能是旧格式或fallback数据，强制清理
  var localData = localStorage.getItem('taxRiskRulesData');
  if (localData) {
    try {
      var parsed = JSON.parse(localData);
      // 检测旧格式：字段名是 categoryIcon（新格式）但数据量太少，或数据不完整
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.length < 10) {
        console.log('[涉税风险规则] 检测到旧/不完整的缓存数据（' + parsed.length + '条），自动清理');
        localStorage.removeItem('taxRiskRulesData');
      } else if (Array.isArray(parsed) && parsed.length >= 10) {
        taxRiskRulesData = parsed;
        renderTaxRiskRulesList();
        updateCategoryFilterOptions();
        toast('已从本地加载 ' + taxRiskRulesData.length + ' 条规则', 'success');
        return;
      }
    } catch (e) {
      console.error('解析本地规则数据失败:', e);
      localStorage.removeItem('taxRiskRulesData');
    }
  }

  // 本地没有则加载默认61条
  await loadDefaultTaxRiskRules();
}

// 加载默认61条规则（从JSON文件）
async function loadDefaultTaxRiskRules() {
  // 如果已有数据，确认是否覆盖
  // 直接覆盖加载，不再弹确认框（用户可随时用"清空规则"按钮清空）
  try {
    var resp = await fetch('/static/tax_risk_rules_default.json?_t=' + Date.now());
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var rules = await resp.json();
    if (!Array.isArray(rules) || rules.length === 0) throw new Error('规则数据为空');

    taxRiskRulesData = rules;
    saveTaxRiskRulesToLocal();
    renderTaxRiskRulesList();
    updateCategoryFilterOptions();
    updateLoadButtonText();
    toast('已加载默认规则 ' + rules.length + ' 条', 'success');
    console.log('[涉税风险规则] 已从JSON文件加载', rules.length, '条规则');
  } catch (e) {
    console.error('加载默认规则失败:', e);
    toast('加载默认规则失败：' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════
//  四、核心：解析文本并添加规则（含重复检测与合并）
// ══════════════════════════════════════════════════════════════

// 判断两条规则的"方向"是否相同（item 名称相似）
function isSameDirection(itemA, itemB) {
  if (!itemA || !itemB) return false;
  var a = itemA.trim().toLowerCase();
  var b = itemB.trim().toLowerCase();
  // 1. 完全相等
  if (a === b) return true;
  // 2. 其中一个包含另一个（长度>=4才判断）
  if (a.length >= 4 && b.length >= 4) {
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return true;
  }
  // 3. 前6个字符相同
  var minLen = Math.min(a.length, b.length);
  if (minLen >= 6 && a.substring(0, 6) === b.substring(0, 6)) return true;
  // 4. 提取关键词（去掉"风险"、"分析"等后缀后比较）
  var ka = a.replace(/风险|分析|检查|检测|评估|报告/g, '').trim();
  var kb = b.replace(/风险|分析|检查|检测|评估|报告/g, '').trim();
  if (ka.length >= 4 && kb.length >= 4) {
    if (ka === kb || ka.indexOf(kb) >= 0 || kb.indexOf(ka) >= 0) return true;
  }
  return false;
}

// 合并两条规则：将 newRule 的内容丰富到 existing 中
function mergeRule(existing, newRule) {
  // 合并 detail：如果新 detail 不包含在旧 detail 中，则追加
  if (newRule.detail && existing.detail.indexOf(newRule.detail) < 0) {
    existing.detail = existing.detail + '；' + newRule.detail;
  }
  // 合并 suggestion：如果新 suggestion 不包含在旧中，则追加
  if (newRule.suggestion && existing.suggestion.indexOf(newRule.suggestion) < 0) {
    existing.suggestion = existing.suggestion + '；' + newRule.suggestion;
  }
  // 合并 evidence
  if (newRule.evidence && existing.evidence.indexOf(newRule.evidence) < 0) {
    existing.evidence = existing.evidence + '；' + newRule.evidence;
  }
  // 合并 dataSource
  if (newRule.dataSource && existing.dataSource.indexOf(newRule.dataSource) < 0) {
    existing.dataSource = existing.dataSource + '；' + newRule.dataSource;
  }
  // 合并 remark
  if (newRule.remark && existing.remark.indexOf(newRule.remark) < 0) {
    existing.remark = existing.remark + '；' + newRule.remark;
  }
  // 评分取较高者
  if (newRule.score > existing.score) {
    existing.score = newRule.score;
    existing.level = scoreToLevel(newRule.score);
  }
  // 如果新规则分类更具体（不是"其他风险"），则更新分类
  if (existing.category === '其他风险' && newRule.category !== '其他风险') {
    existing.category = newRule.category;
    existing.categoryIcon = getCategoryIcon(newRule.category);
  }
}

function parseAndAddRules() {
  var text = document.getElementById('rule-input-text').value.trim();
  if (!text) {
    toast('请输入规则描述', 'warning');
    return;
  }

  // 按序号（数字+点/顿号）或空行分割多条规则
  var blocks = splitRuleBlocks(text);
  var added = 0;
  var merged = 0;
  var parsedRules = [];

  blocks.forEach(function(block) {
    var rule = parseSingleRule(block);
    if (!rule || !rule.item) return;

    // 【核心】检查是否与已有规则重复或同方向
    var existingIdx = -1;
    for (var i = 0; i < taxRiskRulesData.length; i++) {
      if (isSameDirection(taxRiskRulesData[i].item, rule.item)) {
        existingIdx = i;
        break;
      }
    }

    if (existingIdx >= 0) {
      // 找到相同或同方向规则 → 合并丰富，不新增
      mergeRule(taxRiskRulesData[existingIdx], rule);
      merged++;
      parsedRules.push({ action: 'merged', rule: taxRiskRulesData[existingIdx] });
    } else {
      // 没有重复 → 新增
      rule.id = generateNextId();
      taxRiskRulesData.push(rule);
      added++;
      parsedRules.push({ action: 'added', rule: rule });
    }
  });

  var totalChanges = added + merged;
  if (totalChanges > 0) {
    saveTaxRiskRulesToLocal();
    renderTaxRiskRulesList();
    updateCategoryFilterOptions();
    updateLoadButtonText();
    document.getElementById('rule-input-text').value = '';
    var msg = '';
    if (added > 0) msg += '新增 ' + added + ' 条';
    if (merged > 0) msg += (msg ? '，' : '') + '合并丰富 ' + merged + ' 条';
    toast(msg + '（共 ' + taxRiskRulesData.length + ' 条规则）', 'success');
    console.log('[解析结果]', parsedRules);
  } else {
    toast('未能从输入内容中解析出有效规则，请检查输入格式', 'warning');
  }
}

// 将长文本按规则块分割
function splitRuleBlocks(text) {
  // 按序号（数字+点/顿号/括号）或中文序号分割多条规则
  var lines = text.split(/\r?\n/);
  var blocks = [];
  var current = '';
  lines.forEach(function(line) {
    var trimmed = line.trim();
    if (!trimmed) return;
    // 如果这行以数字序号开头（如 1. 2、 3) ），且 current 不为空，则保存上一个块
    if (/^\d+[.、\)]\s/.test(trimmed) && current) {
      blocks.push(current.trim());
      current = '';
    }
    current += (current ? '\n' : '') + trimmed;
  });
  if (current) blocks.push(current.trim());

  // 如果只有1块，尝试按中文序号（一、二、）或（1）（2）再分割
  if (blocks.length <= 1 && text.trim().length > 5) {
    var cnParts = text.split(/(?=[一二三四五六七八九十]+[、．.])/);
    if (cnParts.length > 1) {
      return cnParts.map(function(p) { return p.trim(); }).filter(function(p) { return p.length > 5; });
    }
    var numParts = text.split(/(?=\(\d+\))/);
    if (numParts.length > 1) {
      return numParts.map(function(p) { return p.trim(); }).filter(function(p) { return p.length > 5; });
    }
  }
  return blocks;
}

// 解析单条规则
function parseSingleRule(text) {
  var rule = {
    id: 0,
    category: '其他风险',
    categoryIcon: '🔍',
    item: '',
    detail: '',
    score: 5,
    level: '中风险',
    suggestion: '',
    urgency: '提醒',
    evidence: '',
    dataSource: '',
    remark: ''
  };

  // 1. 提取规则名称（通常是第一句的主语，或"——"前的内容）
  var itemMatch = text.match(/^([^\n—。，；]+?)(?:——|—|：|:|\s+)(.+)/s);
  if (itemMatch) {
    rule.item = itemMatch[1].trim();
    rule.detail = itemMatch[2].trim();
  } else {
    // 没有分隔符，取前15个字作为名称，剩余作为详情
    var firstSentence = text.split(/[。！？\n]/)[0] || text;
    rule.item = firstSentence.substring(0, 30).trim();
    rule.detail = text;
  }

  // 2. 自动分类（关键词匹配）
  rule.category = autoClassify(text);
  rule.categoryIcon = getCategoryIcon(rule.category);

  // 3. 提取评分
  var scoreMatch = text.match(/(?:评分|分数|分值)\s*[:：]?\s*(\d+)/);
  if (scoreMatch) {
    rule.score = parseInt(scoreMatch[1]);
  } else {
    // 从文本情感判断评分
    rule.score = estimateScore(text);
  }

  // 4. 风险等级（由评分决定）
  rule.level = scoreToLevel(rule.score);

  // 5. 提取建议（"建议"后的内容）
  var suggestMatch = text.match(/(?:建议|整改|措施)\s*[:：]\s*([^\n。]+)/);
  if (suggestMatch) {
    rule.suggestion = suggestMatch[1].trim();
  }

  // 6. 提取紧急程度
  if (text.indexOf('紧急') >= 0 || text.indexOf('立即') >= 0) {
    rule.urgency = '紧急';
  } else if (text.indexOf('建议') >= 0 || text.indexOf('注意') >= 0) {
    rule.urgency = '建议';
  }

  // 7. 提取佐证材料（"佐证"、"证据"后的内容）
  var evidenceMatch = text.match(/(?:佐证|证据|材料)\s*[:：]\s*([^\n]+)/);
  if (evidenceMatch) {
    rule.evidence = evidenceMatch[1].trim();
  }

  // 8. 提取数据来源（"数据"、"来源"后的内容）
  var dataMatch = text.match(/(?:数据|来源|依据)\s*[:：]\s*([^\n]+)/);
  if (dataMatch) {
    rule.dataSource = dataMatch[1].trim();
  }

  // 清理：如果item和detail一样长，简化
  if (rule.item.length > 40) {
    rule.item = rule.item.substring(0, 40) + '...';
  }

  return rule;
}

// 自动分类（关键词匹配）
function autoClassify(text) {
  var scores = {};
  var lowerText = text.toLowerCase();

  for (var cat in RULE_CATEGORY_KEYWORDS) {
    var keywords = RULE_CATEGORY_KEYWORDS[cat];
    var count = 0;
    keywords.forEach(function(kw) {
      if (lowerText.indexOf(kw.toLowerCase()) >= 0) count++;
    });
    if (count > 0) scores[cat] = count;
  }

  // 找匹配最多的分类
  var bestCat = '其他风险';
  var bestScore = 0;
  for (var c in scores) {
    if (scores[c] > bestScore) {
      bestScore = scores[c];
      bestCat = c;
    }
  }
  return bestCat;
}

// 获取分类图标
function getCategoryIcon(category) {
  var icons = {
    '账务数据': '📊', '发票合规': '🧾', '发票深度': '🔍', '成本结构': '📈',
    '财税票比对': '🔗', '配比弹性': '📐', '隐匿虚增': '⚠️', '税负水平': '💰',
    '城建税': '🏙️', '房产税': '🏠', '个人所得税': '🧑‍💼', '印花税': '📜',
    '纳税调整': '📝', '收入时点': '📅', '政策执行': '📋', '资金往来': '🏦',
    '薪酬合规': '👥', '客户穿透': '🏢', '供应商穿透': '🏭', '财务健康': '💹',
    '企业信用': '🏛️', '行业专项': '📊', '良好实践': '✅', '经营实质': '🔍',
    '增值税专项': '🔍', '发票异常': '🔍', '费用匹配': '🔍', '企业所得税': '🔍',
    '薪酬福利': '🔍', '其他风险': '🔍'
  };
  return icons[category] || '🔍';
}

// 根据文本情感估算评分
function estimateScore(text) {
  var lower = text.toLowerCase();
  var highRiskWords = ['严重', '紧急', '立即', '必须', '不得', '违法', '失控', '异常', '倒挂', '为负'];
  var midRiskWords = ['注意', '提醒', '可能', '偏低', '偏高', '不足', '缺失', '不匹配'];
  var lowRiskWords = ['建议', '优化', '改善', '良好', '正常', '规范'];

  var highCount = 0, midCount = 0, lowCount = 0;
  highRiskWords.forEach(function(w) { if (lower.indexOf(w) >= 0) highCount++; });
  midRiskWords.forEach(function(w) { if (lower.indexOf(w) >= 0) midCount++; });
  lowRiskWords.forEach(function(w) { if (lower.indexOf(w) >= 0) lowCount++; });

  if (highCount >= 2) return 8;
  if (highCount >= 1) return 7;
  if (midCount >= 2) return 5;
  if (midCount >= 1) return 4;
  if (lowCount >= 2) return 1;
  return 3;
}

// 评分转等级
function scoreToLevel(score) {
  if (score >= 7) return '高风险';
  if (score >= 4) return '中风险';
  if (score >= 1) return '低风险';
  return '良好';
}

// 生成下一个ID
function generateNextId() {
  if (taxRiskRulesData.length === 0) return 1;
  var maxId = 0;
  taxRiskRulesData.forEach(function(r) {
    if (r.id > maxId) maxId = r.id;
  });
  return maxId + 1;
}

// ══════════════════════════════════════════════════════════════
//  五、渲染规则列表
// ══════════════════════════════════════════════════════════════
function renderTaxRiskRulesList(filterData) {
  var data = filterData || taxRiskRulesData;
  var listEl = document.getElementById('risk-rules-list');
  var statsEl = document.getElementById('risk-rules-stats');

  if (!listEl) return;

  if (data.length === 0) {
    listEl.innerHTML = '<div class="risk-rules-empty">暂无规则数据，请在左侧输入区添加规则，或点击"加载61条默认规则"</div>';
  } else {
    // 按分类分组
    var grouped = {};
    data.forEach(function(rule) {
      var cat = rule.category || '未分类';
      if (!grouped[cat]) {
        grouped[cat] = { icon: rule.categoryIcon || '🔍', rules: [] };
      }
      grouped[cat].rules.push(rule);
    });

    // 按分类名称排序
    var sortedCats = Object.keys(grouped).sort();

    var html = '';
    sortedCats.forEach(function(cat) {
      var group = grouped[cat];
      html += ''
        + '<div class="risk-rules-category">'
        + '<div class="category-header">'
        + '<span class="category-icon">' + group.icon + '</span>'
        + '<span class="category-name">' + cat + '</span>'
        + '<span class="category-count">' + group.rules.length + ' 条规则</span>'
        + '</div>'
        + '<div class="category-rules">'
        + group.rules.map(function(rule) { return renderTaxRiskRuleCard(rule); }).join('')
        + '</div>'
        + '</div>';
    });
    listEl.innerHTML = html;
  }

  if (statsEl) {
    var high = data.filter(function(r) { return r.level === '高风险'; }).length;
    var mid = data.filter(function(r) { return r.level === '中风险'; }).length;
    var low = data.filter(function(r) { return r.level === '低风险'; }).length;
    var good = data.filter(function(r) { return r.level === '良好'; }).length;
    statsEl.innerHTML = '共 <strong>' + data.length + '</strong> 条规则 '
      + '<span style="color:#dc2626">🔴 ' + high + '</span> '
      + '<span style="color:#f59e0b">🟡 ' + mid + '</span> '
      + '<span style="color:#3b82f6">🔵 ' + low + '</span> '
      + '<span style="color:#10b981">🟢 ' + good + '</span>';
  }

  // 更新加载按钮上的规则数量
  updateLoadButtonText();
}

// 渲染单条规则卡片
function renderTaxRiskRuleCard(rule) {
  var color = RISK_LEVEL_COLORS[rule.level] || '#666';
  var icon = RISK_LEVEL_ICONS[rule.level] || '⚪';

  return ''
    + '<div class="risk-rule-card" data-id="' + rule.id + '">'
    + '<div class="rule-card-header">'
    + '<span class="rule-level-badge" style="background:' + color + '15;color:' + color + ';">' + icon + ' ' + rule.level + '</span>'
    + '<span class="rule-score-badge">评分: ' + rule.score + '分</span>'
    + '</div>'
    + '<div class="rule-card-body">'
    + '<h4 class="rule-item-name">' + escapeHtml(rule.item) + '</h4>'
    + (rule.detail ? '<p class="rule-detail">' + escapeHtml(rule.detail) + '</p>' : '')
    + (rule.suggestion ? '<p class="rule-suggestion"><strong>建议：</strong>' + escapeHtml(rule.suggestion) + '</p>' : '')
    + (rule.evidence ? '<p class="rule-evidence"><strong>佐证：</strong>' + escapeHtml(rule.evidence).replace(/\n/g, '<br>') + '</p>' : '')
    + (rule.dataSource ? '<p class="rule-data-source"><strong>数据：</strong>' + escapeHtml(rule.dataSource) + '</p>' : '')
    + (rule.remark ? '<p class="rule-data-source"><strong>备注：</strong>' + escapeHtml(rule.remark) + '</p>' : '')
    + '</div>'
    + '<div class="rule-card-footer">'
    + '<span class="rule-urgency">' + (rule.urgency ? '⏰ ' + rule.urgency : '') + '</span>'
    + '<div class="rule-actions">'
    + '<button class="btn-icon" onclick="editRuleInline(' + rule.id + ')" title="编辑">✏️</button>'
    + '<button class="btn-icon" onclick="deleteTaxRiskRule(' + rule.id + ')" title="删除">🗑️</button>'
    + '</div>'
    + '</div>'
    + '</div>';
}

// HTML转义
function escapeHtml(text) {
  if (!text) return '';
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 更新"加载默认规则"按钮上的规则数量
function updateLoadButtonText() {
  var btn = document.getElementById('btn-load-default-rules');
  if (!btn) return;
  var cnt = taxRiskRulesData.length;
  if (cnt > 0) {
    btn.innerHTML = '📥 重新加载默认规则<span style="font-size:11px;opacity:0.8;">（当前 ' + cnt + ' 条）</span>';
  } else {
    btn.innerHTML = '📥 加载61条默认规则';
  }
}

// ══════════════════════════════════════════════════════════════
//  六、编辑与删除
// ══════════════════════════════════════════════════════════════
function deleteTaxRiskRule(id) {
  if (!confirm('确定要删除这条规则吗？')) return;
  var idx = taxRiskRulesData.findIndex(function(r) { return r.id === id; });
  if (idx >= 0) {
    taxRiskRulesData.splice(idx, 1);
    saveTaxRiskRulesToLocal();
    renderTaxRiskRulesList();
    updateCategoryFilterOptions();
    toast('规则删除成功', 'success');
  }
}

// 内联编辑：将规则内容回填到左侧输入框
function editRuleInline(id) {
  var rule = taxRiskRulesData.find(function(r) { return r.id === id; });
  if (!rule) return;

  var text = rule.item;
  if (rule.detail) text += '——' + rule.detail;
  if (rule.score !== undefined) text += '。评分' + rule.score + '分，' + rule.level + '。';
  if (rule.suggestion) text += '建议：' + rule.suggestion + '。';
  if (rule.evidence) text += '佐证：' + rule.evidence + '。';
  if (rule.dataSource) text += '数据：' + rule.dataSource + '。';

  document.getElementById('rule-input-text').value = text;

  // 删除旧规则，等用户重新解析添加
  if (confirm('已将规则内容回填到左侧输入框。是否删除旧规则（重新编辑后添加）？')) {
    var idx = taxRiskRulesData.findIndex(function(r) { return r.id === id; });
    if (idx >= 0) {
      taxRiskRulesData.splice(idx, 1);
      saveTaxRiskRulesToLocal();
      renderTaxRiskRulesList();
      updateCategoryFilterOptions();
    }
  }

  toast('规则已回填到输入框，可修改后重新解析', 'success');
}

// 清空所有规则
function clearAllRules() {
  if (!confirm('确定要清空所有规则吗？此操作不可恢复！')) return;
  taxRiskRulesData = [];
  localStorage.removeItem('taxRiskRulesData');
  renderTaxRiskRulesList();
  updateCategoryFilterOptions();
  toast('所有规则已清空', 'success');
}

// 把浏览器 localStorage 中的规则上传到服务器（方便分析）
async function uploadLocalRulesToServer() {
  var data = localStorage.getItem('taxRiskRulesData');
  if (!data) { toast('本地没有规则数据', 'error'); return; }
  try {
    var resp = await fetch('/api/tax-risk-rules/save-local', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    var result = await resp.json();
    if (result.ok) {
      toast('已上传 ' + result.count + ' 条规则到服务器', 'success');
    } else {
      toast('上传失败: ' + result.error, 'error');
    }
  } catch(e) {
    toast('上传失败: ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════
//  七、过滤与搜索
// ══════════════════════════════════════════════════════════════
function filterTaxRiskRules() {
  var search = (document.getElementById('risk-rules-search').value || '').toLowerCase();
  var category = document.getElementById('risk-rules-filter-category').value;
  var level = document.getElementById('risk-rules-filter-level').value;

  var filtered = taxRiskRulesData.filter(function(rule) {
    var matchSearch = !search ||
      (rule.item && rule.item.toLowerCase().indexOf(search) >= 0) ||
      (rule.detail && rule.detail.toLowerCase().indexOf(search) >= 0) ||
      (rule.suggestion && rule.suggestion.toLowerCase().indexOf(search) >= 0);
    var matchCategory = !category || rule.category === category;
    var matchLevel = !level || rule.level === level;
    return matchSearch && matchCategory && matchLevel;
  });

  renderTaxRiskRulesList(filtered);
}

// 更新分类过滤下拉选项
function updateCategoryFilterOptions() {
  var select = document.getElementById('risk-rules-filter-category');
  if (!select) return;

  // 收集当前所有分类
  var cats = {};
  taxRiskRulesData.forEach(function(r) {
    cats[r.category || '未分类'] = (cats[r.category || '未分类'] || 0) + 1;
  });

  var html = '<option value="">全部分类</option>';
  Object.keys(cats).sort().forEach(function(cat) {
    html += '<option value="' + cat + '">' + cat + ' (' + cats[cat] + ')</option>';
  });
  select.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
//  八、导入导出
// ══════════════════════════════════════════════════════════════
function exportTaxRiskRules() {
  if (taxRiskRulesData.length === 0) {
    toast('没有规则可导出', 'warning');
    return;
  }
  var dataStr = JSON.stringify(taxRiskRulesData, null, 2);
  var blob = new Blob([dataStr], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '涉税风险分析规则_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('规则导出成功：' + taxRiskRulesData.length + ' 条', 'success');
}

function importTaxRiskRules() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (Array.isArray(data)) {
          taxRiskRulesData = data;
        } else if (data.rules && Array.isArray(data.rules)) {
          taxRiskRulesData = data.rules;
        } else {
          throw new Error('无效的规则文件格式');
        }
        saveTaxRiskRulesToLocal();
        renderTaxRiskRulesList();
        updateCategoryFilterOptions();
        toast('规则导入成功，共 ' + taxRiskRulesData.length + ' 条', 'success');
      } catch (err) {
        toast('导入失败：' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ══════════════════════════════════════════════════════════════
//  九、本地存储
// ══════════════════════════════════════════════════════════════
function saveTaxRiskRulesToLocal() {
  localStorage.setItem('taxRiskRulesData', JSON.stringify(taxRiskRulesData));
}
