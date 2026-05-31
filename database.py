"""
中小制造业账务处理系统 - 数据库模型（多公司账套版本）
"""
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Date, DateTime,
    Text, Boolean, ForeignKey, inspect, text as TextClause, UniqueConstraint, Index
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./accounting.db"

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


# ==================== 公司账套 ====================

class Company(Base):
    """公司主表 - 每一行代表一个独立的账套"""
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, comment="公司名称")
    uscc = Column(String(50), comment="统一社会信用代码")
    tax_no = Column(String(50), comment="纳税人识别号")
    address = Column(String(200), comment="注册地址")
    phone = Column(String(30), comment="电话")
    bank_name = Column(String(100), comment="开户银行")
    bank_account = Column(String(50), comment="银行账号")
    legal_representative = Column(String(50), comment="法定代表人")
    legal_representative_id = Column(String(50), comment="法定代表人身份证号")
    registered_capital = Column(String(50), comment="注册资本")
    established_date = Column(Date, nullable=True, comment="成立日期")
    business_scope = Column(Text, comment="经营范围")
    is_active = Column(Boolean, default=True, comment="是否启用")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


# ==================== 公司股东 ====================

class CompanyShareholder(Base):
    """股东信息 - 支持自然人和企业股东，可多人"""
    __tablename__ = "company_shareholders"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    name = Column(String(100), nullable=False, comment="股东名称（自然人姓名或企业名称）")
    id_number = Column(String(50), comment="证件号（身份证或统一社会信用代码）")
    shareholder_type = Column(String(20), default="自然人", comment="股东类型：自然人/企业")
    share_ratio = Column(Float, comment="股权比例（%）")
    created_at = Column(DateTime, default=datetime.now)


# ==================== 公司董事 ====================

class CompanyDirector(Base):
    """董事信息 - 可多人"""
    __tablename__ = "company_directors"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    name = Column(String(50), nullable=False, comment="董事姓名")
    id_number = Column(String(50), comment="董事身份证号")
    created_at = Column(DateTime, default=datetime.now)


# ==================== 公司监事 ====================

class CompanySupervisor(Base):
    """监事信息 - 可多人"""
    __tablename__ = "company_supervisors"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    name = Column(String(50), nullable=False, comment="监事姓名")
    id_number = Column(String(50), comment="监事身份证号")
    created_at = Column(DateTime, default=datetime.now)


# ==================== 财务负责人 ====================

class CompanyFinanceContact(Base):
    """财务负责人信息 - 可多人"""
    __tablename__ = "company_finance_contacts"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    name = Column(String(50), nullable=False, comment="财务负责人姓名")
    id_number = Column(String(50), comment="财务负责人身份证号")
    created_at = Column(DateTime, default=datetime.now)


# ==================== 部门档案 ====================

