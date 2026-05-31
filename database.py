"""
中小制造业账务处理系统 - 数据库模型
"""
from sqlalchemy import create_engine, Column, Integer, String, Float, Date, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./zhangwu.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==================== 公司信息 ====================

class CompanyInfo(Base):
    __tablename__ = "company_info"
    id = Column(Integer, primary_key=True)
    company_name = Column(String(100), nullable=False, comment="公司名称")
    tax_no = Column(String(50), comment="纳税人识别号")
    address = Column(String(200), comment="注册地址")
    phone = Column(String(30), comment="电话")
    bank_name = Column(String(100), comment="开户银行")
    bank_account = Column(String(50), comment="银行账号")
    legal_representative = Column(String(50), comment="法定代表人")
    registered_capital = Column(String(50), comment="注册资本")
    established_date = Column(Date, nullable=True, comment="成立日期")
    business_scope = Column(Text, comment="经营范围")
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


# ==================== 部门档案 ====================

class Department(Base):
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, comment="部门编码")
    name = Column(String(50), nullable=False, comment="部门名称")
    parent_code = Column(String(20), nullable=True, comment="上级部门编码")
    manager = Column(String(50), comment="部门负责人")
    description = Column(String(200), comment="部门说明")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)

    employees = relationship("Employee", back_populates="department")


# ==================== 人员档案 ====================

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, comment="工号")
    name = Column(String(50), nullable=False, comment="姓名")
    department_code = Column(String(20), ForeignKey("departments.code"), nullable=True)
    position = Column(String(50), comment="职位")
    id_card = Column(String(30), comment="身份证号")
    phone = Column(String(30), comment="联系电话")
    email = Column(String(100), comment="邮箱")
    salary = Column(Float, default=0.0, comment="基本工资")
    entry_date = Column(Date, comment="入职日期")
    leave_date = Column(Date, comment="离职日期")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)

    department = relationship("Department", back_populates="employees")


# ==================== 客户档案 ====================

class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, comment="客户编码")
    name = Column(String(100), nullable=False, comment="客户名称")
    tax_no = Column(String(50), comment="税号")
    contact = Column(String(50), comment="联系人")
    phone = Column(String(30), comment="联系电话")
    address = Column(String(200), comment="地址")
    credit_limit = Column(Float, default=0.0, comment="信用额度")
    payment_terms = Column(Integer, default=30, comment="账期（天）")
    bank_name = Column(String(100), comment="开户银行")
    bank_account = Column(String(50), comment="银行账号")
    is_active = Column(Boolean, default=True)
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)


# ==================== 供应商档案 ====================

class Supplier(Base):
    __tablename__ = "suppliers"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, comment="供应商编码")
    name = Column(String(100), nullable=False, comment="供应商名称")
    tax_no = Column(String(50), comment="税号")
    contact = Column(String(50), comment="联系人")
    phone = Column(String(30), comment="联系电话")
    address = Column(String(200), comment="地址")
    credit_limit = Column(Float, default=0.0, comment="信用额度")
    payment_terms = Column(Integer, default=30, comment="账期（天）")
    bank_name = Column(String(100), comment="开户银行")
    bank_account = Column(String(50), comment="银行账号")
    is_active = Column(Boolean, default=True)
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)


# ==================== 会计科目（原样保留） ====================

class Account(Base):
    """会计科目"""
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, comment="科目编码")
    name = Column(String(100), nullable=False, comment="科目名称")
    category = Column(String(20), nullable=False, comment="科目类别：资产/负债/权益/收入/费用/成本")
    balance_direction = Column(String(10), nullable=False, comment="余额方向：借/贷")
    level = Column(Integer, default=1, comment="科目级次")
    parent_code = Column(String(20), nullable=True, comment="上级科目编码")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)

    voucher_details = relationship("VoucherDetail", back_populates="account")


# ==================== 记账凭证（原样保留） ====================

class Voucher(Base):
    """记账凭证"""
    __tablename__ = "vouchers"

    id = Column(Integer, primary_key=True, index=True)
    voucher_no = Column(String(30), unique=True, nullable=False, comment="凭证号")
    voucher_date = Column(Date, nullable=False, comment="凭证日期")
    summary = Column(String(200), nullable=False, comment="摘要")
    total_debit = Column(Float, default=0.0, comment="借方合计")
    total_credit = Column(Float, default=0.0, comment="贷方合计")
    creator = Column(String(50), default="管理员", comment="制单人")
    checker = Column(String(50), nullable=True, comment="审核人")
    status = Column(String(20), default="草稿", comment="状态：草稿/已审核/已过账")
    period = Column(String(7), nullable=False, comment="会计期间 YYYY-MM")
    attachments = Column(Integer, default=0, comment="附件张数")
    created_at = Column(DateTime, default=datetime.now)

    details = relationship("VoucherDetail", back_populates="voucher", cascade="all, delete-orphan")


class VoucherDetail(Base):
    """凭证明细行"""
    __tablename__ = "voucher_details"

    id = Column(Integer, primary_key=True, index=True)
    voucher_id = Column(Integer, ForeignKey("vouchers.id"), nullable=False)
    line_no = Column(Integer, nullable=False, comment="行号")
    summary = Column(String(200), nullable=True, comment="摘要")
    account_code = Column(String(20), ForeignKey("accounts.code"), nullable=False)
    debit_amount = Column(Float, default=0.0, comment="借方金额")
    credit_amount = Column(Float, default=0.0, comment="贷方金额")
    # 辅助核算字段
    department_code = Column(String(20), comment="部门辅助核算")
    customer_code = Column(String(20), comment="客户辅助核算")
    supplier_code = Column(String(20), comment="供应商辅助核算")

    voucher = relationship("Voucher", back_populates="details")
    account = relationship("Account", back_populates="voucher_details")


