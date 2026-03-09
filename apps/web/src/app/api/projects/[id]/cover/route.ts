import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateImage, generateObject, resolveAIConfig, resolveImageConfig } from "@/lib/ai";
import { buildCoverPrompt, buildCoverPromptRefinePrompt } from "@/lib/prompts";
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const coverPromptSchema = z.object({
  prompt: z.string().min(1),
  negativePrompt: z.string().min(1),
});

// 生成封面图
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      include: {
        settings: true,
        characters: {
          where: { role: { in: ["protagonist", "antagonist"] } },
          take: 2,
          orderBy: { createdAt: "asc" },
          select: { name: true, gender: true, appearance: true, role: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    if (!project.settings) {
      return NextResponse.json(
        { error: "请先完成核心设定后再生成封面" },
        { status: 400 }
      );
    }

    logger.info("开始生成封面图", { projectId: id, title: project.title });

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const tomatoAuthorName = (user as any)?.tomatoAuthorName?.trim() || undefined;

    // 第一步：仅组织小说基本信息与封面要求
    const coverRequirement = buildCoverPrompt({
      title: project.title,
      authorName: tomatoAuthorName,
      genre: project.genre,
      description: project.description || undefined,
      worldView: project.settings.worldView || undefined,
      coreConflict: project.settings.coreConflict || undefined,
      powerSystem: project.settings.powerSystem || undefined,
      mainCharacters: project.characters.length > 0
        ? project.characters.map((c) => ({
            name: c.name,
            gender: c.gender || "男",
            appearance: c.appearance || undefined,
            role: c.role,
          }))
        : undefined,
    });

    // 第二步：用文字模型产出正向+负向提示词
    let prompt = coverRequirement;
    const baseNegativePrompt =
      "低清晰度, 文字乱码, 构图混乱, 人物畸形, 手指畸形, 脸部崩坏, 过度模糊, 低对比度, 写实照片风, 水印, logo, 人物过大占画面, 大头特写, 半脸超近景";
    let negativePrompt = baseNegativePrompt;
    try {
      const aiConfig = resolveAIConfig(project, user);
      const coverPrompts = await generateObject(
        buildCoverPromptRefinePrompt({
          title: project.title,
          authorName: tomatoAuthorName,
          genre: project.genre,
          coverRequirement,
        }),
        coverPromptSchema,
        { ...aiConfig, temperature: 0.4 }
      );
      prompt = coverPrompts.prompt?.trim() || coverRequirement;
      negativePrompt = `${baseNegativePrompt}, ${coverPrompts.negativePrompt?.trim() || ""}`.trim();
    } catch (error) {
      logger.warn("[cover] 封面提示词压缩失败，使用原始需求", {
        projectId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 使用项目配置的图像模型生成图片
    const imageConfig = resolveImageConfig(project, user);
    logger.ai("[cover] 封面生成调用", {
      projectId: id,
      title: project.title,
      provider: imageConfig.provider,
      model: imageConfig.model,
      baseURL: imageConfig.baseURL,
      tomatoAuthorName,
      coverRequirement,
      prompt,
      negativePrompt,
    });

    const imageUrl = await generateImage(prompt, {
      ...imageConfig,
      quality: "standard",
      negativePrompt,
    });

    // 获取图片数据（支持 URL 和 data URL）
    let imageBuffer: Buffer;
    if (imageUrl.startsWith("data:")) {
      const base64Data = imageUrl.split(",")[1];
      imageBuffer = Buffer.from(base64Data, "base64");
    } else {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error("下载生成的图片失败");
      }
      imageBuffer = Buffer.from(await response.arrayBuffer());
    }

    let quality = 90;
    let resizedBuffer = await sharp(imageBuffer)
      .resize(600, 800, { fit: "cover", position: "center" })
      .jpeg({ quality })
      .toBuffer();
    while (resizedBuffer.length > 5 * 1024 * 1024 && quality > 60) {
      quality -= 10;
      resizedBuffer = await sharp(imageBuffer)
        .resize(600, 800, { fit: "cover", position: "center" })
        .jpeg({ quality })
        .toBuffer();
    }

    // 保存到 public/uploads/covers/
    const coversDir = path.join(process.cwd(), "public", "uploads", "covers");
    await fs.mkdir(coversDir, { recursive: true });

    const fileName = `${id}-${Date.now()}.jpg`;
    const filePath = path.join(coversDir, fileName);
    await fs.writeFile(filePath, resizedBuffer);

    const coverPath = `/uploads/covers/${fileName}`;

    // 更新项目封面图
    await prisma.project.update({
      where: { id },
      data: { coverImage: coverPath },
    });

    logger.info("封面图生成完成", { projectId: id });

    return NextResponse.json({ coverImage: coverPath }, { status: 201 });
  } catch (error) {
    logger.error("生成封面图失败", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成封面图失败，请稍后重试" },
      { status: 500 }
    );
  }
}
