<script setup lang="ts">
/**
 * 接单开关（Header pill）—— 对应旧系统首页"接单状态"开关
 *
 * 交互纪律（2026-09-21 用户指定）：
 * - 开启/关闭接单点击即执行、立即生效，不弹二次确认；
 * - 定时关闭仅执行"关闭"方向（Worker cron 单向执行，绝不自动开启）；
 * - 状态读取失败（degraded）时开关置灰并提示，不猜测状态。
 */
import { ref, computed, onMounted } from "vue";
import dayjs from "dayjs";
import { ElMessage } from "element-plus";
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
/** 定时模式：默认每天（2026-09-21 用户指令） */
const scheduleMode = ref<"daily" | "once">("daily");
const dailyTime = ref<Date | null>(null);

const degraded = computed(() => status.value?.degraded ?? null);
const known = computed(
  () => status.value?.open === true || status.value?.open === false
);
const schedule = computed(() => status.value?.schedule ?? null);
const lastResult = computed(() => status.value?.lastResult ?? null);

const scheduleText = computed(() => {
  const s = schedule.value;
  if (!s) return "";
  if (s.mode === "daily") return `每天 ${s.time ?? "--:--"}（本地时间）`;
  return s.closeAt ? dayjs(s.closeAt).format("MM-DD HH:mm") : "";
});

function presetAt(offsetMinutes?: number, fixedHour?: number): Date {
  if (fixedHour !== undefined) {
    const t = dayjs().hour(fixedHour).minute(0).second(0).millisecond(0);
    return (t.isBefore(dayjs()) ? t.add(1, "day") : t).toDate();
  }
  return dayjs()
    .add(offsetMinutes ?? 30, "minute")
    .toDate();
}

/**
 * 24 小时制时间（el-time-picker 产出 = 今天 + 所选时刻）→ 实际执行时间：
 * 当天该时刻已过（含未来 1 分钟内）则自动排到明天同一时间。
 */
function scheduleDateFromTime(t: Date): Date {
  const candidate = dayjs()
    .hour(t.getHours())
    .minute(t.getMinutes())
    .second(0)
    .millisecond(0);
  return (
    candidate.isBefore(dayjs().add(60, "second"))
      ? candidate.add(1, "day")
      : candidate
  ).toDate();
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
  // 直接执行、立即生效（不弹二次确认）；失败回滚开关显示
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

/** 每天：本地 HH:mm + 时区偏移提交，由 cron 每日窗口判定执行 */
async function doScheduleDaily(t: Date) {
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  scheduling.value = true;
  try {
    const res = await setAcceptanceSchedule({
      mode: "daily",
      time: `${hh}:${mm}`,
      // getTimezoneOffset() 返回"UTC-本地"分钟（中国 -480），取反即本地偏移
      tzOffsetMinutes: -new Date().getTimezoneOffset()
    });
    if (res.result && res.data?.schedule) {
      status.value = {
        ...(status.value as AcceptanceStatus),
        schedule: res.data.schedule
      };
      ElMessage.success(`将每天 ${hh}:${mm} 自动关闭接单（只关不开）`);
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

async function doSchedule(at: Date) {
  if (at.getTime() <= Date.now() + 60_000) {
    ElMessage.warning("定时时间必须在未来 1 分钟以上");
    return;
  }
  scheduling.value = true;
  try {
    const res = await setAcceptanceSchedule({
      mode: "once",
      closeAt: at.toISOString()
    });
    if (res.result && res.data?.schedule) {
      status.value = {
        ...(status.value as AcceptanceStatus),
        schedule: res.data.schedule
      };
      ElMessage.success(`将在 ${dayjs(at).format("MM-DD HH:mm")} 自动关闭接单`);
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
          到时由系统自动关闭（只关不开）。默认每天：每天所选本地时刻自动关闭一次，
          直至取消；「仅一次」为单次任务，当天该时刻已过则排到明天。
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

        <el-radio-group v-model="scheduleMode" size="small" class="sched-mode">
          <el-radio-button value="daily">每天</el-radio-button>
          <el-radio-button value="once">仅一次</el-radio-button>
        </el-radio-group>

        <div v-if="scheduleMode === 'daily'" class="custom-row">
          <el-time-picker
            v-model="dailyTime"
            placeholder="每天关闭时刻（24 小时制）"
            size="small"
            format="HH:mm"
            :disabled="scheduling"
          />
          <el-button
            size="small"
            type="primary"
            :disabled="!dailyTime"
            :loading="scheduling"
            @click="dailyTime && doScheduleDaily(dailyTime)"
          >
            设定
          </el-button>
        </div>

        <template v-else>
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
            <el-time-picker
              v-model="customTime"
              placeholder="选择时间（24 小时制）"
              size="small"
              format="HH:mm"
              :disabled="scheduling"
            />
            <el-button
              size="small"
              type="primary"
              :disabled="!customTime"
              :loading="scheduling"
              @click="
                customTime && doSchedule(scheduleDateFromTime(customTime))
              "
            >
              设定
            </el-button>
          </div>
        </template>
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

  .sched-mode {
    margin-bottom: 10px;
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
