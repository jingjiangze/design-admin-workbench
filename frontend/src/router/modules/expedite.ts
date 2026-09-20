const Layout = () => import("@/layout/index.vue");

export default {
  path: "/expedite",
  name: "Expedite",
  component: Layout,
  meta: {
    icon: "ep/bell",
    title: "催稿",
    rank: 2
  },
  children: [
    {
      path: "/expedite/index",
      name: "ExpediteList",
      component: () => import("@/views/expedite/index.vue"),
      meta: {
        title: "待处理催稿"
      }
    }
  ]
} satisfies RouteConfigsTable;
