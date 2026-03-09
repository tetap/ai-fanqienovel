import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateText, generateObject, resolveAIConfig } from "@/lib/ai";
import { buildRefineRequirementsPrompt, buildProjectPrompt } from "@/lib/prompts";
import { projectGenerateSchema } from "@/lib/schemas";
import { z } from "zod";

const generateProjectInputSchema = z.object({
  genre: z.string().min(1, "请选择小说类型"),
  requirements: z.string().min(1, "请输入创作需求"),
  enableRefineRequirements: z.boolean().optional().default(true),
});

// AI 生成项目标题和简介
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await req.json();
    const { genre, requirements, enableRefineRequirements } = generateProjectInputSchema.parse(body);

    // 获取用户 AI 配置
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const aiConfig = resolveAIConfig(null, user);

    let refinedRequirements = requirements;
    if (enableRefineRequirements) {
      // 第一步：优化用户的粗糙需求
      logger.info("开始优化用户需求", { genre, requirementsLength: requirements.length });
      const refinePrompt = buildRefineRequirementsPrompt({ genre, requirements });
      refinedRequirements = await generateText(refinePrompt, {
        ...aiConfig,
        temperature: 0.7,
      });
      logger.info("需求优化完成", { refinedLength: refinedRequirements.length });
    }

    // 第二步：基于优化后的需求生成标题和简介
    const projectPrompt = buildProjectPrompt({ genre, requirements: refinedRequirements });
    const parsed = await generateObject(projectPrompt, projectGenerateSchema, {
      ...aiConfig,
      temperature: 0.9,
    });

    return NextResponse.json({
      titles: parsed.titles || [],
      description: parsed.description || "",
      refinedRequirements: enableRefineRequirements ? refinedRequirements : "",
      usedRequirements: refinedRequirements,
      enableRefineRequirements,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    logger.error("AI 生成项目信息失败", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成失败，请稍后重试" },
      { status: 500 }
    );
  }
}
