import { z } from "zod";

export const projectGenerateSchema = z.object({
  titles: z.array(z.object({
    title: z.string(),
    reason: z.string(),
  })),
  description: z.string(),
});

export const settingsSchema = z.object({
  worldView: z.string(),
  coreConflict: z.string(),
  powerSystem: z.string(),
  factions: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })),
  specialRules: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })),
});

export const outlineSchema = z.object({
  acts: z.array(z.object({
    actNumber: z.number(),
    title: z.string(),
    chapterRange: z.string(),
    description: z.string(),
    plotSegments: z.array(z.object({
      title: z.string(),
      chapterRange: z.string(),
      summary: z.string(),
      keyEvents: z.array(z.string()),
      characters: z.array(z.string()),
      purpose: z.string(),
    })),
  })),
  plotPoints: z.array(z.object({
    name: z.string(),
    chapter: z.string(),
    description: z.string(),
  })),
});

export const chapterSchema = z.object({
  title: z.string(),
  content: z.string(),
});

export const characterSchema = z.object({
  name: z.string(),
  age: z.number().nullable().optional(),
  gender: z.string().optional(),
  appearance: z.string().optional(),
  personality: z.array(z.string()),
  background: z.string(),
  motivation: z.string().optional(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
});

export const characterPlanSchema = z.object({
  characters: z.array(z.object({
    name: z.string(),
    role: z.enum(["protagonist", "supporting", "antagonist", "minor"]),
    age: z.number().nullable().optional(),
    gender: z.string().optional(),
    appearance: z.string().optional(),
    personality: z.array(z.string()),
    background: z.string(),
    motivation: z.string().optional(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    keywords: z.string().optional(),
  })),
  relationships: z.array(z.object({
    from: z.string(),
    to: z.string(),
    relation: z.string(),
  })),
});

export const chapterScoreSchema = z.object({
  plot: z.number(),
  character: z.number(),
  writing: z.number(),
  pacing: z.number(),
  originality: z.number(),
  feedback: z.string(),
});

export const chapterStoryboardSchema = z.object({
  shots: z.array(
    z.object({
      shot_id: z.number(),
      scene: z.string(),
      camera: z.enum(["远景", "中景", "近景", "特写"]),
      characters: z.array(z.string()),
      action: z.string(),
      emotion: z.string(),
      dialogue: z
        .object({
          character: z.string(),
          text: z.string(),
        })
        .optional()
        .nullable(),
      duration: z.number(),
      visual_description: z.string(),
    })
  ),
});

