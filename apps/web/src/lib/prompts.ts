/**
 * 从 AI 返回的文本中提取 JSON 对象
 * 支持：纯 JSON、markdown 代码块包裹、前后有多余文字等情况
 */
export function extractJSON<T = any>(raw: string): T | null {
  // 1. 尝试直接解析
  try {
    return JSON.parse(raw.trim());
  } catch {}

  // 2. 去掉 markdown 代码块标记
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // 3. 从文本中找到第一个 { ... } 或 [ ... ] 结构
  const jsonMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {}
  }

  return null;
}

/**
 * 解析章节生成的 AI 响应，提取 title 和 content
 */
export function parseChapterResponse(
  raw: string,
  fallbackTitle: string,
): { title: string; content: string } {
  const parsed = extractJSON<{ title?: string; content?: string }>(raw);
  if (parsed && parsed.title && parsed.content) {
    return { title: parsed.title, content: parsed.content };
  }
  // 回退：整个文本作为 content
  return { title: fallbackTitle, content: raw };
}

/**
 * 原创性要求（所有 prompt 共享）
 */
const ORIGINALITY_REQUIREMENT = `

【原创性要求 - 必须严格遵守】
1. 完全原创，不得抄袭、模仿或改写任何现有小说作品
2. 不得使用任何知名小说的人物、情节、世界观设定
3. 人物名字、地名、组织名称必须原创
4. 情节发展必须独特，避免套路化
5. 文风可以借鉴，但内容必须全新创作
6. 生成后需要通过原创性检测（相似度<30%）`;

/**
 * 封面图生成 Prompt（参考番茄小说平台优化模版）
 */
export function buildCoverPrompt(params: {
  title: string;
  authorName?: string;
  genre: string;
  description?: string;
  worldView?: string;
  coreConflict?: string;
  powerSystem?: string;
  mainCharacters?: Array<{ name: string; gender: string; appearance?: string; role: string }>;
}): string {
  const mainCharacterInfo = params.mainCharacters?.length
    ? params.mainCharacters
        .slice(0, 3)
        .map((c) => `- ${c.name}（${c.role}）${c.appearance ? `：${c.appearance.slice(0, 60)}` : ""}`)
        .join("\n")
    : "- 暂无明确主角形象信息";

  return `请基于以下小说信息，生成“封面设计需求说明”（不是图片提示词），用于后续再交给文字模型压缩为图片模型提示词。

小说基本信息：
- 书名：${params.title}
- 类型：${params.genre}
${params.description ? `- 简介：${params.description.slice(0, 220)}` : ""}
${params.worldView ? `- 世界观要点：${params.worldView.slice(0, 160)}` : ""}
${params.coreConflict ? `- 核心冲突：${params.coreConflict.slice(0, 140)}` : ""}
${params.powerSystem ? `- 力量体系：${params.powerSystem.slice(0, 120)}` : ""}

主要角色信息：
${mainCharacterInfo}

硬性要求：
1. 封面中需有清晰可读的中文书名“${params.title}”
${params.authorName ? `2. 封面中需有清晰可读的作者名“${params.authorName}”` : ""}
${params.authorName ? "3" : "2"}. 人物画风必须使用“二次元Q版风格（Q版）”
${params.authorName ? "4" : "3"}. 内容元素需符合题材与剧情核心
${params.authorName ? "5" : "4"}. 构图按 3:4 竖版（目标尺寸 600x800）设计
${params.authorName ? "6. 作者名需使用小字号，放在底部或次要位置，不可抢占书名视觉层级" : ""}
${params.authorName ? "7" : "5"}. 风格美观、有艺术性，并与网文平台阅读场景匹配
${params.authorName ? "8" : "6"}. 人物建议中景或全身，人物占画面约 25%-45%，不要大头特写或人物占满画面
${params.authorName ? "9" : "7"}. 需考虑手机端缩略图识别度（主体清晰、焦点集中）
${params.authorName ? "10" : "8"}. 输出图后端会统一导出 jpg/jpeg/png，文件不超过 5MB（提示词无需重复格式参数）
${params.authorName ? "11" : "9"}. 不使用写实照片风，优先商业插画封面观感

请输出一段结构化、清晰的“封面需求说明”，供下一步生成图片提示词使用。`;
}