# ==================== 会计期间（原样保留） ====================

class Period(Base):
    """会计期间"""
    __tablename__ = "periods"

    id = Column(Integer, primary_key=True, index=True)
    period = Column(String(7), unique=True, nullable=False, comment="YYYY-MM")
    status = Column(String(20), default="开放", comment="开放/已结账")
    closed_at = Column(DateTime, nullable=True)


# ==================== 初始化数据 ====================

def init_db():
    """初始化数据库，并插入基础数据"""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # 检查是否已初始化
    if db.query(Account).count() > 0:
        db.close()
        return

    # 基础会计科目（适合中小制造业）
    accounts_data = [
        # 资产类
        ("1001", "库存现金", "资产", "借", 1),
        ("1002", "银行存款", "资产", "借", 1),
        ("1122", "应收账款", "资产", "借", 1),
        ("1123", "预收账款", "资产", "贷", 1),
        ("1221", "其他应收款", "资产", "借", 1),
        ("1401", "原材料", "资产", "借", 1),
        ("1402", "在途物资", "资产", "借", 1),
        ("1403", "库存商品", "资产", "借", 1),
        ("1405", "委托加工物资", "资产", "借", 1),
        ("1411", "周转材料", "资产", "借", 1),
        ("1601", "固定资产", "资产", "借", 1),
        ("1602", "累计折旧", "资产", "贷", 1),
        ("1701", "无形资产", "资产", "借", 1),
        ("1801", "长期待摊费用", "资产", "借", 1),
        # 负债类
        ("2001", "短期借款", "负债", "贷", 1),
        ("2202", "应付账款", "负债", "贷", 1),
        ("2203", "预付账款", "负债", "借", 1),
        ("2221", "其他应付款", "负债", "贷", 1),
        ("2241", "递延收益", "负债", "贷", 1),
        ("2501", "长期借款", "负债", "贷", 1),
        # 应交税费
        ("2210", "应交税费", "负债", "贷", 1),
        ("221001", "应交增值税", "负债", "贷", 2, "2210"),
        ("221002", "应交企业所得税", "负债", "贷", 2, "2210"),
        ("221003", "应交个人所得税", "负债", "贷", 2, "2210"),
        # 应付职工薪酬
        ("2211", "应付职工薪酬", "负债", "贷", 1),
        ("221101", "工资", "负债", "贷", 2, "2211"),
        ("221102", "社会保险费", "负债", "贷", 2, "2211"),
        # 权益类
        ("4001", "实收资本", "权益", "贷", 1),
        ("4002", "资本公积", "权益", "贷", 1),
        ("4101", "盈余公积", "权益", "贷", 1),
        ("4103", "本年利润", "权益", "贷", 1),
        ("4104", "利润分配", "权益", "贷", 1),
        # 成本类
        ("5001", "生产成本", "成本", "借", 1),
        ("500101", "直接材料", "成本", "借", 2, "5001"),
        ("500102", "直接人工", "成本", "借", 2, "5001"),
        ("500103", "制造费用", "成本", "借", 2, "5001"),
        ("5101", "制造费用", "成本", "借", 1),
        # 损益类 - 收入
        ("6001", "主营业务收入", "收入", "贷", 1),
        ("6051", "其他业务收入", "收入", "贷", 1),
        ("6111", "投资收益", "收入", "贷", 1),
        ("6301", "营业外收入", "收入", "贷", 1),
        # 损益类 - 费用
        ("6401", "主营业务成本", "费用", "借", 1),
        ("6402", "其他业务成本", "费用", "借", 1),
        ("6403", "税金及附加", "费用", "借", 1),
        ("6601", "销售费用", "费用", "借", 1),
        ("6602", "管理费用", "费用", "借", 1),
        ("660201", "办公费", "费用", "借", 2, "6602"),
        ("660202", "差旅费", "费用", "借", 2, "6602"),
        ("660203", "折旧费", "费用", "借", 2, "6602"),
        ("660204", "工资", "费用", "借", 2, "6602"),
        ("660205", "社保费", "费用", "借", 2, "6602"),
        ("6603", "财务费用", "费用", "借", 1),
        ("660301", "利息支出", "费用", "借", 2, "6603"),
        ("660302", "手续费", "费用", "借", 2, "6603"),
        ("6711", "营业外支出", "费用", "借", 1),
        ("6801", "所得税费用", "费用", "借", 1),
    ]

    for row in accounts_data:
        code, name, category, direction, level = row[0], row[1], row[2], row[3], row[4]
        parent = row[5] if len(row) > 5 else None
        acc = Account(
            code=code, name=name, category=category,
            balance_direction=direction, level=level, parent_code=parent
        )
        db.add(acc)

    # 初始化默认部门（典型制造业10个部门）
    departments_data = [
        ("BM01", "总经办"),
        ("BM02", "生产部"),
        ("BM03", "技术部"),
        ("BM04", "质检部"),
        ("BM05", "采购部"),
        ("BM06", "销售部"),
        ("BM07", "仓储部"),
        ("BM08", "财务部"),
        ("BM09", "行政部"),
        ("BM10", "人事部"),
    ]
    for code, name in departments_data:
        db.add(Department(code=code, name=name))

    # 初始化当前期间
    from datetime import date
    current_period = date.today().strftime("%Y-%m")
    db.add(Period(period=current_period))

    db.commit()
    db.close()
    print("数据库初始化完成（含科目+部门）")
