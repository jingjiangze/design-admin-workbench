// 模拟后端动态生成路由
import { defineFakeRoute } from "vite-plugin-fake-server/client";

// 设计工作台不使用后端动态路由：全部页面路由由 src/router/modules/ 静态声明
export default defineFakeRoute([
  {
    url: "/get-async-routes",
    method: "get",
    response: () => {
      return {
        success: true,
        data: []
      };
    }
  }
]);
