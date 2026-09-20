const Layout = () => import("@/layout/index.vue");

export default {
  path: "/account",
  name: "Account",
  component: Layout,
  meta: {
    icon: "ep/user",
    title: "账户中心",
    rank: 5
  },
  children: [
    {
      path: "/account/index",
      name: "AccountInfo",
      component: () => import("@/views/account/index.vue"),
      meta: {
        title: "账户信息"
      }
    }
  ]
} satisfies RouteConfigsTable;
