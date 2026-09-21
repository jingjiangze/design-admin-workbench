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
      path: "/order-history/index",
      name: "OrderHistory",
      component: () => import("@/views/order-history/index.vue"),
      meta: {
        title: "单号查历史"
      }
    }
  ]
} satisfies RouteConfigsTable;
