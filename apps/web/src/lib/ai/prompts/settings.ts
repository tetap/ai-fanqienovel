export interface GenerateSettingsParams {
  genre: string;
  keywords: string[];
  style: string;
}

export const generateWorldViewPrompt = (params: GenerateSettingsParams): string => {
  return `你是一位资深小说策划师。请根据以下信息生成小说的核心世界观设定：

类型：${params.genre}
关键词：${params.keywords.join('、')}
风格：${params.style}

请生成以下内容（总字数300-500字）：
1. 世界观背景（时代、地点、社会结构）
2. 核心冲突（主要矛盾）
3. 特殊设定（修炼体系/科技体系/魔法规则等）
4. 主要势力或组织

要求：
- 设定要有创新性和吸引力
- 逻辑自洽，避免矛盾
- 为后续情节发展留有空间
- 语言简洁生动

请直接输出设定内容，不要额外的解释。`;
};
