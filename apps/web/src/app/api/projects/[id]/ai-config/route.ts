import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateAIConfigSchema = z.object({
  aiProvider: z.enum(["openai", "anthropic"]),
  aiModel: z.string().optional(),
  aiApiKey: z.string().optional(),
  aiBaseUrl: z.string().url().optional().or(z.literal("")),
  imageProvider: z.enum(["openai", "google", "qwen"]).optional(),
  imageModel: z.string().optional(),
  imageApiKey: z.string().optional(),
  imageBaseUrl: z.string().url().optional().or(z.literal("")),
});

type RouteParams = { params: Promise<{ id: string }> };

// 获取项目 AI 配置
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        aiBaseUrl: true,
        imageProvider: true,
        imageModel: true,
        imageApiKey: true,
        imageBaseUrl: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    return NextResponse.json({ config: project });
  } catch (error) {
    logger.error("获取 AI 配置失败:", { error });
    return NextResponse.json({ error: "获取 AI 配置失败" }, { status: 500 });
  }
}

// 更新项目 AI 配置
export async function PATCH(req: Request, { params }: RouteParams) {
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
    const validatedData = updateAIConfigSchema.parse(body);

    const updated = await prisma.project.update({
      where: { id },
      data: validatedData,
      select: {
        id: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        aiBaseUrl: true,
        imageProvider: true,
        imageModel: true,
        imageApiKey: true,
        imageBaseUrl: true,
      },
    });

    return NextResponse.json({ config: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    logger.error("更新 AI 配置失败:", { error });
    return NextResponse.json({ error: "更新 AI 配置失败" }, { status: 500 });
  }
}
