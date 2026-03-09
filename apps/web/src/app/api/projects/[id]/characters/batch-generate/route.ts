import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateObject, resolveAIConfig } from "@/lib/ai";
import { buildCharacterPlanPrompt } from "@/lib/prompts";
import { characterPlanSchema } from "@/lib/schemas";
import { logger } from "@/lib/logger";
import { z } from "zod";

const batchGenerateSchema = z.object({
  characterCount: z.number().min(3).max(20).optional(),
  clearExisting: z.boolean().optional(),
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

// 批量生成角色
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
    const { characterCount = 8, clearExisting = false } = batchGenerateSchema.parse(body);

    // 如果需要清空现有角色
    if (clearExisting) {
      await prisma.character.deleteMany({
        where: { projectId: id },
      });
    }

    // 查询已有角色作为上下文（清空后则为空）
    const existingCharacters = await prisma.character.findMany({
      where: { projectId: id },
      select: { name: true, role: true, personality: true, background: true },
    });

    // 构建 prompt 并调用 AI
    const prompt = buildCharacterPlanPrompt({
      title: project.title,
      genre: project.genre,
      worldView: project.settings.worldView,
      coreConflict: project.settings.coreConflict,
      characterCount,
      existingCharacters,
    });

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const aiConfig = resolveAIConfig(project, user);

    const parsed = await generateObject(prompt, characterPlanSchema, {
      ...aiConfig,
      temperature: 0.8,
    });

    // 批量创建角色
    const characters = await Promise.all(
      parsed.characters.map((char) => {
        return prisma.character.create({
          data: {
            projectId: id,
            name: char.name,
            role: char.role,
            age: normalizeAge(char.age),
            gender: char.gender || null,
            appearance: char.appearance || null,
            personality: char.personality || [],
            background: char.background,
            motivation: char.motivation || null,
            strengths: char.strengths || [],
            weaknesses: char.weaknesses || [],
            relationships: parsed.relationships || [],
          },
        });
      })
    );

    return NextResponse.json(
      {
        characters,
        relationships: parsed.relationships || [],
        count: characters.length,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("批量生成角色参数验证失败", { error: error.errors });
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    logger.error("批量生成角色失败", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "批量生成角色失败，请稍后重试" },
      { status: 500 }
    );
  }
}