/**
 * 将“封面需求说明”压缩成图片模型可用短 prompt
 */
export function buildCoverPromptRefinePrompt(params: {
  title: string;
  authorName?: string;
  genre: string;
  coverRequirement: string;
}): string {
  return `你是网文封面提示词优化专家。请把下方“封面需求说明”压缩为可直接给图片模型使用的高质量短 prompt，并同时生成 negative_prompt。

书名：${params.title}
${params.authorName ? `作者名：${params.authorName}` : ""}
类型：${params.genre}

封面需求说明：
${params.coverRequirement}

输出要求：
1. 严格输出 JSON，不要额外解释，格式：
{
  "prompt": "正向提示词",
  "negativePrompt": "负向提示词"
}
2. prompt 长度控制在 120-220 字
3. prompt 必须包含：主体、场景、光影、色彩、构图、情绪
4. prompt 必须包含“书名清晰可读”${params.authorName ? "，以及作者名清晰可读" : ""}
${params.authorName ? "5. 作者名字号需明显小于书名，位于底部或次要位置" : ""}
${params.authorName ? "6" : "5"}. prompt 必须明确“人物采用二次元Q版风格（Q版）”
${params.authorName ? "7" : "6"}. prompt 必须明确“人物中景/全身，人物占画面约25%-45%，不要大头特写”
${params.authorName ? "8" : "7"}. negativePrompt 需包含：低清晰度、乱码文字、构图混乱、人物崩坏、写实照片风、水印logo、人物过大占画面、大头特写 等规避项
${params.authorName ? "9" : "8"}. 保持商业网文封面感，避免低质/杂乱描述
${params.authorName ? "10" : "9"}. 避免高风险敏感表达`;
}

/**
 * 优化用户创作需求 Prompt
 */
export function buildRefineRequirementsPrompt(params: {
  genre: string;
  requirements: string;
}): string {
  return `你是一位资深的网络小说策划编辑。用户想写一部${params.genre}小说，但他的需求描述可能比较粗糙或简短。请帮他将需求优化为一段清晰、完整、专业的创作方案。

用户原始需求：
${params.requirements}

请输出优化后的创作方案（纯文本，不要 JSON，不要 markdown），包含以下要素：
1. 核心题材：这是一个什么样的故事（一句话概括）
2. 主角设定：主角是谁，有什么特殊身份或能力
3. 核心冲突：故事的主要矛盾和驱动力是什么
4. 卖点/爽点：这个故事最吸引读者的地方在哪里
5. 故事走向：大致的剧情发展方向（2-3句话）

要求：
- 保留用户原始需求中的所有关键信息，不要丢弃
- 对模糊的部分进行合理补充和细化
- 如果用户只写了几个词，要扩展成完整的构想
- 风格要符合${params.genre}小说的常见套路和读者期待
- 总字数控制在 200-400 字
- 直接输出优化后的文本，不要有"优化后""以下是"等前缀` + ORIGINALITY_REQUIREMENT;
}

/**
 * 项目创建 Prompt（AI 生成标题和简介）
 */
export function buildProjectPrompt(params: {
  genre: string;
  requirements: string;
}): string {
  return `你是一位资深的网络小说策划编辑，精通番茄小说等平台的爆款小说策划。请根据用户的需求和小说类型，生成一个适合在番茄小说平台发布的小说标题和简介。

小说类型：${params.genre}

用户需求：
${params.requirements}

请严格按照以下 JSON 格式输出（不要包含 markdown 代码块标记）：
{
  "titles": [
    {
      "title": "标题1",
      "reason": "推荐理由（30字以内）"
    },
    {
      "title": "标题2",
      "reason": "推荐理由（30字以内）"
    },
    {
      "title": "标题3",
      "reason": "推荐理由（30字以内）"
    }
  ],
  "description": "小说简介（150-300字，适合番茄小说平台风格）"
}

要求：
1. 标题要吸引眼球，符合番茄小说平台用户的阅读偏好
2. 标题字数控制在 4-15 个字，简短有力
3. 标题风格参考番茄小说热门作品，可以用"我""系统""重生""穿越"等热门关键词
4. 提供 3 个标题供用户选择，风格各有侧重
5. 简介要有悬念感和代入感，让读者想点进去看
6. 简介开头要抓人，可以用"当XX发现""如果有一天""重生回到"等句式
7. 简介中要体现核心卖点和爽点
8. 只输出 JSON，不要有其他内容` + ORIGINALITY_REQUIREMENT;
}

