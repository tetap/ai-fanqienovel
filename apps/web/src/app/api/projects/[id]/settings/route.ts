import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateText, generateObject, resolveAIConfig } from "@/lib/ai";
import { buildSettingsPrompt, buildRefineSettingsKeywordsPrompt } from "@/lib/prompts";
import { settingsSchema } from "@/lib/schemas";
import { logger } from "@/lib/logger";
import { z } from "zod";

const generateSettingsSchema = z.object({
  keywords: z.string().optional(),
  enableRefineKeywords: z.boolean().optional().default(true),
});

type RouteParams = { params: Promise<{ id: string }> };

// 获取项目设定
export async function GET(req: Request, { params }: RouteParams) {
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

    return NextResponse.json({ settings: project.settings });
  } catch (error) {
    logger.error("获取设定失败", { error });
    return NextResponse.json({ error: "获取设定失败" }, { status: 500 });
  }
}

// 生成核心设定
export async function POST(req: Request, { params }: RouteParams) {
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

    const body = await req.json();
    const { keywords, enableRefineKeywords } = generateSettingsSchema.parse(body);
    const normalizedKeywords = keywords?.trim();

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const aiConfig = resolveAIConfig(project, user);

    let finalKeywords: string | undefined;

    // 有关键词时先做意图扩写，空关键词时直接走智能补全的设定生成
    if (normalizedKeywords) {
      if (enableRefineKeywords) {
        logger.info("开始优化设定关键词", {
          projectId: id,
          keywordsLength: normalizedKeywords.length,
        });

        const refinePrompt = buildRefineSettingsKeywordsPrompt({
          title: project.title,
          genre: project.genre,
          description: project.description || undefined,
          keywords: normalizedKeywords,
        });

        finalKeywords = await generateText(refinePrompt, {
          ...aiConfig,
          temperature: 0.7,
        });

        logger.info("关键词优化完成", { refinedLength: finalKeywords.length });
      } else {
        finalKeywords = normalizedKeywords;
      }
    } else {
      logger.info("未输入关键词，使用项目信息直接生成核心设定", { projectId: id });
    }

    // 第二步：基于优化后的关键词生成核心设定
    const prompt = buildSettingsPrompt({
      title: project.title,
      genre: project.genre,
      description: project.description || undefined,
      keywords: finalKeywords,
    });

    // 使用项目配置的 AI 服务
    const parsed = await generateObject(prompt, settingsSchema, {
      ...aiConfig,
      temperature: 0.8,
    });

    // 保存到数据库（upsert）
    const settings = await prisma.projectSettings.upsert({
      where: { projectId: id },
      update: {
        worldView: parsed.worldView,
        coreConflict: parsed.coreConflict,
        powerSystem: parsed.powerSystem || "",
        factions: parsed.factions || [],
        specialRules: parsed.specialRules || [],
      },
      create: {
        projectId: id,
        worldView: parsed.worldView,
        coreConflict: parsed.coreConflict,
        powerSystem: parsed.powerSystem || "",
        factions: parsed.factions || [],
        specialRules: parsed.specialRules || [],
      },
    });

    return NextResponse.json({ settings }, { status: 201 });
  } catch (error) {
    logger.error("生成设定失败", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成设定失败，请稍后重试" },
      { status: 500 }
    );
  }
}

// 手动更新设定
export async function PATCH(req: Request, { params }: RouteParams) {
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

    if (!project || !project.settings) {
      return NextResponse.json({ error: "设定不存在" }, { status: 404 });
    }

    const body = await req.json();

    const settings = await prisma.projectSettings.update({
      where: { projectId: id },
      data: {
        worldView: body.worldView,
        coreConflict: body.coreConflict,
        powerSystem: body.powerSystem,
        factions: body.factions,
        specialRules: body.specialRules,
      },
    });

    return NextResponse.json({ settings });
  } catch (error) {
    logger.error("更新设定失败", { error });
    return NextResponse.json({ error: "更新设定失败" }, { status: 500 });
  }
}
