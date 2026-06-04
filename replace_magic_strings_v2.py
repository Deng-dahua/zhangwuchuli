#!/usr/bin/env python3
"""
replace_magic_strings_v2.py
精准替换有歧义的魔法字符串，根据上下文选择合适的 STATUS 常量。
"""
import re, sys

FILE = 'static/index.html'
with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

def smart_replace(text):
    orig = text

    # 1. 勾选状态（无歧义）
    text = text.replace("'已勾选'", 'STATUS.CHECKED')
    text = text.replace("'未勾选'", 'STATUS.UNCHECKED')
    text = text.replace('"已勾选"', 'STATUS.CHECKED')
    text = text.replace('"未勾选"', 'STATUS.UNCHECKED')

    # 2. 发票状态字符串（作废/红冲，无歧义）
    text = text.replace("'作废'", 'STATUS.VOID')
    text = text.replace("'红冲'", 'STATUS.RED')

    # 3. 认证/抵扣状态
    text = text.replace("'已认证'", 'STATUS.CERTIFIED')
    text = text.replace("'已抵扣'", 'STATUS.DEDUCTED')
    text = text.replace("'部分抵扣'", 'STATUS.PARTIAL')
    text = text.replace("'不得抵扣'", 'STATUS.NOT_DEDUCTIBLE')

    # 4. 根据上下文替换 '正常'
    # 4a. invoice status 上下文：i.status / inv.status / invoice.status === '正常'
    text = re.sub(r"(\.status\s*===?\s*)'正常'", r"\1STATUS.NORMAL", text)
    text = re.sub(r"(\.status\s*!==?\s*)'正常'", r"\1STATUS.NORMAL", text)
    text = re.sub(r"(\.status\s*!==?\s*)'正常'", r"\1STATUS.NORMAL", text)
    # invoice_status 字段值
    text = re.sub(r"(invoice_status\s*===\s*)'正常'", r"\1STATUS.NORMAL", text)
    # badge 判断中的 '正常'（发票）
    text = re.sub(r"(stCls\s*=\s*i\.status\s*===\s*)'正常'", r"\1STATUS.NORMAL", text)

    # 4b. risk_level 上下文
    text = re.sub(r"(\.risk_level\s*===?\s*)'正常'", r"\1STATUS.RISK_NORMAL", text)
    text = re.sub(r"('正常'\s*:\s*'#059669')", "STATUS.RISK_NORMAL + \"': '#059669'", text)

    # 4c. 风险等级 tab / 统计卡片中的 '正常'
    # risk_level filter
    text = re.sub(r"(risk_level\s*===\s*)'正常'", r"\1STATUS.RISK_NORMAL", text)

    # 5. 风险等级字符串
    text = text.replace("'疑点'", 'STATUS.RISK_WARN')
    text = text.replace("'异常'", 'STATUS.RISK_ABNORMAL')
    text = text.replace("'失控'", 'STATUS.RISK_LOST')

    # 6. 关注状态
    text = text.replace("'关注'", 'STATUS.FOLLOW_ATTENTION')

    # 7. PSI label 中的状态字符串（付款统计）
    text = re.sub(r"'>待审批</div>", '>' + "', STATUS.PENDING, '" + '</div>', text)
    # 这个用正则太复杂，直接替换函数调用处

    return text

new_content = smart_replace(content)
changes = sum(1 for a, b in zip(content, new_content) if a != b)
if changes == 0:
    print('[INFO] 没有需要替换的内容')
else:
    with open(FILE, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f'[OK] 精准替换完成，修改字符数：{changes}')
    print('[WARN] 请手动检查 invoice status / risk_level 上下文的 STATUS 常量引用是否正确')
