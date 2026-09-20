const Layout = () => import("@/layout/index.vue");

export default {
  path: "/category",
  name: "Category",
  component: Layout,
  meta: {
    icon: "ep/grid",
    title: "品类中心",
    rank: 3
  },
  children: [
    {
      path: "/category/index",
      name: "CategoryList",
      component: () => import("@/views/category/index.vue"),
      meta: {
        title: "品类查询"
      }
    }
  ]
} satisfies RouteConfigsTable;
