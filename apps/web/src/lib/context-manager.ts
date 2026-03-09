import { prisma } from "./db";
import { logger } from "./logger";
import { generateText } from "./ai";
import type { ChatMessage } from "./ai";
import { buildChapterSummaryPrompt } from "./prompts";

interface ContextItem {
  type: "setting" | "character" | "outline" | "chapter" | "summary";
  content: string;
  importance: number; // 1-10，重要性评分
  tokens: number;
}

interface ContextWindow {
  items: ContextItem[];
  totalTokens: number;
  maxTokens: number;
}

function truncateByTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return "";
  let result = text;
  while (estimateTokens(result) > maxTokens && result.length > 50) {
    result = result.slice(0, Math.floor(result.length * 0.85));
  }
  return result;
}

/**
 * 估算文本的 token 数量（粗略估算：中文1字≈2tokens，英文1词≈1.3tokens）
 */
export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 2 + otherChars * 0.4);
}

/**
 * 为章节生成 AI 摘要并保存到数据库
 */
export async function generateChapterSummary(params: {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  content: string;
  genre: string;
  aiProvider: "openai" | "anthropic";
  aiModel?: string;
  apiKey?: string;
  baseURL?: string;
}): Promise<string> {
  const {
    chapterId,
    chapterNumber,
    chapterTitle,
    content,
    genre,
    aiProvider,
    aiModel,
    apiKey,
    baseURL,
  } = params;

  logger.info("开始生成章节摘要", { chapterId, chapterNumber });

  const prompt = buildChapterSummaryPrompt({
    chapterNumber,
    chapterTitle,
    content,
    genre,
  });

  const summary = await generateText(prompt, {
    provider: aiProvider,
    model: aiModel,
    apiKey,
    baseURL,
    temperature: 0.3,
  });

  // 保存摘要到数据库
  await prisma.chapter.update({
    where: { id: chapterId },
    data: { summary },
  });

  logger.info("章节摘要生成完成", {
    chapterId,
    chapterNumber,
    summaryLength: summary.length,
  });

  return summary;
}

/**
 * 构建章节生成的上下文
 */
export async function buildChapterContext(params: {
  projectId: string;
  chapterNumber: number;
  maxTokens?: number;
}): Promise<ContextWindow> {
  const { projectId, chapterNumber, maxTokens = 100000 } = params;

  logger.info("开始构建章节上下文", { projectId, chapterNumber, maxTokens });

  const items: ContextItem[] = [];
  let totalTokens = 0;

  // 1. 获取核心设定（重要性：10，必须保留）
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { settings: true },
  });

  if (project?.settings) {
    const settingContent = `世界观：${project.settings.worldView}\n核心冲突：${project.settings.coreConflict}\n力量体系：${project.settings.powerSystem || "无"}`;
    const tokens = estimateTokens(settingContent);
    items.push({
      type: "setting",
      content: settingContent,
      importance: 10,
      tokens,
    });
    totalTokens += tokens;
    logger.debug("添加核心设定", { tokens });
  }

  // 2. 获取相关角色（重要性：9）
  const characters = await prisma.character.findMany({
    where: { projectId },
    select: {
      name: true,
      role: true,
      personality: true,
      background: true,
      motivation: true,
      strengths: true,
      weaknesses: true,
    },
  });

  for (const char of characters) {
    const charContent = `角色：${char.name}（${char.role}）\n性格：${char.personality.join("、")}\n背景：${char.background}\n动机：${char.motivation || "未知"}`;
    const tokens = estimateTokens(charContent);
    items.push({
      type: "character",
      content: charContent,
      importance: 9,
      tokens,
    });
    totalTokens += tokens;
  }
  logger.debug("添加角色信息", { count: characters.length, tokens: totalTokens });

  // 3. 获取大纲（重要性：8）
  const outline = await prisma.outline.findUnique({
    where: { projectId },
    include: { items: { orderBy: { order: "asc" } } },
  });

  if (outline) {
    // 找到当前章节对应的情节段落
    const relevantSegments = outline.items.filter((item) => {
      // 解析章节范围，判断当前章节是否在范围内
      const match = item.summary.match(/第(\d+)-(\d+)章/);
      if (match) {
        const start = parseInt(match[1]);
        const end = parseInt(match[2]);
        return chapterNumber >= start && chapterNumber <= end;
      }
      return false;
    });

    for (const segment of relevantSegments) {
      const segmentContent = `情节段落：${segment.title}\n概要：${segment.summary}\n关键事件：${segment.keyEvents.join("、")}`;
      const tokens = estimateTokens(segmentContent);
      items.push({
        type: "outline",
        content: segmentContent,
        importance: 8,
        tokens,
      });
      totalTokens += tokens;
    }
    logger.debug("添加大纲信息", { segments: relevantSegments.length });
  }

  // 4. 获取前面的章节（最多20章，使用AI生成的摘要）
  const previousChapters = await prisma.chapter.findMany({
    where: {
      projectId,
      chapterNumber: { lt: chapterNumber },
    },
    orderBy: { chapterNumber: "desc" },
    take: 20,
    select: {
      id: true,
      chapterNumber: true,
      title: true,
      content: true,
      summary: true,
      wordCount: true,
    },
  });

  // 按章节号正序排列（从早到晚）
  previousChapters.reverse();

  for (const chapter of previousChapters) {
    const distance = chapterNumber - chapter.chapterNumber;
    const importance = Math.max(1, 7 - Math.floor(distance / 3));

    let chapterContent: string;
    if (distance <= 2) {
      // 最近2章保留完整内容
      chapterContent = `第${chapter.chapterNumber}章：${chapter.title}\n${chapter.content}`;
    } else if (chapter.summary) {
      // 有AI摘要的章节使用摘要
      chapterContent = `第${chapter.chapterNumber}章：${chapter.title}\n【摘要】${chapter.summary}`;
    } else {
      // 没有摘要的旧章节，暂时跳过（后续会异步生成摘要）
      logger.warn("章节缺少摘要，跳过", {
        chapterId: chapter.id,
        chapterNumber: chapter.chapterNumber,
      });
      continue;
    }

    const tokens = estimateTokens(chapterContent);
    items.push({
      type: distance <= 2 ? "chapter" : "summary",
      content: chapterContent,
      importance,
      tokens,
    });
    totalTokens += tokens;
  }
  logger.debug("添加前置章节", { count: previousChapters.length, tokens: totalTokens });

  // 5. 如果超过 maxTokens，进行压缩
  if (totalTokens > maxTokens) {
    logger.warn("上下文超过限制，开始压缩", { totalTokens, maxTokens });
    return compressContext({ items, totalTokens, maxTokens });
  }

  logger.info("上下文构建完成", { totalTokens, itemCount: items.length });
  return { items, totalTokens, maxTokens };
}

