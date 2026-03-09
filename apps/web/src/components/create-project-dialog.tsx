"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

const GENRES = [
  "玄幻", "仙侠", "都市", "科幻", "历史",
  "悬疑", "言情", "武侠", "奇幻", "军事",
] as const;

const manualSchema = z.object({
  title: z.string().min(1, "项目标题不能为空").max(100, "标题最多100个字符"),
  genre: z.string().min(1, "请选择小说类型"),
  description: z.string().optional(),
});

type ManualInput = z.infer<typeof manualSchema>;

type TitleOption = {
  title: string;
  reason: string;
};

interface CreateProjectDialogProps {
  onSuccess?: () => void;
}

export function CreateProjectDialog({ onSuccess }: CreateProjectDialogProps) {
  const { alert } = useAlertDialog();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tab, setTab] = useState<string>("ai");

  // AI 模式状态
  const [aiGenre, setAiGenre] = useState("");
  const [aiRequirements, setAiRequirements] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [titleOptions, setTitleOptions] = useState<TitleOption[]>([]);
  const [selectedTitleIndex, setSelectedTitleIndex] = useState<number>(-1);
  const [generatedDescription, setGeneratedDescription] = useState("");
  const [refinedRequirements, setRefinedRequirements] = useState("");
  const [enableRefineRequirements, setEnableRefineRequirements] = useState(true);
  const [aiStep, setAiStep] = useState<"input" | "select">("input");
  const [hasAiConfig, setHasAiConfig] = useState<boolean | null>(null);

  // 检查用户是否配置了 AI
  useEffect(() => {
    if (open && tab === "ai") {
      fetch("/api/user/settings")
        .then((res) => res.json())
        .then((data) => {
          const s = data.settings;
          setHasAiConfig(!!(s?.aiApiKey || s?.aiProvider));
        })
        .catch(() => setHasAiConfig(false));
    }
  }, [open, tab]);

  // 手动模式表单
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ManualInput>({
    resolver: zodResolver(manualSchema),
  });

  const resetAll = () => {
    reset();
    setAiGenre("");
    setAiRequirements("");
    setTitleOptions([]);
    setSelectedTitleIndex(-1);
    setGeneratedDescription("");
    setRefinedRequirements("");
    setEnableRefineRequirements(true);
    setAiStep("input");
    setTab("ai");
  };

  // 手动创建
  const onManualSubmit = async (data: ManualInput) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "创建失败");
      }

      setOpen(false);
      resetAll();
      onSuccess?.();
      router.refresh();
    } catch (error) {
      console.error("创建项目失败:", error);
      alert(error instanceof Error ? error.message : "创建失败", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // AI 生成标题和简介
  const handleAiGenerate = async () => {
    if (!aiGenre) {
      alert("请选择小说类型", "warning");
      return;
    }
    if (!aiRequirements.trim()) {
      alert("请输入创作需求", "warning");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/projects/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genre: aiGenre,
          requirements: aiRequirements,
          enableRefineRequirements,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "生成失败");
      }

      const data = await response.json();
      setTitleOptions(data.titles || []);
      setGeneratedDescription(data.description || "");
      setRefinedRequirements(data.refinedRequirements || "");
      setSelectedTitleIndex(-1);
      setAiStep("select");
    } catch (error) {
      console.error("AI 生成失败:", error);
      alert(error instanceof Error ? error.message : "生成失败，请重试", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  // AI 模式确认创建
  const handleAiCreate = async () => {
    if (selectedTitleIndex < 0) {
      alert("请选择一个标题", "warning");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleOptions[selectedTitleIndex].title,
          genre: aiGenre,
          description: generatedDescription,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "创建失败");
      }

      setOpen(false);
      resetAll();
      onSuccess?.();
      router.refresh();
    } catch (error) {
      console.error("创建项目失败:", error);
      alert(error instanceof Error ? error.message : "创建失败", "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetAll(); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          创建新项目
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>创建新项目</DialogTitle>
          <DialogDescription>
            选择手动填写或让 AI 帮你生成标题和简介
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ai">
              <Sparkles className="mr-2 h-4 w-4" />
              AI 创建
            </TabsTrigger>
            <TabsTrigger value="manual">手动创建</TabsTrigger>
          </TabsList>

          {/* AI 创建 */}
          <TabsContent value="ai" className="space-y-4 mt-4">
            {hasAiConfig === false && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-yellow-800 dark:text-yellow-200">
                    尚未配置 AI 模型，请先前往
                    <Link href="/settings" className="underline font-medium mx-1">用户设置</Link>
                    配置 AI 服务
                  </p>
                </div>
              </div>
            )}
            {aiStep === "input" && (
              <>
                <div className="space-y-2">
                  <Label>小说类型</Label>
                  <Select value={aiGenre} onValueChange={setAiGenre}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择类型" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENRES.map((genre) => (
                        <SelectItem key={genre} value={genre}>
                          {genre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>创作需求</Label>
                  <Textarea
                    value={aiRequirements}
                    onChange={(e) => setAiRequirements(e.target.value)}
                    placeholder={"描述你想写的小说，例如：\n主角重生回到高中时代，利用前世记忆在商业和感情上逆袭翻盘，同时揭开前世死因的真相..."}
                    rows={5}
                    disabled={isGenerating}
                  />
                  <p className="text-xs text-muted-foreground">
                    描述越详细，AI 生成的标题和简介越精准
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-md border p-3">
                  <Checkbox
                    id="enable-refine-requirements"
                    checked={enableRefineRequirements}
                    onCheckedChange={(checked) => setEnableRefineRequirements(checked === true)}
                    disabled={isGenerating}
                  />
                  <Label htmlFor="enable-refine-requirements" className="cursor-pointer text-sm">
                    优化创作需求（更完整但会更慢）
                  </Label>
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
                  <Button
                    onClick={handleAiGenerate}
                    disabled={isGenerating || !aiGenre || !aiRequirements.trim()}
                  >
                    {isGenerating ? (
                      <>
                        <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                        生成中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        生成标题和简介
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}

            {aiStep === "select" && (
              <>
                {refinedRequirements && (
                  <div className="space-y-2">
                    <Label>AI 理解的创作方案</Label>
                    <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                      {refinedRequirements}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>选择标题</Label>
                  <div className="space-y-2">
                    {titleOptions.map((option, index) => (
                      <div
                        key={index}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedTitleIndex === index
                            ? "border-primary bg-primary/5"
                            : "hover:bg-accent"
                        }`}
                        onClick={() => setSelectedTitleIndex(index)}
                      >
                        <p className="font-semibold">{option.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {option.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>生成的简介</Label>
                  <Textarea
                    value={generatedDescription}
                    onChange={(e) => setGeneratedDescription(e.target.value)}
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground">
                    可以直接编辑修改简介内容
                  </p>
                </div>
                <DialogFooter className="flex justify-between sm:justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setAiStep("input");
                      setTitleOptions([]);
                      setSelectedTitleIndex(-1);
                      setGeneratedDescription("");
                    }}
                    disabled={isLoading || isGenerating}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    重新生成
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpen(false)}
                      disabled={isLoading}
                    >
                      取消
                    </Button>
                    <Button
                      onClick={handleAiCreate}
                      disabled={isLoading || selectedTitleIndex < 0}
                    >
                      {isLoading ? "创建中..." : "确认创建"}
                    </Button>
                  </div>
                </DialogFooter>
              </>
            )}
          </TabsContent>

          {/* 手动创建 */}
          <TabsContent value="manual" className="mt-4">
            <form onSubmit={handleSubmit(onManualSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">项目标题</Label>
                <Input
                  {...register("title")}
                  id="title"
                  placeholder="输入小说标题"
                  disabled={isLoading}
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="genre">小说类型</Label>
                <Select onValueChange={(value) => setValue("genre", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENRES.map((genre) => (
                      <SelectItem key={genre} value={genre}>
                        {genre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.genre && (
                  <p className="text-sm text-destructive">{errors.genre.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">简介（可选）</Label>
                <Textarea
                  {...register("description")}
                  id="description"
                  placeholder="简单描述你的小说构想..."
                  rows={3}
                  disabled={isLoading}
                />
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
