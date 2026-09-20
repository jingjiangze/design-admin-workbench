# ORDER_DETAIL_MODEL.md — 订单详情对象模型

> 状态：**PARTIAL VERIFIED** — 2026-09-20 使用本账号自己的测试订单只读取证（GET，未执行任何修改操作）。
> 取证样本：needsid=`1977019785` / applyid=`1977019790` / ordernum=`TT_260908007929`（名片类、多版 5 版、已完结）。

## 1. 请求契约

| 项 | needsDetail2 | needsDetail | 证据等级 |
| -- | ------------ | ----------- | -------- |
| URL | `/chsjs/child/needsDetail2.do?needsid=<needsid>` | `/chsjs/child/needsDetail.do?applyid=<applyid>` | [VERIFIED] 实测 |
| Method | GET | GET | [VERIFIED] |
| 鉴权 | SESSION Cookie（未登录访问被拦截） | 同左 | [VERIFIED] |
| 返回 | 服务端渲染 HTML（**551KB**），`text/html;charset=UTF-8` | 同左 | [VERIFIED] |
| 数据形态 | 无纯 JSON API——详情数据以**HTML 实体转义的 JSON 内嵌**在页面中，前端 JS 解析后渲染 | 同左 | [VERIFIED] |

### 两接口对比结论（实测）

- 两个响应 **99.97% 逐字节相同**（551,219 字节同规模），唯一差异是内嵌 JSON 中一个附件记录的内部 ID（`decidingPapersFile.id`）。
- 判定：**两接口渲染同一详情页模板、同一业务数据**，仅入参键不同。
- **主详情键判定**：`needsid` 应作为新系统主详情键 [INFERRED]——理由：① myOrder/催单/消息页面的详情入口统一引用 `needsDetail2.do?needsid=`（[VERIFIED] 源码）；② WebSocket 推送按 needsid 关联；③ 动态子接口（历史订单/校对记录）均以 `{needsid}` 为参数（[VERIFIED] 源码）。
- **双键业务关系**：applyid 与 needsid 数值相邻（…790 / …785，差 5），且详情对象同时携带两键 → 推断为同一需求在"申请"与"需求"两张表中的自增 ID，由 ERP 发单时同时生成 [INFERRED]。**双键冗余是旧系统历史包袱，新系统应收敛为单一需求实体。**

## 2. 详情容器对象（内嵌 JSON 顶层 17 字段，[VERIFIED]）

| 字段 | 类型 | 实测值/形态 | 含义 | 证据等级 |
| ---- | ---- | ---- | ---- | ---- |
| applyid | string | 1977019790 | 需求申请 ID | [VERIFIED] |
| needsid | string | 1977019785 | 需求 ID（主键） | [VERIFIED] |
| ordernum | string | TT_260908007929 | 订单号（设计侧） | [VERIFIED] |
| erpOrderJson | string(JSON) | len=3307 | **ERP 原始推单对象**（二次嵌套 JSON 字符串，见 §3） | [VERIFIED] |
| products | array(5) | 27 字段/项 | 多版设计产品行（与 erp.Products 同构，每版一条） | [VERIFIED] |
| goodsFileParamList | array(1) | 见 §4 | 商品文件上传约束（含版次文件参数） | [VERIFIED] |
| decidingPapersFile | object | fileType=3 | 定稿凭证文件对象（id/needsid/ordernum/uploadSpan"上传定稿凭证"） | [VERIFIED] |
| s3url / s3Largeurl | string | `https://www.36588.com.cn/kyfs/...` | **小样/大图预览 URL**（自建云存储，字段名沿用 s3 习惯） | [VERIFIED] 值脱敏 |
| isbeol | boolean | — | 是否后道（beol=backend of line） | [VERIFIED] 字段/语义[INFERRED] |
| isModel | number | — | 是否模板单 | [VERIFIED] 字段/语义[INFERRED] |
| isMultipleUpload | boolean | — | 是否允许多文件上传 | [VERIFIED] 字段/语义[INFERRED] |
| isPackgeUpload / isPackgeUploadShow | boolean | — | 是否打包上传 | [VERIFIED] 字段/语义[INFERRED] |
| isOnlyDesignOfOrder | boolean | — | 是否纯设计单（无实体产品） | [VERIFIED] 字段/语义[INFERRED] |
| isConnectShow | boolean | — | 是否显示关联（聊天/连接）区 | [VERIFIED] 字段/语义[INFERRED] |
| spotColor | boolean | — | 是否专色（印刷术语） | [VERIFIED] 字段/语义[INFERRED] |

