export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("@/lib/logger");

    // 记录应用启动
    logger.info("应用启动", {
      runtime: "nodejs",
      env: process.env.NODE_ENV,
    });

    // 拦截全局错误
    process.on("unhandledRejection", (reason, promise) => {
      logger.error("未处理的 Promise 拒绝", { reason, promise });
    });

    process.on("uncaughtException", (error) => {
      logger.error("未捕获的异常", { error });
    });
  }
}
