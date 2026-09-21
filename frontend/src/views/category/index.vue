<template>
  <div class="category">
    <div class="category__head">
      <h1 class="category__title">商品金额</h1>
      <span class="category__sub">
        我的统计金额仅用于个人收入统计，不会修改原订单
      </span>
      <div class="category__tools">
        <AppButton
          variant="text"
          size="sm"
          icon="upload"
          @click="triggerImport"
        >
          导入
        </AppButton>
        <AppButton variant="text" size="sm" icon="download" @click="exportJson">
          导出
        </AppButton>
        <input
          ref="fileInputRef"
          type="file"
          accept="application/json"
          class="category__file-input"
          @change="onImportFile"
        />
      </div>
    </div>

    <div class="category__search">
      <AppSearch
        v-model="query"
        size="sm"
        placeholder="搜索商品 / 关键词…"
        class="category__search-input"
      />
    </div>

    <AppSkeleton v-if="loading" :rows="8" />

    <template v-else>
      <section
        v-for="group in groupedVisible"
        :key="group.group"
        class="category__group"
      >
        <h2 class="category__group-title">{{ group.group }}</h2>
        <div class="category__rows">
          <div
            v-for="g in group.items"
            :key="`${g.goodsId}|${g.subGoodsId}`"
            class="category__row"
          >
            <span class="category__name">{{ g.displayName }}</span>
            <span class="category__legacy">
              系统
              <b v-if="g.legacyAmount !== null" class="app-num"
                >¥{{ g.legacyAmount }}</b
              >
              <b v-else class="category__undefined">未定义</b>
            </span>
            <span class="category__mine">
              我的
              <b v-if="myRuleOf(g)" class="app-num">
                {{
                  myRuleOf(g)?.enabled === false
                    ? "已停用"
                    : `¥${myRuleOf(g)?.amount}`
                }}
              </b>
              <b v-else class="category__unset">未设置</b>
            </span>
            <div class="category__ops">
              <AppButton variant="text" size="sm" @click="openEditor(g)">
                {{ myRuleOf(g) ? "修改" : "设置" }}
              </AppButton>
              <AppButton
                v-if="myRuleOf(g)"
                variant="text"
                size="sm"
                @click="confirmRestore(g)"
              >
                恢复系统金额
              </AppButton>
            </div>
          </div>
        </div>
        <AppEmpty
          v-if="group.items.length === 0"
          icon="inbox"
          text="该品类没有匹配的商品"
        />
      </section>

      <AppEmpty
        v-if="groupedVisible.length === 0"
        icon="inbox"
        text="没有匹配的商品"
      />
    </template>

    <!-- 金额设置弹窗（§三十：极简，不需要复杂表单） -->
    <AppDialog v-model="editorVisible" :title="editing?.displayName ?? ''">
      <div class="editor">
        <div class="editor__row">
          <span class="editor__key">系统金额</span>
          <span class="editor__val app-num">
            {{
              editing?.legacyAmount !== null &&
              editing?.legacyAmount !== undefined
                ? `¥${editing.legacyAmount}`
                : "未定义"
            }}
          </span>
        </div>
        <div class="editor__row editor__row--input">
          <span class="editor__key">我的统计金额</span>
          <span class="editor__input">
            <span class="editor__cny">¥</span>
            <ElInputNumber
              v-model="editingAmount"
              :min="0"
              :max="99999"
              :precision="2"
              :step="1"
              :controls="false"
              placeholder="8.00"
              style="width: 140px"
            />
          </span>
        </div>
        <p class="editor__note">仅用于个人收入统计 · 不会修改原订单金额</p>
      </div>

      <template #footer>
        <div class="editor__footer">
          <AppButton variant="ghost" size="sm" @click="editorVisible = false">
            取消
          </AppButton>
          <AppButton variant="solid" size="sm" @click="saveRule"
            >保存</AppButton
          >
        </div>
      </template>
    </AppDialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 品类/金额规则工作台（Phase UI-R1 §二十九/§三十）
 * 分组商品行（系统金额 | 我的金额 对照）+ 极简设置弹窗 + 恢复系统金额
 * 规则读写一律经 pricingRuleStore（页面禁止直接 localStorage）
 * 未定义 ≠ ¥0（未定义灰色警示；¥0 正常展示）
 */
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { ElInputNumber, ElMessage, ElMessageBox } from "element-plus";
import {
  AppButton,
  AppDialog,
  AppEmpty,
  AppSearch,
  AppSkeleton
} from "@/components/ui";
import {
  fetchGoodsCatalog,
  groupByCategory,
  searchGoods,
  type GoodsItem
} from "@/service/category";
import {
  getRule,
  setRule,
  clearRule,
  listRules,
  buildImportPreview,
  commitImport,
  exportRules
} from "@/service/pricing/pricing-rule-store";
import type { PricingRule } from "@/service/pricing/pricing-rule-types";

defineOptions({ name: "CategoryList" });

const route = useRoute();