## 3. erpOrderJson — ERP 推单对象（19 顶层字段 + Products 27 字段，[VERIFIED]）

### 顶层

| 字段 | 实测形态 | 含义 | 证据等级 |
| ---- | ---- | ---- | ---- |
| orderid | TT_260908007929 | ERP 订单号（本样本与 ordernum 同值；页面模板另示纯数字长单号形态） | [VERIFIED] |
| ordrtyp | "益好旗舰店" | **语义错位**：订单类型字段实际存店铺名 [VERIFIED 值/INFERRED 错位] |
| orderState | 0 | ERP 侧状态（独立于设计侧 12 态） | [VERIFIED] 字段 |
| creattime | 2026-09-19 09:02:02 | ERP 创建时间（= 列表 needscreatetime/erpcreatetime） | [VERIFIED] |
| num | 1 | 订单商品组数 | [VERIFIED] |
| sales | "0.0000" | 销售额 | [VERIFIED] |
| **tel** | 11 位字符串 | **客户手机号（PII，值不入库）** | [VERIFIED] 存在 |
| email / company / qq | string | 客户邮箱/公司/QQ（PII，值不入库） | [VERIFIED] 存在 |
| buyer_open_uid | string | 平台买家开放 ID（PII） | [VERIFIED] 存在 |
| membername / memberid | — | 会员名/ID（与列表一致） | [VERIFIED] |
| notes | "错字 设计师" | 客户问题/要求摘要 | [VERIFIED] |
| bz | "刘承昌@9月18日 18:34yh-…错字 设计师 补发 铜版纸名片、5…" | **业务备注=客服署名+时间戳+工单轨迹**（非普通备注） | [VERIFIED] |
| orderNowGroup / isChangeOrderCompleted / state | — | 分组/改单完结/状态 | [VERIFIED] 字段 |

### Products[]（27 字段/版，实测样本）

| 字段 | 实测值 | 含义 | 证据等级 |
| ---- | ---- | ---- | ---- |
| spmc | 胶印铜版纸名片【双面】 | 商品名称 | [VERIFIED] |
| designNo | TT_260908007929(多版作品共5版第二版)-26-09-19-093227-8270-P | **设计编号**：订单号+版次说明+日期+序列+P 尾缀 | [VERIFIED] |
| def1Name | 54*90mm | 规格名 | [VERIFIED] |
| chang / wide | 54 / 90 | 长/宽（mm） | [VERIFIED] |
| attrs | 54*90mm,【100】,N,铜版纸,优质300g | 属性串：规格,数量,工艺标记,材质,克重 | [VERIFIED] |
| def8 / sizeName | 铜版纸 | 材质 | [VERIFIED] |
| guige / spsl | 100 / 5 | 规格(数量)/购买数量 | [VERIFIED] |
| danwei | 盒 | 单位 | [VERIFIED] |
| je | 0 | 金额 | [VERIFIED] |
| outer_sku_id | 2002030100008 | 平台外部 SKU | [VERIFIED] |
| def1 | 010891 | 品类属性代码 | [VERIFIED] 语义[INFERRED] |
| templateId / referenceSku / markId / gygx / cid / def10Name | 空 | 模板/参考SKU/标记/工艺/分类（本样本未启用） | [VERIFIED] |
| ifPrint / isCheckSizeOfSku | false / true | 是否印刷/是否校验 SKU 尺寸 | [VERIFIED] |
| def15 / def16 / sizeWidth / sizeLong | 54 / 90 / 空 / 空 | 尺寸冗余字段组 | [VERIFIED] |
| id | 319593997 | ERP 产品行 ID | [VERIFIED] |

## 4. goodsFileParamList — 文件上传约束（[VERIFIED]）