/**
 * 优化核心设定关键词 Prompt
 */
export function buildRefineSettingsKeywordsPrompt(params: {
  title: string;
  genre: string;
  description?: string;
  keywords: string;
}): string {
  return `你是一位资深的${params.genre}小说世界观架构师。用户想为小说《${params.title}》生成核心设定，但他输入的关键词可能很简短、零碎甚至混杂。请先准确理解其意图，再把这些关键词升级为可直接用于创作的“设定需求说明”。

小说标题：${params.title}
小说类型：${params.genre}
${params.description ? `小说简介：${params.description}` : ""}

用户输入的关键词：
${params.keywords}

请输出优化后的设定需求（纯文本，不要 JSON，不要 markdown），包含以下要素：
1. 世界观方向：故事发生在什么样的世界（时代背景、地理环境、社会结构）
2. 力量体系方向：这个世界的力量/能力/修炼体系大致是什么样的
3. 核心矛盾方向：故事的主要冲突和对立面是什么
4. 势力格局方向：世界中有哪些主要势力或阵营
5. 特色元素：有什么独特的规则或设定能让这个世界与众不同

要求：
- 保留用户原始关键词中的核心意图，不要偏题
- 将词语级输入转化为可执行的创作需求，避免空泛口号
- 对模糊部分进行合理补全，但不要引入与关键词冲突的设定
- 兼顾商业网文可读性：冲突清晰、升级路径明确、爽点可持续
- 符合${params.genre}小说的常见世界观框架
- 总字数控制在 220-380 字
- 直接输出优化后的文本，不要有"优化后""以下是"等前缀` + ORIGINALITY_REQUIREMENT;
}

/**
 * 核心设定生成 Prompt
 */
export function buildSettingsPrompt(params: {
  title: string;
  genre: string;
  description?: string;
  keywords?: string;
}): string {
  return `你是一位资深的小说创作总编。请根据以下信息，为一部${params.genre}小说生成“可直接用于连载”的核心设定，要求兼顾原创性、商业可读性和后续扩展空间。

小说标题：${params.title}
小说类型：${params.genre}
${params.description ? `简介：${params.description}` : ""}
${params.keywords ? `关键词/设定需求：${params.keywords}` : "关键词/设定需求：用户未提供，请基于标题、类型与简介自行补全最合理的设定方向"}

请严格按照以下 JSON 格式输出（不要包含 markdown 代码块标记）：
{
  "worldView": "世界观设定（300-500字，描述故事发生的世界背景、基本规则）",
  "coreConflict": "核心冲突（200-300字，描述故事的主要矛盾和驱动力）",
  "powerSystem": "力量体系（200-400字，描述世界中的力量/能力体系，如果适用的话）",
  "factions": [
    {"name": "势力名称", "description": "势力描述（50-100字）"}
  ],
  "specialRules": [
    {"name": "规则名称", "description": "规则描述（50-100字）"}
  ]
}

要求：
1. 设定要有创意，避免同质化套路，但要让读者一眼能理解卖点
2. 各部分之间要逻辑自洽，且因果链清晰（背景 -> 冲突 -> 力量 -> 势力 -> 规则）
3. 核心冲突必须具备长期推进性，支撑中长篇连载，不可“一次性解决”
4. 力量体系要有成长阶梯和代价约束，避免纯堆数值
5. 势力与特殊规则必须服务主线冲突，不能只是设定堆砌
6. 为后续角色塑造和剧情升级预留明确空间（至少 3 条潜在发展方向）
7. 若用户未提供关键词，请优先围绕题材核心母题构建，不要出现“信息不足”之类表述
8. 只输出 JSON，不要有其他内容` + ORIGINALITY_REQUIREMENT;
}

/**
 * 大纲生成 Prompt（动态结构）
 */
