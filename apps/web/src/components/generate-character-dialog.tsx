"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

const generateCharacterSchema = z.object({
  role: z.enum(["protagonist", "supporting", "antagonist", "minor"]),
  keywords: z.string().min(1, "请输入关键词"),
});

type GenerateCharacterInput = z.infer<typeof generateCharacterSchema>;

interface GenerateCharacterDialogProps {
  projectId: string;
  onSuccess?: () => void;
}

export function GenerateCharacterDialog({ projectId, onSuccess }: GenerateCharacterDialogProps) {
  const { alert } = useAlertDialog();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<GenerateCharacterInput>({
    resolver: zodResolver(generateCharacterSchema),
  });

  const onSubmit = async (data: GenerateCharacterInput) => {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/characters/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result = await response.json();
        alert(result.error || "生成失败", "error");
        return;
      }

      setOpen(false);
      reset();
      onSuccess?.();
      router.refresh();
    } catch (error) {
      console.error("生成角色失败:", error);
      alert("生成失败，请稍后重试", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles className="mr-2 h-4 w-4" />
          AI 生成角色
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>AI 生成角色</DialogTitle>
          <DialogDescription>
            让 AI 根据核心设定自动创建角色
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role">角色类型 *</Label>
            <Select onValueChange={(value) => setValue("role", value as any)}>
              <SelectTrigger>
                <SelectValue placeholder="选择类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="protagonist">主角</SelectItem>
                <SelectItem value="supporting">配角</SelectItem>
                <SelectItem value="antagonist">反派</SelectItem>
                <SelectItem value="minor">次要角色</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="keywords">角色关键词 *</Label>
            <Textarea
              {...register("keywords")}
              id="keywords"
              placeholder="例如：冷酷剑客、天才少年、神秘老者、温柔师姐..."
              rows={3}
              disabled={isGenerating}
            />
            {errors.keywords && (
              <p className="text-sm text-destructive">{errors.keywords.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              描述角色的特点、职业、性格等，AI 会据此生成完整的角色信息
            </p>
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
                  <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  生成角色
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
