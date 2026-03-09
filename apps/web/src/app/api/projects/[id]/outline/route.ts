import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateObject, resolveAIConfig } from "@/lib/ai";
import { buildOutlinePrompt } from "@/lib/prompts";
import { outlineSchema } from "@/lib/schemas";
import { logger } from "@/lib/logger";
import { z } from "zod";

const generateOutlineSchema = z.object({
  targetChapters: z.number().min(10).max(10000).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// 获取项目大纲
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      include: {
        outline: {
          include: {
            items: { orderBy: { order: "asc" } },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    return NextResponse.json({ outline: project.outline });
  } catch (error) {
    logger.error("获取大纲失败", { error });
    return NextResponse.json({ error: "获取大纲失败" }, { status: 500 });
  }
}

// 生成大纲
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      include: { settings: true },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    if (!project.settings) {
      return NextResponse.json({ error: "请先生成核心设定" }, { status: 400 });
    }

    const body = await req.json();
    const { targetChapters } = generateOutlineSchema.parse(body);

    const characters = await prisma.character.findMany({
      where: { projectId: id },
      select: {
        name: true,
        role: true,
        personality: true,
        background: true,
      },
      orderBy: { createdAt: "asc" },
      take: 30,
    });

    // 构建 prompt 并调用 AI
    const prompt = buildOutlinePrompt({
      title: project.title,
      genre: project.genre,
      description: project.description || undefined,
      worldView: project.settings.worldView,
      coreConflict: project.settings.coreConflict,
      characters,
      targetChapters,
    });

    // 使用项目配置的 AI 服务
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const aiConfig = resolveAIConfig(project, user);

    const parsed = await generateObject(prompt, outlineSchema, {
      ...aiConfig,
      temperature: 0.8,
    });

    logger.info("生成成功，幕数:", parsed.acts?.length);

    // 创建或更新大纲
    const outline = await prisma.outline.upsert({
      where: { projectId: id },
      update: {
        structure: parsed.acts || [], // 存储幕结构
        plotPoints: parsed.plotPoints || [],
      },
      create: {
        projectId: id,
        structure: parsed.acts || [],
        plotPoints: parsed.plotPoints || [],
      },
    });

    // 删除旧的大纲条目
    await prisma.outlineItem.deleteMany({
      where: { outlineId: outline.id },
    });

    // 创建新的情节段落（从所有幕中提取）
    if (parsed.acts && parsed.acts.length > 0) {
      let order = 0;
      for (const act of parsed.acts) {
        if (act.plotSegments && act.plotSegments.length > 0) {
          await Promise.all(
            act.plotSegments.map((segment: any) =>
              prisma.outlineItem.create({
                data: {
                  outlineId: outline.id,
                  chapterNumber: act.actNumber, // 存储幕编号
                  title: segment.title,
                  summary: segment.summary,
                  keyEvents: segment.keyEvents || [],
                  characters: segment.characters || [],
                  order: order++,
                },
              }),
            ),
          );
        }
      }
    }

    // 重新获取完整的大纲数据
    const fullOutline = await prisma.outline.findUnique({
      where: { id: outline.id },
      include: {
        items: { orderBy: { order: "asc" } },
      },
    });

    return NextResponse.json({ outline: fullOutline }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 },
      );
    }
    logger.error("生成大纲失败", { error });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "生成大纲失败，请稍后重试",
      },
      { status: 500 },
    );
  }
}

// 更新大纲
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      include: { outline: true },
    });

    if (!project || !project.outline) {
      return NextResponse.json({ error: "大纲不存在" }, { status: 404 });
    }

    const body = await req.json();

    const outline = await prisma.outline.update({
      where: { projectId: id },
      data: {
        structure: body.structure,
        plotPoints: body.plotPoints,
      },
    });

    return NextResponse.json({ outline });
  } catch (error) {
    logger.error("更新大纲失败", { error });
    return NextResponse.json({ error: "更新大纲失败" }, { status: 500 });
  }
}
