"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

const createChapterSchema = z.object({
  actNumber: z.number(),
  chapterNumber: z.number(),
  wordCount: z.number().min(1000).max(5000).optional(),
  versionCount: z.number().min(1).max(5).optional(),
  autoSelectBest: z.boolean().optional(),
  scoreThreshold: z.number().min(0).max(100).optional(),
});

type CreateChapterInput = z.infer<typeof createChapterSchema>;

interface CreateChapterDialogProps {
  projectId: string;
  actNumber: number;
  chapterNumber: number;
  actTitle: string;
  actDescription: string;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
  /** 幕内章节范围（起始章节号） */
  chapterStart?: number;
  /** 幕内章节范围（结束章节号） */
  chapterEnd?: number;
  /** 该幕内已生成的章节号列表 */
  existingChapterNumbers?: number[];
  /** 重新生成模式 */
  regenerate?: {
    chapterId: string;
    chapterTitle: string;
  };
}

export function CreateChapterDialog({
  projectId,
  actNumber,
  chapterNumber,
  actTitle,
  actDescription,
  onSuccess,
  trigger,
  chapterStart,
  chapterEnd,
  existingChapterNumbers = [],
  regenerate,
}: CreateChapterDialogProps) {
  const { alert } = useAlertDialog();
  const isRegenerate = !!regenerate;

  // 计算可选的章节号列表（幕内未生成的章节）
  const availableChapterNumbers: number[] = [];
  if (!isRegenerate && chapterStart !== undefined && chapterEnd !== undefined) {
    for (let i = chapterStart; i <= chapterEnd; i++) {
      if (!existingChapterNumbers.includes(i)) {
        availableChapterNumbers.push(i);
      }
    }
  }
  const nextAvailableChapterNumber = availableChapterNumbers.length > 0 ? availableChapterNumbers[0] : chapterNumber;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateChapterInput>({
    resolver: zodResolver(createChapterSchema),
    defaultValues: {
      actNumber,
      chapterNumber: isRegenerate ? chapterNumber : nextAvailableChapterNumber,
      wordCount: 2300,
      versionCount: 1,
      autoSelectBest: false,
      scoreThreshold: 70,
    },
  });

  const versionCount = watch("versionCount");
  const autoSelectBest = watch("autoSelectBest");

  const onSubmit = async (data: CreateChapterInput) => {
    setIsGenerating(true);
    try {
      const url = isRegenerate
        ? `/api/projects/${projectId}/chapters/${regenerate!.chapterId}/regenerate`
        : `/api/projects/${projectId}/chapters`;

      const body = isRegenerate
        ? {
            wordCount: data.wordCount,
            versionCount: data.versionCount,
            autoSelectBest: data.autoSelectBest,
            scoreThreshold: data.scoreThreshold,
          }
        : data;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const result = await response.json();
        alert(result.error || "生成失败", "error");
        return;
      }

      const result = await response.json();
      setOpen(false);
      reset();
      onSuccess?.();
      if (!isRegenerate) {
        router.push(`/projects/${projectId}/chapters/${result.chapter.id}`);
      }
    } catch (error) {
      console.error("生成章节失败:", error);
      alert("生成失败，请稍后重试", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm">
            <Sparkles className="mr-2 h-4 w-4" />
            生成章节
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isRegenerate
              ? `重新生成第 ${chapterNumber} 章`
              : `生成章节 — 第 ${actNumber} 幕`}
          </DialogTitle>
          <DialogDescription>
            {isRegenerate
              ? `将重新生成第 ${chapterNumber} 章的内容，原内容将保留在版本历史中`
              : `根据第 ${actNumber} 幕的大纲生成章节内容，AI 将自动评分并选择最佳版本`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2 p-4 bg-muted rounded-lg">
            <div>
              <Label className="text-xs text-muted-foreground">所属幕</Label>
              <p className="font-medium">第 {actNumber} 幕：{actTitle}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">幕概要</Label>
              <p className="text-sm">{actDescription}</p>
            </div>
            <div className="pt-2 border-t">
              <Label className="text-xs text-muted-foreground">生成章节</Label>
              {isRegenerate ? (
                <p className="font-medium text-primary">第 {chapterNumber} 章</p>
              ) : (
                <>
                  <p className="font-medium text-primary">第 {nextAvailableChapterNumber} 章</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    按顺序生成，必须先完成前一章后才能生成后续章节
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wordCount">目标字数</Label>
            <Input
              {...register("wordCount", { valueAsNumber: true })}
              id="wordCount"
              type="number"
              min={1000}
              max={5000}
              step={100}
              disabled={isGenerating}
            />
            {errors.wordCount && (
              <p className="text-sm text-destructive">{errors.wordCount.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              建议 1500-3000 字，实际生成字数可能有偏差
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="versionCount">生成版本数</Label>
            <Input
              {...register("versionCount", { valueAsNumber: true })}
              id="versionCount"
              type="number"
              min={1}
              max={5}
              step={1}
              disabled={isGenerating}
            />
            {errors.versionCount && (
              <p className="text-sm text-destructive">{errors.versionCount.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              生成多个版本供选择，每个版本会被 AI 评分（1-5 个版本）
            </p>
          </div>

          {versionCount && versionCount > 1 && (
            <>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="autoSelectBest"
                  checked={autoSelectBest}
                  onCheckedChange={(checked) => setValue("autoSelectBest", checked as boolean)}
                  disabled={isGenerating}
                />
                <Label htmlFor="autoSelectBest" className="text-sm font-normal cursor-pointer">
                  自动选择最高分版本
                </Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scoreThreshold">评分阈值</Label>
                <Input
                  {...register("scoreThreshold", { valueAsNumber: true })}
                  id="scoreThreshold"
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  disabled={isGenerating}
                />
                {errors.scoreThreshold && (
                  <p className="text-sm text-destructive">{errors.scoreThreshold.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  低于此分数的版本将被标记为需要重写（0-100 分）
                </p>
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isGenerating}
            >
              取消
            </Button>
            <Button type="submit" disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                  {isRegenerate ? "重新生成中..." : "生成中..."}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {isRegenerate ? "重新生成" : "开始生成"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
