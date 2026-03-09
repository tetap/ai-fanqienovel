import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateImage, resolveImageConfig } from "@/lib/ai";

type RouteParams = { params: Promise<{ id: string; characterId: string }> };

async function ensureCharacterImageColumn() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Character"
    ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
  `);
}

function compactText(input: string | null | undefined, max = 60): string {
  const text = (input || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function hasExplicitNonHumanSetting(input: string): boolean {
  const text = input.toLowerCase();
  const keywords = [
    "非人",
    "兽",
    "妖",
    "精灵",
    "魔物",
    "怪物",
    "异形",
    "机器人",
    "机甲",
    "龙",
    "狐",
    "猫耳",
    "兽耳",
    "animal",
    "monster",
    "robot",
    "android",
    "cyborg",
    "alien",
    "elf",
  ];
  return keywords.some((word) => text.includes(word));
}

export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id, characterId } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      include: { settings: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const character = await prisma.character.findFirst({
      where: { id: characterId, projectId: id },
      select: {
        id: true,
        name: true,
        role: true,
        gender: true,
        appearance: true,
        personality: true,
        background: true,
        motivation: true,
      },
    });
    if (!character) {
      return NextResponse.json({ error: "角色不存在" }, { status: 404 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const imageConfig = resolveImageConfig(project, user);

    const appearance = compactText(character.appearance, 120) || "突出发型、服饰和角色辨识度";
    const personality = compactText(character.personality?.join("、"), 60) || "性格明确，表情自然";
    const motivation = compactText(character.motivation, 50) || "目标明确";
    const storyBackground = compactText(character.background, 50) || "不强调剧情背景";
    const roleContext = [
      character.name || "",
      character.role || "",
      character.appearance || "",
      character.background || "",
      character.motivation || "",
      ...(character.personality || []),
    ].join(" ");
    const isExplicitNonHuman = hasExplicitNonHumanSetting(roleContext);
    const humanConstraint = isExplicitNonHuman
      ? "角色身份可按设定自由表现。"
      : "角色身份（强制）：必须是人类角色（human character），一个人，完整人类五官和四肢，禁止动物化、玩偶化、吉祥物化、怪物化。";

    const prompt = `生成角色立绘（仅单人）：
角色名：${character.name}
性别：${character.gender || "未知"}
角色定位：${character.role}
外貌关键点：${appearance}
性格关键词：${personality}
动机关键词：${motivation}
剧情背景（仅作弱参考，不要画成场景）：${storyBackground}

风格：二次元Q版，anime chibi character design，clean lineart，flat cel shading，high quality illustration。
构图：单人全身或3/4身，正面或微侧身，人物居中，完整头身，不裁切四肢，边缘清晰。
背景（强制）：纯色标准绿色绿幕，HEX #00FF00，flat chroma key green background，no texture，no gradient，no shadow，no environment。
${humanConstraint}
输出目标：角色卡可用的人物立绘。`;

    const negativePrompt =
      "photorealistic, realistic skin, lowres, blurry, deformed hands, extra limbs, bad anatomy, text, watermark, logo, cluttered composition, indoor scene, outdoor scene, landscape, building, textured background, gradient background, shadows on wall, props occluding body, cropped head, cropped feet, mascot, plush toy, doll-like character, chibi animal, furry, beast, monster";

    logger.ai("[character-image] 生成角色形象", {
      projectId: id,
      characterId,
      characterName: character.name,
      provider: imageConfig.provider,
      model: imageConfig.model,
      prompt,
      negativePrompt,
    });

    const imageUrl = await generateImage(prompt, {
      ...imageConfig,
      quality: "standard",
      negativePrompt,
    });

    let imageBuffer: Buffer;
    if (imageUrl.startsWith("data:")) {
      const base64Data = imageUrl.split(",")[1];
      imageBuffer = Buffer.from(base64Data, "base64");
    } else {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error("下载生成图片失败");
      }
      imageBuffer = Buffer.from(await response.arrayBuffer());
    }

    const resizedBuffer = await sharp(imageBuffer)
      .resize(512, 768, { fit: "cover", position: "center" })
      .jpeg({ quality: 88 })
      .toBuffer();

    const outputDir = path.join(process.cwd(), "public", "uploads", "characters");
    await fs.mkdir(outputDir, { recursive: true });
    const fileName = `${id}-${characterId}-${Date.now()}.jpg`;
    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, resizedBuffer);
    const savedPath = `/uploads/characters/${fileName}`;

    await ensureCharacterImageColumn();
    await prisma.$executeRawUnsafe(
      `UPDATE "Character" SET "imageUrl" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
      savedPath,
      characterId
    );

    return NextResponse.json({ imageUrl: savedPath }, { status: 201 });
  } catch (error) {
    logger.error("[character-image] 生成失败", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成角色形象失败" },
      { status: 500 }
    );
  }
}
