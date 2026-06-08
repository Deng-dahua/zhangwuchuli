"""
财税系统 - AI 智能助手对话引擎
从 main.py 提取，独立模块化管理
"""
from fastapi import APIRouter, Depends, Query, UploadFile, File, Form
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
import os
import csv
import io
import re
import uuid
import json
import openpyxl
from pypdf import PdfReader

from database import (
    get_db, Customer, Supplier, Employee, JournalEntry, Account,
)

router = APIRouter()

# ==================== 数据模型 ====================

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

sessions: dict = {}  # { session_id: { "intent": str, "step": int, "data": dict, "updated": float } }

def get_session(sid: str):
    if sid not in sessions:
        sessions[sid] = {"intent": None, "step": 0, "data": {}, "updated": 0}
    return sessions[sid]


# ==================== 意图识别与文本提取 ====================

def intent_from_text(msg: str) -> str:
    """从消息中识别意图 — 基于关键词优先级得分匹配，返回置信度最高的意图"""
    msg_lower = msg.strip().lower()

    # 文件上传 — 最高优先级，先于所有其他意图
    if msg_lower.startswith("[上传文件]"):
        return "file_upload"

    # 意图关键词库：(intent_name, [(pattern_regex, score), ...])
    # score 越高越优先；正则基于 msg_lower 匹配
    INTENTS = [
        ("create_voucher", [
            (r"\b(录[入记]凭证|制[单证]|做[一]?[笔张]?(账|分录|凭证)|填制凭证|记[账一]笔|录入分录)\b", 20),
            (r"(添加|新增|录入).{0,4}(凭证|分录)", 15),
            (r"nova.*voucher", 10),
        ]),
        ("list_vouchers", [
            (r"\b(查[看询]?凭证|凭证列[表出]|序时账|日记账|会计分录)\b", 20),
            (r"voucher.*list", 10),
            (r"(查|看|显示).{0,4}(凭证|分录)", 10),
        ]),
        ("create_customer", [
            (r"\b(新[增添加][客]户|录入客户|添加客户|建档.*客户|客户.*建档)\b", 20),
            (r"new.*customer|create.*customer", 10),
            (r"(添加|新增|录入).{0,4}客户", 15),
        ]),
        ("list_customers", [
            (r"\b(查[看询]?客户|客户列[表出]|客户管理)\b", 20),
            (r"(查|看).{0,4}客户", 10),
        ]),
        ("create_supplier", [
            (r"\b(新[增添加]供应商|录入供应商|添加供应商|建档.*供应商|供应商.*建档)\b", 20),
            (r"new.*supplier|create.*supplier", 10),
            (r"(添加|新增|录入).{0,4}供应商", 15),
        ]),
        ("list_suppliers", [
            (r"\b(查[看询]?供应商|供应商列[表出]|供应商管理)\b", 20),
            (r"(查|看).{0,4}供应商", 10),
        ]),
        ("create_employee", [
            (r"\b(新[增添加](员工|人员|职员)|录入(员工|人员)|添加(员工|人员))\b", 20),
            (r"new.*employee|create.*employee", 10),
            (r"(添加|新增|录入|建档).{0,4}(员工|人员|职员)", 15),
        ]),
        ("list_employees", [
            (r"\b(查[看询]?(员工|人员|职员)|(员工|人员|职员)列[表出])\b", 20),
            (r"(查|看).{0,4}(员工|人员|职员)", 10),
        ]),
        ("query_profit_loss", [
            (r"\b(利润表|损益表|利润报表|损益报表)\b", 20),
            (r"\bprofit.*loss|loss.*profit\b", 10),
            (r"(查|看|生成).{0,4}(利润|损益)", 12),
        ]),
        ("query_balance_sheet", [
            (r"\b(资产负债表|资产负债|balance\s*sheet)\b", 20),
            (r"(查|看|生成).{0,4}(资产|负债).{0,4}表", 12),
        ]),
        ("query_general_ledger", [
            (r"\b(总账|总分类账|general\s*ledger)\b", 20),
            (r"(查|看).{0,4}总账", 15),
        ]),
        ("query_detail_ledger", [
            (r"\b(明细账|明细分类账|detail\s*ledger)\b", 20),
            (r"(查|看).{0,4}明细", 12),
        ]),
        ("company_info", [
            (r"\b((公司|企业)信息|设置公司|录入公司|公司设置)\b", 20),
            (r"(修改|编辑|查看).{0,4}(公司|企业)", 12),
        ]),
        ("list_accounts", [
            (r"\b(科目表|科目列表|会计科目|chart\s*of\s*account)\b", 20),
            (r"(查|看|浏览).{0,4}科目", 12),
        ]),
        ("dashboard", [
            (r"\b(看板|dashboard|数据概览|统计看板|首页)\b", 20),
            (r"(看|打开).{0,4}(看板|概览|面板)", 12),
        ]),
        ("help", [
            (r"\b(帮助|help|能做什么|会什么|功能|指令|命令|怎么用)\b", 20),
        ]),
        ("cancel", [
            (r"\b(取消|退出|算了|不要了|返回|撤销)\b", 20),
        ]),
    ]

    # 得分制匹配：计算每个意图的总分，选最高分
    best_intent = None
    best_score = 0
    for intent_name, patterns in INTENTS:
        score = 0
        for pattern_regex, pattern_score in patterns:
            if re.search(pattern_regex, msg_lower):
                score += pattern_score
        if score > best_score:
            best_score = score
            best_intent = intent_name

    # 智能问询：如果没有任何匹配，尝试自然语言判断
    if best_score == 0:
        # 问报表
        if re.search(r"(看|查|显示).{0,4}(报表|报告)", msg_lower):
            return "query_general_ledger"
        # 问数据
        if re.search(r"(多少|几个|哪些|什么)", msg_lower):
            return "query_general_ledger"

    return best_intent


