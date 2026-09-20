/**
 * 旧系统登录密码加密（Phase CF-REAL-03 前置接线）
 *
 * 旧系统登录接口要求密码以 RSA(PKCS#1 v1.5) 密文提交，公钥硬编码于
 * 旧系统公开 JS（Phase 0 取证，公开非 secret）。浏览器加密后 Worker
 * 只透传密文，全程不接触明文密码（docs/AUTH.md 纪律）。
 */
import JSEncrypt from "jsencrypt";

const LEGACY_LOGIN_PUBLIC_KEY =
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCvkosc8DZyVo9TOoOOdYxpGTjSJqyrBoOLEciY\n" +
  "HW+3g9bVdrU1urxparXV5mcDpB0ebhocjjYWQPiAlyK1SgwzC7Y8TXnsbmqh+1U7K3JIXSQc+ajA\n" +
  "NnuDgfmCnfJ9S8MY28AjdN8ahrmPBL1S4V/GQSxX9zhmh2LLupdpqheEuQIDAQAB";

/** 返回 base64 密文；加密失败返回 false */
export function encryptLegacyPassword(plain: string): string | false {
  const encrypt = new JSEncrypt();
  encrypt.setPublicKey(LEGACY_LOGIN_PUBLIC_KEY);
  return encrypt.encrypt(plain);
}
