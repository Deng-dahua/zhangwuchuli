# 财税系统全面审计报告

**日期**: 2026-06-05 | **版本**: ac1fef4 | **审计范围**: database.py / main.py / salary.py / vat.py / index.html / 全部JS / 交叉一致性

---

## 概览

| 级别 | 后端 | 前端 | 交叉 | 合计 |
|------|------|------|------|------|
| **P0** 致命 | 3 | 5 | 2 | **10** |
| **P1** 错误行为 | 8 | 12 | 1 | **21** |
| **P2** 代码质量 | 11 | 6 | 2 | **19** |
| **合计** | **22** | **23** | **5** | **50** |

---

## P0 — 致命问题（必须立即修复）

### P0-1: VAT端点缺少 company_id 隔离 — 跨公司越权

> **文件**: vat.py:74, 106, 128, 138 | **影响**: 数据泄露/篡改

`get_vat_declaration`/`update_vat_declaration`/`delete_vat_declaration`/`recompute_vat_declaration` 四个端点仅按 `declaration_id` 查询，完全不加 `company_id` 过滤。任何用户猜 ID 即可跨公司操作增值税申报数据。

**修复**: 各端点增加 `company_id` 查询参数并在 SQL 中加 `.filter(VATDeclaration.company_id == company_id)`。

---

### P0-2: VAT日期硬编码 "-31" — 2月数据丢失

> **文件**: vat.py:63, 167-168, 413-415 | **影响**: 2月VAT计算错误

```python
period + "-31"  # 2月没有31号
```

**修复**: 使用 `calendar.monthrange` 动态计算月末日期。

---

### P0-3: 删除公司不级联清理 — 大量孤儿数据

> **文件**: main.py:1069-1077 | **影响**: 15+张表残留

`delete_company` 仅删除 Company 记录，但 departments/employees/accounts/journal_entries/sales_invoices/purchase_invoices/bank_transactions 等 20+ 张业务表未级联清理。新公司如果分配到相同自增 ID 会被旧数据污染。

**修复**: 删除前逐表清理关联数据，或模型层面配置 cascade。

---

### P0-4: salary.js `api()` 签名与 core.js 不兼容

> **文件**: static/js/salary.js:79, 247 | **影响**: 工资CRUD可能全部失效

```javascript
// salary.js 三参数调用
api(url, data, { method })  // ❌ core.js 只接受 (url, options)

// salary.js 对象参数
api('/api/salary/records', { period: currentSalaryPeriod })
// ❌ {period:...} 被当成 fetch options，后端收不到 period 参数
```

**修复**: 重写为 `api('/api/salary/records?period=' + encodeURIComponent(currentSalaryPeriod))`。

---

### P0-5: salary.js `showToast()` 不存在

> **文件**: static/js/salary.js:250, 260, 270, 328, 341, 351 | **影响**: ReferenceError

`core.js` 定义的函数是 `toast(msg, type)`，不是 `showToast()`。6处调用全部报错。

**修复**: 统一改为 `toast()`。

---

### P0-6: salary.js 操作不存在的 `#app` 元素

> **文件**: static/js/salary.js:27 | **影响**: 工资页渲染失效

```javascript
const app = document.getElementById('app'); // ❌ 不存在
app.innerHTML = `...`; // TypeError: Cannot set property of null
```

**修复**: 使用路由系统提供的 `container` 参数，或 `document.getElementById('page-salary')`。

---

### P0-7: `closeModal()` 跨文件冲突

> **文件**: chat.js:212-214 vs salary.js:369-372 | **影响**: Modal关闭异常

- chat.js: `closeModal()` — 删除 `#modal-overlay`
- salary.js: `closeModal(id)` — 重载后覆盖前者

当全局 modal 和 salary modal 同时存在时，关闭可能不正确。

**修复**: 统一为接受可选 id 参数的单一实现。

---

### P0-8: company.js `saveCompanyDetail()` 引用未定义变量

> **文件**: static/js/company.js:200 | **影响**: ReferenceError

```javascript
showCompanyManager(container);  // ❌ container 未定义
```

**修复**: 传入正确的容器选择器或移除该调用。

---

### P0-9: VAT创建端点 company_id 从请求体获取

> **文件**: vat.py:36-37 | **影响**: company_id 可伪造

```python
company_id = data.get("company_id", 1)  # 在请求体中，可被篡改
```

与其他所有端点 `company_id: int = Query(1)` 模式不一致，攻击者可伪造 company_id。

**修复**: 改为查询参数。

---

### P0-10: 工资模块无联合唯一约束

> **文件**: database.py SalaryRecord 模型 | **影响**: 同一员工同期重复录入

缺少 `(company_id, period, id_number)` 联合唯一约束，导致累计预扣法计算时"取上一条"结果不确定。

**修复**: 添加 `UniqueConstraint('company_id', 'period', 'id_number')`。

---

## P1 — 错误行为

### 后端