def extract_date(text: str) -> Optional[str]:
    """从自由文本中提取日期"""
    m = re.search(r"(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})[日号]?", text)
    if m:
        raw = m.group(1)
        raw = raw.replace("年", "-").replace("月", "-").replace("/", "-")
        parts = raw.split("-")
        if len(parts) == 3:
            return f"{parts[0]}-{parts[1].zfill(2)}-{parts[2].zfill(2)}"
    # 仅年月
    m = re.search(r"(\d{4})[-/年](\d{1,2})[月]?", text)
    if m:
        return f"{m.group(1)}-{m.group(2).zfill(2)}-01"
    return None


def extract_amount(text: str) -> Optional[float]:
    """从文本中提取金额"""
    m = re.search(r"(\d+\.?\d*)\s*(万|万元|元|块|块钱)?", text)
    if m:
        amt = float(m.group(1))
        if m.group(2) in ("万", "万元"):
            amt *= 10000
        return round(amt, 2)
    return None


def extract_number(text: str) -> Optional[int]:
    """从文本中提取数字"""
    m = re.search(r"(\d+)", text)
    return int(m.group(1)) if m else None


# ==================== 文件读取与上传 ====================

def read_excel_content(file_bytes: bytes, filename: str) -> str:
    """读取 Excel 文件内容"""
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    lines = [f"[Excel] {filename}"]
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        lines.append(f"\n--- 工作表: {sheet_name} ---")
        headers = []
        for col in range(1, ws.max_column + 1):
            cell = ws.cell(row=1, column=col)
            headers.append(str(cell.value) if cell.value is not None else "")
        lines.append(" | ".join(headers))
        lines.append("-" * 60)
        row_count = 0
        for row in range(2, ws.max_row + 1):
            vals = []
            for col in range(1, ws.max_column + 1):
                cell = ws.cell(row=row, column=col)
                vals.append(str(cell.value) if cell.value is not None else "")
            if any(v.strip() for v in vals):
                lines.append(" | ".join(vals))
                row_count += 1
                if row_count >= 200:
                    lines.append(f"... (共 {ws.max_row - 1} 行，仅显示前 200 行)")
                    break
        lines.append(f"→ 共 {ws.max_row - 1} 行数据\n")
    return "\n".join(lines)


def read_csv_content(file_bytes: bytes, filename: str) -> str:
    """读取 CSV 文件内容"""
    text = file_bytes.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return f"[CSV] {filename}\n(空文件)"
    lines = [f"[CSV] {filename}"]
    lines.append(" | ".join(rows[0]))
    lines.append("-" * 60)
    for i, row in enumerate(rows[1:], 1):
        lines.append(" | ".join(row))
        if i >= 200:
            lines.append(f"... (共 {len(rows) - 1} 行，仅显示前 200 行)")
            break
    return "\n".join(lines)


def read_pdf_content(file_bytes: bytes, filename: str) -> str:
    """读取 PDF 文件文本内容"""
    reader = PdfReader(io.BytesIO(file_bytes))
    lines = [f"[PDF] {filename}"]
    total_text = ""
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text:
            total_text += text + "\n"
    if not total_text.strip():
        return f"[PDF] {filename}\n(无法提取文本内容，可能是扫描件或图片型 PDF)"
    if len(total_text) > 5000:
        total_text = total_text[:5000] + f"\n...(共 {len(total_text)} 字符，仅显示前 5000)"
    lines.append(total_text.strip())
    return "\n".join(lines)


