const Layout = () => import("@/layout/index.vue");

export default {
  path: "/data",
  name: "DataCenter",
  component: Layout,
  meta: {
    icon: "ep/data-analysis",
    title: "数据中心",
    rank: 4
  },
  children: [
    {
      path: "/data/index",
      name: "DataOverview",
      component: () => import("@/views/data/index.vue"),
      meta: {
        title: "数据概览"
      }
    }
  ]
} satisfies RouteConfigsTable;