| # | 问题 | 文件 | 行号 |
|---|------|------|------|
| 1 | 累计预扣法个税计算 — 扣除额未累计（只用本月值） | salary.py | 180-225 |
| 2 | 实发工资未扣除社保公积金 | salary.py | 724 |
| 3 | 科目余额表树形汇总可能双重计数（父级自身分录重复加） | main.py | 3028-3037 |
| 4 | 通用导入员工不检查 id_card 去重（仅工资模块检查） | main.py | 5199-5204 |
| 5 | 会计科目分类错误：预收账款(资产→应负债)、预付账款(负债→应资产) | database.py | 1643-1658 |
| 6 | 进项税额二级科目方向标"借"与父级"贷"矛盾 | database.py | 1664 |
| 7 | 所有端点 company_id 默认值=1 — 忘传参数时静默操作错误公司 | 全文~50处 | - |
| 8 | 银行流水凭证去重依赖摘要文本匹配（脆弱） | database.py | 1524-1531 |

### 前端

| # | 问题 | 文件 | 区域 |
|---|------|------|------|
| 9 | 侧边栏"增值税申报"重复出现在两个导航分组 | index.html | 124,153 |
| 10 | XSS风险 — 大量 innerHTML 拼接用户数据未转义 | 多文件 | 股东名/身份证号等 |
| 11 | 银行流水/序时账/发票表格无分页（大量数据时性能问题） | bank-vat.js/journal.js/invoices.js | - |
| 12 | salary.js 等模块使用 alert() 代替 toast() | salary.js | ~10处 |
| 13 | STATUS.FOLLOW_ATTENTION 常量未定义 | invoices.js | 210,859 |
| 14 | 年份硬编码2020-2030 — 2031年失效 | core.js | 209 |
| 15 | onGlobalPeriodConfirm 直接引用未加载模块的全局变量 | core.js | 245-254 |
| 16 | renderJournal 等函数被无 container 参数调用 | journal.js | 133-135 |
| 17 | Modal 堆叠无保护 — 可同时打开多个弹窗 | 全局 | - |
| 18 | 工资模块 colspan=11 硬编码 | salary.js | 60 |
| 19 | company.js 多行用户数据未转义直接拼 innerHTML | company.js | 58,69,80,91 |
| 20 | 银行流水一次性加载数据无分页 | bank-vat.js | 68-116 |

---

## P2 — 代码质量

### 后端

| # | 问题 | 文件 | 行号 |
|---|------|------|------|
| 1 | Float 类型存金额 — 浮点精度丢失风险 | database.py | 全文 |
| 2 | 废弃 API: `sqlalchemy.ext.declarative.declarative_base` | database.py | 9 |
| 3 | 废弃 API: `@app.on_event("startup")` | main.py | 50-52 |
| 4 | 文件上传无大小限制（DoS风险） | main.py | 4634,4757,5613 |
| 5 | 文件上传无扩展名白名单 | main.py | 4768 |
| 6 | 裸 except 吞没异常 | database.py/main.py | 多处 |
| 7 | force 导入 _fingerprint 使用行号后缀（可碰撞） | main.py | 5019,5103 |
| 8 | VAT update 用无类型验证的 dict | vat.py | 106 |
| 9 | init_db() 每次启动都重跑迁移 | database.py | 1854-1857 |
| 10 | 文件上传先用 await file.read() 读入内存再检查格式 | 多处 | - |
| 11 | 大量 except: pass 吞没所有异常包括中断 | 多处 | - |

### 前端

| # | 问题 | 文件 | 区域 |
|---|------|------|------|
| 12 | 内联样式过多（AI助手菜单、period-picker onclick） | index.html | 54,173 |
| 13 | 期间管理页面无侧边栏入口（死代码） | core.js/index.html | - |
| 14 | 按钮样式 btn-info/btn-warning 未定义 | salary.js | 36 |
| 15 | salary.js 不使用 core.js 路由容器（单独操作 DOM） | salary.js | 27 |
| 16 | var/let 混用 | 多文件 | - |
| 17 | 多模块重复定义 escapeHtml/esc 等函数 | chat.js/salary.js/archives.js | - |
| 18 | chat.js 与 salary.js 的 escHtml/escapeHtml 功能不同 | 两个文件 | - |
| 19 | 工资模块使用 fetch() 绕过了 api() 的统一错误处理 | salary.js | 324 |

---

## 修复优先级排序

### 🔴 立即修复（本周）

1. **P0-4/5/6** — salary.js 三个致命 bug（api签名/函数名/元素ID），导致工资模块前端基本不可用
2. **P0-1/9** — VAT 模块 company_id 隔离缺失，安全漏洞
3. **P0-7** — closeModal 冲突修复
4. **P0-8** — company.js 变量未定义
5. **P0-10** — 工资表唯一约束

### 🟡 尽快修复（本周内）

6. **P0-2** — 2月日期硬编码
7. **P1-1/2** — 个税计算逻辑 + 实发工资公式
8. **P1-3** — 科目余额表双重计数
9. **P1-5** — 员工通用导入去重
10. **P1-7/8** — 科目分类和方向错误

### 🟢 计划修复（下个迭代）

11. **P0-3** — 删除公司级联清理（需仔细设计）
12. **P1-9~20** — 前端 XSS/分页/alert 替换等
13. **P2 全部** — 代码质量提升

---

## 正面发现

- ✅ 序时账借贷平等校验严格执行
- ✅ 多公司 company_id 隔离机制在大多数端点正确实施
- ✅ 银行流水双分录凭证（借=贷）实现正确
- ✅ 发票去重全行指纹逻辑跨模块一致
- ✅ 进项抵扣凭证自动生成+去重逻辑完善
- ✅ SQL注入防护良好（使用参数化查询）
- ✅ 前端代码模块化拆分（14个JS文件）
