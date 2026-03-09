export interface GenerateOutlineParams {
  projectSettings: string;
  characters: Array<{ name: string; role: string; background: string }>;
  targetChapters: number;
}

export const generateOutlinePrompt = (params: GenerateOutlineParams): string => {
  return `你是一位资深小说策划师。请根据以下信息生成详细的小说大纲：

【世界观设定】
${params.projectSettings}

【主要角色】
${params.characters.map(c => `${c.name}（${c.role}）：${c.background}`).join('\n')}

【目标章节数】
${params.targetChapters}章

请生成以下内容：

1. 三幕式结构划分
   - 第一幕（开端）：占比25%
   - 第二幕（发展）：占比50%
   - 第三幕（高潮与结局）：占比25%

2. 每章大纲（包含以下要素）：
   - 章节序号和标题
   - 核心事件（2-3个）
   - 出场角色
   - 情节推进要点
   - 伏笔或悬念

要求：
- 情节要有起承转合，节奏合理
- 冲突层层递进，高潮迭起
- 人物成长轨迹清晰
- 伏笔与呼应完整
- 逻辑自洽，无明显漏洞

请按照以下格式输出每章大纲：
第X章：【标题】
核心事件：...
出场角色：...
情节推进：...
伏笔悬念：...`;
};
