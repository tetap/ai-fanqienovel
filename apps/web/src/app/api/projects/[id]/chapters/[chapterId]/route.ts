import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateChapterSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string; chapterId: string }> };

// 获取单个章节详情
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id, chapterId } = await params;

    const chapter = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        project: { id, userId: session.user.id },
      },
      include: {
        versions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!chapter) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }

    return NextResponse.json({ chapter });
  } catch (error) {
    logger.error("获取章节失败:", { error });
    return NextResponse.json({ error: "获取章节失败" }, { status: 500 });
  }
}

// 更新章节
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id, chapterId } = await params;

    const existing = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        project: { id, userId: session.user.id },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }

    const body = await req.json();
    const validatedData = updateChapterSchema.parse(body);

    // 如果更新了内容，创建新版本
    if (validatedData.content && validatedData.content !== existing.content) {
      const wordCount = validatedData.content.length;

      await prisma.chapterVersion.create({
        data: {
          chapterId,
          content: validatedData.content,
          wordCount,
          note: "手动编辑",
        },
      });

      validatedData.content = validatedData.content;
      (validatedData as any).wordCount = wordCount;
    }

    const chapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: validatedData,
    });

    return NextResponse.json({ chapter });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    logger.error("更新章节失败:", { error });
    return NextResponse.json({ error: "更新章节失败" }, { status: 500 });
  }
}

// 删除章节
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id, chapterId } = await params;

    const existing = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        project: { id, userId: session.user.id },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }

    await prisma.chapter.delete({ where: { id: chapterId } });

    return NextResponse.json({ message: "章节已删除" });
  } catch (error) {
    logger.error("删除章节失败:", { error });
    return NextResponse.json({ error: "删除章节失败" }, { status: 500 });
  }
}
