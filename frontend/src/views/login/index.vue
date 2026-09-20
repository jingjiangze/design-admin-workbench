<script setup lang="ts">
import Motion from "./utils/motion";
import { useRouter } from "vue-router";
import { message } from "@/utils/message";
import { loginRules } from "./utils/rule";
import { ref, reactive, onMounted, onBeforeUnmount, toRaw } from "vue";
import { debounce } from "@pureadmin/utils";
import { useNav } from "@/layout/hooks/useNav";
import { useEventListener } from "@vueuse/core";
import type { FormInstance } from "element-plus";
import { useLayout } from "@/layout/hooks/useLayout";
import { useUserStoreHook } from "@/store/modules/user";
import { initRouter, getTopMenu } from "@/router/utils";
import { getPublicConfig } from "@/api/user";
import { encryptLegacyPassword } from "@/utils/legacy-crypto";
import { bg, avatar, illustration } from "./utils/static";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import { useDataThemeChange } from "@/layout/hooks/useDataThemeChange";

import dayIcon from "@/assets/svg/day.svg?component";
import darkIcon from "@/assets/svg/dark.svg?component";
import Lock from "~icons/ri/lock-fill";
import User from "~icons/ri/user-3-fill";

defineOptions({
  name: "Login"
});

/** Turnstile 浏览器 API（challenges.cloudflare.com 注入） */
interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}
function getTurnstile(): TurnstileApi | null {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile ?? null;
}
function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector("script[data-dw-turnstile]")) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.setAttribute("data-dw-turnstile", "1");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile-script-load-failed"));
    document.head.appendChild(script);
  });
}

const router = useRouter();
const loading = ref(false);
const disabled = ref(false);
const ruleFormRef = ref<FormInstance>();

/** Turnstile 状态（site key 由 /api/config 下发；mock 环境为空不渲染） */
const siteKey = ref("");
const turnstileToken = ref("");
const tsBox = ref<HTMLElement | null>(null);
let tsWidgetId: string | null = null;

const { initStorage } = useLayout();
initStorage();

const { dataTheme, overallStyle, dataThemeChange } = useDataThemeChange();
dataThemeChange(overallStyle.value);
const { title } = useNav();

const ruleForm = reactive({
  username: "",
  password: ""
});

onMounted(async () => {
  try {
    const config = await getPublicConfig();
    if (config?.data?.turnstileSiteKey) {
      siteKey.value = config.data.turnstileSiteKey;
      await loadTurnstileScript();
      const api = getTurnstile();
      if (api && tsBox.value) {
        tsWidgetId = api.render(tsBox.value, {
          sitekey: siteKey.value,
          callback: (token: string) => {
            turnstileToken.value = token;
          },
          "expired-callback": () => {
            turnstileToken.value = "";
          }
        });
      }
    }
  } catch {
    // 配置读取失败不阻塞登录（mock 环境无 Turnstile）
  }
});

onBeforeUnmount(() => {
  const api = getTurnstile();
  if (api && tsWidgetId) api.remove(tsWidgetId);
});

function resetTurnstile() {
  const api = getTurnstile();
  if (api && tsWidgetId) {
    try {
      api.reset(tsWidgetId);
    } catch {
      /* noop */
    }
  }
  turnstileToken.value = "";
}

const onLogin = async (formEl: FormInstance | undefined) => {
  if (!formEl) return;
  await formEl.validate(valid => {
    if (valid) {
      // 密码在浏览器侧 RSA 加密，Worker 只透传密文（docs/AUTH.md）
      const cipher = encryptLegacyPassword(ruleForm.password);
      if (!cipher) {
        message("密码加密失败，请重试", { type: "error" });
        return;
      }
      loading.value = true;
      useUserStoreHook()
        .loginByUsername({
          username: ruleForm.username,
          password: cipher,
          turnstileToken: turnstileToken.value || undefined
        })
        .then(res => {
          if (res.success) {
            // 获取后端路由
            return initRouter().then(() => {
              disabled.value = true;
              router
                .push(getTopMenu(true).path)
                .then(() => {
                  message("登录成功", { type: "success" });
                })
                .finally(() => (disabled.value = false));
            });
          } else {
            message("登录失败", { type: "error" });
            resetTurnstile();
          }
        })
        .catch(
          (error: {
            response?: { data?: { message?: string } };
            message?: string;
          }) => {
            const detail =
              error?.response?.data?.message ?? error?.message ?? "";
            message(detail ? `登录失败：${detail}` : "登录失败", {
              type: "error"
            });
            resetTurnstile();
          }
        )
        .finally(() => (loading.value = false));
    }
  });
};

const immediateDebounce: any = debounce(
  formRef => onLogin(formRef),
  1000,
  true
);

useEventListener(document, "keydown", ({ code }) => {
  if (
    ["Enter", "NumpadEnter"].includes(code) &&
    !disabled.value &&
    !loading.value
  )
    immediateDebounce(ruleFormRef.value);
});
</script>

<template>
  <div class="select-none">
    <img :src="bg" class="wave" />
    <div class="flex-c absolute right-5 top-3">
      <!-- 主题 -->
      <el-switch
        v-model="dataTheme"
        inline-prompt
        :active-icon="dayIcon"
        :inactive-icon="darkIcon"
        @change="dataThemeChange"
      />
    </div>
    <div class="login-container">
      <div class="img">
        <component :is="toRaw(illustration)" />
      </div>
      <div class="login-box">
        <div class="login-form">
          <avatar class="avatar" />
          <Motion>
            <h2 class="outline-hidden">{{ title }}</h2>
          </Motion>

          <el-form
            ref="ruleFormRef"
            :model="ruleForm"
            :rules="loginRules"
            size="large"
          >
            <Motion :delay="100">
              <el-form-item
                :rules="[
                  {
                    required: true,
                    message: '请输入账号',
                    trigger: 'blur'
                  }
                ]"
                prop="username"
              >
                <el-input
                  v-model="ruleForm.username"
                  clearable
                  placeholder="账号"
                  :prefix-icon="useRenderIcon(User)"
                />
              </el-form-item>
            </Motion>

            <Motion :delay="150">
              <el-form-item prop="password">
                <el-input
                  v-model="ruleForm.password"
                  clearable
                  show-password
                  placeholder="密码"
                  :prefix-icon="useRenderIcon(Lock)"
                />
              </el-form-item>
            </Motion>

            <Motion :delay="200">
              <div ref="tsBox" class="turnstile-box" />
            </Motion>

            <Motion :delay="250">
              <el-button
                class="w-full mt-4!"
                size="default"
                type="primary"
                :loading="loading"
                :disabled="disabled"
                @click="onLogin(ruleFormRef)"
              >
                登录
              </el-button>
            </Motion>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url("@/style/login.css");
</style>

<style lang="scss" scoped>
:deep(.el-input-group__append, .el-input-group__prepend) {
  padding: 0;
}

.turnstile-box {
  min-height: 0;
}
</style>