| 字段 | 实测值 | 含义 |
| ---- | ---- | ---- |
| checkFileSuffix | **jpg,xls,xlsx,pdf,cdr** | 允许的交稿格式——**含 CDR（CorelDRAW）**，验证了设计行业工作流 |
| checkSimilar | 1 | 相似度检测开启 |
| edition | 5 | 版数 |
| editionFileParamList | 5 个对象 | **每版独立的文件参数**（版-文件结构） |
| goodsid / goodsname | 548890581 / 名片 | 品类 |
| subGoodsid / subGoodsname | 1604601457 / 双面 | **子品类**（正/双面）——品类为两级结构 [INFERRED→大概率] |
| goodsKey / goodsNameKey | 548890581_0 / 名片_0 | 前端键 |
| keywords | 名片，明信片，名牌，铭牌 | **品类关键词组**（搜单/关联用途） |
| sizeName | 铜版纸 | 材质名 |
| excelUploadShow | true | 允许 Excel 上传 |
| detailId | 1977117384 | 明细行 ID |
| isConnect | 0 | 关联标志 |

## 5. 详情页功能区块（HTML 结构，[VERIFIED]）

- 基本信息区：设计费（￥10.00）、截稿时间、备注、设计状态、店铺筛单权限提示
- 产品属性区：设计形式、版数、后道、材质、是否定金单/打样单、数量、尺寸
- 附件区：客户资料/图片资料（复制、一键下载、下载）、上传定稿凭证
- **聊天记录区**：客服/客户对话流（含时间戳）
- **校对记录表**：审核时间、校对人、审核状态、审核意见、意见备注、设计师回复
- **历史订单记录**（getHistoryOrder.do，弹窗）：订单号/下单时间/设计需求/文件图片/设计师/操作
- **相似度检测**（checkSimilar.do）+ **AI 错别字检测**：产品多版相似度比较
- **订单改价弹窗**：原产品属性/定金单绑定/设计费/规格/设计形式/版数/备注理由/凭证图
- 资质上传区：委托方签字盖章、身份证、其他证明（敏感资质场景）
- 操作面：开启设计、打开模板、下载模板（downloadTemplet.do）、取色（copycolor.do）

## 6. 详情页动态子接口（POST 查询类，仅记录结构未调用——遵守只 GET 约束）

| 接口 | Method | 参数 | 用途 | 证据等级 |
| ---- | ------ | ---- | ---- | -------- |
| /child/getHistoryOrder.do | POST JSON | {needsid} | 历史订单数组 | [VERIFIED] 源码 |
| /child/getHistoryOrderInfo.do | POST | — | 历史订单详情 | [VERIFIED] 引用 |
| /child/getCheckOrderInfoList.do | POST JSON | {needsid} | 校对记录（checkTime 等字段） | [VERIFIED] 源码 |
| /child/getSubmitAll.do | POST formData | — | 上传模板记录 | [VERIFIED] 源码 |
| /child/getQqByOrdernum.do | GET/POST | {ordernum} | **按订单号取客户 QQ**（PII 接口） | [VERIFIED] 引用 |

（另有 abandon/取消/拒绝/申诉/改价/转交/送审等**写操作端点** 20+ 个仅登记于 LEGACY_API_MAP，本轮一律未调用。）

## 7. 对新系统的建模结论（[INFERRED]，证据支撑见上）

1. **详情 = 聚合根快照**：设计侧容器 + ERP 推单快照 + 版次产品行 + 文件约束 + 聊天/校对/历史三流。新系统应建模为 `OrderDetail` 聚合：`order` / `need` / `products[]`（版次）/ `files{constraints, editions[]}` / `erpSnapshot`（只读审计用）。
2. **ERP 快照原样保存**：erpOrderJson 是 ERP 侧字段的透传（含语义错位 ordrtyp），新系统**不得直接复用其字段名做领域模型**，应在 Adapter 层翻译。
3. **双订单号收敛**：TT_ 号为业务主号；ERP 长数字单号（页面样例形态）作为外部参照。新系统统一单号 + 外部引用字段。
4. **版次是一等公民**：designNo 内嵌版次语义、editionFileParamList 按版组织文件 → 新系统 `DesignEdition` 实体（版号/状态/文件/相似度检测结果）。
5. **PII 集中在 ERP 快照**（tel/email/company/qq/buyer_open_uid）→ 新系统展示层需脱敏策略 + 权限控制（getQqByOrdernum 这类接口不应无门槛暴露）。
6. **文件格式需求**：CDR/PDF/JPG/XLS 交稿 + 相似度检测 + AI 错别字检测 → 新系统文件服务需保留同等格式支持，检测能力作为增强项规划。