export function buildOutlinePrompt(params: {
  title: string;
  genre: string;
  description?: string;
  worldView: string;
  coreConflict: string;
  characters?: Array<{
    name: string;
    role: string;
    personality?: string[];
    background?: string;
  }>;
  targetChapters?: number;
}): string {
  const chapters = params.targetChapters || 100;
  const roleMap: Record<string, string> = {
    protagonist: "主角",
    supporting: "配角",
    antagonist: "反派",
    minor: "次要角色",
  };
  const characterList = params.characters?.length
    ? params.characters
        .slice(0, 20)
        .map((c) => {
          const role = roleMap[c.role] || c.role;
          const traits = c.personality?.length ? `；性格：${c.personality.slice(0, 3).join("、")}` : "";
          const bg = c.background ? `；背景：${c.background.slice(0, 80)}` : "";
          return `- ${c.name}（${role}）${traits}${bg}`;
        })
        .join("\n")
    : "- 暂无角色，请先规划角色原型并在大纲中为关键角色预留登场位";

  return `你是一位资深的${params.genre}小说编剧。请根据以下核心设定，为小说《${params.title}》规划完整的故事大纲。

项目简介：
${params.description || "暂无"}

世界观：
${params.worldView}

核心冲突：
${params.coreConflict}

角色列表：
${characterList}

目标章节数：约 ${chapters} 章

【重要】请严格按照以下 JSON 格式输出，不要包含任何其他文字、解释或 markdown 标记：

{
  "acts": [
    {
      "actNumber": 1,
      "title": "幕标题（如：开端、发展、转折、高潮、结局等）",
      "chapterRange": "第1-50章",
      "description": "该幕的主要内容和作用（100-200字）",
      "plotSegments": [
        {
          "title": "情节段落标题",
          "chapterRange": "第1-10章",
          "summary": "该情节段落的主要内容（200-300字）",
          "keyEvents": ["关键事件1", "关键事件2"],
          "characters": ["涉及的主要角色"],
          "purpose": "该段落在整体故事中的作用"
        }
      ]
    }
  ],
  "plotPoints": [
    {
      "name": "情节点名称（如：触发事件、第一次转折、中点、第二次转折、黑暗时刻、高潮、结局等）",
      "chapter": "第X章",
      "description": "描述该情节点的内容和意义"
    }
  ]
}

要求：
1. 根据小说类型和章节数，智能决定幕数，并让每一幕都有明确阶段目标和失败代价：
   - 短篇（<100章）：建议 3-5 幕
   - 中篇（100-300章）：建议 5-7 幕
   - 长篇（300-1000章）：建议 7-12 幕
   - 超长篇（>1000章）：建议 12-20 幕

2. 每一幕包含 2-5 个情节段落，且每个段落都要有推进主线冲突的功能

3. 情节段落是幕的子集，要符合该幕主题，并体现“目标 -> 阻碍 -> 转折 -> 结果”

4. 关键情节点要标注在合适的章节位置，数量根据幕数调整：
   - 3幕：4-6个情节点
   - 5幕：6-8个情节点
   - 7幕：8-12个情节点
   - 更多幕：相应增加情节点

5. 对于网络小说（特别是玄幻、修仙类）：
   - 可以按照境界突破、地图转换、势力更迭来划分幕
   - 每一幕代表一个大的阶段（如：凡人界、修仙界、仙界等）
   - 情节要有节奏感，避免平铺直叙，并确保每 3-8 章出现一个强钩子

6. 必须充分利用“项目简介、世界观、核心冲突、角色列表”四类信息：
   - 主要角色要有连续成长弧线，反派要有阶段性目标
   - 角色关系变化要在 plotSegments 的 characters 与 summary 中可追踪
   - 不得出现与已给角色设定明显冲突的人设行为

7. 确保故事结构合理，有起承转合，并在中段防止“重复打怪/重复冲突”

8. chapterRange 需要覆盖完整章节区间，幕与段落之间不重叠、不遗漏

9. 【关键】直接输出 JSON，不要有任何额外的文字、问题或解释` + ORIGINALITY_REQUIREMENT;
}

