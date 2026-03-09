import { generateText as aiGenerateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { z } from "zod";
import { extractJSON } from "@/lib/json-utils";
import { logger } from "@/lib/logger";

export type AIProvider = "openai" | "anthropic";

export interface GenerateOptions {
  provider?: AIProvider;
  model?: string;
  temperature?: number;
  stream?: boolean;
  apiKey?: string;
  baseURL?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 根据 provider 配置创建 AI SDK model 实例
 */
function getModel(options: GenerateOptions = {}) {
  const {
    provider = "openai",
    model,
    apiKey,
    baseURL,
  } = options;

  if (provider === "anthropic") {
    if (!apiKey) {
      throw new Error("Anthropic API Key 未配置，请在项目或用户设置中填写");
    }
    const anthropic = createAnthropic({
      apiKey,
      baseURL: baseURL || undefined,
    });
    return anthropic(model || "claude-sonnet-4-20250514");
  }

  if (!apiKey) {
    throw new Error("OpenAI API Key 未配置，请在项目或用户设置中填写");
  }
  const openai = createOpenAI({
    apiKey,
    baseURL: baseURL || undefined,
    compatibility: "strict",
  });
  return openai(model || "gpt-4o-mini");
}

/**
 * 生成文本内容
 */
export async function generateText(
  prompt: string,
  options: GenerateOptions = {},
): Promise<string> {
  const { temperature = 0.7 } = options;
  const model = getModel(options);

  const { text } = await aiGenerateText({
    model,
    prompt,
    temperature,
  });

  return text;
}

/**
 * 生成结构化 JSON 对象
 * 使用 generateText 获取文本 → extractJSON 提取 → zod 校验
 */
export async function generateObject<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: GenerateOptions = {},
): Promise<T> {
  const { temperature = 0.7 } = options;
  const model = getModel(options);

  logger.ai("[generateObject] 开始调用", {
    provider: options.provider,
    model: options.model,
    promptLength: prompt.length,
  });

  const { text } = await aiGenerateText({
    model,
    prompt,
    temperature,
  });

  logger.ai("[generateObject] AI 返回文本", {
    textLength: text.length,
    textHead: text.substring(0, 300),
  });

  // 提取 JSON
  let raw: any;
  try {
    raw = extractJSON(text);
  } catch (e) {
    logger.error("[generateObject] JSON 提取失败", {
      error: String(e),
      textLength: text.length,
      textFull: text,
    });
    throw e;
  }

  logger.ai("[generateObject] JSON 提取成功", {
    keys: raw ? Object.keys(raw) : null,
  });

  // zod 校验
  const result = schema.safeParse(raw);
  if (!result.success) {
    logger.error("[generateObject] zod 校验失败", {
      zodErrors: result.error.issues,
      rawKeys: raw ? Object.keys(raw) : null,
    });
    // 校验失败也返回原始数据，不要炸掉整个流程
    // 大部分字段可能是对的，只是个别字段类型不符
    return raw as T;
  }

  return result.data;
}

/**
 * 基于多轮 messages 生成结构化 JSON 对象
 */
export async function generateObjectFromMessages<T>(
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  options: GenerateOptions = {},
): Promise<T> {
  const { temperature = 0.7 } = options;
  const model = getModel(options);

  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  logger.ai("[generateObjectFromMessages] 开始调用", {
    provider: options.provider,
    model: options.model,
    messageCount: messages.length,
    systemLength: systemText.length,
    messages,
  });

  const { text } = await aiGenerateText({
    model,
    system: systemText || undefined,
    messages: chatMessages as any,
    temperature,
  });

  logger.ai("[generateObjectFromMessages] AI 返回文本", {
    textLength: text.length,
    textHead: text.substring(0, 300),
  });

  let raw: any;
  try {
    raw = extractJSON(text);
  } catch (e) {
    logger.error("[generateObjectFromMessages] JSON 提取失败", {
      error: String(e),
      textLength: text.length,
      textFull: text,
    });
    throw e;
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    logger.error("[generateObjectFromMessages] zod 校验失败", {
      zodErrors: result.error.issues,
      rawKeys: raw ? Object.keys(raw) : null,
    });
    return raw as T;
  }

  return result.data;
}

/**
 * 根据模型名称推断上下文窗口上限（token）
 * 章节生成场景统一限制在 200k 以内，避免超长上下文导致不稳定。
 */
export function inferModelContextLimit(model?: string): number {
  if (!model) return 200000;
  const m = model.toLowerCase();

  if (m.includes("gpt-4o") || m.includes("gpt-4-turbo")) return 128000;
  if (m.includes("claude-3-5") || m.includes("claude-3.5")) return 200000;
  if (m.includes("claude-sonnet-4") || m.includes("claude-opus-4")) return 200000;
  if (m.includes("qwen")) return 128000;

  return 200000;
}

/**
 * 检查 AI 服务是否可用
 */
export function isAIAvailable(provider?: AIProvider): boolean {
  // 已移除环境变量兜底；可用性由项目/用户配置在调用时校验。
  return !!provider;
}

/**
 * 获取可用的 AI 提供商
 */
export function getAvailableProviders(): AIProvider[] {
  // 已移除环境变量兜底；提供商列表由上层配置页面维护。
  return [];
}

/**
 * 从 project → user → 默认值 的优先级链中解析 AI 配置
 */
export function resolveAIConfig(
  project: { aiProvider: string; aiModel: string | null; aiApiKey: string | null; aiBaseUrl: string | null } | null,
  user: { aiProvider: string | null; aiModel: string | null; aiApiKey: string | null; aiBaseUrl: string | null } | null,
): GenerateOptions {
  return {
    provider: (project?.aiProvider || user?.aiProvider || "openai") as AIProvider,
    model: project?.aiModel || user?.aiModel || undefined,
    apiKey: project?.aiApiKey || user?.aiApiKey || undefined,
    baseURL: project?.aiBaseUrl || user?.aiBaseUrl || undefined,
  };
}

/**
 * 从 project → user → 默认值 的优先级链中解析图像模型配置
 */
export function resolveImageConfig(
  project: { imageProvider: string | null; imageModel: string | null; imageApiKey: string | null; imageBaseUrl: string | null } | null,
  user: { imageProvider: string | null; imageModel: string | null; imageApiKey: string | null; imageBaseUrl: string | null } | null,
): GenerateImageOptions {
  const hasProjectImageOverride = !!project && (
    !!project.imageModel ||
    !!project.imageApiKey ||
    !!project.imageBaseUrl ||
    (project.imageProvider !== null && project.imageProvider !== "openai")
  );

  const provider = hasProjectImageOverride
    ? ((project?.imageProvider || "openai") as ImageProvider)
    : ((user?.imageProvider || project?.imageProvider || "openai") as ImageProvider);

  return {
    provider,
    model: hasProjectImageOverride
      ? project?.imageModel || user?.imageModel || undefined
      : user?.imageModel || project?.imageModel || undefined,
    apiKey: hasProjectImageOverride
      ? project?.imageApiKey || user?.imageApiKey || undefined
      : user?.imageApiKey || project?.imageApiKey || undefined,
    baseURL: hasProjectImageOverride
      ? project?.imageBaseUrl || user?.imageBaseUrl || undefined
      : user?.imageBaseUrl || project?.imageBaseUrl || undefined,
  };
}

export type ImageProvider = "openai" | "google" | "qwen";

/**
 * 图像生成选项
 */
export interface GenerateImageOptions {
  provider?: ImageProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  size?: "auto" | "1024*1024" | "768*1024" | "1024*768";
  quality?: "standard" | "hd";
  negativePrompt?: string;
}

function softenPromptForQwenImage(prompt: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/血腥|血液|断肢|残肢|内脏|爆头|虐杀|屠杀|分尸/gi, "激烈冲突"],
    [/开打|厮杀|致命|死亡|杀戮|暴力|重伤/gi, "对抗"],
    [/情色|裸露|挑逗|露骨|性暗示/gi, "情绪张力"],
    [/恐怖|惊悚|诡异惊吓|惊吓/gi, "悬疑氛围"],
  ];

  let result = prompt;
  for (const [regex, replacement] of replacements) {
    result = result.replace(regex, replacement);
  }

  return `${result}

补充约束：画面需健康合规，避免血腥、暴力细节、裸露与敏感内容，保持商业小说封面风格与视觉冲击力。`;
}

