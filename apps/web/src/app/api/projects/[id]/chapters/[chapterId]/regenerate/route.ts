import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateObjectFromMessages, inferModelContextLimit, resolveAIConfig } from "@/lib/ai";
import { buildChapterSystemPrompt, buildChapterUserPrompt } from "@/lib/prompts";
import { chapterSchema } from "@/lib/schemas";
import {
  buildChapterContext,
  contextToConversationMessages,
  contextToPrompt,
  generateChapterSummary,
} from "@/lib/context-manager";
import { scoreChapter, selectBestVersion } from "@/lib/chapter-scorer";
import { acquireProjectChapterLock, releaseProjectChapterLock } from "@/lib/chapter-generation-lock";
import { z } from "zod";

const regenerateSchema = z.object({
  wordCount: z.number().min(1000).max(5000).optional(),
  versionCount: z.number().min(1).max(5).optional().default(1),
  autoSelectBest: z.boolean().optional().default(false),
  scoreThreshold: z.number().min(0).max(100).optional().default(70),
  maxContextTokens: z.number().min(20000).max(200000).optional(),
});

type RouteParams = { params: Promise<{ id: string; chapterId: string }> };

// 重新生成章节
export async function POST(req: Request, { params }: RouteParams) {
  let lockedProjectId: string | null = null;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id, chapterId } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      include: {
        settings: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    if (!project.settings) {
      return NextResponse.json(
        { error: "请先生成核心设定" },
        { status: 400 }
      );
    }

    // 获取现有章节
    const existingChapter = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        projectId: id,
      },
    });

    if (!existingChapter) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }

    const body = await req.json();
    const { wordCount, versionCount, autoSelectBest, scoreThreshold, maxContextTokens } =
      regenerateSchema.parse(body);

    const chapterNumber = existingChapter.chapterNumber;

    const lockResult = acquireProjectChapterLock(id, chapterNumber);
    if (!lockResult.ok) {
      return NextResponse.json(
        {
          error: `第 ${lockResult.current.chapterNumber} 章正在生成中，请等待当前任务完成后再试`,
        },
        { status: 409 }
      );
    }
    lockedProjectId = id;

    // 获取大纲信息
    const outline = await prisma.outline.findUnique({
      where: { projectId: id },
      include: {
        items: { orderBy: { order: "asc" } },
      },
    });

    if (!outline) {
      return NextResponse.json(
        { error: "请先生成大纲" },
        { status: 400 }
      );
    }

    // 从大纲结构中找到该章节所属的幕
    const acts = outline.structure as any[];
    let chapterSummary = "";
    for (const act of acts) {
      if (act.chapterRange) {
        const match = act.chapterRange.match(/第(\d+)-(\d+)章/);
        if (match) {
          const start = parseInt(match[1]);
          const end = parseInt(match[2]);
          if (chapterNumber >= start && chapterNumber <= end) {
            // 找到包含该章节的情节段落
            if (act.plotSegments && act.plotSegments.length > 0) {
              for (const segment of act.plotSegments) {
                if (segment.chapterRange) {
                  const segMatch = segment.chapterRange.match(/第(\d+)-(\d+)章/);
                  if (segMatch) {
                    const segStart = parseInt(segMatch[1]);
                    const segEnd = parseInt(segMatch[2]);
                    if (chapterNumber >= segStart && chapterNumber <= segEnd) {
                      chapterSummary = `${segment.title}\n${segment.summary}`;
                      break;
                    }
                  }
                }
              }
            }
            if (!chapterSummary) {
              chapterSummary = act.description || act.summary || "";
            }
            break;
          }
        }
      }
    }

    const fallbackTitle = existingChapter.title;

    logger.info("开始重新生成章节", {
      projectId: id,
      chapterId,
      chapterNumber,
      versionCount,
    });

    // 获取用户 AI 配置并解析
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const aiConfig = resolveAIConfig(project, user);
    const modelLimit = inferModelContextLimit(aiConfig.model);
    const contextBudget = Math.min(maxContextTokens || modelLimit, modelLimit, 200000);

    const characters = await prisma.character.findMany({
      where: { projectId: id },
      select: {
        name: true,
        role: true,
        personality: true,
        motivation: true,
        background: true,
      },
      orderBy: { createdAt: "asc" },
      take: 40,
    });

    // 构建上下文
    const context = await buildChapterContext({
      projectId: id,
      chapterNumber,
      maxTokens: contextBudget,
    });

    const contextText = contextToPrompt(context);
    const historyMessages = contextToConversationMessages(context);

    const systemPrompt = buildChapterSystemPrompt({
      title: project.title,
      genre: project.genre,
      description: project.description || undefined,
      worldView: project.settings.worldView,
      coreConflict: project.settings.coreConflict,
      powerSystem: project.settings.powerSystem || undefined,
      outlineContext: chapterSummary,
      characters,
    });
    const userPrompt = buildChapterUserPrompt({
      chapterNumber,
      chapterGoal: chapterSummary,
      wordCount,
    });

    logger.ai("[chapters.regenerate] 重新生成上下文详情", {
      projectId: id,
      chapterId,
      chapterNumber,
      model: aiConfig.model,
      provider: aiConfig.provider,
      contextBudget,
      contextUsed: context.totalTokens,
      modelLimit,
      chapterGoal: chapterSummary,
      systemPrompt,
      historyMessages,
      userPrompt,
    });

    // 生成多个版本
    const versions: Array<{ title: string; content: string; score: any }> = [];

    for (let i = 0; i < (versionCount || 1); i++) {
      logger.info(`重新生成第 ${i + 1}/${versionCount || 1} 个版本`);
      const finalUserPrompt =
        (versionCount || 1) > 1
          ? `${userPrompt}\n\n补充要求：这是候选版本 ${i + 1}，请在确保连续性的前提下做差异化表达。`
          : userPrompt;

      logger.ai("[chapters.regenerate] 本轮调用 prompt", {
        chapterId,
        chapterNumber,
        versionIndex: i + 1,
        versionCount: versionCount || 1,
        systemPrompt,
        historyMessages,
        finalUserPrompt,
      });

      const parsed = await generateObjectFromMessages(
        [
          { role: "system", content: systemPrompt },
          ...historyMessages,
          {
            role: "user",
            content: finalUserPrompt,
          },
        ],
        chapterSchema,
        {
          ...aiConfig,
          temperature: 0.8 + (i * 0.05),
        }
      );

      const score = await scoreChapter({
        content: parsed.content,
        title: parsed.title,
        genre: project.genre,
        worldView: project.settings.worldView,
        previousContext: contextText.substring(0, 2000),
        aiProvider: aiConfig.provider,
        aiModel: aiConfig.model,
        apiKey: aiConfig.apiKey,
        baseURL: aiConfig.baseURL,
      });

      versions.push({ title: parsed.title, content: parsed.content, score });

      logger.info(`版本 ${i + 1} 评分`, {
        title: parsed.title,
        overall: score.overall,
        plot: score.plot,
        character: score.character,
        writing: score.writing,
        pacing: score.pacing,
      });
    }

    // 选择最佳版本
    let selectedIndex = 0;
    if (autoSelectBest && versions.length > 1) {
      selectedIndex = selectBestVersion(versions);
      logger.info("自动选择最佳版本", { selectedIndex: selectedIndex + 1 });
    }

    const selectedVersion = versions[selectedIndex];
    const actualWordCount = selectedVersion.content.length;
    const title = selectedVersion.title;

    if (selectedVersion.score.overall < (scoreThreshold || 70)) {
      logger.warn("章节评分低于阈值", {
        score: selectedVersion.score.overall,
        threshold: scoreThreshold || 70,
      });
    }

    // 更新章节内容和标题
    const updatedChapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        title,
        content: selectedVersion.content,
        wordCount: actualWordCount,
        status: "draft",
      },
    });

    // 保存所有新版本到数据库
    await Promise.all(
      versions.map((version, index) =>
        prisma.chapterVersion.create({
          data: {
            chapterId,
            content: version.content,
            wordCount: version.content.length,
            note: index === selectedIndex
              ? `重新生成 - 版本 ${index + 1}（已选中，评分: ${version.score.overall}，标题: ${version.title}）`
              : `重新生成 - 版本 ${index + 1}（评分: ${version.score.overall}，标题: ${version.title}）`,
            metadata: {
              score: version.score,
              title: version.title,
              isSelected: index === selectedIndex,
              isRegenerated: true,
              generatedAt: new Date().toISOString(),
            },
          },
        })
      )
    );

    logger.info("章节重新生成完成", {
      chapterId,
      versionsCount: versions.length,
      selectedScore: selectedVersion.score.overall,
      contextBudget,
      contextUsed: context.totalTokens,
      modelLimit,
    });

    // 异步重新生成章节摘要
    generateChapterSummary({
      chapterId,
      chapterNumber,
      chapterTitle: title,
      content: selectedVersion.content,
      genre: project.genre,
      aiProvider: aiConfig.provider!,
      aiModel: aiConfig.model,
      apiKey: aiConfig.apiKey,
      baseURL: aiConfig.baseURL,
    }).catch((err) => {
      logger.error("重新生成章节摘要失败", { chapterId, error: err });
    });

    return NextResponse.json({
      chapter: updatedChapter,
      versions: versions.map((v, i) => ({
        index: i,
        score: v.score,
        isSelected: i === selectedIndex,
        wordCount: v.content.length,
      })),
      selectedIndex,
      context: {
        budget: contextBudget,
        used: context.totalTokens,
        modelLimit,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    logger.error("重新生成章节失败:", { error });
    return NextResponse.json(
      { error: "重新生成章节失败，请稍后重试" },
      { status: 500 }
    );
  } finally {
    if (lockedProjectId) {
      releaseProjectChapterLock(lockedProjectId);
    }
  }
}
