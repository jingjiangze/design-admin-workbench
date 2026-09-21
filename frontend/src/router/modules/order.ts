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
    }
  ]
} satisfies RouteConfigsTable;
