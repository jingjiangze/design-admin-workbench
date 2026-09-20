import { http } from "@/utils/http";

export type UserResult = {
  success: boolean;
  data: {
    /** 头像 */
    avatar: string;
    /** 用户名 */
    username: string;
    /** 昵称 */
    nickname: string;
    /** 当前登录用户的角色 */
    roles: Array<string>;
    /** 按钮级别权限 */
    permissions: Array<string>;
    /** `token`（本应用存 csrfToken，真正会话在 HttpOnly Cookie） */
    accessToken: string;
    /** 用于调用刷新`accessToken`的接口时所需的`token` */
    refreshToken: string;
    /** `accessToken`的过期时间（格式'xxxx/xx/xx xx:xx:xx'） */
    expires: Date;
    /** 运行模式：mock / legacy */
    mode?: string;
  };
};

export type RefreshTokenResult = {
  success: boolean;
  data: {
    /** `token` */
    accessToken: string;
    /** 用于调用刷新`accessToken`的接口时所需的`token` */
    refreshToken: string;
    /** `accessToken`的过期时间（格式'xxxx/xx/xx xx:xx:xx'） */
    expires: Date;
  };
};

/** Worker 登录接口原始响应形态（jsonOk 包装） */
interface WorkerLoginResponse {
  result: boolean;
  data?: { mode: string; userKey: string; csrfToken: string };
  code?: string;
  message?: string;
}

/**
 * 登录（POST /api/auth/login，Phase CF-REAL 真实接线）
 * - password 必须已是 RSA 密文（utils/legacy-crypto.ts），Worker 不接触明文；
 * - 响应适配为 pure-admin 的 UserResult 形态（accessToken 存 csrfToken）；
 * - 真正的会话凭据是 HttpOnly Cookie __dw_session，不进 JS 可读存储。
 */
export const getLogin = (data?: {
  username: string;
  password: string;
  turnstileToken?: string;
}) =>
  http
    .request<WorkerLoginResponse>("post", "/api/auth/login", { data })
    .then(res => {
      if (res?.result && res.data) {
        return {
          success: true,
          data: {
            avatar: "",
            username: res.data.userKey,
            nickname: res.data.userKey,
            roles: ["designer"],
            permissions: ["designer"],
            accessToken: res.data.csrfToken,
            refreshToken: res.data.csrfToken,
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
            mode: res.data.mode
          }
        } as unknown as UserResult;
      }
      throw new Error(res?.message ?? "登录响应异常");
    });

/** 刷新`token`（占位保留：会话鉴权基于 HttpOnly Cookie，无独立刷新端点） */
export const refreshTokenApi = (data?: object) => {
  return http.request<RefreshTokenResult>("post", "/refresh-token", { data });
};

/** 公开配置（登录页读取 Turnstile site key 等，无需会话） */
export const getPublicConfig = () =>
  http.request<{
    result: boolean;
    data: { mode: string; turnstileSiteKey: string | null };
  }>("get", "/api/config");
