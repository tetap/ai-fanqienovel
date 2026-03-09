"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus } from "lucide-react";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

const createCharacterSchema = z.object({
  name: z.string().min(1, "角色名称不能为空"),
  role: z.enum(["protagonist", "supporting", "antagonist", "minor"]),
  age: z.number().optional(),
  gender: z.string().optional(),
  appearance: z.string().optional(),
  personality: z.string().optional(),
  background: z.string().min(1, "角色背景不能为空").max(150, "背景不超过150字"),
  motivation: z.string().optional(),
  strengths: z.string().optional(),
  weaknesses: z.string().optional(),
});

type CreateCharacterInput = z.infer<typeof createCharacterSchema>;

interface CreateCharacterDialogProps {
  projectId: string;
  onSuccess?: () => void;
}

export function CreateCharacterDialog({ projectId, onSuccess }: CreateCharacterDialogProps) {
  const { alert } = useAlertDialog();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CreateCharacterInput>({
    resolver: zodResolver(createCharacterSchema),
  });

  const onSubmit = async (data: CreateCharacterInput) => {
    setIsLoading(true);
    try {
      // 转换字符串为数组
      const payload = {
        ...data,
        age: data.age ? Number(data.age) : undefined,
        personality: data.personality ? data.personality.split(/[,，、]/).map(s => s.trim()).filter(Boolean) : [],
        strengths: data.strengths ? data.strengths.split(/[,，、]/).map(s => s.trim()).filter(Boolean) : [],
        weaknesses: data.weaknesses ? data.weaknesses.split(/[,，、]/).map(s => s.trim()).filter(Boolean) : [],
      };

      const response = await fetch(`/api/projects/${projectId}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const result = await response.json();
        alert(result.error || "创建失败", "error");
        return;
      }

      setOpen(false);
      reset();
      onSuccess?.();
      router.refresh();
    } catch (error) {
      console.error("创建角色失败:", error);
      alert("创建失败，请稍后重试", "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          创建角色
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>创建新角色</DialogTitle>
          <DialogDescription>
            填写角色的基本信息和背景故事
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">角色名称 *</Label>
              <Input
                {...register("name")}
                id="name"
                placeholder="张三"
                disabled={isLoading}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="age">年龄</Label>
              <Input
                {...register("age", { valueAsNumber: true })}
                id="age"
                type="number"
                placeholder="25"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">性别</Label>
              <Input
                {...register("gender")}
                id="gender"
                placeholder="男/女"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="appearance">外貌描述</Label>
            <Textarea
              {...register("appearance")}
              id="appearance"
              placeholder="身材高大，剑眉星目..."
              rows={2}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="personality">性格特点</Label>
            <Input
              {...register("personality")}
              id="personality"
              placeholder="勇敢、正直、冲动（用逗号分隔）"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="background">角色背景 * (不超过150字)</Label>
            <Textarea
              {...register("background")}
              id="background"
              placeholder="简要描述角色的过去和经历..."
              rows={3}
              disabled={isLoading}
            />
            {errors.background && (
              <p className="text-sm text-destructive">{errors.background.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivation">动机目标</Label>
            <Textarea
              {...register("motivation")}
              id="motivation"
              placeholder="角色的目标和追求..."
              rows={2}
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="strengths">优势特长</Label>
              <Input
                {...register("strengths")}
                id="strengths"
                placeholder="剑术、智谋（用逗号分隔）"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weaknesses">弱点缺陷</Label>
              <Input
                {...register("weaknesses")}
                id="weaknesses"
                placeholder="冲动、多疑（用逗号分隔）"
                disabled={isLoading}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              取消
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
