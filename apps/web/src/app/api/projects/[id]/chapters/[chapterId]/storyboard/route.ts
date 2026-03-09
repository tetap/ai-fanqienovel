import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  generateObjectFromMessages,
  inferModelContextLimit,
  resolveAIConfig,
} from "@/lib/ai";
import { chapterStoryboardSchema } from "@/lib/schemas";
import {
  buildChapterStoryboardSystemPrompt,
  buildChapterStoryboardUserPrompt,
} from "@/lib/prompts";
import {
  buildChapterContext,
  contextToConversationMessages,
} from "@/lib/context-manager";

type RouteParams = { params: Promise<{ id: string; chapterId: string }> };

const generateChapterStoryboardSchema = z.object({
  maxContextTokens: z.number().min(20000).max(200000).optional(),
});

const cameraValues = new Set(["远景", "中景", "近景", "特写"]);

function normalizeCamera(value: unknown): "远景" | "中景" | "近景" | "特写" {
  if (typeof value !== "string") return "中景";
  if (cameraValues.has(value)) return value as "远景" | "中景" | "近景" | "特写";
  const v = value.trim();
  if (v.includes("远")) return "远景";
  if (v.includes("特")) return "特写";
  if (v.includes("近")) return "近景";
  return "中景";
}

async function ensureChapterStoryboardTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ChapterStoryboard" (
      "id" TEXT PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "chapterId" TEXT NOT NULL,
      "chapterNumber" INTEGER NOT NULL,
      "chapterTitle" TEXT NOT NULL,
      "shots" JSONB NOT NULL,
      "debug" JSONB,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "ChapterStoryboard_projectId_fkey"
        FOREIGN KEY ("projectId")
        REFERENCES "Project"("id")
        ON DELETE CASCADE,
      CONSTRAINT "ChapterStoryboard_chapterId_fkey"
        FOREIGN KEY ("chapterId")
        REFERENCES "Chapter"("id")
        ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ChapterStoryboard_chapterId_key"
    ON "ChapterStoryboard" ("chapterId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ChapterStoryboard_projectId_idx"
    ON "ChapterStoryboard" ("projectId");
  `);
}

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id, chapterId } = await params;
    const chapter = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        projectId: id,
        project: { userId: session.user.id },
      },
      select: { id: true },
    });
    if (!chapter) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }

    await ensureChapterStoryboardTable();
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT "chapterId","chapterNumber","chapterTitle","shots","debug","updatedAt"
       FROM "ChapterStoryboard"
       WHERE "chapterId" = $1
       LIMIT 1`,
      chapterId
    )) as Array<any>;

    if (!rows.length) {
      return NextResponse.json({ storyboard: null });
    }
    return NextResponse.json({
      storyboard: {
        chapterId: rows[0].chapterId,
        chapterNumber: rows[0].chapterNumber,
        chapterTitle: rows[0].chapterTitle,
        shots: Array.isArray(rows[0].shots) ? rows[0].shots : [],
        debug: rows[0].debug ?? null,
        updatedAt: rows[0].updatedAt,
      },
    });
  } catch (error) {
    logger.error("[chapter-storyboard] 获取失败", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取章节分镜失败" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id, chapterId } = await params;
    const chapter = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        projectId: id,
        project: { userId: session.user.id },
      },
      include: {
        project: {
          include: { settings: true },
        },
      },
    });
    if (!chapter) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }
    if (!chapter.project.settings) {
      return NextResponse.json({ error: "请先生成核心设定" }, { status: 400 });
    }

    if (chapter.chapterNumber > 1) {
      const previousChapter = await prisma.chapter.findFirst({
        where: {
          projectId: id,
          chapterNumber: chapter.chapterNumber - 1,
        },
        select: { id: true, chapterNumber: true },
      });
      if (previousChapter) {
        await ensureChapterStoryboardTable();
        const prevRows = (await prisma.$queryRawUnsafe(
          `SELECT "chapterId" FROM "ChapterStoryboard" WHERE "chapterId" = $1 LIMIT 1`,
          previousChapter.id
        )) as Array<any>;
        if (!prevRows.length) {
          return NextResponse.json(
            { error: `请先生成第 ${previousChapter.chapterNumber} 章分镜` },
            { status: 400 }
          );
        }
      }
    }

    const body = await req.json().catch(() => ({}));
    const { maxContextTokens } = generateChapterStoryboardSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const aiConfig = resolveAIConfig(chapter.project, user);
    const modelLimit = inferModelContextLimit(aiConfig.model);
    const contextBudget = Math.min(maxContextTokens || modelLimit, modelLimit, 200000);

    const context = await buildChapterContext({
      projectId: id,
      chapterNumber: chapter.chapterNumber,
      maxTokens: contextBudget,
    });
    const historyMessages = contextToConversationMessages(context);

    const characters = await prisma.character.findMany({
      where: { projectId: id },
      select: {
        name: true,
        role: true,
        personality: true,
      },
      orderBy: { createdAt: "asc" },
      take: 40,
    });

    const systemPrompt = buildChapterStoryboardSystemPrompt({
      title: chapter.project.title,
      genre: chapter.project.genre,
      description: chapter.project.description || undefined,
      worldView: chapter.project.settings.worldView,
      coreConflict: chapter.project.settings.coreConflict,
      characters,
    });
    const userPrompt = buildChapterStoryboardUserPrompt({
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
      novelText: chapter.content,
    });

    logger.ai("[chapter-storyboard] 调用上下文", {
      projectId: id,
      chapterId,
      chapterNumber: chapter.chapterNumber,
      model: aiConfig.model,
      provider: aiConfig.provider,
      contextBudget,
      contextUsed: context.totalTokens,
      modelLimit,
      systemPrompt,
      historyMessages,
      userPrompt,
    });

    const generated = await generateObjectFromMessages(
      [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: userPrompt },
      ],
      chapterStoryboardSchema,
      {
        ...aiConfig,
        temperature: 0.35,
      }
    );

    const rawShots = Array.isArray((generated as any)?.shots) ? (generated as any).shots : [];
    const shots = rawShots.map((shot: any, index: number) => ({
      shot_id: index + 1,
      scene: typeof shot?.scene === "string" && shot.scene.trim() ? shot.scene.trim() : `第${index + 1}镜`,
      camera: normalizeCamera(shot?.camera),
      characters: Array.isArray(shot?.characters)
        ? shot.characters.map((v: unknown) => String(v).trim()).filter(Boolean)
        : [],
      action: typeof shot?.action === "string" && shot.action.trim() ? shot.action.trim() : "推进剧情动作",
      emotion: typeof shot?.emotion === "string" && shot.emotion.trim() ? shot.emotion.trim() : "紧张",
      dialogue: shot?.dialogue && typeof shot.dialogue === "object"
        ? {
            character:
              typeof shot.dialogue.character === "string" && shot.dialogue.character.trim()
                ? shot.dialogue.character.trim()
                : "旁白",
            text:
              typeof shot.dialogue.text === "string" && shot.dialogue.text.trim()
                ? shot.dialogue.text.trim()
                : "环境音与情绪推进",
          }
        : {
            character: "旁白",
            text: "环境音与情绪推进",
          },
      duration: 6,
      visual_description:
        typeof shot?.visual_description === "string" && shot.visual_description.trim()
          ? shot.visual_description.trim()
          : "围绕当前剧情进行清晰可拍摄的视觉表达",
    }));

    await ensureChapterStoryboardTable();
    const rowId = randomUUID();
    const debug = {
      contextBudget,
      contextUsed: context.totalTokens,
      modelLimit,
      historyMessageCount: historyMessages.length,
      shotCount: shots.length,
    };
    const rows = (await prisma.$queryRawUnsafe(
      `INSERT INTO "ChapterStoryboard" ("id","projectId","chapterId","chapterNumber","chapterTitle","shots","debug","createdAt","updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, NOW(), NOW())
       ON CONFLICT ("chapterId")
       DO UPDATE SET
         "chapterNumber" = EXCLUDED."chapterNumber",
         "chapterTitle" = EXCLUDED."chapterTitle",
         "shots" = EXCLUDED."shots",
         "debug" = EXCLUDED."debug",
         "updatedAt" = NOW()
       RETURNING "chapterId","chapterNumber","chapterTitle","shots","debug","updatedAt"`,
      rowId,
      id,
      chapterId,
      chapter.chapterNumber,
      chapter.title,
      JSON.stringify(shots),
      JSON.stringify(debug)
    )) as Array<any>;

    return NextResponse.json({
      storyboard: {
        chapterId: rows[0]?.chapterId || chapterId,
        chapterNumber: rows[0]?.chapterNumber || chapter.chapterNumber,
        chapterTitle: rows[0]?.chapterTitle || chapter.title,
        shots: Array.isArray(rows[0]?.shots) ? rows[0].shots : shots,
        debug: rows[0]?.debug ?? debug,
        updatedAt: rows[0]?.updatedAt || new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("[chapter-storyboard] 生成失败", { error });
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "参数错误" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "章节分镜生成失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id, chapterId } = await params;
    const chapter = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        projectId: id,
        project: { userId: session.user.id },
      },
      select: { id: true },
    });
    if (!chapter) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }
    await ensureChapterStoryboardTable();
    const deletedCount = await prisma.$executeRawUnsafe(
      `DELETE FROM "ChapterStoryboard" WHERE "chapterId" = $1`,
      chapterId
    );
    return NextResponse.json({ success: true, deletedCount });
  } catch (error) {
    logger.error("[chapter-storyboard] 删除失败", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除章节分镜失败" },
      { status: 500 }
    );
  }
}
