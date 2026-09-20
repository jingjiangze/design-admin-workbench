const Layout = () => import("@/layout/index.vue");

export default {
  path: "/order",
  name: "Order",
  component: Layout,
  meta: {
    icon: "ep/list",
    title: "订单中心",
    rank: 1
  },
  children: [
    {
      path: "/order/index",
      name: "OrderList",
      component: () => import("@/views/order/index.vue"),
      meta: {
        title: "订单列表"
      }
    }
  ]
} satisfies RouteConfigsTable;
