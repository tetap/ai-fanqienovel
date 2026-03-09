import fs from "fs";
import path from "path";

const LOG_DIR = path.resolve(process.cwd(), "logs");

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

/**
 * 格式化日志条目
 */
function formatLogEntry(entry: LogEntry): string {
  const dataStr = entry.data ? `\n${JSON.stringify(entry.data, null, 2)}` : "";
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${dataStr}\n`;
}

/**
 * 写入日志文件
 */
function writeLog(filename: string, entry: LogEntry) {
  const logPath = path.join(LOG_DIR, filename);
  const logLine = formatLogEntry(entry);

  try {
    fs.appendFileSync(logPath, logLine);
  } catch (error) {
    console.error("写入日志失败:", error);
  }
}

/**
 * 获取当前日期的日志文件名
 */
function getLogFilename(prefix: string = "app"): string {
  const date = new Date();
  const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
  return `${prefix}-${dateStr}.log`;
}

/**
 * 日志记录器
 */
export const logger = {
  info(message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      message,
      data,
    };
    writeLog(getLogFilename(), entry);
    console.log(message, data || "");
  },

  warn(message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "warn",
      message,
      data,
    };
    writeLog(getLogFilename(), entry);
    console.warn(message, data || "");
  },

  error(message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "error",
      message,
      data,
    };
    writeLog(getLogFilename("error"), entry);
    console.error(message, data || "");
  },

  debug(message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "debug",
      message,
      data,
    };
    writeLog(getLogFilename("debug"), entry);
    if (process.env.NODE_ENV === "development") {
      console.debug(message, data || "");
    }
  },

  // AI 相关日志
  ai(message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      message,
      data,
    };
    writeLog(getLogFilename("ai"), entry);
    console.log(`[AI] ${message}`, data || "");
  },
};
