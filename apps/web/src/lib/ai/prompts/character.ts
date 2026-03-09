export interface GenerateCharacterParams {
  projectSettings: string;
  role: 'protagonist' | 'supporting' | 'antagonist';
  basicInfo?: {
    name?: string;
    age?: number;
    gender?: string;
  };
}

export const generateCharacterPrompt = (params: GenerateCharacterParams): string => {
  const roleNames = {
    protagonist: '主角',
    supporting: '配角',
    antagonist: '反派',
  };

  return `你是一位资深小说策划师。请根据以下信息设计一个${roleNames[params.role]}角色：

【世界观设定】
${params.projectSettings}

【角色类型】
${roleNames[params.role]}

${params.basicInfo?.name ? `【角色名称】\n${params.basicInfo.name}\n` : ''}
${params.basicInfo?.age ? `【年龄】\n${params.basicInfo.age}\n` : ''}
${params.basicInfo?.gender ? `【性别】\n${params.basicInfo.gender}\n` : ''}

请生成以下内容：
1. 外貌特征（50-100字）
2. 性格特点（3-5个关键词）
3. 角色背景（不超过150字）
4. 动机与目标
5. 优势（2-3个）
6. 缺陷（2-3个）

要求：
- 角色要立体鲜明，有独特性
- 符合世界观设定
- 性格和行为逻辑一致
- 为故事发展留有空间

请按照以下格式输出：
外貌：...
性格：...
背景：...
动机：...
优势：...
缺陷：...`;
};