class Department(Base):
    __tablename__ = "departments"
    __table_args__ = (
        UniqueConstraint('company_id', 'code', name='uq_dept_company_code'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    code = Column(String(20), nullable=False, comment="部门编码")
    name = Column(String(50), nullable=False, comment="部门名称")
    parent_code = Column(String(20), nullable=True, comment="上级部门编码")
    manager = Column(String(50), comment="部门负责人")
    description = Column(String(200), comment="部门说明")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)


# ==================== 人员档案 ====================

class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint('company_id', 'code', name='uq_emp_company_code'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    code = Column(String(20), nullable=False, comment="工号")
    name = Column(String(50), nullable=False, comment="姓名")
    department_code = Column(String(20), nullable=True, comment="所属部门编码")
    position = Column(String(50), comment="职位")
    id_card = Column(String(30), comment="身份证号")
    phone = Column(String(30), comment="联系电话")
    email = Column(String(100), comment="邮箱")
    salary = Column(Float, default=0.0, comment="基本工资")
    entry_date = Column(Date, comment="入职日期")
    leave_date = Column(Date, comment="离职日期")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)

    # 部门关联（通过company_id+department_code，由应用层保证）
    department = relationship("Department",
        primaryjoin="and_(foreign(Employee.department_code)==Department.code, "
                    "foreign(Employee.company_id)==Department.company_id)",
        viewonly=True, uselist=False)


# ==================== 客户档案 ====================

class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint('company_id', 'code', name='uq_cust_company_code'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    code = Column(String(20), nullable=False, comment="客户编码")
    name = Column(String(100), nullable=False, comment="客户名称")
    tax_no = Column(String(50), comment="税号")
    contact = Column(String(50), comment="联系人")
    phone = Column(String(30), comment="联系电话")
    address = Column(String(200), comment="地址")
    credit_limit = Column(Float, default=0.0, comment="信用额度")
    payment_terms = Column(Integer, default=30, comment="账期（天）")
    bank_name = Column(String(100), comment="开户银行")
    bank_account = Column(String(50), comment="银行账号")
    uscc = Column(String(50), comment="统一社会信用代码")
    is_active = Column(Boolean, default=True)
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)


# ==================== 供应商档案 ====================

class Supplier(Base):
    __tablename__ = "suppliers"
    __table_args__ = (
        UniqueConstraint('company_id', 'code', name='uq_supp_company_code'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    code = Column(String(20), nullable=False, comment="供应商编码")
    name = Column(String(100), nullable=False, comment="供应商名称")
    tax_no = Column(String(50), comment="税号")
    contact = Column(String(50), comment="联系人")
    phone = Column(String(30), comment="联系电话")
    address = Column(String(200), comment="地址")
    credit_limit = Column(Float, default=0.0, comment="信用额度")
    payment_terms = Column(Integer, default=30, comment="账期（天）")
    bank_name = Column(String(100), comment="开户银行")
    bank_account = Column(String(50), comment="银行账号")
    uscc = Column(String(50), comment="统一社会信用代码")
    is_active = Column(Boolean, default=True)
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)


# ==================== 会计科目 ====================

class Account(Base):
    """会计科目 - 每个公司有独立的科目表"""
    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint('company_id', 'code', name='uq_acct_company_code'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    code = Column(String(20), nullable=False, comment="科目编码")
    name = Column(String(100), nullable=False, comment="科目名称")
    category = Column(String(20), nullable=False, comment="科目类别：资产/负债/权益/收入/费用/成本")
    balance_direction = Column(String(10), nullable=False, comment="余额方向：借/贷")
    level = Column(Integer, default=1, comment="科目级次")
    parent_code = Column(String(20), nullable=True, comment="上级科目编码")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)


# ==================== 记账凭证 ====================

class Voucher(Base):
    """记账凭证"""
    __tablename__ = "vouchers"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    voucher_no = Column(String(30), nullable=False, comment="凭证号")
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

    __table_args__ = (
        UniqueConstraint('company_id', 'voucher_no', name='uq_vch_company_no'),
        Index('idx_vch_company_period', 'company_id', 'period'),
    )

    details = relationship("VoucherDetail", back_populates="voucher", cascade="all, delete-orphan")


class VoucherDetail(Base):
    """凭证明细行"""
    __tablename__ = "voucher_details"
    id = Column(Integer, primary_key=True, index=True)
    voucher_id = Column(Integer, ForeignKey("vouchers.id"), nullable=False)
    line_no = Column(Integer, nullable=False, comment="行号")
    summary = Column(String(200), nullable=True, comment="摘要")
    account_code = Column(String(20), nullable=False, comment="科目编码（应用层关联）")
    debit_amount = Column(Float, default=0.0, comment="借方金额")
    credit_amount = Column(Float, default=0.0, comment="贷方金额")
    department_code = Column(String(20), comment="部门辅助核算")
    customer_code = Column(String(20), comment="客户辅助核算")
    supplier_code = Column(String(20), comment="供应商辅助核算")

    voucher = relationship("Voucher", back_populates="details")


# ==================== 会计期间 ====================

class Period(Base):
    """会计期间 - 每个公司独立管理期间"""
    __tablename__ = "periods"
    __table_args__ = (
        UniqueConstraint('company_id', 'period', name='uq_period_company_period'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    period = Column(String(7), nullable=False, comment="YYYY-MM")
    status = Column(String(20), default="开放", comment="开放/已结账")
    closed_at = Column(DateTime, nullable=True)


# ==================== 固定资产 ====================

class FixedAsset(Base):
    """固定资产卡片"""
    __tablename__ = "fixed_assets"
    __table_args__ = (
        UniqueConstraint('company_id', 'code', name='uq_fa_company_code'),
        Index('idx_fa_company_status', 'company_id', 'status'),
        Index('idx_fa_company_dept', 'company_id', 'dept_code'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    code = Column(String(30), nullable=False, comment="资产编码")
    name = Column(String(100), nullable=False, comment="资产名称")
    category = Column(String(30), nullable=False, comment="资产类别：房屋建筑物/机器设备/运输工具/电子设备/办公设备/其他")
    spec = Column(String(100), comment="规格型号")
    unit = Column(String(10), comment="计量单位")
    dept_code = Column(String(20), comment="使用部门编码")
    location = Column(String(100), comment="存放地点")
    purchase_date = Column(Date, comment="购入日期")
    original_value = Column(Float, default=0.0, comment="原值")
    residual_value = Column(Float, default=0.0, comment="预计净残值")
    useful_life_months = Column(Integer, default=60, comment="使用年限（月）")
    accumulated_depreciation = Column(Float, default=0.0, comment="累计折旧")
    monthly_depreciation = Column(Float, default=0.0, comment="月折旧额")
    depreciation_method = Column(String(20), default="直线法", comment="折旧方法：直线法/双倍余额递减法/年数总和法")
    status = Column(String(20), default="在用", comment="状态：在用/闲置/报废/出售")
    supplier = Column(String(100), comment="供应商")
    warranty_expiry = Column(Date, comment="保修到期日")
    voucher_no = Column(String(30), comment="入账凭证号")
    disposal_voucher_no = Column(String(30), comment="处置凭证号")
    disposal_date = Column(Date, comment="处置日期")
    disposal_amount = Column(Float, default=0.0, comment="处置收入")
    remark = Column(Text, comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class FixedAssetDepreciation(Base):
    """固定资产折旧明细"""
    __tablename__ = "fa_depreciations"
    __table_args__ = (
        Index('idx_fad_asset_period', 'asset_id', 'period'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    asset_id = Column(Integer, ForeignKey("fixed_assets.id"), nullable=False)
    period = Column(String(7), nullable=False, comment="折旧期间 YYYY-MM")
    depreciation_amount = Column(Float, default=0.0, comment="本期折旧额")
    accumulated_before = Column(Float, default=0.0, comment="折旧前累计")
    accumulated_after = Column(Float, default=0.0, comment="折旧后累计")
    net_value = Column(Float, default=0.0, comment="折旧后净值")
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)


# ==================== 无形资产 ====================

class IntangibleAsset(Base):
    """无形资产卡片"""
    __tablename__ = "intangible_assets"
    __table_args__ = (
        UniqueConstraint('company_id', 'code', name='uq_ia_company_code'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    code = Column(String(30), nullable=False, comment="资产编码")
    name = Column(String(100), nullable=False, comment="资产名称")
    category = Column(String(30), nullable=False, comment="类别：专利权/商标权/著作权/土地使用权/软件/特许权/其他")
    purchase_date = Column(Date, comment="取得日期")
    original_value = Column(Float, default=0.0, comment="原值")
    useful_life_months = Column(Integer, default=120, comment="摊销期限（月）")
    accumulated_amortization = Column(Float, default=0.0, comment="累计摊销")
    monthly_amortization = Column(Float, default=0.0, comment="月摊销额")
    residual_value = Column(Float, default=0.0, comment="预计残值")
    status = Column(String(20), default="在用", comment="状态：在用/处置")
    voucher_no = Column(String(30), comment="入账凭证号")
    disposal_voucher_no = Column(String(30), comment="处置凭证号")
    disposal_date = Column(Date, comment="处置日期")
    disposal_amount = Column(Float, default=0.0, comment="处置收入")
    remark = Column(Text, comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class IntangibleAssetAmortization(Base):
    """无形资产摊销明细"""
    __tablename__ = "ia_amortizations"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    asset_id = Column(Integer, ForeignKey("intangible_assets.id"), nullable=False)
    period = Column(String(7), nullable=False, comment="摊销期间")
    amortization_amount = Column(Float, default=0.0, comment="本期摊销额")
    accumulated_before = Column(Float, default=0.0, comment="摊销前累计")
    accumulated_after = Column(Float, default=0.0, comment="摊销后累计")
    net_value = Column(Float, default=0.0, comment="摊销后净值")
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)


# ==================== 库存管理 ====================

class InventoryItem(Base):
    """库存商品/物料档案"""
    __tablename__ = "inventory_items"
    __table_args__ = (
        UniqueConstraint('company_id', 'code', name='uq_ii_company_code'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    code = Column(String(30), nullable=False, comment="商品编码")
    name = Column(String(100), nullable=False, comment="商品名称")
    spec = Column(String(100), comment="规格型号")
    unit = Column(String(10), comment="计量单位")
    category = Column(String(30), comment="分类：原材料/半成品/产成品/周转材料/低值易耗品")
    warehouse = Column(String(50), comment="仓库")
    safety_stock = Column(Float, default=0.0, comment="安全库存量")
    current_stock = Column(Float, default=0.0, comment="当前库存量")
    cost_price = Column(Float, default=0.0, comment="参考成本价")
    sale_price = Column(Float, default=0.0, comment="参考售价")
    account_code = Column(String(20), comment="关联会计科目编码")
    is_active = Column(Boolean, default=True)
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class InventoryTransaction(Base):
    """库存流水"""
    __tablename__ = "inventory_transactions"
    __table_args__ = (
        Index('idx_it_company_item', 'company_id', 'item_code'),
        Index('idx_it_company_date', 'company_id', 'transaction_date'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    item_code = Column(String(30), nullable=False, comment="商品编码")
    transaction_date = Column(Date, nullable=False, comment="业务日期")
    trans_type = Column(String(20), nullable=False, comment="类型：入库/出库/调拨入/调拨出/盘盈/盘亏/其他")
    quantity = Column(Float, nullable=False, comment="数量（+入库/-出库）")
    unit_price = Column(Float, default=0.0, comment="单价")
    total_amount = Column(Float, default=0.0, comment="金额")
    warehouse = Column(String(50), comment="仓库")
    warehouse_to = Column(String(50), comment="调入仓库（调拨用）")
    voucher_no = Column(String(30), comment="关联凭证号")
    reference_no = Column(String(50), comment="单据号（入库单/出库单等）")
    operator = Column(String(50), comment="操作人")
    remark = Column(Text, comment="备注")
    created_at = Column(DateTime, default=datetime.now)


class InventoryBalance(Base):
    """库存余额快照（按期计算）"""
    __tablename__ = "inventory_balances"
    __table_args__ = (
        UniqueConstraint('company_id', 'item_code', 'period', name='uq_ib_company_item_period'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    item_code = Column(String(30), nullable=False, comment="商品编码")
    period = Column(String(7), nullable=False, comment="期间 YYYY-MM")
    begin_quantity = Column(Float, default=0.0, comment="期初数量")
    in_quantity = Column(Float, default=0.0, comment="本期入库数量")
    out_quantity = Column(Float, default=0.0, comment="本期出库数量")
    end_quantity = Column(Float, default=0.0, comment="期末数量")
    total_amount = Column(Float, default=0.0, comment="期末金额")
    created_at = Column(DateTime, default=datetime.now)


# ==================== 合同管理 ====================

class Contract(Base):
    """合同台账"""
    __tablename__ = "contracts"
    __table_args__ = (
        UniqueConstraint('company_id', 'contract_no', name='uq_contract_company_no'),
        Index('idx_contract_company_status', 'company_id', 'status'),
        Index('idx_contract_company_type', 'company_id', 'contract_type'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    contract_no = Column(String(50), nullable=False, comment="合同编号")
    name = Column(String(200), nullable=False, comment="合同名称")
    contract_type = Column(String(20), nullable=False, comment="类型：采购/销售/服务/租赁/其他")
    party_a = Column(String(100), comment="甲方")
    party_b = Column(String(100), comment="乙方")
    amount = Column(Float, default=0.0, comment="合同金额")
    signing_date = Column(Date, comment="签订日期")
    effective_date = Column(Date, comment="生效日期")
    expiry_date = Column(Date, comment="到期日期")
    status = Column(String(20), default="起草中", comment="状态：起草中/已签署/履行中/已完成/已终止")
    responsible_person = Column(String(50), comment="负责人")
    dept_code = Column(String(20), comment="部门编码")
    content_summary = Column(Text, comment="内容摘要")
    remark = Column(Text, comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class ContractPayment(Base):
    """合同收付款计划"""
    __tablename__ = "contract_payments"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    payment_no = Column(Integer, default=1, comment="期次")
    payment_type = Column(String(10), nullable=False, comment="收款/付款")
    amount = Column(Float, nullable=False, comment="金额")
    due_date = Column(Date, comment="到期日期")
    paid_date = Column(Date, comment="实际收付日期")
    paid_amount = Column(Float, default=0.0, comment="实收/实付金额")
    status = Column(String(20), default="未付", comment="状态：未付/部分已付/已付清")
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


# ==================== 付款管理 ====================

class Payment(Base):
    """付款记录"""
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint('company_id', 'payment_no', name='uq_payment_company_no'),
        Index('idx_payment_company_status', 'company_id', 'status'),
        Index('idx_payment_company_supplier', 'company_id', 'supplier_id'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, default=1, comment="所属公司")
    payment_type = Column(String(10), nullable=False, default="外部单位", comment="类型：内部人员/外部单位")
    scenario = Column(String(20), comment="情形：备用金/报销/借支（内部人员）或 预付款/应付款（外部单位）")
    payment_no = Column(String(50), nullable=False, comment="付款单号")
    payment_date = Column(Date, nullable=False, comment="付款日期")
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True, comment="内部人员ID")
    employee_name = Column(String(50), comment="内部人员姓名")
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True, comment="供应商ID（外部单位）")
    supplier_name = Column(String(100), comment="供应商名称")
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=True, comment="关联合同ID")
    contract_no = Column(String(50), comment="关联合同编号")
    amount = Column(Float, nullable=False, comment="金额")
    payment_method = Column(String(20), nullable=False, default="银行转账", comment="付款方式：银行转账/现金/支票/其他")
    payee = Column(String(100), comment="收款方")
    payee_account = Column(String(50), comment="收款账号")
    payee_bank = Column(String(100), comment="收款银行")
    status = Column(String(20), default="待审批", comment="状态：待审批/已审批/已付款/已驳回")
    approved_by = Column(String(50), comment="审批人")
    approved_at = Column(DateTime, comment="审批时间")
    paid_at = Column(DateTime, comment="实际付款时间")
    department = Column(String(50), comment="所属部门")
    purpose = Column(String(200), comment="用途说明")
    remark = Column(Text, comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


# ==================== 数据库迁移与初始化 ====================

def migrate_schema(db):
    """迁移旧数据库到多公司架构"""
    inspector = inspect(engine)

    # ── 1. 创建 companies 表（如果不存在） ──
    if "companies" not in inspector.get_table_names():
        Base.metadata.create_all(bind=engine, tables=[Company.__table__])

    # ── 2. 如果没有公司，将旧 company_info 数据迁移到 companies ──
    if db.query(Company).count() == 0:
        # 检查旧 company_info 表是否有数据
        if "company_info" in inspector.get_table_names():
            try:
                old = db.execute(TextClause("SELECT * FROM company_info LIMIT 1")).fetchone()
                if old:
                    keys = [c for c in old._mapping.keys()]
                    vals = [old._mapping[k] for k in keys]
                    placeholders = ", ".join([f":{k}" for k in keys])
                    cols = ", ".join(keys)
                    params = {k: old._mapping[k] for k in keys}
                    # 映射 company_name → name
                    if "company_name" in params:
                        params["name"] = params.pop("company_name")
                    # 去掉 id 让数据库自增
                    cols_no_id = ", ".join([k for k in keys if k != "id"])
                    placeholders_no_id = ", ".join([f":{k}" for k in keys if k != "id"])
                    params_no_id = {k: v for k, v in params.items() if k != "id"}
                    if "name" not in params_no_id:
                        params_no_id["name"] = "默认公司"
                    db.execute(TextClause(
                        f"INSERT INTO companies ({cols_no_id}) VALUES ({placeholders_no_id})"
                    ), params_no_id)
                    db.commit()
                    print("已从 company_info 迁移数据到 companies 表")
            except Exception as e:
                db.rollback()
                print(f"迁移 company_info → companies 失败: {e}")

    # ── 3. 给所有表增加 company_id 列 ──
    migrations = {
        "departments": "ALTER TABLE departments ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
        "employees": "ALTER TABLE employees ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
        "customers": "ALTER TABLE customers ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
        "suppliers": "ALTER TABLE suppliers ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
        "accounts": "ALTER TABLE accounts ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
        "vouchers": "ALTER TABLE vouchers ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
        "voucher_details": "ALTER TABLE voucher_details ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
        "periods": "ALTER TABLE periods ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
    }

    for table_name, sql in migrations.items():
        try:
            existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
            if "company_id" not in existing_cols:
                db.execute(TextClause(sql))
                db.commit()
                print(f"已为 {table_name} 添加 company_id 列")
        except Exception as e:
            db.rollback()
            print(f"迁移 {table_name} 跳过（可能已存在）: {e}")

    # ── 4. 补充 uscc 列 ──
    extra_cols = {
        "company_info": "ALTER TABLE company_info ADD COLUMN uscc VARCHAR(50)",
        "customers": "ALTER TABLE customers ADD COLUMN uscc VARCHAR(50)",
        "suppliers": "ALTER TABLE suppliers ADD COLUMN uscc VARCHAR(50)",
    }
    for table_name, sql in extra_cols.items():
        try:
            if table_name in inspector.get_table_names():
                existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
                if "uscc" not in existing_cols:
                    db.execute(TextClause(sql))
                    db.commit()
        except Exception:
            db.rollback()

    # ── 5. 给 companies 表补充新字段（六员比对） ──
    company_extra = {
        "legal_representative_id": "ALTER TABLE companies ADD COLUMN legal_representative_id VARCHAR(50)",
        "registered_capital":       "ALTER TABLE companies ADD COLUMN registered_capital VARCHAR(50)",
        "business_scope":           "ALTER TABLE companies ADD COLUMN business_scope TEXT",
        "established_date":          "ALTER TABLE companies ADD COLUMN established_date DATE",
    }
    if "companies" in inspector.get_table_names():
        existing = {c["name"] for c in inspector.get_columns("companies")}
        for col, sql in company_extra.items():
            if col not in existing:
                try:
                    db.execute(TextClause(sql))
                    db.commit()
                    print(f"已为 companies 添加字段: {col}")
                except Exception as e:
                    db.rollback()
                    print(f"companies 添加字段 {col} 失败（可能已存在）: {e}")

    # ── 6. 付款管理：重命名 payment_type 值 + 添加 scenario 列 ──
    if "payments" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("payments")}
        # 添加 scenario 列
        if "scenario" not in existing_cols:
            try:
                db.execute(TextClause("ALTER TABLE payments ADD COLUMN scenario VARCHAR(20)"))
                db.commit()
                print("已为 payments 添加 scenario 列")
            except Exception as e:
                db.rollback()
                print(f"payments 添加 scenario 列失败: {e}")
        # 重命名内部报销 → 内部人员
        try:
            db.execute(TextClause("UPDATE payments SET payment_type = '内部人员' WHERE payment_type = '内部报销'"))
            db.commit()
        except Exception as e:
            db.rollback()
        # 重命名外部支付 → 外部单位
        try:
            db.execute(TextClause("UPDATE payments SET payment_type = '外部单位' WHERE payment_type = '外部支付'"))
            db.commit()
        except Exception as e:
            db.rollback()


# 基础科目数据模板（中小制造业标准科目表）
ACCOUNTS_TEMPLATE = [
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
    ("2001", "短期借款", "负债", "贷", 1),
    ("2202", "应付账款", "负债", "贷", 1),
    ("2203", "预付账款", "负债", "借", 1),
    ("2221", "其他应付款", "负债", "贷", 1),
    ("2241", "递延收益", "负债", "贷", 1),
    ("2501", "长期借款", "负债", "贷", 1),
    ("2210", "应交税费", "负债", "贷", 1),
    ("221001", "应交增值税", "负债", "贷", 2, "2210"),
    ("221002", "应交企业所得税", "负债", "贷", 2, "2210"),
    ("221003", "应交个人所得税", "负债", "贷", 2, "2210"),
    ("2211", "应付职工薪酬", "负债", "贷", 1),
    ("221101", "工资", "负债", "贷", 2, "2211"),
    ("221102", "社会保险费", "负债", "贷", 2, "2211"),
    ("4001", "实收资本", "权益", "贷", 1),
    ("4002", "资本公积", "权益", "贷", 1),
    ("4101", "盈余公积", "权益", "贷", 1),
    ("4103", "本年利润", "权益", "贷", 1),
    ("4104", "利润分配", "权益", "贷", 1),
    ("5001", "生产成本", "成本", "借", 1),
    ("500101", "直接材料", "成本", "借", 2, "5001"),
    ("500102", "直接人工", "成本", "借", 2, "5001"),
    ("500103", "制造费用", "成本", "借", 2, "5001"),
    ("5101", "制造费用", "成本", "借", 1),
    ("6001", "主营业务收入", "收入", "贷", 1),
    ("6051", "其他业务收入", "收入", "贷", 1),
    ("6111", "投资收益", "收入", "贷", 1),
    ("6301", "营业外收入", "收入", "贷", 1),
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

DEPARTMENTS_TEMPLATE = [
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


def init_company_data(db, company_id: int):
    """为新公司初始化科目表、部门、期间等基础数据"""
    # 科目表
    existing = db.query(Account).filter(Account.company_id == company_id).count()
    if existing == 0:
        for row in ACCOUNTS_TEMPLATE:
            code, name, category, direction, level = row[0], row[1], row[2], row[3], row[4]
            parent = row[5] if len(row) > 5 else None
            db.add(Account(
                company_id=company_id, code=code, name=name,
                category=category, balance_direction=direction,
                level=level, parent_code=parent
            ))

    # 部门
    dept_count = db.query(Department).filter(Department.company_id == company_id).count()
    if dept_count == 0:
        for code, name in DEPARTMENTS_TEMPLATE:
            db.add(Department(company_id=company_id, code=code, name=name))

    # 期间
    period_count = db.query(Period).filter(Period.company_id == company_id).count()
    if period_count == 0:
        from datetime import date
        current = date.today().strftime("%Y-%m")
        db.add(Period(company_id=company_id, period=current))

    db.commit()


def init_db():
    """初始化数据库：建表 → 迁移 → 初始化已有公司的种子数据"""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        migrate_schema(db)

        # 为已有公司初始化基础数据（不再自动创建默认公司，由注册页负责）
        companies = db.query(Company).filter(Company.is_active == True).all()
        for company in companies:
            init_company_data(db, company.id)

        print(f"数据库初始化完成（{len(companies)} 家公司）")
    except Exception as e:
        db.rollback()
        print(f"初始化错误: {e}")
    finally:
        db.close()