export function buildChapterPrompt(params: {
  title: string;
  genre: string;
  worldView: string;
  coreConflict: string;
  chapterNumber: number;
  chapterSummary?: string;
  previousContent?: string;
  characters?: string[];
  wordCount?: number;
}): string {
  const targetWords = params.wordCount || 2300;

  return `你是一位优秀的${params.genre}小说作家。请根据以下信息创作第${params.chapterNumber}章的内容。

小说标题：${params.title}
${params.chapterSummary ? `章节大纲：${params.chapterSummary}` : ""}

世界观设定：
${params.worldView}

核心冲突：
${params.coreConflict}

${params.characters?.length ? `涉及角色：${params.characters.join("、")}` : ""}

${params.previousContent ? `前文概要：\n${params.previousContent}` : "这是小说的开篇章节。"}

请严格按照以下 JSON 格式输出（不要包含 markdown 代码块标记）：
{
  "title": "本章标题（2-8个字，简短有力，概括本章核心内容或悬念）",
  "content": "章节正文内容"
}

要求：
1. 正文字数约 ${targetWords} 字
2. 文笔流畅，情节引人入胜
3. 注意与世界观设定保持一致
4. 章节结尾要有悬念或推进感
5. 标题要吸引人，能体现本章的核心看点
6. content 中只放正文，不要包含"第X章"或章节标题
7. 只输出 JSON，不要有其他内容` + ORIGINALITY_REQUIREMENT;
}

/**
 * 章节生成的 system prompt（小说框架）
 */
export function buildChapterSystemPrompt(params: {
  title: string;
  genre: string;
  description?: string;
  worldView: string;
  coreConflict: string;
  powerSystem?: string;
  outlineContext?: string;
  characters?: Array<{
    name: string;
    role: string;
    personality?: string[];
    motivation?: string | null;
    background?: string | null;
  }>;
}): string {
  const roleMap: Record<string, string> = {
    protagonist: "主角",
    supporting: "配角",
    antagonist: "反派",
    minor: "次要角色",
  };

  const characterText = params.characters?.length
    ? params.characters
        .slice(0, 30)
        .map((c) => {
          const role = roleMap[c.role] || c.role;
          const personality = c.personality?.length
            ? `；性格：${c.personality.slice(0, 3).join("、")}`
            : "";
          const motivation = c.motivation ? `；动机：${c.motivation.slice(0, 60)}` : "";
          const background = c.background ? `；背景：${c.background.slice(0, 80)}` : "";
          return `- ${c.name}（${role}）${personality}${motivation}${background}`;
        })
        .join("\n")
    : "- 暂无角色";

  return `你是长篇${params.genre}小说的主笔编剧，负责在连续连载中保持人物、世界观、冲突主线、伏笔回收的一致性。

【小说框架】
小说标题：${params.title}
小说类型：${params.genre}
项目简介：${params.description || "暂无"}

世界观：
${params.worldView}

核心冲突：
${params.coreConflict}

力量体系：
${params.powerSystem || "暂无"}

角色清单：
${characterText}

大纲锚点：
${params.outlineContext || "暂无，需根据现有设定自行保持主线推进"}

【写作规则】
1. 严格承接对话中的历史章节信息，不得与既有剧情冲突
2. 每章都要推进主线冲突，避免原地打转
3. 角色行为必须符合其已知性格、动机与关系
4. 保持网文节奏：开场抓人，中段升级，结尾留钩子
5. 兼顾可读性与连贯性，不堆设定，不空喊口号
6. 如果历史信息存在歧义，优先采用最近章节信息
7. 只能输出 JSON，不要额外解释` + ORIGINALITY_REQUIREMENT;
}

/**
 * 章节生成的最终用户请求（当前轮）
 */
export function buildChapterUserPrompt(params: {
  chapterNumber: number;
  chapterGoal?: string;
  wordCount?: number;
}): string {
  const targetWords = params.wordCount || 2300;
  return `请基于当前会话中的所有历史上下文，创作第${params.chapterNumber}章。

本章目标：
${params.chapterGoal || "延续主线并自然推进冲突升级"}

输出要求（严格 JSON）：
{
  "title": "本章标题（2-8个字）",
  "content": "章节正文"
}

写作约束：
1. 字数约 ${targetWords} 字
2. 不能与历史章节冲突，不能重置人物关系
3. 必须有实质推进（事件、关系、信息或局势至少推进两项）
4. 章节结尾要有明确钩子
5. content 仅正文，不要出现“第X章”标题抬头
6. 只输出 JSON`;
}

/**
 * 章节分镜 system prompt
 */
