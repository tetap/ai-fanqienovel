import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

type RouteParams = { params: Promise<{ id: string }> };

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

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    await ensureChapterStoryboardTable();
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT "chapterId","chapterNumber","chapterTitle","shots","updatedAt"
       FROM "ChapterStoryboard"
       WHERE "projectId" = $1
       ORDER BY "chapterNumber" ASC`,
      id
    )) as Array<any>;

    return NextResponse.json({
      storyboards: rows.map((row) => ({
        chapterId: row.chapterId,
        chapterNumber: row.chapterNumber,
        chapterTitle: row.chapterTitle,
        shotCount: Array.isArray(row.shots) ? row.shots.length : 0,
        updatedAt: row.updatedAt,
      })),
    });
  } catch (error) {
    logger.error("[chapter-storyboards] 获取列表失败", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取章节分镜列表失败" },
      { status: 500 }
    );
  }
}
