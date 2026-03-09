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
import { scoreChapter, shouldRewrite, selectBestVersion } from "@/lib/chapter-scorer";
import { acquireProjectChapterLock, releaseProjectChapterLock } from "@/lib/chapter-generation-lock";
import { z } from "zod";

const createChapterSchema = z.object({
  actNumber: z.number().min(1, "幕编号不能为空"),
  chapterNumber: z.number().min(1, "章节号不能为空"),
  wordCount: z.number().min(1000).max(5000).optional(),
  versionCount: z.number().min(1).max(5).optional().default(1), // 生成版本数
  autoSelectBest: z.boolean().optional().default(false), // 自动选择最佳版本
  scoreThreshold: z.number().min(0).max(100).optional().default(70), // 评分阈值
  maxContextTokens: z.number().min(20000).max(200000).optional(), // 上下文窗口上限（可覆盖）
});

type RouteParams = { params: Promise<{ id: string }> };

// 获取项目的所有章节
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const chapters = await prisma.chapter.findMany({
      where: { projectId: id },
      orderBy: { chapterNumber: "asc" },
      select: {
        id: true,
        chapterNumber: true,
        title: true,
        wordCount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ chapters });
  } catch (error) {
    logger.error("获取章节列表失败:", { error });
    return NextResponse.json({ error: "获取章节列表失败" }, { status: 500 });
  }
}

