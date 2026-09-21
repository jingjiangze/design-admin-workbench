const Layout = () => import("@/layout/shell/AppShell.vue");

export default {
  path: "/order",
  name: "Order",
  component: Layout,
  meta: {
    icon: "ep/list",
    title: "订单",
    rank: 1
  },
  children: [
    {
      path: "/order/index",
      name: "OrderList",
      component: () => import("@/views/order/index.vue"),
      meta: {
        title: "订单"
      }
    },
    {
      // 首页单号直查的全屏结果页（不进侧边栏，仅搜索落地）
      path: "/order-history/index",
      name: "OrderHistoryQuery",
      component: () => import("@/views/order-history/index.vue"),
      meta: {
        title: "订单详情",
        showLink: false
      }
    }
  ]
} satisfies RouteConfigsTable;
