type Result = {
  success: boolean;
  data: Array<any>;
};

/**
 * 动态路由（Phase CF-REAL 起）：fake server 已从构建中移除，本应用
 * 全部使用 src/router/modules 下的静态路由，返回空数组即"无额外动态路由"。
 * 注意：initRouter 对该 Promise 无 .catch，必须本地 resolve，禁止再打网络。
 */
export const getAsyncRoutes = (): Promise<Result> =>
  Promise.resolve({ success: true, data: [] });
