<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { fetchOrderDetail, type OrderDetail } from "@/service/order-detail";

/**
 * P1A-09 详情 Drawer 技术 Proof（极简测试页）
 * 仅验证链路：输入 needsid → fetchOrderDetail → 七区块摘要 + 脱敏 JSON
 * P1B 将替换为完整 OrderDrawer 组件（720px，docs/NEW_UI_UX_DIRECTION.md）
 */
defineOptions({
  name: "DetailProof"
});

const needsid = ref("1977019785");
const loading = ref(false);
const detail = ref<OrderDetail | null>(null);
const error = ref("");

async function query() {
  loading.value = true;
  error.value = "";
  detail.value = null;
  try {
    const res = await fetchOrderDetail({ needsid: needsid.value.trim() });
    if (!res) {
      error.value = "未提取到详情数据（接口返回异常或非预期结构）";
      return;
    }
    detail.value = res;
    ElMessage.success("详情拉取成功");
  } catch (e) {
    error.value = String((e as Error)?.message ?? e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="detail-proof">
    <h2>详情 Drawer 技术 Proof（P1A-09）</h2>
    <p class="hint">
      needsid 主键 + applyid 兼容键；七区块映射 + PII 脱敏全部在 Adapter 层完成
    </p>

    <div class="query-bar">
      <el-input
        v-model="needsid"
        placeholder="输入 needsid"
        style="width: 260px"
        @keyup.enter="query"
      />
      <el-button type="primary" :loading="loading" @click="query">
        查询详情
      </el-button>
    </div>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
    />

    <template v-if="detail">
      <el-descriptions title="区块 1：identity" :column="3" border>
        <el-descriptions-item label="needsid">
          {{ detail.identity.needsid }}
        </el-descriptions-item>
        <el-descriptions-item label="applyid">
          {{ detail.identity.applyid }}
        </el-descriptions-item>
        <el-descriptions-item label="ordernum">
          {{ detail.identity.ordernum }}
        </el-descriptions-item>
      </el-descriptions>

      <el-descriptions title="区块 3：flags / 区块 5：files" :column="2" border>
        <el-descriptions-item label="后道 isbeol">
          {{ detail.flags.isBeol }}
        </el-descriptions-item>
        <el-descriptions-item label="专色 spotColor">
          {{ detail.flags.spotColor }}
        </el-descriptions-item>
        <el-descriptions-item label="版次数">
          {{ detail.editions.length }}
        </el-descriptions-item>
        <el-descriptions-item label="交稿格式">
          {{ detail.fileConstraints[0]?.acceptedSuffixes.join(" / ") || "-" }}
        </el-descriptions-item>
      </el-descriptions>

      <h3>区块 4：版次（前 3 版）</h3>
      <el-table :data="detail.editions.slice(0, 3)" border size="small">
        <el-table-column prop="editionIndex" label="#" width="48" />
        <el-table-column prop="productName" label="商品" min-width="140" />
        <el-table-column prop="spec" label="规格" width="100" />
        <el-table-column prop="material" label="材质" width="90" />
        <el-table-column
          prop="designNo"
          label="designNo"
          min-width="220"
          show-overflow-tooltip
        />
      </el-table>

      <h3>区块 6/7：ERP 快照（脱敏）+ PII（掩码）</h3>
      <p class="hint">
        shop 由 ordrtyp 改名（Adapter 层）；bz 为客服署名+时间戳工单轨迹
      </p>
      <pre class="json-box">{{
        JSON.stringify(
          { erpSnapshot: detail.erpSnapshot, pii: detail.pii },
          null,
          2
        )
      }}</pre>

      <el-collapse>
        <el-collapse-item title="完整 OrderDetail（脱敏 JSON）">
          <pre class="json-box">{{ JSON.stringify(detail, null, 2) }}</pre>
        </el-collapse-item>
      </el-collapse>
    </template>
  </div>
</template>

<style scoped>
.detail-proof {
  padding: 24px;
}
.detail-proof h2 {
  margin-bottom: 8px;
  font-size: 18px;
  font-weight: 600;
}
.detail-proof h3 {
  margin: 16px 0 8px;
  font-size: 15px;
  font-weight: 600;
}
.hint {
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.query-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.json-box {
  max-height: 360px;
  padding: 12px;
  overflow: auto;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  line-height: 1.5;
}
.el-descriptions {
  margin-bottom: 16px;
}
</style>