@router.post("/api/chat/upload")
async def upload_file(
    file: UploadFile = File(...),
    session_id: str = Form("")
):
    """上传文件并识别内容"""
    try:
        content_bytes = await file.read()
        fname = file.filename or "unknown"
        ext = os.path.splitext(fname)[1].lower()

        if ext in (".xlsx", ".xls"):
            content = read_excel_content(content_bytes, fname)
        elif ext == ".csv":
            content = read_csv_content(content_bytes, fname)
        elif ext == ".pdf":
            content = read_pdf_content(content_bytes, fname)
        elif ext in (".txt", ".md", ".log"):
            text = content_bytes.decode("utf-8")
            if len(text) > 5000:
                text = text[:5000] + f"\n...(共 {len(text)} 字符，仅显示前 5000)"
            content = f"[文本] {fname}\n{text}"
        elif ext in (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"):
            content = f"[图片] {fname}\n(不支持图片文字识别，请直接描述需求或将数据整理为 Excel/CSV 格式上传)"
        else:
            return {"error": f"不支持的文件格式：{ext}。支持格式：xlsx, csv, pdf, txt, md, log", "session_id": session_id}

        return {
            "file_name": fname,
            "file_type": ext,
            "content": content,
            "session_id": session_id
        }
    except Exception as e:
        return {"error": f"文件处理失败：{str(e)}", "session_id": session_id}


# ==================== 主对话接口 ====================

@router.post("/api/chat")
def chat_endpoint(payload: ChatRequest, company_id: int = Query(...), db: Session = Depends(get_db)):
    """AI 助手对话接口"""
    message = payload.message.strip()
    sid = payload.session_id or str(uuid.uuid4())
    sess = get_session(sid)

    if not message:
        return {"reply": "请说点什么吧 😊", "session_id": sid, "action": None}

    # 取消当前流程
    if re.search(r"^(取消|退出|算了|不要了|返回)$", message):
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        return {"reply": "好的，已取消当前操作。你可以随时开始新的任务。\n\n💡 试试这些：\n• 录入凭证\n• 新增客户\n• 查看利润表\n• 公司信息", "session_id": sid, "action": None}

    intent = intent_from_text(message)

    # 如果在流程中
    if sess["intent"]:
        intent = sess["intent"]
    elif intent == "cancel":
        sess["intent"] = None
        return {"reply": "当前没有进行中的任务。有什么我可以帮你的？", "session_id": sid, "action": None}

    # ────────────── 录入凭证 ──────────────
    if intent == "create_voucher":
        return handle_create_voucher(sess, message, db, sid, company_id)

    # ────────────── 新增客户 ──────────────
    if intent == "create_customer":
        return handle_create_customer(sess, message, db, sid, company_id)

    # ────────────── 新增供应商 ──────────────
    if intent == "create_supplier":
        return handle_create_supplier(sess, message, db, sid, company_id)

    # ────────────── 新增员工 ──────────────
    if intent == "create_employee":
        return handle_create_employee(sess, message, db, sid, company_id)

    # ────────────── 查询类 ──────────────
    if intent == "query_profit_loss":
        sess["intent"] = None
        today = date.today().strftime("%Y-%m")
        return {"reply": f"📅 请告诉我你要查询的期间范围，例如：\n• `{today}` → 查 {today} 月\n• `2026-01 到 2026-05` → 查1-5月", "session_id": sid, "action": None}

    if intent == "query_balance_sheet":
        sess["intent"] = None
        today = date.today().strftime("%Y-%m")
        return {"reply": f"📅 请告诉我你要查询的截止期间，例如：\n• `{today}` → 截止 {today} 月", "session_id": sid, "action": None}

    if intent == "query_general_ledger":
        return handle_query_general(sess, message, db, sid)

    if intent == "query_detail_ledger":
        return handle_query_detail(sess, message, db, sid)

    if intent == "list_vouchers":
        sess["intent"] = None
        return handle_list_vouchers(message, db, sid)

    if intent in ("list_customers", "list_suppliers", "list_employees", "list_accounts"):
        sess["intent"] = None
        return {"reply": f"✅ 请打开侧边栏的对应页面查看。\n💡 提示：你可以说「新增客户」来快捷录入。", "session_id": sid, "action": {"type": "navigate", "page": intent.replace("list_", "")}}

    if intent == "company_info":
        sess["intent"] = None
        return {"reply": "🏢 请打开侧边栏「公司信息」页面填写。\n你也可以直接告诉我：\n• 公司名称\n• 统一社会信用代码\n• 法定代表人\n• 地址电话等\n\n我会帮你一次性填好！", "session_id": sid, "action": None}

    if intent == "dashboard":
        sess["intent"] = None
        return {"reply": "📊 请打开侧边栏「数据看板」查看统计。", "session_id": sid, "action": {"type": "navigate", "page": "dashboard"}}

    if intent == "help":
        sess["intent"] = None
        return {
            "reply": "🤖 **我能帮你做什么？**\n\n"
                     "**📝 录入数据**\n"
                     "• 「录入凭证」— 智能引导填制记账凭证\n"
                     "• 「新增客户」— 添加客户档案\n"
                     "• 「新增供应商」— 添加供应商档案\n"
                     "• 「新增员工」— 添加员工信息\n\n"
                     "**📊 查询报表**\n"
                     "• 「查看利润表」— 查询损益表\n"
                     "• 「查看资产负债表」— 查询资产负债表\n"
                     "• 「总账」— 查询总账\n"
                     "• 「明细账」— 查询明细账\n\n"
                     "**💬 自然对话**\n"
                     "直接告诉我你要做什么，我会引导你一步步完成。\n"
                     "例如：「录入一笔采购原材料的凭证，5月28日，金额32000元」\n\n"
                     "输入「取消」可随时退出当前流程。",
            "session_id": sid,
            "action": None
        }

    # ────────────── 文件上传 ──────────────
    if intent == "file_upload":
        return handle_file_upload(sess, message, db, sid)

    # ────────────── 文件确认后续 ──────────────
    if intent == "file_confirm":
        return handle_file_confirm(sess, message, db, sid)

    # 未识别意图 → 尝试从文本中提取操作
    sess["intent"] = None
    return {
        "reply": "抱歉，我没完全理解你的意思 🤔\n\n"
                 "你可以试试这些：\n"
                 "• **录入凭证** — 开始填制记账凭证\n"
                 "• **新增客户 / 供应商 / 员工**\n"
                 "• **查看利润表 / 资产负债表**\n"
                 "• **帮助** — 查看我能做什么\n\n"
                 "或者直接描述你的需求，我会尽量理解 😊",
        "session_id": sid,
        "action": None
    }


# ==================== 文件上传智能分析 ====================

DATA_PATTERNS = {
    "voucher": {
        "name": "记账凭证",
        "keywords": ["日期", "摘要", "科目", "借方", "贷方", "金额", "凭证", "voucher", "date", "account", "debit", "credit"],
        "min_match": 3,
        "action_hint": "我可以帮你**逐笔录入凭证**，你只需要确认每一笔即可。"
    },
    "customer": {
        "name": "客户档案",
        "keywords": ["客户", "名称", "联系人", "电话", "手机", "地址", "税号", "customer", "phone", "contact", "address"],
        "min_match": 2,
        "action_hint": "我可以帮你**批量导入客户档案**，请确认以下信息无误。"
    },
    "supplier": {
        "name": "供应商档案",
        "keywords": ["供应商", "厂家", "供货", "supplier", "采购"],
        "min_match": 2,
        "action_hint": "我可以帮你**批量导入供应商档案**，请确认以下信息无误。"
    },
    "employee": {
        "name": "员工花名册",
        "keywords": ["员工", "人员", "职员", "部门", "职位", "入职", "身份证", "employee", "department", "position"],
        "min_match": 2,
        "action_hint": "我可以帮你**批量导入员工信息**，请确认以下信息无误。"
    },
    "account": {
        "name": "会计科目",
        "keywords": ["科目编码", "科目名称", "科目类别", "余额方向", "account_code", "account_name"],
        "min_match": 2,
        "action_hint": "我可以帮你**批量导入会计科目**，请确认后处理。"
    },
}


def analyze_file_columns(headers: List[str]) -> dict:
    """分析文件列名，猜测数据类型"""
    headers_lower = [h.strip().lower() for h in headers]
    best_type = None
    best_score = 0

    for ptype, pattern in DATA_PATTERNS.items():
        score = 0
        for kw in pattern["keywords"]:
            for h in headers_lower:
                if kw in h:
                    score += 1
                    break
        if score >= pattern["min_match"] and score > best_score:
            best_score = score
            best_type = ptype

    return {
        "detected_type": best_type,
        "confidence": best_score,
        "pattern": DATA_PATTERNS.get(best_type) if best_type else None
    }


def handle_file_upload(sess, message: str, db, sid: str):
    """处理文件上传：分析内容 → 提问确认 → 等待用户指令"""
    lines = message.split("\n")
    file_name = ""
    content_start = 0

    m = re.match(r"\[上传文件\]\s*(.+)", lines[0])
    if m:
        file_name = m.group(1).strip()

    for i, line in enumerate(lines):
        if line.strip().startswith("[Excel]") or line.strip().startswith("[CSV]") or \
           line.strip().startswith("[PDF]") or line.strip().startswith("[文本]") or \
           line.strip().startswith("[图片]"):
            content_start = i
            break

    format_label = ""
    if content_start < len(lines):
        format_label = lines[content_start].strip()
        fm = re.match(r"\[(\w+)\]\s*(.+)", format_label)
        if fm and not file_name:
            file_name = fm.group(2).strip()

    headers = []
    data_rows = 0
    for line in lines[content_start:]:
        stripped = line.strip()
        if " | " in stripped and not stripped.startswith("---"):
            parts = [p.strip() for p in stripped.split(" | ")]
            if not headers:
                headers = parts
            else:
                data_rows += 1
        rm = re.search(r"共\s*(\d+)\s*行", stripped)
        if rm:
            data_rows = max(data_rows, int(rm.group(1)))

    if not headers:
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        return {
            "reply": f"📎 已收到文件 **{file_name}**。\n\n"
                     f"我暂时无法自动识别这个文件的列结构。\n\n"
                     f"🤔 **请告诉我：**\n"
                     f"• 这个文件包含什么数据？（凭证 / 客户 / 供应商 / 员工 / 科目 / 其他）\n"
                     f"• 你希望我怎么处理？（录入系统 / 仅查看 / 导入到对应模块）\n\n"
                     f"也可以点击左侧菜单进入对应页面手动操作。",
            "session_id": sid,
            "action": None
        }

    analysis = analyze_file_columns(headers)
    detected = analysis["detected_type"]
    confidence = analysis["confidence"]
    pattern = analysis["pattern"]

    cols_display = "、".join(headers[:8])
    if len(headers) > 8:
        cols_display += f" ... 共 {len(headers)} 列"

    if not detected or confidence < 2:
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        return {
            "reply": f"📎 已收到文件 **{file_name}**（约 {data_rows} 行数据）\n\n"
                     f"📋 识别到的列：{cols_display}\n\n"
                     f"⚠️ 我无法确定这是什么类型的数据。\n\n"
                     f"🤔 **请确认：**\n"
                     f"1️⃣ 这是**凭证数据**？→ 回复「凭证」\n"
                     f"2️⃣ 这是**客户名单**？→ 回复「客户」\n"
                     f"3️⃣ 这是**供应商名单**？→ 回复「供应商」\n"
                     f"4️⃣ 这是**员工信息**？→ 回复「员工」\n"
                     f"5️⃣ 这是**会计科目**？→ 回复「科目」\n"
                     f"6️⃣ 只是给你看看，不做处理？→ 回复「不用」\n\n"
                     f"💡 也可以直接描述，例如：「把这些客户信息录入系统」",
            "session_id": sid,
            "action": None
        }

    sess["intent"] = "file_confirm"
    sess["step"] = 0
    sess["data"] = {
        "file_name": file_name,
        "detected_type": detected,
        "headers": headers,
        "data_rows": data_rows,
        "raw_content": message
    }

    preview_lines = []
    preview_count = 0
    for line in lines[content_start:]:
        stripped = line.strip()
        if " | " in stripped and not stripped.startswith("---") and not stripped.startswith("[") and preview_count < 3:
            parts = [p.strip() for p in stripped.split(" | ")]
            if parts != headers:
                preview_lines.append(" | ".join(parts))
                preview_count += 1

    preview_text = ""
    if preview_lines:
        preview_text = "\n\n📋 **数据预览（前3行）：**\n" + "\n".join(f"  `{p}`" for p in preview_lines)

    return {
        "reply": f"📎 已收到文件 **{file_name}**（约 {data_rows} 行数据）\n\n"
                 f"🔍 我识别到这可能是一份 **{pattern['name']}** 数据。\n"
                 f"📋 包含列：{cols_display}"
                 f"{preview_text}\n\n"
                 f"⚠️ **请确认：**\n"
                 f"• 回复「**是**」或「**确认**」→ {pattern['action_hint']}\n"
                 f"• 回复「**不是**」→ 告诉我这是什么数据\n"
                 f"• 回复「**不用**」→ 仅查看，不做处理\n"
                 f"• 回复「**取消**」→ 放弃本次上传",
        "session_id": sid,
        "action": None
    }


def handle_file_confirm(sess, message: str, db, sid: str):
    """处理文件确认后的用户回应"""
    msg = message.strip()
    msg_lower = msg.lower()
    data = sess.get("data", {})
    detected_type = data.get("detected_type", "")
    file_name = data.get("file_name", "未知文件")

    if re.search(r"^(是|对|确认|好|可以|行|ok|yes|没错|是的|对的)$", msg_lower):
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        if detected_type == "voucher":
            return {
                "reply": f"✅ 好的！我将根据 **{file_name}** 的数据逐笔录入凭证。\n\n"
                         f"📝 请回复「**录入凭证**」开始，我会引导你一步步操作。\n\n"
                         f"💡 提示：你可以把文件中每一行的数据逐条告诉我，我来填。",
                "session_id": sid,
                "action": None
            }
        elif detected_type == "customer":
            return {
                "reply": f"✅ 好的！我将把 **{file_name}** 中的客户信息录入系统。\n\n"
                         f"请回复「**新增客户**」开始逐条录入。\n\n"
                         f"💡 提示：也可以告诉我「批量导入所有客户」，我会遍历每一行。",
                "session_id": sid,
                "action": None
            }
        elif detected_type == "supplier":
            return {
                "reply": f"✅ 好的！我将把 **{file_name}** 中的供应商信息录入系统。\n\n"
                         f"请回复「**新增供应商**」开始逐条录入。\n\n"
                         f"💡 提示：也可以告诉我「批量导入所有供应商」，我会遍历每一行。",
                "session_id": sid,
                "action": None
            }
        elif detected_type == "employee":
            return {
                "reply": f"✅ 好的！我将把 **{file_name}** 中的员工信息录入系统。\n\n"
                         f"请回复「**新增员工**」开始逐条录入。\n\n"
                         f"💡 提示：也可以告诉我「批量导入所有员工」，我会遍历每一行。",
                "session_id": sid,
                "action": None
            }
        else:
            return {
                "reply": f"✅ 好的！请告诉我具体要怎么处理 **{file_name}** 的数据？",
                "session_id": sid,
                "action": None
            }

    if re.search(r"^(不是|不对|错了|不对的|no|不对哦)$", msg_lower):
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        return {
            "reply": f"🤔 抱歉识别错了！\n\n"
                     f"请告诉我 **{file_name}** 里是什么数据：\n"
                     f"• 回复「**凭证**」→ 记账凭证\n"
                     f"• 回复「**客户**」→ 客户档案\n"
                     f"• 回复「**供应商**」→ 供应商档案\n"
                     f"• 回复「**员工**」→ 员工信息\n"
                     f"• 回复「**科目**」→ 会计科目\n"
                     f"• 或直接描述你要做什么",
            "session_id": sid,
            "action": None
        }

    if re.search(r"^(不用|算了|不需要|看看就行|仅查看|只是看看)$", msg_lower):
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        return {
            "reply": f"👌 好的，**{file_name}** 的数据仅供查看，不做录入处理。\n\n"
                     f"如果后续需要处理，随时告诉我！\n\n"
                     f"💡 你可以继续上传其他文件，或告诉我其他需求。",
            "session_id": sid,
            "action": None
        }

    sess["intent"] = None
    sess["step"] = 0
    sess["data"] = {}

    type_hint = None
    if re.search(r"凭证|voucher|记账", msg_lower):
        type_hint = "voucher"
    elif re.search(r"客户|customer", msg_lower):
        type_hint = "customer"
    elif re.search(r"供应商|supplier", msg_lower):
        type_hint = "supplier"
    elif re.search(r"员工|人员|职员|employee", msg_lower):
        type_hint = "employee"
    elif re.search(r"科目|account", msg_lower):
        type_hint = "account"

    if type_hint:
        pattern = DATA_PATTERNS.get(type_hint, {})
        sess["intent"] = "file_confirm"
        sess["step"] = 0
        sess["data"] = {**data, "detected_type": type_hint}
        return {
            "reply": f"🔍 收到，你指定为 **{pattern.get('name', type_hint)}** 数据。\n\n"
                     f"⚠️ **再次确认：**\n"
                     f"• 回复「**是**」→ {pattern.get('action_hint', '开始处理')}\n"
                     f"• 回复「**不是**」→ 重新指定",
            "session_id": sid,
            "action": None
        }

    return {
        "reply": f"🤔 收到你的回复：「{msg}」\n\n"
                 f"关于 **{file_name}** 的数据处理，请明确告诉我：\n"
                 f"• 回复「**是**」→ 确认按识别类型处理\n"
                 f"• 回复「**不是**」→ 重新指定数据类型\n"
                 f"• 回复「**不用**」→ 仅查看\n"
                 f"• 回复「**取消**」→ 放弃\n\n"
                 f"💡 也可以直接说数据类型如「凭证」「客户」等。",
        "session_id": sid,
        "action": None
    }


# ==================== CRUD 处理器 ====================

def handle_create_voucher(sess, msg, db, sid, company_id):
    """AI 录入凭证：引导用户去序时账页面操作"""
    sess["intent"] = None
    return {
        "reply": "📝 录入凭证请打开侧边栏「序时账」页面操作。\n\n在序时账页面可以：\n• 新增凭证\n• 编辑凭证\n• 从销项/进项/银行流水自动生成凭证\n\n💡 提示：你也可以上传文件，我会帮你识别并引导导入。",
        "session_id": sid,
        "action": {"type": "navigate", "page": "journal"}
    }


def handle_create_customer(sess, msg, db, sid, company_id):
    step = sess["step"]
    data = sess["data"]

    if step == 0:
        sess["intent"] = "create_customer"
        sess["step"] = 1
        parts = msg.strip()
        code_match = re.search(r"编码[：:]*\s*(\S+)", msg)
        name_match = re.sub(r"新[增添加]客户|录入客户|添加客户", "", msg).strip("，。,.").strip()
        if name_match:
            data["name"] = name_match
        if code_match:
            data["code"] = code_match.group(1)

        if data.get("name"):
            if not data.get("code"):
                data["code"] = f"KH{db.query(Customer).filter(Customer.company_id == company_id).count() + 1:03d}"
            sess["data"] = data
            sess["step"] = 2
            return {"reply": f"👤 客户名称：**{data['name']}**\n📋 编码：**{data['code']}**\n\n还需要添加其他信息吗？可以直接告诉我：\n• 联系人\n• 电话\n• 信用额度\n\n或说「**完成**」直接保存。", "session_id": sid, "action": None}

        return {"reply": "👤 好的，新增客户。\n\n请告诉我**客户名称**和**编码**（可选），例如：\n• 「广州钢材贸易有限公司」\n• 「编码 KH001 广州钢材贸易有限公司」", "session_id": sid, "action": None}

    elif step == 1:
        data["name"] = msg.strip()
        if not data.get("code"):
            data["code"] = f"KH{db.query(Customer).filter(Customer.company_id == company_id).count() + 1:03d}"
        sess["data"] = data
        sess["step"] = 2
        return {"reply": f"👤 客户名称：**{data['name']}**\n📋 编码：**{data['code']}**\n\n还需要添加其他信息吗？可以告诉我联系人、电话、地址等。\n或说「**完成**」直接保存。", "session_id": sid, "action": None}

    elif step >= 2:
        if re.search(r"^(完成|好了|结束|确认|提交|保存|ok|done)$", msg.strip(), re.IGNORECASE):
            return save_customer(data, db, sess, sid, company_id)
        contact_m = re.search(r"联系人[：:]*\s*(\S+)", msg)
        phone_m = re.search(r"电话[：:]*\s*(\S+)", msg)
        addr_m = re.search(r"地址[：:]*\s*(.+?)(?:$|电话|联系人)", msg)
        credit_m = re.search(r"额度[：:]*\s*(\d+\.?\d*)", msg)
        if contact_m: data["contact"] = contact_m.group(1)
        if phone_m: data["phone"] = phone_m.group(1)
        if addr_m: data["address"] = addr_m.group(1).strip()
        if credit_m: data["credit_limit"] = float(credit_m.group(1))
        if not contact_m and not phone_m and not addr_m and not credit_m:
            pt = msg.strip().split()
            if len(pt) >= 1 and not data.get("contact"):
                data["contact"] = pt[0]
            if len(pt) >= 2 and not data.get("phone"):
                data["phone"] = pt[1]

        sess["data"] = data
        info_lines = []
        for k, label in [("name", "名称"), ("code", "编码"), ("contact", "联系人"), ("phone", "电话"), ("address", "地址"), ("credit_limit", "信用额度")]:
            if data.get(k):
                info_lines.append(f"  {label}：{data[k]}")
        return {"reply": f"已更新客户信息：\n" + "\n".join(info_lines) + "\n\n说「**完成**」保存，或继续补充信息。", "session_id": sid, "action": None}

    return {"reply": "请继续...", "session_id": sid, "action": None}


def save_customer(data, db, sess, sid, company_id):
    try:
        name = data.get("name", "")
        code = data.get("code", "")
        c = Customer(
            company_id=company_id,
            code=data.get("code", ""),
            name=name or "未命名客户",
            uscc=data.get("uscc"),
            contact=data.get("contact"),
            phone=data.get("phone"),
            address=data.get("address"),
            credit_limit=data.get("credit_limit", 0.0)
        )
        db.add(c)
        db.commit()
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        return {"reply": f"🎉 客户 **{c.name}**（{c.code}）添加成功！\n\n💡 接下来可以「新增客户」继续添加，或「查看利润表」查询报表。", "session_id": sid, "action": {"type": "reload", "page": "customers"}}
    except Exception as e:
        return {"reply": f"❌ 保存失败：{str(e)}", "session_id": sid, "action": None}


def handle_create_supplier(sess, msg, db, sid, company_id):
    step = sess["step"]
    data = sess["data"]

    if step == 0:
        sess["intent"] = "create_supplier"
        sess["step"] = 1
        name_match = re.sub(r"新[增添加]供应商|录入供应商|添加供应商", "", msg).strip("，。,.").strip()
        code_match = re.search(r"编码[：:]*\s*(\S+)", msg)
        if name_match: data["name"] = name_match
        if code_match: data["code"] = code_match.group(1)
        if data.get("name"):
            if not data.get("code"): data["code"] = f"GYS{db.query(Supplier).filter(Supplier.company_id == company_id).count() + 1:03d}"
            sess["data"] = data; sess["step"] = 2
            return {"reply": f"📦 供应商：**{data['name']}**（{data['code']}）\n\n需要补充其他信息吗？或说「**完成**」直接保存。", "session_id": sid, "action": None}
        return {"reply": "📦 新增供应商。请告诉我**供应商名称**，例如：\n「广州钢铁供应链有限公司」", "session_id": sid, "action": None}

    elif step == 1:
        data["name"] = msg.strip()
        if not data.get("code"): data["code"] = f"GYS{db.query(Supplier).filter(Supplier.company_id == company_id).count() + 1:03d}"
        sess["data"] = data; sess["step"] = 2
        return {"reply": f"📦 供应商：**{data['name']}**（{data['code']}）\n\n需要补充其他信息吗？或说「**完成**」保存。", "session_id": sid, "action": None}

    elif step >= 2:
        if re.search(r"^(完成|好了|结束|确认|提交|保存|ok|done)$", msg.strip(), re.IGNORECASE):
            return save_supplier(data, db, sess, sid, company_id)
        sess["data"] = data
        lines = [f"  {k}：{v}" for k, v in data.items() if v and k in ("name", "code")]
        return {"reply": "已更新：\n" + "\n".join(lines) + "\n\n说「**完成**」保存。", "session_id": sid, "action": None}

    return {"reply": "请继续...", "session_id": sid, "action": None}


def save_supplier(data, db, sess, sid, company_id):
    try:
        name = data.get("name", "")
        code = data.get("code", "")
        s = Supplier(company_id=company_id, code=data.get("code", ""), name=name, uscc=data.get("uscc", ""))
        db.add(s); db.commit()
        sess["intent"] = None; sess["step"] = 0; sess["data"] = {}
        return {"reply": f"🎉 供应商 **{s.name}**（{s.code}）添加成功！", "session_id": sid, "action": {"type": "reload", "page": "suppliers"}}
    except Exception as e:
        return {"reply": f"❌ {e}", "session_id": sid, "action": None}


def handle_create_employee(sess, msg, db, sid, company_id):
    step = sess["step"]
    data = sess["data"]

    if step == 0:
        sess["intent"] = "create_employee"
        sess["step"] = 1
        name_match = re.sub(r"新[增添加](员工|人员|职员)|录入(员工|人员)|添加(员工|人员)", "", msg).strip("，。,.").strip()
        dept_m = re.search(r"部门[：:]*\s*(\S+)", msg)
        if name_match: data["name"] = name_match
        if dept_m: data["department_name"] = dept_m.group(1)
        if data.get("name"):
            if not data.get("code"): data["code"] = f"RY{db.query(Employee).filter(Employee.company_id == company_id).count() + 1:03d}"
            sess["data"] = data; sess["step"] = 2
            return {"reply": f"👤 员工：**{data['name']}**（{data['code']}）\n\n还需要补充部门、职位、电话吗？或说「**完成**」保存。", "session_id": sid, "action": None}
        return {"reply": "👤 新增员工。请告诉我**姓名**，例如：「张三」", "session_id": sid, "action": None}

    elif step == 1:
        data["name"] = msg.strip()
        if not data.get("code"): data["code"] = f"RY{db.query(Employee).filter(Employee.company_id == company_id).count() + 1:03d}"
        sess["data"] = data; sess["step"] = 2
        return {"reply": f"👤 员工：**{data['name']}**\n\n需要补充部门、职位、电话吗？或说「**完成**」保存。", "session_id": sid, "action": None}

    elif step >= 2:
        if re.search(r"^(完成|好了|结束|确认|ok|done)$", msg.strip(), re.IGNORECASE):
            return save_employee(data, db, sess, sid, company_id)
        dept_m = re.search(r"部门[：:]*\s*(\S+)", msg)
        pos_m = re.search(r"职位[：:]*\s*(\S+)", msg)
        phone_m = re.search(r"电话[：:]*\s*(\S+)", msg)
        if dept_m: data["department_name"] = dept_m.group(1)
        if pos_m: data["position"] = pos_m.group(1)
        if phone_m: data["phone"] = phone_m.group(1)
        sess["data"] = data
        lines = [f"  {k}：{v}" for k, v in data.items() if v and k in ("name", "code", "department_name", "position", "phone")]
        return {"reply": "已更新：\n" + "\n".join(lines) + "\n\n说「**完成**」保存。", "session_id": sid, "action": None}

    return {"reply": "请继续...", "session_id": sid, "action": None}


def save_employee(data, db, sess, sid, company_id):
    try:
        e = Employee(company_id=company_id, code=data.get("code", ""), name=data.get("name", ""), id_card=data.get("id_card"), email=data.get("email"))
        db.add(e); db.commit()
        sess["intent"] = None; sess["step"] = 0; sess["data"] = {}
        return {"reply": f"🎉 员工 **{e.name}** 添加成功！", "session_id": sid, "action": {"type": "reload", "page": "employees"}}
    except Exception as e:
        return {"reply": f"❌ {e}", "session_id": sid, "action": None}


# ==================== 查询处理器（存根） ====================

def handle_list_vouchers(message, db, sid):
    """查询凭证列表 — 引导用户去序时账页面"""
    return {
        "reply": "📋 请打开侧边栏「序时账」页面查看凭证列表。\n\n💡 你也可以告诉我具体的查询条件（如「5月的凭证」），我会帮你筛选。",
        "session_id": sid,
        "action": {"type": "navigate", "page": "journal"}
    }


def handle_query_general(sess, message, db, sid):
    """查询总账 — 引导用户去报表页面"""
    sess["intent"] = None
    return {
        "reply": "📊 请打开侧边栏「科目余额表」查看总账。\n\n💡 你可以告诉我具体的科目编码或名称来查询明细。",
        "session_id": sid,
        "action": {"type": "navigate", "page": "trial-balance"}
    }


def handle_query_detail(sess, message, db, sid):
    """查询明细账 — 引导用户去序时账页面"""
    sess["intent"] = None
    return {
        "reply": "📋 请打开侧边栏「序时账」页面查看明细账。\n\n💡 你可以告诉我具体的科目编码来筛选。",
        "session_id": sid,
        "action": {"type": "navigate", "page": "journal"}
    }