/**
 * 压缩上下文（保留重要内容）
 */
function compressContext(context: ContextWindow): ContextWindow {
  const { items, maxTokens } = context;

  // 按重要性排序
  const sortedItems = [...items].sort((a, b) => b.importance - a.importance);

  const compressedItems: ContextItem[] = [];
  let totalTokens = 0;

  for (const item of sortedItems) {
    if (totalTokens >= maxTokens) break;

    if (totalTokens + item.tokens <= maxTokens) {
      compressedItems.push(item);
      totalTokens += item.tokens;
    } else if (item.importance >= 8) {
      // 重要内容尝试截断后保留，保证严格不超过 maxTokens
      const remaining = maxTokens - totalTokens;
      if (remaining < 200) continue;
      const truncatedContent = truncateByTokens(item.content, remaining);
      const truncatedTokens = estimateTokens(truncatedContent);
      if (truncatedTokens <= 0) continue;
      compressedItems.push({
        ...item,
        content: `${truncatedContent}\n\n[已截断以适配上下文窗口]`,
        tokens: truncatedTokens,
      });
      totalTokens += truncatedTokens;
    }
  }

  // 按原始顺序重新排列
  compressedItems.sort((a, b) => {
    const typeOrder = { setting: 0, character: 1, outline: 2, chapter: 3, summary: 4 };
    return typeOrder[a.type] - typeOrder[b.type];
  });

  logger.info("上下文压缩完成", {
    原始: items.length,
    压缩后: compressedItems.length,
    原始tokens: context.totalTokens,
    压缩后tokens: totalTokens,
  });

  return {
    items: compressedItems,
    totalTokens,
    maxTokens,
  };
}

/**
 * 将上下文转换为 prompt
 */
export function contextToPrompt(context: ContextWindow): string {
  return context.items.map((item) => item.content).join("\n\n---\n\n");
}

/**
 * 将上下文转换为多轮对话消息
 */
export function contextToConversationMessages(
  context: ContextWindow,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  const nonChapterItems = context.items.filter(
    (item) => item.type !== "chapter" && item.type !== "summary",
  );
  if (nonChapterItems.length > 0) {
    messages.push({
      role: "user",
      content:
        "以下是固定上下文（设定/角色/大纲），请作为后续章节创作的硬约束：\n\n" +
        nonChapterItems.map((item) => item.content).join("\n\n---\n\n"),
    });
    messages.push({
      role: "assistant",
      content: "已接收固定上下文约束，将在后续章节创作中保持一致性。",
    });
  }

  const historyItems = context.items.filter(
    (item) => item.type === "chapter" || item.type === "summary",
  );
  for (const item of historyItems) {
    messages.push({
      role: "user",
      content: `历史章节信息：\n${item.content}`,
    });
    messages.push({
      role: "assistant",
      content: "已记录该章节信息，后续会保持剧情与人设连续。",
    });
  }

  return messages;
}
