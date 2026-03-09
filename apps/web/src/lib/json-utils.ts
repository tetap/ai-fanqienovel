/**
 * 从 AI 返回的文本中提取并解析 JSON
 *
 * 处理：markdown 代码块、字符串内换行、尾部逗号、截断
 */
export function extractJSON(text: string): any {
  // 1. 去掉 markdown 代码块
  let raw = text
    .replace(/```json\s*\n?/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // 2. 定位 JSON 主体（第一个 { 到最后一个 }）
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last <= first) {
    // 也试试数组
    const af = raw.indexOf("[");
    const al = raw.lastIndexOf("]");
    if (af !== -1 && al > af) {
      raw = raw.substring(af, al + 1);
    }
  } else {
    raw = raw.substring(first, last + 1);
  }

  // 3. 修复字符串值中的换行符（逐字符状态机，不用正则）
  let fixed = fixNewlinesInJSON(raw);
  fixed = repairCommonJSONTypos(fixed);

  // 4. 尝试解析
  try {
    return JSON.parse(fixed);
  } catch (e1) {
    // 5. 去尾部逗号再试
    const noTrailing = repairCommonJSONTypos(fixed.replace(/,(\s*[}\]])/g, "$1"));
    try {
      return JSON.parse(noTrailing);
    } catch (e2) {
      // 6. 从后往前找最后一个能解析的 }
      for (let i = fixed.length - 1; i > 0; i--) {
        if (fixed[i] === "}") {
          try {
            return JSON.parse(fixed.substring(0, i + 1));
          } catch {
            continue;
          }
        }
      }

      console.error("[extractJSON] 所有解析方式均失败", {
        rawLength: raw.length,
        rawHead: raw.substring(0, 200),
        rawTail: raw.substring(Math.max(0, raw.length - 200)),
        error: String(e1),
      });
      throw new Error("无法从 AI 返回中提取有效的 JSON");
    }
  }
}

/**
 * 逐字符扫描，把 JSON 字符串值内的真实换行符替换为 \\n
 *
 * 比正则靠谱：正确处理转义引号、跨行字符串
 */
function fixNewlinesInJSON(text: string): string {
  const chars: string[] = [];
  let inString = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inString) {
      if (ch === "\\") {
        // 转义序列，原样保留两个字符
        chars.push(ch);
        i++;
        if (i < text.length) {
          chars.push(text[i]);
        }
        i++;
        continue;
      }
      if (ch === '"') {
        // 字符串结束
        inString = false;
        chars.push(ch);
        i++;
        continue;
      }
      // 在字符串内部，把真实换行替换掉
      if (ch === "\n") {
        chars.push("\\n");
        i++;
        continue;
      }
      if (ch === "\r") {
        i++;
        continue;
      }
      if (ch === "\t") {
        chars.push("\\t");
        i++;
        continue;
      }
      chars.push(ch);
      i++;
    } else {
      if (ch === '"') {
        inString = true;
      }
      chars.push(ch);
      i++;
    }
  }

  return chars.join("");
}

/**
 * 修复模型常见 JSON 语法脏点（不改变语义）：
 * 1) 键值分隔误用全角冒号： "key"：value
 * 2) 键后出现双冒号形态： "key":：value
 * 3) 少量字段值漏掉开头引号： "key":：中文文本",
 */
function repairCommonJSONTypos(text: string): string {
  let s = text;

  // "key"：value / "key"﹕value / "key"꞉value / "key"∶value -> "key":value
  s = s.replace(/"([^"]+)"\s*[：﹕꞉∶]/g, "\"$1\":");

  // "key":：value / "key":﹕value -> "key":"value（后续按行补全尾引号）
  s = s.replace(/":\s*[：﹕꞉∶]\s*/g, "\":\"");

  // 按行兜底：处理 "key":：<未加引号的文本值>（允许值内包含逗号）
  s = s
    .split("\n")
    .map((line) => {
      const m = line.match(/^(\s*"[^"]+"\s*:\s*)[：﹕꞉∶]\s*(.+)$/);
      if (!m) return line;

      const prefix = m[1];
      let valuePart = m[2];
      const trimmed = valuePart.trimStart();

      // 对象/数组/数字/布尔/null 不强行加引号
      if (/^["[{]|^-?\d+(\.\d+)?([eE][+-]?\d+)?\s*[,}]?$|^(true|false|null)\s*[,}]?$/i.test(trimmed)) {
        return `${prefix}${valuePart}`;
      }

      // 若没有起始引号，则补一个；若缺尾引号，在行尾补齐（保留逗号）
      if (!trimmed.startsWith("\"")) {
        valuePart = valuePart.replace(/^(\s*)/, "$1\"");
      }

      const hasEndingQuote = /"\s*,?\s*$/.test(valuePart);
      if (!hasEndingQuote) {
        valuePart = valuePart.replace(/\s*([,}]?)\s*$/, "\"$1");
      }

      return `${prefix}${valuePart}`;
    })
    .join("\n");

  // 处理 value 漏起始引号但末尾有引号的场景：
  // "sceneDescription":：顾野冲入雨幕，暗示大战开始。",
  // ->
  // "sceneDescription":"顾野冲入雨幕，暗示大战开始。",
  s = s.replace(
    /"([^"]+)"\s*:\s*[：﹕꞉∶]\s*([^"\n][^\n}]*)"\s*([,}])/g,
    (_m, key, value, tail) => {
      const safe = String(value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .trim();
      return `"${key}":"${safe}"${tail}`;
    }
  );

  return s;
}
