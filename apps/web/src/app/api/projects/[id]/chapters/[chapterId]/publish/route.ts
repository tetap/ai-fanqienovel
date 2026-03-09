import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { publishTomatoChapter } from "@/lib/tomato-login";

type RouteParams = { params: Promise<{ id: string; chapterId: string }> };

const publishSchema = z.object({
  chapterNumber: z.number().int().min(1).optional(),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
});

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
      select: {
        id: true,
        chapterNumber: true,
        title: true,
        content: true,
        status: true,
      },
    });

    if (!chapter) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = publishSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数错误" }, { status: 400 });
    }

    const chapterNumber = parsed.data.chapterNumber || chapter.chapterNumber;
    const title = parsed.data.title || chapter.title;
    const content = parsed.data.content || chapter.content;

    if (!content?.trim()) {
      return NextResponse.json({ error: "章节内容为空，无法发布" }, { status: 400 });
    }

    const result = await publishTomatoChapter({
      userId: session.user.id,
      projectId: id,
      chapterNumber,
      title,
      content,
    });

    await prisma.chapter.update({
      where: { id: chapter.id },
      data: { status: "published" },
    });

    return NextResponse.json({
      success: true,
      chapterId: chapter.id,
      status: "published",
      publish: result,
    });
  } catch (error) {
    logger.error("发布章节到番茄失败", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发布失败，请稍后重试" },
      { status: 500 }
    );
  }
}

