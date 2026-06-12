"""
涉税风险规则质量检查脚本
对 static/tax_risk_rules_default.json 执行 6 层检查，输出完整报告。
用法: python scripts/audit_rules.py [json_path]
"""
import json
import sys
from collections import Counter
from difflib import SequenceMatcher

def load_rules(path="static/tax_risk_rules_default.json"):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def check_duplicates(data):
    """第1层: ID和名称精确去重"""
    issues = []
    ids = [r["id"] for r in data]
    dup_ids = set(i for i in ids if ids.count(i) > 1)
    if dup_ids:
        issues.append(f"❌ 重复ID: {dup_ids}")

    items = [r["item"] for r in data]
    dup_names = {k: v for k, v in Counter(items).items() if v > 1}
    if dup_names:
        issues.append(f"❌ 重复名称: {dup_names}")

    if not issues:
        print("✅ 第1层: ID和名称全唯一")
    else:
        for i in issues:
            print(i)
    return len(issues) == 0

def check_name_similarity(data, threshold=0.85):
    """第2层: 名称相似度检查"""
    print(f"\n--- 第2层: 名称相似度检查 (≥{threshold:.0%}) ---")
    found = False
    for i in range(len(data)):
        for j in range(i + 1, len(data)):
            ratio = SequenceMatcher(None, data[i]["item"], data[j]["item"]).ratio()
            if ratio >= threshold:
                print(f"  ⚠️ [{ratio:.0%}] \"{data[i]['item']}\" ({data[i]['category']})")
                print(f"          <-> \"{data[j]['item']}\" ({data[j]['category']})")
                found = True
    if not found:
        print("  无高相似度名称")
    return not found

def check_detail_similarity(data, threshold=0.80):
    """第3层: detail 相似度检查（同分类+跨分类）"""
    print(f"\n--- 第3层: detail 相似度检查 (≥{threshold:.0%}) ---")
    
    # 同分类
    by_cat = {}
    for r in data:
        by_cat.setdefault(r["category"], []).append(r)
    
    found = False
    for cat, rules in by_cat.items():
        for i in range(len(rules)):
            for j in range(i + 1, len(rules)):
                ratio = SequenceMatcher(None, rules[i]["detail"], rules[j]["detail"]).ratio()
                if ratio >= threshold:
                    print(f"  ⚠️ [同分类:{cat}] \"{rules[i]['item']}\" <-> \"{rules[j]['item']}\" ({ratio:.0%})")
                    found = True

    # 跨分类
    for i in range(len(data)):
        for j in range(i + 1, len(data)):
            if data[i]["category"] != data[j]["category"]:
                ratio = SequenceMatcher(None, data[i]["detail"], data[j]["detail"]).ratio()
                if ratio >= threshold:
                    print(f"  ⚠️ [跨分类] \"{data[i]['item']}\"({data[i]['category']}) <-> \"{data[j]['item']}\"({data[j]['category']}) ({ratio:.0%})")
                    found = True
    
    if not found:
        print("  无高相似度 detail")
    return not found

def check_semantic_overlap(data):
    """第4层: 语义同类规则检查（跨分类关键词扫描）"""
    print("\n--- 第4层: 跨分类语义同类检查 ---")
    
    keyword_groups = {
        "零申报/零税额": ["零申报", "零税额"],
        "留抵退税/留抵": ["留抵退税", "留抵", "进项留抵"],
        "红冲/作废": ["红冲", "作废"],
        "开票限额/顶额": ["顶额", "开票限额", "开票.*匹配"],
        "进项转出": ["进项转出", "进项税额转出"],
        "发票跨期": ["跨期", "跨年"],
        "税负率": ["税负率"],
        "小规模纳税人": ["小规模", "一般纳税人"],
        "咨询费/服务费": ["咨询", "服务费"],
        "资金回流": ["资金回流"],
    }
    
    issues = []
    for group_name, keywords in keyword_groups.items():
        matches = []
        seen = set()
        for kw in keywords:
            for r in data:
                combined = r["item"] + r["detail"]
                if kw in combined and r["item"] not in seen:
                    seen.add(r["item"])
                    matches.append(r)
        
        if len(matches) > 1:
            cats = set(m["category"] for m in matches)
            if len(cats) > 1:
                print(f"  🔍 {group_name} (跨{len(cats)}分类, {len(matches)}条):")
                for m in matches:
                    print(f"       [{m['category']}] \"{m['item']}\"")
    
    return True  # semantic overlap is informational, not always an error

