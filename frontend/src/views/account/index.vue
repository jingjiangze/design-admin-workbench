<script setup lang="ts">
/**
 * 账户页（P1B-06b 补充：金额规则导入/导出，docs/PRICING_RULE_SPEC.md §8）
 *
 * 账户信息卡 + 金额规则管理（导出 JSON 下载 / 导入预览确认生效）。
 * 规则存储经 pricingRuleStore（key=pricingRules:<userIdentity>）。
 */
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import {
  listRules,
  exportRules,
  buildImportPreview,
  commitImport,
  getUserIdentity
} from "@/service/pricing/pricing-rule-store";
import type { ImportPreview } from "@/service/pricing/pricing-rule-types";
import { formatAmount } from "@/service/pricing/amount-resolution";

defineOptions({
  name: "Account"
});

const rules = computed(() => listRules());
const importJson = ref("");
const preview = ref<ImportPreview | null>(null);

function exportJson() {
  if (rules.value.length === 0) {
    ElMessage.info("当前没有金额规则可导出");
    return;
  }
  const blob = new Blob([exportRules()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pricing-rules-${getUserIdentity()}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  ElMessage.success(`已导出 ${rules.value.length} 条规则`);
}

function onPreview() {
  if (!importJson.value.trim()) {
    ElMessage.info("请先粘贴导出的 JSON 内容");
    return;
  }
  preview.value = buildImportPreview(importJson.value);
  ElMessage.info(
    `发现 ${preview.value.total} 条：新增 ${preview.value.added.length} / 覆盖 ${preview.value.updated.length} / 跳过 ${preview.value.skipped.length}`
  );
}

function onCommit() {
  if (!preview.value) return;
  const r = commitImport(preview.value);
  preview.value = null;
  importJson.value = "";
  ElMessage.success(
    `导入完成：新增 ${r.added} / 覆盖 ${r.updated} / 跳过 ${r.skipped}`
  );
}
</script>

<template>
  <div class="account-page">
    <!-- 账户信息 -->
    <div class="panel">
      <h3>账户信息</h3>
      <div class="info-row">
        <span class="label">当前身份</span>
        <span>{{ getUserIdentity() }}（Phase 1 本地模式）</span>
      </div>
      <div class="info-row">
        <span class="label">规则存储</span>
        <span
          >浏览器本地（pricingRules:{{ getUserIdentity() }}），Phase 2
          迁移服务器账号体系</span
        >
      </div>
      <div class="info-row">
        <span class="label">金额规则</span>
        <span>{{ rules.length }} 条</span>
      </div>
    </div>

    <!-- 金额规则管理 -->
    <div class="panel">
      <h3>金额规则管理</h3>
      <div v-if="rules.length > 0" class="rule-summary">
        <div v-for="r in rules" :key="r.id" class="rule-line">
          <span>{{ r.productName }}</span>
          <span class="mono">{{ r.goodsId }}</span>
          <b>{{ formatAmount(r.amount) }}</b>
        </div>
      </div>
      <p v-else class="hint">暂无自定义规则——在"品类 → 金额规则"中设置。</p>

      <div class="import-section">
        <h4>导入金额规则</h4>
        <el-input
          v-model="importJson"
          type="textarea"
          :rows="6"
          placeholder='粘贴导出的 JSON，如 [{"goodsid":"1717812924","amount":8}]'
        />
        <div class="import-actions">
          <el-button @click="onPreview">解析预览</el-button>
          <el-button @click="exportJson">导出金额规则</el-button>
        </div>
        <div v-if="preview" class="preview-box">
          <p>
            发现 <b>{{ preview.total }}</b> 条：新增
            <b>{{ preview.added.length }}</b> / 覆盖
            <b>{{ preview.updated.length }}</b> / 跳过
            <b>{{ preview.skipped.length }}</b>
          </p>
          <div
            v-for="(u, i) in preview.updated"
            :key="'u' + i"
            class="preview-line"
          >
            覆盖：{{ u.displayName || u.goodsid }}
            {{ formatAmount(u.previousAmount) }} → {{ formatAmount(u.amount) }}
          </div>
          <div
            v-for="(s, i) in preview.skipped"
            :key="'s' + i"
            class="preview-line skip"
          >
            跳过：{{ s.goodsid }}（{{ s.reason }}）
          </div>
          <el-button type="primary" size="small" @click="onCommit"
            >确认导入</el-button
          >
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.account-page {
  max-width: 760px;
  padding: 16px 20px;
}

.panel {
  padding: 14px 16px;
  margin-bottom: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.panel h3 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}

.panel h4 {
  margin: 16px 0 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.info-row {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
}

.label {
  width: 84px;
  color: var(--el-text-color-secondary);
}

.rule-summary {
  margin-bottom: 10px;
}

.rule-line {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 5px 0;
  font-size: 13px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.rule-line b {
  margin-left: auto;
}

.mono {
  font-family: monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.import-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.preview-box {
  padding: 10px 12px;
  margin-top: 12px;
  font-size: 13px;
  background: var(--el-fill-color-extra-light);
  border-radius: 6px;
}

.preview-box p {
  margin: 0 0 6px;
}

.preview-line {
  padding: 2px 0;
  font-size: 12px;
}

.preview-line.skip {
  color: var(--el-text-color-placeholder);
}
</style>
