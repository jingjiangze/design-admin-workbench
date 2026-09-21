<script setup lang="ts">
/**
 * 接单开关（Header pill）—— 对应旧系统首页"接单状态"开关
 *
 * 交互纪律：
 * - 切换必经二次确认（写操作，影响真实派单）；
 * - 定时关闭仅执行"关闭"方向（Worker cron 单向执行，绝不自动开启）；
 * - 状态读取失败（degraded）时开关置灰并提示，不猜测状态。
 */
import { ref, computed, onMounted } from "vue";
import dayjs from "dayjs";
import { ElMessage, ElMessageBox } from "element-plus";
import AppIcon from "@/components/ui/AppIcon.vue";
import {
  fetchAcceptanceStatus,
  toggleAcceptance,
  setAcceptanceSchedule,
  cancelAcceptanceSchedule,
  type AcceptanceStatus
} from "@/service/legacy/acceptance";

defineOptions({ name: "AcceptanceSwitch" });

const status = ref<AcceptanceStatus | null>(null);
const loading = ref(false);
const scheduling = ref(false);
const popoverVisible = ref(false);
const customTime = ref<Date | null>(null);
const switchValue = ref(false);

const degraded = computed(() => status.value?.degraded ?? null);
const known = computed(
  () => status.value?.open === true || status.value?.open === false
);
const schedule = computed(() => status.value?.schedule ?? null);
const lastResult = computed(() => status.value?.lastResult ?? null);

const scheduleText = computed(() =>
  schedule.value ? dayjs(schedule.value.closeAt).format("MM-DD HH:mm") : ""
);

function presetAt(offsetMinutes?: number, fixedHour?: number): Date {
  if (fixedHour !== undefined) {
    const t = dayjs().hour(fixedHour).minute(0).second(0).millisecond(0);
    return (t.isBefore(dayjs()) ? t.add(1, "day") : t).toDate();
  }
  return dayjs()
    .add(offsetMinutes ?? 30, "minute")
    .toDate();
}

async function refresh() {
  loading.value = true;
  try {
    const res = await fetchAcceptanceStatus();
    if (res.result && res.data) {
      status.value = res.data;
      switchValue.value = res.data.open === true;
    } else {
      ElMessage.error("接单状态读取失败");
    }
  } catch {
    ElMessage.error("接单状态读取失败（网络异常）");
  } finally {
    loading.value = false;
  }
}