def check_fragment_categories(data, min_rules=2):
    """第5层: 碎片分类检测"""
    print(f"\n--- 第5层: 碎片分类检测 (<{min_rules}条) ---")
    cats = Counter(r["category"] for r in data)
    fragments = [(cat, cnt) for cat, cnt in cats.items() if cnt < min_rules]
    
    if fragments:
        print("  ⚠️ 以下分类规则过少，建议合并:")
        for cat, cnt in fragments:
            items = [r["item"] for r in data if r["category"] == cat]
            print(f"       [{cat}] ({cnt}条): {', '.join(items)}")
    else:
        print("  无碎片分类")
    return len(fragments) == 0

def check_misplacement(data):
    """第6层: 归类不当检测（税种关键词 vs 分类）"""
    print("\n--- 第6层: 归类不当检测 ---")
    
    # 各税种的"合理归属分类"
    tax_category_map = {
        "增值税": ["增值税专项", "申报比对", "发票合规", "发票异常", "发票深度", "税负水平"],
        "进项税额": ["增值税专项", "申报比对", "发票合规", "发票异常", "发票深度", "交易特征"],
        "销项税额": ["增值税专项", "申报比对", "发票合规", "发票异常", "发票深度"],
        "企业所得税": ["企业所得税", "纳税调整", "成本结构", "财务健康"],
        "汇算清缴": ["企业所得税", "纳税调整"],
        "纳税调增": ["企业所得税", "纳税调整", "成本结构"],
        "个人所得税": ["个人所得税"],
        "个税": ["个人所得税", "薪酬福利"],
        "代扣代缴": ["个人所得税"],
    }
    
    found = False
    for r in data:
        detail = r["detail"] + r["suggestion"]
        for tax_kw, allowed_cats in tax_category_map.items():
            if tax_kw in detail and r["category"] not in allowed_cats:
                print(f"  ⚠️ [{r['category']}] \"{r['item']}\" 含\"{tax_kw}\"关键词，可能归类不当")
                found = True
    
    if not found:
        print("  无归类异常")
    return not found

def check_level_consistency(data):
    """第7层: level 字段一致性"""
    print("\n--- 第7层: level 字段一致性 ---")
    valid_levels = {"高风险", "中风险", "低风险", "良好"}
    issues = []
    for r in data:
        if r["level"] not in valid_levels:
            issues.append(f"  ⚠️ [{r['category']}] \"{r['item']}\" level=\"{r['level']}\" 不标准")
    
    if issues:
        for i in issues:
            print(i)
    else:
        print("  ✅ 所有 level 字段规范")
    return len(issues) == 0

def check_score_range(data, max_spread=5):
    """第8层: 同分类评分跨度检查"""
    print(f"\n--- 第8层: 同分类评分跨度检查 (>={max_spread}分) ---")
    by_cat = {}
    for r in data:
        by_cat.setdefault(r["category"], []).append(r)
    
    found = False
    for cat, rules in by_cat.items():
        scores = sorted([r["score"] for r in rules])
        if len(scores) > 1 and max(scores) - min(scores) >= max_spread:
            print(f"  ⚠️ [{cat}] 评分跨度 {min(scores)}~{max(scores)}: {[r['item'] for r in rules]}")
            found = True
    
    if not found:
        print("  评分分布合理")
    return not found

def print_summary(data):
    """打印汇总"""
    cats = Counter(r["category"] for r in data)
    levels = Counter(r["level"] for r in data)
    scores = [r["score"] for r in data]
    
    print(f"\n{'='*50}")
    print(f"📊 规则库概览")
    print(f"{'='*50}")
    print(f"  总规则: {len(data)}")
    print(f"  总分类: {len(cats)}")
    print(f"  风险等级: {dict(levels)}")
    print(f"  评分范围: {min(scores)}~{max(scores)} (均分{sum(scores)/len(scores):.1f})")
    print(f"\n  分类分布:")
    for cat, cnt in cats.most_common():
        bar = "█" * cnt
        print(f"    {cat:12s} {bar} {cnt}")

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "static/tax_risk_rules_default.json"
    print(f"🔍 检查文件: {path}\n")
    
    data = load_rules(path)
    
    results = {
        "ID/名称去重": check_duplicates(data),
        "名称相似度": check_name_similarity(data, 0.85),
        "detail相似度": check_detail_similarity(data, 0.80),
        "语义同类": check_semantic_overlap(data),
        "碎片分类": check_fragment_categories(data, 2),
        "归类不当": check_misplacement(data),
        "level一致性": check_level_consistency(data),
        "评分跨度": check_score_range(data, 5),
    }
    
    print_summary(data)
    
    errors = sum(1 for v in results.values() if not v)
    print(f"\n{'='*50}")
    if errors == 0:
        print("✅ 全部检查通过！")
    else:
        print(f"⚠️ 发现 {errors} 项需关注的问题")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
