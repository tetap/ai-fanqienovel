import { z } from 'zod';

// 用户相关
export const registerSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  name: z.string().min(2, '名称至少2个字符').max(50, '名称最多50个字符'),
  password: z.string().min(6, '密码至少6个字符').max(100, '密码最多100个字符'),
});

export const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(1, '请输入密码'),
});

// 项目相关
export const createProjectSchema = z.object({
  title: z.string().min(1, '请输入项目标题').max(100, '标题最多100个字符'),
  genre: z.string().min(1, '请选择小说类型'),
  description: z.string().max(500, '描述最多500个字符').optional(),
});

// 核心设定生成
export const generateSettingsSchema = z.object({
  genre: z.string().min(1, '请选择小说类型'),
  keywords: z.array(z.string()).min(1, '至少输入一个关键词').max(10, '最多10个关键词'),
  style: z.string().min(1, '请选择风格'),
});

// 角色创建
export const createCharacterSchema = z.object({
  name: z.string().min(1, '请输入角色名称').max(50, '名称最多50个字符'),
  role: z.enum(['protagonist', 'supporting', 'antagonist'], {
    errorMap: () => ({ message: '请选择角色类型' }),
  }),
  age: z.number().int().min(0).max(200).optional(),
  gender: z.string().max(20).optional(),
  appearance: z.string().max(1000).optional(),
  personality: z.array(z.string()).max(10, '最多10个性格特点'),
  background: z.string().min(1, '请输入角色背景').max(150, '背景最多150字'),
  motivation: z.string().max(500).optional(),
  strengths: z.array(z.string()).max(10),
  weaknesses: z.array(z.string()).max(10),
});

// 章节生成
export const generateChapterSchema = z.object({
  projectId: z.string().cuid(),
  chapterOutline: z.string().min(10, '章节大纲至少10个字符'),
  wordCount: z.number().int().min(1500).max(5000).default(2300),
  perspective: z.enum(['first', 'third']).default('third'),
});
