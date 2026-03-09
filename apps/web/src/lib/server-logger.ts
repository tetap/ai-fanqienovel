import fs from "node:fs";
import path from "node:path";

const DEFAULT_LOG_DIR = path.resolve(process.cwd(), "logs")

const LOG_DIR = process.env.LOG_DIR ?? DEFAULT_LOG_DIR;
const LOG_FILE = path.join(LOG_DIR, "web.log");

let stream: fs.WriteStream | null = null;
let initErrorPrinted = false;

function ensureStream(): fs.WriteStream | null {
  if (stream) return stream;

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    stream = fs.createWriteStream(LOG_FILE, { flags: "a" });
    stream.on("error", (error) => {
      if (!initErrorPrinted) {
        initErrorPrinted = true;
        process.stderr.write(`[logger] failed writing log file: ${String(error)}\n`);
      }
    });
    return stream;
  } catch (error) {
    if (!initErrorPrinted) {
      initErrorPrinted = true;
      process.stderr.write(`[logger] failed initializing log file: ${String(error)}\n`);
    }
    return null;
  }
}

function formatLog(level: string, args: unknown[]) {
  const time = new Date().toISOString();
  const body = args.join("");
  return `[${time}] [${level}] ${body}`;
}

function writeServerLog(level: string, ...args: unknown[]) {
  const writer = ensureStream();
  if (!writer) return;
  writer.write(formatLog(level, args));
}

export function patchServerConsole() {
  const key = "__webStreamPatched__";
  const globalState = globalThis as typeof globalThis & Record<string, boolean | undefined>;
  if (globalState[key]) return;

  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk: any, encoding?: any, cb?: any) => {
    writeServerLog("STDOUT", String(chunk));
    return stdoutWrite(chunk, encoding, cb);
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: any, encoding?: any, cb?: any) => {
    writeServerLog("STDERR", String(chunk));
    return stderrWrite(chunk, encoding, cb);
  }) as typeof process.stderr.write;

  globalState[key] = true;
  writeServerLog("INFO", `Server output patched. logDir=${LOG_DIR}\n`);
}

export { LOG_DIR, LOG_FILE };