const loading = ref(true);
const catalog = ref<GoodsItem[]>([]);
const query = ref("");

/** Palette 跳转带入搜索词 */
onMounted(async () => {
  const q = route.query.q;
  if (typeof q === "string" && q) query.value = q;
  try {
    catalog.value = await fetchGoodsCatalog();
  } catch {
    catalog.value = [];
  } finally {
    loading.value = false;
  }
});

const groupedVisible = computed(() => {
  const filtered = searchGoods(catalog.value, query.value);
  return groupByCategory(filtered);
});

/** 我的规则（enabled=false 显示"已停用"） */
function myRuleOf(g: GoodsItem): PricingRule | null {
  const rule = getRule(g.goodsId, g.subGoodsId);
  return rule && rule.amount !== null ? rule : null;
}

// ── 设置弹窗 ──
const editorVisible = ref(false);
const editing = ref<GoodsItem | null>(null);
const editingAmount = ref<number | null>(null);

function openEditor(g: GoodsItem) {
  editing.value = g;
  const rule = getRule(g.goodsId, g.subGoodsId);
  editingAmount.value = rule?.amount ?? null;
  editorVisible.value = true;
}

function saveRule() {
  const g = editing.value;
  if (!g) return;
  setRule({
    goodsId: g.goodsId,
    subGoodsId: g.subGoodsId,
    productName: g.displayName,
    amount: editingAmount.value
  });
  editorVisible.value = false;
  ElMessage.success(
    editingAmount.value === null
      ? "已清除该商品的我的金额"
      : `已保存 ${g.displayName} = ¥${editingAmount.value}`
  );
}

async function confirmRestore(g: GoodsItem) {
  try {
    await ElMessageBox.confirm(
      `将删除「${g.displayName}」的个人金额规则，收入统计恢复为系统金额。`,
      "恢复系统金额",
      { confirmButtonText: "恢复", cancelButtonText: "取消", type: "warning" }
    );
  } catch {
    return;
  }
  clearRule(g.goodsId, g.subGoodsId);
  ElMessage.success(`已恢复 ${g.displayName} 为系统金额`);
}

// ── 导入/导出（P1B-06b 能力保留，§五十六 不删业务） ──
const fileInputRef = ref<HTMLInputElement>();

function triggerImport() {
  fileInputRef.value?.click();
}

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const preview = buildImportPreview(text);
    if (preview.total === 0) {
      ElMessage.warning("导入文件中没有可用规则");
      return;
    }
    await ElMessageBox.confirm(
      `新增 ${preview.added.length} · 覆盖 ${preview.updated.length} · 跳过 ${preview.skipped.length}，确认导入？`,
      "导入金额规则",
      { confirmButtonText: "导入", cancelButtonText: "取消", type: "info" }
    );
    const result = commitImport(preview);
    ElMessage.success(
      `导入完成：新增 ${result.added} · 覆盖 ${result.updated} · 跳过 ${result.skipped}`
    );
  } catch {
    /* 用户取消或文件非法：静默 */
  }
}

function exportJson() {
  if (listRules().length === 0) {
    ElMessage.info("当前没有可导出的规则");
    return;
  }
  const blob = new Blob([exportRules()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pricing-rules-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.category {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.category__head {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
}

.category__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text);
}

.category__sub {
  font-size: 12.5px;
  color: var(--app-text-faint);
}

.category__tools {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  margin-left: auto;
}

.category__file-input {
  display: none;
}

.category__search {
  display: flex;
}

.category__search-input {
  width: 280px;
}

/* 分组 */
.category__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.category__group-title {
  margin: var(--space-4) 0 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-faint);
  letter-spacing: 0.04em;
}

.category__rows {
  display: flex;
  flex-direction: column;
}

.category__row {
  display: grid;
  grid-template-columns: 1.6fr 0.9fr 0.9fr auto;
  gap: var(--space-4);
  align-items: center;
  padding: var(--space-3) var(--space-2);
  font-size: 13.5px;
  border-bottom: 1px solid var(--app-border);
}

.category__row:hover {
  background: var(--app-surface-hover);
  border-radius: var(--radius-sm);
}

.category__name {
  font-weight: 500;
  color: var(--app-text);
}

.category__legacy,
.category__mine {
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
  font-size: 12.5px;
  color: var(--app-text-muted);
}

.category__legacy b,
.category__mine b {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
}

.category__undefined {
  color: var(--app-warning) !important;
}

.category__unset {
  font-weight: 400 !important;
  color: var(--app-text-faint) !important;
}

.category__ops {
  display: flex;
  gap: var(--space-1);
  opacity: 0;
  transition: opacity 140ms ease;
}

.category__row:hover .category__ops {
  opacity: 1;
}

/* 设置弹窗（§三十） */
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.editor__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.editor__key {
  font-size: 12.5px;
  color: var(--app-text-muted);
}

.editor__val {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.editor__row--input {
  align-items: center;
}

.editor__input {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.editor__cny {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.editor__note {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-faint);
}

.editor__footer {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
</style>