export function buildChapterStoryboardSystemPrompt(params: {
  title: string;
  genre: string;
  description?: string;
  worldView?: string;
  coreConflict?: string;
  characters?: Array<{
    name: string;
    role: string;
    personality?: string[];
  }>;
}): string {
  const characterText = params.characters?.length
    ? params.characters
        .slice(0, 25)
        .map(
          (c) =>
            `- ${c.name}（${c.role}）${c.personality?.length ? `｜性格：${c.personality.join("、")}` : ""}`
        )
        .join("\n")
    : "- 暂无角色信息";

  return `# 任务
你是一名影视分镜设计师。

请将输入的小说内容转换为短剧视频分镜脚本。

该短剧的规则：
- 每个镜头固定 6 秒
- 每个镜头只表达一个画面
- 优先表现人物动作和情绪

# 镜头类型
只能使用：远景、中景、近景、特写
使用规则：
场景建立 -> 远景
人物互动 -> 中景
人物动作 -> 近景
情绪表现 -> 特写

# 项目约束
- 小说名：${params.title}
- 类型：${params.genre}
${params.description ? `- 简介：${params.description}` : ""}
${params.worldView ? `- 世界观：${params.worldView}` : ""}
${params.coreConflict ? `- 核心冲突：${params.coreConflict}` : ""}

角色参考：
${characterText}

你必须保证人物关系和设定不与已知上下文冲突。`;
}

/**
 * 章节分镜 user prompt
 */
export function buildChapterStoryboardUserPrompt(params: {
  chapterNumber: number;
  chapterTitle: string;
  novelText: string;
}): string {
  return `# 输出格式（严格 JSON）
{
  "shots": [
    {
      "shot_id": 1,
      "scene": "场景名称",
      "camera": "远景 | 中景 | 近景 | 特写",
      "characters": ["角色名"],
      "action": "人物动作",
      "emotion": "人物情绪",
      "dialogue": {
        "character": "角色",
        "text": "台词"
      },
      "duration": 6,
      "visual_description": "清晰画面描述"
    }
  ]
}

硬性要求：
1. 镜头必须按原文时间顺序推进，不可跳剧情
2. 每个镜头只表达一个明确画面动作
3. duration 固定为 6
4. camera 只能是：远景/中景/近景/特写
5. shot_id 从 1 开始递增
6. 如果该镜头无台词，dialogue 也必须给出旁白或环境描述，不可留空
7. 只输出 JSON，不要 markdown，不要解释

# 输入小说
章节：第${params.chapterNumber}章《${params.chapterTitle}》
${params.novelText}`;
}

/**
 * 章节摘要生成 Prompt
 * 将章节全文压缩成精炼摘要，用于后续章节生成时的上下文传递
 */
export function buildChapterSummaryPrompt(params: {
  chapterNumber: number;
  chapterTitle: string;
  content: string;
  genre: string;
}): string {
  return `你是一位专业的小说编辑。请将以下${params.genre}小说第${params.chapterNumber}章的内容压缩为一段精炼的摘要。

章节标题：${params.chapterTitle}

章节全文：
${params.content}

要求：
1. 摘要字数控制在 200-400 字
2. 保留所有关键情节转折和重要事件
3. 保留出场角色的关键行为和状态变化
4. 保留重要的对话要点（不需要原文，概括即可）
5. 保留伏笔和悬念线索
6. 保留场景/地点的转换
7. 用客观叙述的方式，不加评价
8. 直接输出摘要文本，不要有"摘要""以下是"等前缀`;
}

/**
 * 角色生成 Prompt
 */