async function onSwitchChange(val: boolean) {
  const tip = val
    ? "确认开启接单？开启后发单员可直接派单或自动分单。"
    : "确认关闭接单？关闭后不再自动分单（旧系统 30 分钟无操作也会自动关闭）。";
  try {
    await ElMessageBox.confirm(tip, "接单开关", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    switchValue.value = !val; // 取消：回滚开关显示
    return;
  }
  loading.value = true;
  try {
    const res = await toggleAcceptance(val);
    if (res.result && res.data && res.data.open === val) {
      ElMessage.success(
        res.data.message || (val ? "已开启接单" : "已关闭接单")
      );
      status.value = {
        ...(status.value as AcceptanceStatus),
        open: val,
        degraded: null
      };
    } else {
      ElMessage.error(res.data?.message || "切换失败（旧系统拒绝）");
      switchValue.value = !val;
    }
  } catch {
    ElMessage.error("网络异常，切换失败");
    switchValue.value = !val;
  } finally {
    loading.value = false;
  }
}

async function doSchedule(at: Date) {
  if (at.getTime() <= Date.now() + 60_000) {
    ElMessage.warning("定时时间必须在未来 1 分钟以上");
    return;
  }
  scheduling.value = true;
  try {
    const res = await setAcceptanceSchedule(at.toISOString());
    if (res.result && res.data?.schedule) {
      status.value = {
        ...(status.value as AcceptanceStatus),
        schedule: res.data.schedule
      };
      ElMessage.success(`将在 ${dayjs(at).format("HH:mm")} 自动关闭接单`);
      popoverVisible.value = false;
    } else {
      ElMessage.error("定时设置失败");
    }
  } catch {
    ElMessage.error("定时设置失败（网络异常）");
  } finally {
    scheduling.value = false;
  }
}

async function onCancelSchedule() {
  scheduling.value = true;
  try {
    const res = await cancelAcceptanceSchedule();
    if (res.result) {
      status.value = { ...(status.value as AcceptanceStatus), schedule: null };
      ElMessage.success("已取消定时关闭");
    } else {
      ElMessage.error("取消失败");
    }
  } catch {
    ElMessage.error("取消失败（网络异常）");
  } finally {
    scheduling.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <div class="acceptance-pill">
    <el-popover
      v-model:visible="popoverVisible"
      placement="bottom-end"
      :width="300"
      trigger="click"
    >
      <template #reference>
        <span
          class="sched-btn"
          title="定时关闭接单"
          :class="{ 'has-schedule': !!schedule }"
        >
          <AppIcon name="clock" :size="16" />
          <i v-if="schedule" class="sched-dot" />
        </span>
      </template>

      <div class="sched-panel">
        <p class="sched-title">定时关闭接单</p>
        <p class="sched-tip">
          到时由系统自动关闭（只关不开）；旧系统 30 分钟无操作也会自动关闭。
        </p>

        <div v-if="schedule" class="sched-active">
          <span
            >已设定：<b>{{ scheduleText }}</b> 自动关闭</span
          >
          <el-button
            size="small"
            text
            type="danger"
            :loading="scheduling"
            @click="onCancelSchedule"
          >
            取消
          </el-button>
        </div>

        <div
          v-if="lastResult"
          class="sched-result"
          :class="'r-' + lastResult.status"
        >
          <template v-if="lastResult.status === 'CLOSED'">
            上次定时已关闭（{{ dayjs(lastResult.at).format("MM-DD HH:mm") }}）
          </template>
          <template v-else-if="lastResult.status === 'SESSION_EXPIRED'">
            登录会话过期，重新登录后将自动重试
          </template>
          <template v-else>
            上次执行未成功：{{ lastResult.message || lastResult.status }}
          </template>
        </div>

        <div class="presets">
          <el-button
            size="small"
            :disabled="scheduling"
            @click="doSchedule(presetAt(30))"
          >
            30 分钟后
          </el-button>
          <el-button
            size="small"
            :disabled="scheduling"
            @click="doSchedule(presetAt(60))"
          >
            1 小时后
          </el-button>
          <el-button
            size="small"
            :disabled="scheduling"
            @click="doSchedule(presetAt(120))"
          >
            2 小时后
          </el-button>
          <el-button
            size="small"
            :disabled="scheduling"
            @click="doSchedule(presetAt(undefined, 21))"
          >
            今天 21:00
          </el-button>
        </div>

        <div class="custom-row">
          <el-date-picker
            v-model="customTime"
            type="datetime"
            placeholder="自定义时间"
            size="small"
            format="YYYY-MM-DD HH:mm"
            :disabled="scheduling"
            :disabled-date="(d: Date) => d.getTime() < Date.now() - 86400_000"
          />
          <el-button
            size="small"
            type="primary"
            :disabled="!customTime"
            :loading="scheduling"
            @click="customTime && doSchedule(customTime)"
          >
            设定
          </el-button>
        </div>
      </div>
    </el-popover>

    <span class="as-label" :title="degraded ?? undefined">接单</span>
    <el-switch
      v-model="switchValue"
      :loading="loading"
      :disabled="loading || (!!degraded && !known)"
      inline-prompt
      active-text="开"
      inactive-text="关"
      @change="onSwitchChange"
    />
  </div>
</template>

<style lang="scss" scoped>
.acceptance-pill {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: center;
  padding-right: var(--space-1, 4px);

  .sched-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    color: var(--app-text-muted);
    cursor: pointer;
    border-radius: var(--radius-md);
    transition:
      background-color 140ms ease,
      color 140ms ease;

    &:hover {
      color: var(--app-text);
      background: var(--app-surface-hover);
    }

    &.has-schedule {
      color: var(--app-accent);

      &:hover {
        color: var(--app-accent);
      }
    }

    .sched-dot {
      position: absolute;
      top: 5px;
      right: 5px;
      width: 6px;
      height: 6px;
      background: var(--app-danger);
      border-radius: 50%;
    }
  }

  .as-label {
    font-size: 12px;
    color: var(--app-text-muted);
  }
}

.sched-panel {
  .sched-title {
    margin: 0 0 6px;
    font-size: 14px;
    font-weight: 600;
  }

  .sched-tip {
    margin: 0 0 10px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--app-text-muted, #909399);
  }

  .sched-active {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    margin-bottom: 8px;
    font-size: 12px;
    background: var(--el-color-primary-light-9);
    border-radius: var(--radius-md, 6px);
  }

  .sched-result {
    margin-bottom: 8px;
    font-size: 12px;
    color: var(--app-text-muted, #909399);

    &.r-SESSION_EXPIRED {
      color: var(--el-color-warning);
    }

    &.r-ERROR,
    &.r-REJECTED {
      color: var(--app-danger, var(--el-color-danger));
    }
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;

    .el-button {
      margin: 0;
    }
  }

  .custom-row {
    display: flex;
    gap: 6px;
    align-items: center;

    .el-date-editor {
      flex: 1;
    }
  }
}
</style>
