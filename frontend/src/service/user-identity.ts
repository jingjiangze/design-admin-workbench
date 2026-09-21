/**
 * 用户身份门面 —— 登录成功 / 会话恢复 / 登出三时点的统一挂载点
 *
 * P1-05 修复：此前 setUserIdentity 全工程零调用（REAL_DATA_INVENTORY #P0-1
 * 审计发现），pricing 规则恒归属 "local"，多账号同浏览器会互相污染；
 * goods-id-map 的 identityScope 同病。
 * 身份值 = Worker 登录响应的 userKey（旧系统登录名）。
 */
import { setUserIdentity, getUserIdentity } from "./pricing/pricing-rule-store";
import { setGoodsIdIdentity } from "./income/goods-id-map";

/** 登录成功 / 刷新恢复时调用（幂等；同身份重复调用仅多一次服务端对齐） */
export function initUserIdentity(userKey: string): void {
  if (!userKey) return;
  setUserIdentity(userKey);
  setGoodsIdIdentity(userKey);
}

/** 登出时调用：回到 local 归属，防止登出窗口内读写串账号 */
export function resetUserIdentity(): void {
  setUserIdentity("local");
  setGoodsIdIdentity("local");
}

export { getUserIdentity };
