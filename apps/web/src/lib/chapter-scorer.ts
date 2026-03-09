import { generateObject } from "./ai";
import { chapterScoreSchema } from "./schemas";
import { logger } from "./logger";

export interface ChapterScore {
  overall: number; // 总分 0-100
  plot: number; // 情节连贯性 0-100
  character: number; // 角色塑造 0-100
  writing: number; // 文笔质量 0-100
  pacing: number; // 节奏把控 0-100
  originality: number; // 原创性 0-100
  feedback: string; // 评分反馈
}

/**
 * 使用 AI 对章节进行评分
 */
export async function scoreChapter(params: {
  content: string;
  title: string;
  genre: string;
  worldView: string;
  previousContext?: string;
  aiProvider?: "openai" | "anthropic";
  aiModel?: string;
  apiKey?: string;
  baseURL?: string;
}): Promise<ChapterScore> {
  const prompt = `你是一位专业的${params.genre}小说编辑。请对以下章节进行评分。

章节标题：${params.title}

世界观背景：
${params.worldView}

${params.previousContext ? `前文概要：\n${params.previousContext}\n\n` : ""}

章节内容：
${params.content}

请从以下维度进行评分（每项0-100分）：
1. 情节连贯性：与前文衔接是否自然，情节发展是否合理
2. 角色塑造：角色行为是否符合设定，对话是否生动
3. 文笔质量：语言表达是否流畅，描写是否生动
4. 节奏把控：情节推进节奏是否合适，有无拖沓或仓促
5. 原创性：内容是否完全原创，是否存在抄袭或过度模仿已有作品的痕迹（与知名小说相似度需<30%）

请严格按照以下 JSON 格式输出（不要包含 markdown 代码块标记）：
{
  "plot": 85,
  "character": 90,
  "writing": 88,
  "pacing": 87,
  "originality": 90,
  "feedback": "详细的评分反馈（200-300字），指出优点和需要改进的地方，特别注明是否存在与已有作品雷同的问题"
}`;

  try {
    const parsed = await generateObject(prompt, chapterScoreSchema, {
      provider: params.aiProvider,
      model: params.aiModel,
      apiKey: params.apiKey,
      baseURL: params.baseURL,
      temperature: 0.3,
    });

    const score: ChapterScore = {
      plot: parsed.plot || 0,
      character: parsed.character || 0,
      writing: parsed.writing || 0,
      pacing: parsed.pacing || 0,
      originality: parsed.originality || 0,
      feedback: parsed.feedback || "",
      overall: Math.round(
        (parsed.plot + parsed.character + parsed.writing + parsed.pacing + (parsed.originality || 0)) / 5
      ),
    };

    logger.ai("章节评分完成", { title: params.title, score });
    return score;
  } catch (error) {
    logger.error("章节评分失败", { error });
    // 返回默认评分
    return {
      overall: 60,
      plot: 60,
      character: 60,
      writing: 60,
      pacing: 60,
      originality: 60,
      feedback: "评分失败，请手动评估",
    };
  }
}

/**
 * 判断章节是否需要重写
 */
export function shouldRewrite(score: ChapterScore, threshold: number = 70): boolean {
  return score.overall < threshold;
}

/**
 * 从多个版本中选择最佳版本
 */
export function selectBestVersion(
  versions: Array<{ content: string; score: ChapterScore }>
): number {
  let bestIndex = 0;
  let bestScore = versions[0].score.overall;

  for (let i = 1; i < versions.length; i++) {
    if (versions[i].score.overall > bestScore) {
      bestScore = versions[i].score.overall;
      bestIndex = i;
    }
  }

  logger.info("选择最佳版本", {
    选中版本: bestIndex + 1,
    最高分: bestScore,
    总版本数: versions.length,
  });

  return bestIndex;
}