export function buildCharacterPrompt(params: {
  title: string;
  genre: string;
  worldView: string;
  coreConflict: string;
  role: string;
  keywords?: string;
  existingCharacters?: Array<{ name: string; role: string; personality: string[]; background: string }>;
}): string {
  const roleMap: Record<string, string> = {
    protagonist: "主角",
    supporting: "配角",
    antagonist: "反派",
    minor: "次要角色",
  };

  let existingContext = "";
  if (params.existingCharacters && params.existingCharacters.length > 0) {
    existingContext = `\n已有角色（请勿重复，且新角色要与现有角色形成差异化和互动关系）：\n${params.existingCharacters
      .map(
        (c) =>
          `- ${c.name}（${roleMap[c.role] || c.role}）：性格 ${c.personality.join("、")}，${c.background}`
      )
      .join("\n")}\n`;
  }

  return `你是一位资深的${params.genre}小说编剧。请根据以下信息，为小说《${params.title}》创建一个${roleMap[params.role]}角色。

世界观：
${params.worldView}

核心冲突：
${params.coreConflict}
${existingContext}
${params.keywords ? `关键词：${params.keywords}` : ""}

要求：
1. 角色要符合世界观设定
2. 性格鲜明，有独特的特点
3. 背景故事不超过150字
4. 优势和弱点要平衡${params.existingCharacters?.length ? "\n5. 不要与已有角色重名或定位雷同，要形成互补或对立关系" : ""}
${params.existingCharacters?.length ? "6" : "5"}. 严格按照以下 JSON 格式输出（不要包含 markdown 代码块标记）：

{
  "name": "角色名字",
  "age": 25,
  "gender": "男/女",
  "appearance": "外貌描述（50-100字）",
  "personality": ["性格特点1", "性格特点2", "性格特点3"],
  "background": "角色背景故事（100-150字）",
  "motivation": "角色的目标和动机（50-100字）",
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["弱点1", "弱点2"]
}` + ORIGINALITY_REQUIREMENT;
}

/**
 * 角色规划 Prompt
 */
export function buildCharacterPlanPrompt(params: {
  title: string;
  genre: string;
  worldView: string;
  coreConflict: string;
  characterCount?: number;
  existingCharacters?: Array<{ name: string; role: string; personality: string[]; background: string }>;
}): string {
  const count = params.characterCount || 8;

  const roleMap: Record<string, string> = {
    protagonist: "主角",
    supporting: "配角",
    antagonist: "反派",
    minor: "次要角色",
  };

  let existingContext = "";
  if (params.existingCharacters && params.existingCharacters.length > 0) {
    existingContext = `\n已有角色（请在此基础上补充新角色，不要重复已有角色）：\n${params.existingCharacters
      .map(
        (c) =>
          `- ${c.name}（${roleMap[c.role] || c.role}）：性格 ${c.personality.join("、")}，${c.background}`
      )
      .join("\n")}\n`;
  }

  const actualNewCount = params.existingCharacters?.length
    ? Math.max(1, count - params.existingCharacters.length)
    : count;

  return `你是一位资深的${params.genre}小说编剧。请根据以下核心设定，为小说《${params.title}》规划完整的角色体系。

世界观：
${params.worldView}

核心冲突：
${params.coreConflict}
${existingContext}
要求：
1. ${params.existingCharacters?.length ? `在已有 ${params.existingCharacters.length} 个角色的基础上，再规划 ${actualNewCount} 个新角色` : `规划 ${count} 个主要角色`}（包括主角、配角、反派等）
2. 角色之间要有合理的关系和互动${params.existingCharacters?.length ? "（包括与已有角色的关系）" : ""}
3. 每个角色都要有明确的定位和作用
4. 角色设定要符合世界观和核心冲突${params.existingCharacters?.length ? "\n5. 不要与已有角色重名或定位雷同" : ""}
${params.existingCharacters?.length ? "6" : "5"}. 严格按照以下 JSON 格式输出（不要包含 markdown 代码块标记）：

{
  "characters": [
    {
      "name": "角色名字",
      "role": "protagonist/supporting/antagonist/minor",
      "age": 25,
      "gender": "男/女",
      "appearance": "外貌描述（50-100字）",
      "personality": ["性格特点1", "性格特点2", "性格特点3"],
      "background": "角色背景故事（100-150字）",
      "motivation": "角色的目标和动机（50-100字）",
      "strengths": ["优势1", "优势2"],
      "weaknesses": ["弱点1", "弱点2"],
      "keywords": "角色关键词（用于标识角色特点）"
    }
  ],
  "relationships": [
    {
      "from": "角色A名字",
      "to": "角色B名字",
      "relation": "关系描述（如：师徒、敌对、朋友等）"
    }
  ]
}

注意：
- 必须包含至少1个主角(protagonist)
- 建议包含2-3个配角(supporting)
- 建议包含1-2个反派(antagonist)
- 其余为次要角色(minor)
- 角色之间的关系要合理且有戏剧张力${params.existingCharacters?.length ? "\n- relationships 中也要包含新角色与已有角色之间的关系" : ""}` + ORIGINALITY_REQUIREMENT;
}

