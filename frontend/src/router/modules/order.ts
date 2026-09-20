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
    },
    {
      // P1A-09 技术 Proof 测试页（P1B 替换为完整 Drawer 后移除）
      path: "/order/detail-proof",
      name: "DetailProof",
      component: () => import("@/views/order/detail-proof.vue"),
      meta: {
        title: "详情链路 Proof"
      }
    }
  ]
} satisfies RouteConfigsTable;