function buildUltraSafeCoverPrompt(prompt: string): string {
  const titleMatch = prompt.match(/《([^》]{1,40})》/);
  const genreMatch = prompt.match(/为([^\s《》]{1,8})小说/);
  const title = titleMatch?.[1] || "小说";
  const genre = genreMatch?.[1] || "网络";

  return `为${genre}小说《${title}》设计商业封面插画。3:4竖版，主角中近景居中，轮廓清晰，色彩鲜明，对比强，光影高级，细节精致，背景简洁有层次，整体风格年轻化、热血感、平台化。禁止文字、水印、logo。内容健康合规。`;
}

function isQwenInappropriateContentError(err: any): boolean {
  const text = [
    err?.message,
    err?.Message,
    err?.code,
    err?.Code,
    err?.error,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes("inappropriate-content") || text.includes("inappropriate");
}

function detectImageProvider(options: GenerateImageOptions): ImageProvider {
  const provider = options.provider || "openai";
  const model = (options.model || "").toLowerCase();
  const baseURL = (options.baseURL || "").toLowerCase();

  if (provider === "openai") {
    // 兼容历史配置：如果模型/baseURL明显是 Qwen，却误选了 openai，则自动纠正
    if (model.includes("qwen") || baseURL.includes("dashscope.aliyuncs.com")) {
      return "qwen";
    }
  }

  return provider;
}

function buildDashscopeImageEndpoint(baseURL?: string): string {
  const defaultBase = "https://dashscope.aliyuncs.com";
  const input = (baseURL || defaultBase).trim().replace(/\/+$/, "");

  if (input.endsWith("/api/v1/services/aigc/multimodal-generation/generation")) {
    return input;
  }
  if (input.endsWith("/api/v1")) {
    return `${input}/services/aigc/multimodal-generation/generation`;
  }
  return `${input}/api/v1/services/aigc/multimodal-generation/generation`;
}

function toOpenAIImageSize(
  size: GenerateImageOptions["size"]
): "auto" | "1024x1024" | "1024x1536" | "1536x1024" {
  if (!size || size === "auto") return "auto";
  if (size === "1024*1024") return "1024x1024";
  if (size === "768*1024") return "1024x1536";
  return "1536x1024";
}

/**
 * 生成图像
 */
export async function generateImage(
  prompt: string,
  options: GenerateImageOptions = {},
): Promise<string> {
  const {
    provider: rawProvider = "openai",
    model,
    apiKey,
    baseURL,
    size = "auto",
    quality = "standard",
    negativePrompt,
  } = options;
  const provider = detectImageProvider({
    provider: rawProvider,
    model,
    baseURL,
  });

  if (provider === "google") {
    const key = apiKey;
    if (!key) {
      throw new Error("Google API Key 未配置，请在项目或用户设置中填写");
    }

    const genai = new GoogleGenAI({ apiKey: key });

    const response = await genai.models.generateImages({
      model: model || "imagen-3.0-generate-002",
      prompt,
      config: { numberOfImages: 1 },
    });

    const image = response.generatedImages?.[0];
    if (!image?.image?.imageBytes) {
      throw new Error("图像生成失败：未返回图像数据");
    }

    return `data:image/png;base64,${image.image.imageBytes}`;
  }

  if (provider === "qwen") {
    const key = apiKey;
    if (!key) {
      throw new Error("DashScope API Key 未配置，请在项目或用户设置中填写");
    }

    const endpoint = buildDashscopeImageEndpoint(baseURL);

    const payload = {
      model: model || "qwen-image-2.0-pro",
      input: {
        messages: [
          {
            role: "user",
            content: [{ text: prompt }],
          },
        ],
      },
      parameters: {
        prompt_extend: true,
        watermark: false,
        size: "1104*1472",
        ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      },
    };

    const sendQwenRequest = async (requestPayload: any) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        return { ok: false as const, err };
      }

      const data = (await res.json()) as any;
      const content = data.output?.choices?.[0]?.message?.content;
      const contentArray = Array.isArray(content) ? content : [content];
      const imageUrl = contentArray.find((c: any) => c?.image)?.image;

      if (!imageUrl) {
        return {
          ok: false as const,
          err: { message: "图像生成失败：未返回图像 URL" },
        };
      }

      return { ok: true as const, imageUrl };
    };

    const firstTry = await sendQwenRequest(payload);
    if (firstTry.ok) return firstTry.imageUrl;

    if (!isQwenInappropriateContentError(firstTry.err)) {
      const dashscopeMessage =
        firstTry.err?.message ||
        firstTry.err?.Message ||
        firstTry.err?.code ||
        firstTry.err?.Code ||
        "请求失败";
      throw new Error(`图像生成失败: ${dashscopeMessage}`);
    }

    logger.warn("[generateImage] 命中内容安全，尝试降敏重试", {
      provider: "qwen",
      model: model || "qwen-image-2.0-pro",
    });

    const retryPayload = {
      ...payload,
      input: {
        ...payload.input,
        messages: [
          {
            role: "user",
            content: [{ text: softenPromptForQwenImage(prompt) }],
          },
        ],
      },
      parameters: {
        ...payload.parameters,
        prompt_extend: false,
      },
    };

    const secondTry = await sendQwenRequest(retryPayload);
    if (secondTry.ok) return secondTry.imageUrl;

    if (isQwenInappropriateContentError(secondTry.err)) {
      logger.warn("[generateImage] 二次仍命中内容安全，尝试极简安全提示词", {
        provider: "qwen",
        model: model || "qwen-image-2.0-pro",
      });

      const thirdTry = await sendQwenRequest({
        ...payload,
        input: {
          ...payload.input,
          messages: [
            {
              role: "user",
              content: [{ text: buildUltraSafeCoverPrompt(prompt) }],
            },
          ],
        },
        parameters: {
          ...payload.parameters,
          prompt_extend: false,
        },
      });
      if (thirdTry.ok) return thirdTry.imageUrl;

      const thirdMessage =
        thirdTry.err?.message ||
        thirdTry.err?.Message ||
        thirdTry.err?.code ||
        thirdTry.err?.Code ||
        "请求失败";
      throw new Error(`图像生成失败: ${thirdMessage}`);
    }

    const retryMessage =
      secondTry.err?.message ||
      secondTry.err?.Message ||
      secondTry.err?.code ||
      secondTry.err?.Code ||
      "请求失败";
    throw new Error(`图像生成失败: ${retryMessage}`);
  }

  // OpenAI 图像生成（仍用 openai SDK，AI SDK 尚未提供图像生成接口）
  if (!apiKey) {
    throw new Error("OpenAI 图像 API Key 未配置，请在项目或用户设置中填写");
  }
  const client = new OpenAI({
    apiKey,
    baseURL: baseURL || undefined,
  });

  const response = await client.images.generate({
    model: model || "dall-e-3",
    prompt,
    n: 1,
    quality,
    response_format: "url",
  });

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) {
    throw new Error("图像生成失败：未返回图像 URL");
  }

  return imageUrl;
}
