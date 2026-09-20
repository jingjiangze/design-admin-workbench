const Layout = () => import("@/layout/shell/AppShell.vue");

export default {
  path: "/category",
  name: "Category",
  component: Layout,
  meta: {
    icon: "ep/grid",
    title: "品类",
    rank: 3
  },
  children: [
    {
      path: "/category/index",
      name: "CategoryList",
      component: () => import("@/views/category/index.vue"),
      meta: {
        title: "品类与金额"
      }
    }
  ]
} satisfies RouteConfigsTable;
