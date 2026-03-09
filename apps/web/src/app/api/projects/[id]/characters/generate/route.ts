import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateObject, resolveAIConfig } from "@/lib/ai";
import { buildCharacterPrompt } from "@/lib/prompts";
import { characterSchema } from "@/lib/schemas";
import { z } from "zod";

const generateCharacterInputSchema = z.object({
  role: z.enum(["protagonist", "supporting", "antagonist", "minor"]),
  keywords: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

function normalizeAge(age: unknown): number | null {
  if (age === null || age === undefined || age === "") return null;
  if (typeof age === "number" && Number.isInteger(age)) return age;
  if (typeof age === "string") {
    const parsed = Number.parseInt(age, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

// AI 生成角色
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
      return NextResponse.json(
        { error: "请先生成核心设定" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { role, keywords } = generateCharacterInputSchema.parse(body);

    // 查询已有角色作为上下文
    const existingCharacters = await prisma.character.findMany({
      where: { projectId: id },
      select: { name: true, role: true, personality: true, background: true },
    });

    // 构建 prompt 并调用 AI
    const prompt = buildCharacterPrompt({
      title: project.title,
      genre: project.genre,
      worldView: project.settings.worldView,
      coreConflict: project.settings.coreConflict,
      role,
      keywords,
      existingCharacters,
    });

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const aiConfig = resolveAIConfig(project, user);

    const parsed = await generateObject(prompt, characterSchema, {
      ...aiConfig,
      temperature: 0.8,
    });

    // 创建角色
    const character = await prisma.character.create({
      data: {
        projectId: id,
        name: parsed.name,
        role,
        age: normalizeAge(parsed.age),
        gender: parsed.gender || null,
        appearance: parsed.appearance || null,
        personality: parsed.personality || [],
        background: parsed.background,
        motivation: parsed.motivation || null,
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
      },
    });

    return NextResponse.json({ character }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    logger.error("生成角色失败:", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成角色失败，请稍后重试" },
      { status: 500 }
    );
  }
}
