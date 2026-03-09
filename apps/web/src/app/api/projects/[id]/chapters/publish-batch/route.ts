import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { publishTomatoChapters } from "@/lib/tomato-login";
import {
  createChapterPublishTask,
  updateChapterPublishTask,
} from "@/lib/chapter-publish-task";

type RouteParams = { params: Promise<{ id: string }> };

const batchSchema = z.object({
  chapterIds: z.array(z.string().min(1)).min(1, "请至少选择一章"),
});

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { chapterIds } = batchSchema.parse(body);

    const chapters = await prisma.chapter.findMany({
      where: {
        id: { in: chapterIds },
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
      orderBy: { chapterNumber: "asc" },
    });

    if (!chapters.length) {
      return NextResponse.json({ error: "未找到可发布章节" }, { status: 404 });
    }

    const toPublish = chapters.filter((c) => c.status !== "published");
    if (!toPublish.length) {
      return NextResponse.json({
        success: true,
        taskId: null,
        total: 0,
        message: "所选章节均已发布",
      });
    }

    const invalid = toPublish.find((c) => !c.content?.trim());
    if (invalid) {
      return NextResponse.json(
        { error: `第 ${invalid.chapterNumber} 章内容为空，无法发布` },
        { status: 400 }
      );
    }

    const taskId = randomUUID();
    createChapterPublishTask({
      id: taskId,
      userId: session.user.id,
      projectId: id,
      total: toPublish.length,
    });

    const chapterIdByNumber = new Map<number, string>(
      toPublish.map((c) => [c.chapterNumber, c.id])
    );

    void (async () => {
      try {
        await publishTomatoChapters(
          {
            userId: session.user.id,
            projectId: id,
            chapters: toPublish.map((c) => ({
              chapterNumber: c.chapterNumber,
              title: c.title,
              content: c.content,
            })),
          },
          {
            onChapterStart: async ({ chapter }) => {
              updateChapterPublishTask(taskId, {
                currentChapter: {
                  chapterNumber: chapter.chapterNumber,
                  title: chapter.title,
                },
              });
            },
            onChapterPublished: async ({ index, chapter }) => {
              const chapterId = chapterIdByNumber.get(chapter.chapterNumber);
              if (chapterId) {
                await prisma.chapter.update({
                  where: { id: chapterId },
                  data: { status: "published" },
                });
                const next = updateChapterPublishTask(taskId, {
                  current: index,
                });
                if (next) {
                  updateChapterPublishTask(taskId, {
                    successCount: next.successCount + 1,
                    publishedChapterIds: [...next.publishedChapterIds, chapterId],
                    currentChapter: null,
                  });
                }
              } else {
                updateChapterPublishTask(taskId, { current: index, currentChapter: null });
              }
            },
          }
        );
        updateChapterPublishTask(taskId, {
          status: "completed",
          current: toPublish.length,
          currentChapter: null,
        });
      } catch (error) {
        updateChapterPublishTask(taskId, {
          status: "failed",
          currentChapter: null,
          error: error instanceof Error ? error.message : "批量发布失败",
        });
        logger.error("批量发布章节到番茄失败", { error, taskId });
      }
    })();

    return NextResponse.json({
      success: true,
      taskId,
      total: toPublish.length,
    });
  } catch (error) {
    logger.error("发起批量发布任务失败", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发起批量发布失败，请稍后重试" },
      { status: 500 }
    );
  }
}

