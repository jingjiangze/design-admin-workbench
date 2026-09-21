const Layout = () => import("@/layout/shell/AppShell.vue");

export default [
  {
    path: "/login",
    name: "Login",
    component: () => import("@/views/login/index.vue"),
    meta: {
      title: "登录",
      showLink: false
    }
  },
  // 全屏403（无权访问）页面
  {
    path: "/access-denied",
    name: "AccessDenied",
    component: () => import("@/views/error/403.vue"),
    meta: {
      title: "403",
      showLink: false
    }
  },
  // 全屏500（服务器出错）页面
  {
    path: "/server-error",
    name: "ServerError",
    component: () => import("@/views/error/500.vue"),
    meta: {
      title: "500",
      showLink: false
    }
  },
  {
    path: "/redirect",
    component: Layout,
    meta: {
      title: "加载中...",
      showLink: false
    },
    children: [
      {
        path: "/redirect/:path(.*)",
        name: "Redirect",
        component: () => import("@/layout/redirect.vue")
      }
    ]
  },
  {
    // 真实数据证明页（#67 收尾 Wave）：逐域探测 INCOME/PRICING/HOME 数据通道
    // 真实性，不进入正式导航（与 /ui-preview 同类）
    path: "/real-data-proof",
    name: "RealDataProof",
    component: Layout,
    meta: {
      title: "真实数据证明",
      showLink: false
    },
    children: [
      {
        path: "/real-data-proof/index",
        name: "RealDataProofIndex",
        component: () => import("@/views/real-data-proof/index.vue"),
        meta: {
          title: "真实数据证明"
        }
      }
    ]
  },
  {
    // 视觉验收页（Phase UI-R1 §四十六）：展示基础组件，不进入正式导航
    path: "/ui-preview",
    name: "UiPreview",
    component: Layout,
    meta: {
      title: "视觉验收",
      showLink: false
    },
    children: [
      {
        path: "/ui-preview/index",
        name: "UiPreviewIndex",
        component: () => import("@/views/ui-preview/index.vue"),
        meta: {
          title: "视觉验收"
        }
      }
    ]
  }
] satisfies Array<RouteConfigsTable>;