// 创建并生成新章节（支持多版本生成和评分）
export async function POST(req: Request, { params }: RouteParams) {
  let lockedProjectId: string | null = null;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      include: {
        settings: true,
        chapters: { orderBy: { chapterNumber: "desc" }, take: 1 },
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

    const body = await req.json();
    const { actNumber, chapterNumber, wordCount, versionCount, autoSelectBest, scoreThreshold, maxContextTokens } =
      createChapterSchema.parse(body);

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

    const existingChapter = await prisma.chapter.findFirst({
      where: { projectId: id, chapterNumber },
      select: { id: true },
    });
    if (existingChapter) {
      return NextResponse.json(
        { error: `第 ${chapterNumber} 章已存在，请勿重复生成` },
        { status: 400 }
      );
    }

    if (chapterNumber > 1) {
      const previousChapter = await prisma.chapter.findFirst({
        where: { projectId: id, chapterNumber: chapterNumber - 1 },
        select: { id: true },
      });
      if (!previousChapter) {
        return NextResponse.json(
          {
            error: `请按顺序生成章节：第 ${chapterNumber - 1} 章尚未生成，暂不能生成第 ${chapterNumber} 章`,
          },
          { status: 400 }
        );
      }
    }

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

    // 从大纲结构中找到对应的幕
    const acts = outline.structure as any[];
    const act = acts.find((a: any) => a.actNumber === actNumber);

    if (!act) {
      return NextResponse.json(
        { error: "幕不存在" },
        { status: 404 }
      );
    }

    // 生成章节标题的默认值（AI 会生成真正的标题）
    const fallbackTitle = `第${chapterNumber}章`;

    // 获取该章节对应的情节段落
    let chapterSummary = "";
    if (act.plotSegments && act.plotSegments.length > 0) {
      // 找到包含该章节的情节段落
      for (const segment of act.plotSegments) {
        if (segment.chapterRange) {
          const match = segment.chapterRange.match(/第(\d+)-(\d+)章/);
          if (match) {
            const start = parseInt(match[1]);
            const end = parseInt(match[2]);
            if (chapterNumber >= start && chapterNumber <= end) {
              chapterSummary = `${segment.title}\n${segment.summary}`;
              break;
            }
          }
        }
      }
    }

    // 如果没有找到对应的情节段落，使用幕的描述
    if (!chapterSummary) {
      chapterSummary = act.description || act.summary || "";
    }

    logger.info("开始生成章节", {
      projectId: id,
      actNumber,
      chapterNumber,
      versionCount
    });

    // 获取用户 AI 配置并解析
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const aiConfig = resolveAIConfig(project, user);
    const modelLimit = inferModelContextLimit(aiConfig.model);
    const contextBudget = Math.min(maxContextTokens || modelLimit, modelLimit, 200000);

    // 读取角色列表并作为 system prompt 的小说框架输入
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

    // 构建上下文（包含设定、角色、大纲、前置章节）
    const context = await buildChapterContext({
      projectId: id,
      chapterNumber,
      maxTokens: contextBudget,
    });

    // 文本上下文用于评分器
    const contextText = contextToPrompt(context);
    // 多轮上下文用于章节生成
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

    logger.ai("[chapters.create] 生成章节上下文详情", {
      projectId: id,
      chapterNumber,
      actNumber,
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
      logger.info(`生成第 ${i + 1}/${versionCount || 1} 个版本`);
      const finalUserPrompt =
        (versionCount || 1) > 1
          ? `${userPrompt}\n\n补充要求：这是候选版本 ${i + 1}，请在保证主线一致的前提下适度变化叙事角度与冲突切入点。`
          : userPrompt;

      logger.ai("[chapters.create] 本轮调用 prompt", {
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

      // 对生成的内容进行评分
      const score = await scoreChapter({
        content: parsed.content,
        title: parsed.title,
        genre: project.genre,
        worldView: project.settings.worldView,
        previousContext: contextText.substring(0, 2000), // 只传递部分上下文用于评分
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

    // 选择最佳版本或使用第一个版本
    let selectedIndex = 0;
    if (autoSelectBest && versions.length > 1) {
      selectedIndex = selectBestVersion(versions);
      logger.info("自动选择最佳版本", { selectedIndex: selectedIndex + 1 });
    }

    const selectedVersion = versions[selectedIndex];
    const actualWordCount = selectedVersion.content.length;
    const title = selectedVersion.title;

    // 检查评分是否达到阈值
    if (selectedVersion.score.overall < (scoreThreshold || 70)) {
      logger.warn("章节评分低于阈值", {
        score: selectedVersion.score.overall,
        threshold: scoreThreshold || 70,
      });
    }

    // 创建章节（使用选中的版本）
    const chapter = await prisma.chapter.create({
      data: {
        projectId: id,
        chapterNumber,
        title,
        content: selectedVersion.content,
        wordCount: actualWordCount,
        status: "draft",
      },
    });

    // 保存所有版本到数据库
    await Promise.all(
      versions.map((version, index) =>
        prisma.chapterVersion.create({
          data: {
            chapterId: chapter.id,
            content: version.content,
            wordCount: version.content.length,
            note: index === selectedIndex
              ? `版本 ${index + 1}（已选中，评分: ${version.score.overall}，标题: ${version.title}）`
              : `版本 ${index + 1}（评分: ${version.score.overall}，标题: ${version.title}）`,
            metadata: {
              score: version.score,
              title: version.title,
              isSelected: index === selectedIndex,
              generatedAt: new Date().toISOString(),
            },
          },
        })
      )
    );

    logger.info("章节生成完成", {
      chapterId: chapter.id,
      versionsCount: versions.length,
      selectedScore: selectedVersion.score.overall,
      contextBudget,
      contextUsed: context.totalTokens,
      modelLimit,
    });

    // 异步生成章节摘要（不阻塞响应）
    generateChapterSummary({
      chapterId: chapter.id,
      chapterNumber,
      chapterTitle: title,
      content: selectedVersion.content,
      genre: project.genre,
      aiProvider: aiConfig.provider!,
      aiModel: aiConfig.model,
      apiKey: aiConfig.apiKey,
      baseURL: aiConfig.baseURL,
    }).catch((err) => {
      logger.error("生成章节摘要失败", { chapterId: chapter.id, error: err });
    });

    return NextResponse.json({
      chapter,
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
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    logger.error("生成章节失败:", { error });
    return NextResponse.json(
      { error: "生成章节失败，请稍后重试" },
      { status: 500 }
    );
  } finally {
    if (lockedProjectId) {
      releaseProjectChapterLock(lockedProjectId);
    }
  }
}
