export interface GenerateChapterParams {
  projectSettings: string;
  characters: Array<{ name: string; background: string }>;
  outlineSummary: string;
  previousChapter?: string;
  chapterOutline: string;
  wordCount: number;
  perspective: 'first' | 'third';
}

export const generateChapterPrompt = (params: GenerateChapterParams): string => {
  return `你是一位专业小说作家。请根据以下信息创作小说章节：

【世界观设定】
${params.projectSettings}

【主要角色】
${params.characters.map(c => `${c.name}：${c.background}`).join('\n')}

【故事大纲】
${params.outlineSummary}

${params.previousChapter ? `【上一章节内容摘要】\n${params.previousChapter}\n` : ''}

【本章大纲】
${params.chapterOutline}

创作要求：
1. 字数：约${params.wordCount}字
2. 视角：${params.perspective === 'first' ? '第一人称' : '第三人称'}
3. 情节要跌宕起伏，有冲突和转折
4. 人物对话要符合角色性格
5. 场景描写要生动具体
6. 保持与前文的连贯性
7. 语言流畅，富有感染力
8. 章节结尾要有悬念或钩子

请直接输出章节内容，不要包含章节标题和额外说明。`;
};

export const generateChapterTitlePrompt = (chapterSummary: string): string => {
  return `请为以下章节内容生成3-5个吸引人的标题：

${chapterSummary}

要求：
- 标题要简洁有力，8-15字
- 能够吸引读者兴趣
- 体现本章核心内容或悬念
- 风格统一

请直接输出标题列表，每行一个标题。`;
};
