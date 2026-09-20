const Layout = () => import("@/layout/index.vue");

export default {
  path: "/income",
  name: "Income",
  component: Layout,
  meta: {
    icon: "ep/wallet",
    title: "收入",
    rank: 4
  },
  children: [
    {
      path: "/income/index",
      name: "IncomeOverview",
      component: () => import("@/views/income/index.vue"),
      meta: {
        title: "收入总览"
      }
    }
  ]
} satisfies RouteConfigsTable;
