const Layout = () => import("@/layout/index.vue");

export default {
  path: "/expedite",
  name: "Expedite",
  component: Layout,
  meta: {
    icon: "ep/bell",
    title: "催单中心",
    rank: 2
  },
  children: [
    {
      path: "/expedite/index",
      name: "ExpediteList",
      component: () => import("@/views/expedite/index.vue"),
      meta: {
        title: "催单清单"
      }
    }
  ]
} satisfies RouteConfigsTable;
