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
import { Wand2 } from "lucide-react";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

const batchGenerateSchema = z.object({
  characterCount: z.number().min(3, "至少生成3个角色").max(20, "最多生成20个角色"),
  clearExisting: z.boolean(),
});

type BatchGenerateInput = z.infer<typeof batchGenerateSchema>;

interface BatchGenerateCharactersDialogProps {
  projectId: string;
  hasExistingCharacters: boolean;
  onSuccess?: () => void;
}

export function BatchGenerateCharactersDialog({
  projectId,
  hasExistingCharacters,
  onSuccess,
}: BatchGenerateCharactersDialogProps) {
  const { alert, confirm } = useAlertDialog();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<BatchGenerateInput>({
    resolver: zodResolver(batchGenerateSchema),
    defaultValues: {
      characterCount: 8,
      clearExisting: false,
    },
  });

  const clearExisting = watch("clearExisting");

  const onSubmit = async (data: BatchGenerateInput) => {
    if (hasExistingCharacters && data.clearExisting) {
      if (!await confirm({ title: "确认操作", description: "确定要删除所有现有角色并重新生成吗？此操作不可恢复。", type: "warning" })) {
        return;
      }
    }

    setIsGenerating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/characters/batch-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result = await response.json();
        alert(result.error || "生成失败", "error");
        return;
      }

      const result = await response.json();
      setOpen(false);
      onSuccess?.();
      router.refresh();
      alert(`成功生成 ${result.count} 个角色！`, "success");
    } catch (error) {
      console.error("批量生成角色失败:", error);
      alert("生成失败，请稍后重试", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Wand2 className="mr-2 h-4 w-4" />
          一键生成角色
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>一键生成角色体系</DialogTitle>
          <DialogDescription>
            AI 将根据核心设定自动规划并生成完整的角色体系
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="characterCount">生成角色数量</Label>
            <Input
              {...register("characterCount", { valueAsNumber: true })}
              id="characterCount"
              type="number"
              min={3}
              max={20}
              disabled={isGenerating}
            />
            {errors.characterCount && (
              <p className="text-sm text-destructive">{errors.characterCount.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              建议 6-10 个角色，包括主角、配角、反派等
            </p>
          </div>

          {hasExistingCharacters && (
            <div className="flex items-center space-x-2 p-4 rounded-lg border bg-muted/50">
              <Checkbox
                id="clearExisting"
                checked={clearExisting}
                onCheckedChange={(checked) => setValue("clearExisting", checked as boolean)}
                disabled={isGenerating}
              />
              <div className="flex-1">
                <Label
                  htmlFor="clearExisting"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  清空现有角色
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  勾选后将删除所有现有角色，重新生成全新的角色体系
                </p>
              </div>
            </div>
          )}

          <div className="rounded-lg border p-4 bg-muted/30">
            <h4 className="text-sm font-medium mb-2">AI 将自动生成：</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• 主角、配角、反派等不同类型的角色</li>
              <li>• 每个角色的完整信息（外貌、性格、背景等）</li>
              <li>• 角色之间的关系网络</li>
              <li>• 符合世界观和核心冲突的角色设定</li>
            </ul>
          </div>

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
                  <Wand2 className="mr-2 h-4 w-4 animate-pulse" />
                  生成中...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  开始生成
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
