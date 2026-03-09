"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, QrCode, Unplug, ExternalLink } from "lucide-react";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

const updateProjectSchema = z.object({
  title: z.string().min(1, "项目标题不能为空"),
  genre: z.string().min(1, "请选择小说类型"),
  description: z.string().optional(),
  aiProvider: z.enum(["openai", "anthropic"]),
  aiModel: z.string().optional(),
  aiApiKey: z.string().optional(),
  aiBaseUrl: z.string().optional(),
  imageProvider: z.enum(["openai", "google", "qwen"]).optional(),
  imageModel: z.string().optional(),
  imageApiKey: z.string().optional(),
  imageBaseUrl: z.string().optional(),
});

type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

const GENRES = [
  "玄幻", "仙侠", "都市", "科幻", "历史",
  "悬疑", "言情", "武侠", "奇幻", "军事",
] as const;

export default function ProjectEditPage() {
  const params = useParams();
  const router = useRouter();
  const { alert } = useAlertDialog();
  const projectId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [tomatoBound, setTomatoBound] = useState(false);
  const [tomatoSavedAt, setTomatoSavedAt] = useState<string>("");
  const [tomatoCookiesCount, setTomatoCookiesCount] = useState(0);
  const [tomatoAuthorName, setTomatoAuthorName] = useState("");
  const [tomatoAuthorAvatar, setTomatoAuthorAvatar] = useState("");
  const [tomatoBookId, setTomatoBookId] = useState("");
  const [tomatoCopySources, setTomatoCopySources] = useState<
    Array<{ projectId: string; projectTitle: string; bookId: string; authorName?: string }>
  >([]);
  const [selectedTomatoSourceProjectId, setSelectedTomatoSourceProjectId] = useState("");
  const [isTomatoBookIdSaving, setIsTomatoBookIdSaving] = useState(false);
  const [isTomatoCopying, setIsTomatoCopying] = useState(false);
  const [tomatoSessionId, setTomatoSessionId] = useState<string>("");
  const [tomatoQrCode, setTomatoQrCode] = useState<string>("");
  const [tomatoLoginStatus, setTomatoLoginStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [isTomatoTesting, setIsTomatoTesting] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UpdateProjectInput>({
    resolver: zodResolver(updateProjectSchema),
  });

  const aiProvider = watch("aiProvider");
  const imageProvider = watch("imageProvider");

  useEffect(() => {
    fetchProject();
    fetchTomatoBinding();
  }, [projectId]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const fetchProject = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (response.ok) {
        const data = await response.json();
        const project = data.project;
        setValue("title", project.title);
        setValue("genre", project.genre);
        setValue("description", project.description || "");
        setValue("aiProvider", project.aiProvider || "openai");
        setValue("aiModel", project.aiModel || "");
        setValue("aiApiKey", project.aiApiKey || "");
        setValue("aiBaseUrl", project.aiBaseUrl || "");
        setValue("imageProvider", project.imageProvider || "openai");
        setValue("imageModel", project.imageModel || "");
        setValue("imageApiKey", project.imageApiKey || "");
        setValue("imageBaseUrl", project.imageBaseUrl || "");
      }
    } catch (error) {
      console.error("获取项目失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTomatoBinding = async () => {
    try {
      const response = await fetch(
        `/api/integrations/tomato/binding?projectId=${encodeURIComponent(projectId)}`
      );
      if (!response.ok) return;
      const data = await response.json();
      setTomatoBound(!!data.bound);
      setTomatoSavedAt(data.savedAt || "");
      setTomatoCookiesCount(data.cookiesCount || 0);
      setTomatoAuthorName(data.authorName || "");
      setTomatoAuthorAvatar(data.authorAvatar || "");
      setTomatoBookId(data.bookId || "");
      setTomatoCopySources(Array.isArray(data.copySources) ? data.copySources : []);
    } catch (error) {
      console.error("获取番茄绑定状态失败:", error);
    }
  };

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const startTomatoLogin = async () => {
    setTomatoLoginStatus("pending");
    try {
      const response = await fetch("/api/integrations/tomato/login/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "发起扫码失败");
      }

      setTomatoSessionId(data.sessionId);
      setTomatoQrCode(data.qrCode);

      stopPolling();
      pollTimerRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `/api/integrations/tomato/login/status?sessionId=${encodeURIComponent(
              data.sessionId
            )}`
          );
          const statusData = await statusRes.json();
          if (!statusRes.ok) {
            throw new Error(statusData.error || "轮询状态失败");
          }

          if (statusData.status === "pending") {
            if (statusData.qrCode) {
              setTomatoQrCode(statusData.qrCode);
            }
            return;
          }

          if (statusData.status === "success") {
            stopPolling();
            setTomatoLoginStatus("success");
            setTomatoQrCode("");
            setTomatoSessionId("");
            await fetchTomatoBinding();
            alert("番茄绑定成功", "success");
            return;
          }

          stopPolling();
          setTomatoLoginStatus("error");
          setTomatoSessionId("");
          setTomatoQrCode("");
          alert(statusData.message || "扫码会话已结束", "error");
        } catch (err) {
          stopPolling();
          setTomatoLoginStatus("error");
          alert(err instanceof Error ? err.message : "扫码状态检查失败", "error");
        }
      }, 2000);
    } catch (error) {
      setTomatoLoginStatus("error");
      alert(error instanceof Error ? error.message : "发起扫码失败", "error");
    }
  };

  const cancelTomatoLogin = async () => {
    if (!tomatoSessionId) {
      setTomatoQrCode("");
      setTomatoLoginStatus("idle");
      return;
    }
    try {
      await fetch("/api/integrations/tomato/login/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: tomatoSessionId }),
      });
    } catch (error) {
      console.error("取消番茄扫码失败:", error);
    } finally {
      stopPolling();
      setTomatoSessionId("");
      setTomatoQrCode("");
      setTomatoLoginStatus("idle");
    }
  };

  const unbindTomatoAccount = async () => {
    try {
      const response = await fetch(
        `/api/integrations/tomato/binding?projectId=${encodeURIComponent(projectId)}`,
        {
        method: "DELETE",
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "解绑失败");
      }
      setTomatoBound(false);
      setTomatoSavedAt("");
      setTomatoCookiesCount(0);
      setTomatoAuthorName("");
      setTomatoAuthorAvatar("");
      setTomatoBookId("");
      alert("已解绑番茄账号", "success");
    } catch (error) {
      alert(error instanceof Error ? error.message : "解绑失败", "error");
    }
  };

  const saveTomatoBookId = async () => {
    if (!tomatoBookId.trim()) {
      alert("请输入书籍ID", "error");
      return;
    }
    setIsTomatoBookIdSaving(true);
    try {
      const response = await fetch("/api/integrations/tomato/binding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: tomatoBookId.trim(), projectId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "保存书籍ID失败");
      }
      alert("书籍ID保存成功", "success");
      await fetchTomatoBinding();
    } catch (error) {
      alert(error instanceof Error ? error.message : "保存书籍ID失败", "error");
    } finally {
      setIsTomatoBookIdSaving(false);
    }
  };

  const copyTomatoDataFromProject = async () => {
    if (!selectedTomatoSourceProjectId) {
      alert("请选择要复制的项目", "warning");
      return;
    }
    setIsTomatoCopying(true);
    try {
      const response = await fetch("/api/integrations/tomato/binding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceProjectId: selectedTomatoSourceProjectId,
          projectId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "复制失败");
      }
      if (data.bookId) {
        setTomatoBookId(data.bookId);
      }
      alert("已复制番茄数据到当前项目", "success");
      await fetchTomatoBinding();
    } catch (error) {
      alert(error instanceof Error ? error.message : "复制失败", "error");
    } finally {
      setIsTomatoCopying(false);
    }
  };

  const testOpenTomato = async () => {
    setIsTomatoTesting(true);
    try {
      const response = await fetch("/api/integrations/tomato/test-open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "测试打开失败");
      }
      alert(`已打开番茄页面：${data.url}`, "success");
    } catch (error) {
      alert(error instanceof Error ? error.message : "测试打开失败", "error");
    } finally {
      setIsTomatoTesting(false);
    }
  };

  const onSubmit = async (data: UpdateProjectInput) => {
    setIsSaving(true);
    try {
      // 更新基本信息
      const basicResponse = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          genre: data.genre,
          description: data.description,
        }),
      });

      if (!basicResponse.ok) {
        const error = await basicResponse.json();
        console.error("更新基本信息失败:", error);
        alert(`保存失败: ${error.error || "未知错误"}`, "error");
        return;
      }

      // 更新 AI 配置
      const aiResponse = await fetch(`/api/projects/${projectId}/ai-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiProvider: data.aiProvider,
          aiModel: data.aiModel || null,
          aiApiKey: data.aiApiKey || null,
          aiBaseUrl: data.aiBaseUrl || null,
          imageProvider: data.imageProvider || "openai",
          imageModel: data.imageModel || null,
          imageApiKey: data.imageApiKey || null,
          imageBaseUrl: data.imageBaseUrl || null,
        }),
      });

      if (!aiResponse.ok) {
        const error = await aiResponse.json();
        console.error("更新 AI 配置失败:", error);
        alert(`保存失败: ${error.error || "未知错误"}`, "error");
        return;
      }

      alert("保存成功", "success");
      router.push(`/projects/${projectId}`);
    } catch (error) {
      console.error("保存失败:", error);
      alert(`保存失败：${error instanceof Error ? error.message : "请稍后重试"}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  return (
    <div>
      <Button variant="ghost" asChild className="mb-4">
        <Link href={`/projects/${projectId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回项目
        </Link>
      </Button>

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">项目设置</h1>
          <p className="text-muted-foreground mt-1">
            管理项目基本信息和 AI 配置
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* 基本信息 */}
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
            <CardDescription>项目的基本设置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">项目标题 *</Label>
              <Input
                {...register("title")}
                id="title"
                placeholder="输入小说标题"
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="genre">小说类型 *</Label>
              <Select
                value={watch("genre")}
                onValueChange={(value) => setValue("genre", value)}
              >
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
              <Label htmlFor="description">简介</Label>
              <Textarea
                {...register("description")}
                id="description"
                placeholder="简单描述你的小说构想..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* 番茄作家绑定 */}
        <Card>
          <CardHeader>
            <CardTitle>番茄作家绑定</CardTitle>
            <CardDescription>
              绑定番茄作家账号后，可复用登录态执行后续自动化发布流程
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={tomatoBound ? "default" : "secondary"}>
                {tomatoBound ? "已绑定" : "未绑定"}
              </Badge>
              {tomatoBound && (
                <div className="flex items-center gap-2">
                  {tomatoAuthorAvatar ? (
                    <img
                      src={tomatoAuthorAvatar}
                      alt="番茄作者头像"
                      className="h-6 w-6 rounded-full border object-cover"
                    />
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {tomatoAuthorName ? `作者：${tomatoAuthorName} | ` : ""}
                    Cookies: {tomatoCookiesCount} | 绑定时间: {tomatoSavedAt || "未知"}
                  </p>
                </div>
              )}
            </div>

            {tomatoBound && (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="tomatoBookId">书籍ID</Label>
                  <Input
                    id="tomatoBookId"
                    value={tomatoBookId}
                    onChange={(e) => setTomatoBookId(e.target.value)}
                    placeholder="请输入番茄书籍ID"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={saveTomatoBookId}
                  disabled={isTomatoBookIdSaving}
                >
                  {isTomatoBookIdSaving ? "保存中..." : "保存书籍ID"}
                </Button>
              </div>
            )}

            {tomatoCopySources.length > 0 && (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label>复制已有项目的番茄数据</Label>
                  <Select
                    value={selectedTomatoSourceProjectId}
                    onValueChange={setSelectedTomatoSourceProjectId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择已有项目" />
                    </SelectTrigger>
                    <SelectContent>
                      {tomatoCopySources.map((item) => (
                        <SelectItem key={item.projectId} value={item.projectId}>
                          {item.projectTitle}（书籍ID: {item.bookId}
                          {item.authorName ? ` / 作者: ${item.authorName}` : ""}）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={copyTomatoDataFromProject}
                  disabled={!selectedTomatoSourceProjectId || isTomatoCopying}
                >
                  {isTomatoCopying ? "复制中..." : "复制到当前项目"}
                </Button>
              </div>
            )}

            {!tomatoQrCode && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={startTomatoLogin}
                  disabled={tomatoLoginStatus === "pending"}
                >
                  <QrCode
                    className={`mr-2 h-4 w-4 ${
                      tomatoLoginStatus === "pending" ? "animate-pulse" : ""
                    }`}
                  />
                  {tomatoLoginStatus === "pending" ? "处理中..." : "扫码绑定番茄"}
                </Button>
                {tomatoBound && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={testOpenTomato}
                      disabled={isTomatoTesting}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {isTomatoTesting ? "打开中..." : "测试打开"}
                    </Button>
                    <Button type="button" variant="outline" onClick={unbindTomatoAccount}>
                      <Unplug className="mr-2 h-4 w-4" />
                      解绑
                    </Button>
                  </>
                )}
              </div>
            )}

            {tomatoQrCode && (
              <div className="rounded-md border p-4 space-y-3">
                <p className="text-sm font-medium">请用番茄作家助手扫码登录</p>
                <img
                  src={tomatoQrCode}
                  alt="番茄扫码二维码"
                  className="h-44 w-44 rounded border object-contain"
                />
                <p className="text-xs text-muted-foreground">
                  状态：{tomatoLoginStatus === "pending" ? "等待扫码/确认中" : tomatoLoginStatus}
                </p>
                <Button type="button" variant="outline" onClick={cancelTomatoLogin}>
                  取消扫码
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI 配置 */}
        <Card>
          <CardHeader>
            <CardTitle>AI 配置</CardTitle>
            <CardDescription>
              配置此项目使用的 AI 服务和模型
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="aiProvider">AI 提供商 *</Label>
              <Select
                value={aiProvider}
                onValueChange={(value) => setValue("aiProvider", value as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                选择用于生成内容的 AI 服务提供商
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="aiModel">模型名称（可选）</Label>
              <Input
                {...register("aiModel")}
                id="aiModel"
                placeholder={
                  aiProvider === "openai"
                    ? "默认: gpt-4o-mini"
                    : "默认: claude-3-5-sonnet-20241022"
                }
              />
              <p className="text-xs text-muted-foreground">
                留空使用默认模型。可选值：
                {aiProvider === "openai"
                  ? " gpt-4o, gpt-4o-mini, gpt-4-turbo"
                  : " claude-3-5-sonnet-20241022, claude-3-opus-20240229"}
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="aiBaseUrl">API Base URL（可选）</Label>
              <Input
                {...register("aiBaseUrl")}
                id="aiBaseUrl"
                placeholder={
                  aiProvider === "openai"
                    ? "默认: https://api.openai.com/v1"
                    : "默认: https://api.anthropic.com"
                }
              />
              <p className="text-xs text-muted-foreground">
                自定义 API 端点，支持代理或第三方兼容服务
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="aiApiKey">项目专用 API Key（可选）</Label>
              <Input
                {...register("aiApiKey")}
                id="aiApiKey"
                type="password"
                placeholder="留空使用用户默认配置"
              />
              <p className="text-xs text-muted-foreground">
                为此项目单独配置 API Key，优先级高于用户默认配置
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 图像模型配置 */}
        <Card>
          <CardHeader>
            <CardTitle>图像模型配置</CardTitle>
            <CardDescription>
              配置用于生成封面图的图像模型
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="imageProvider">图像服务提供商</Label>
              <Select
                value={imageProvider || "openai"}
                onValueChange={(value) => setValue("imageProvider", value as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI (DALL-E)</SelectItem>
                  <SelectItem value="google">Google (Imagen)</SelectItem>
                  <SelectItem value="qwen">通义千问 (通义万相)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                选择用于生成封面图的图像服务
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="imageModel">图像模型名称（可选）</Label>
              <Input
                {...register("imageModel")}
                id="imageModel"
                placeholder={
                  imageProvider === "google"
                    ? "默认: imagen-3.0-generate-002"
                    : imageProvider === "qwen"
                      ? "默认: qwen-image-2.0-pro"
                      : "默认: dall-e-3"
                }
              />
              <p className="text-xs text-muted-foreground">
                留空使用默认模型。可选值：
                {imageProvider === "google"
                  ? " imagen-3.0-generate-002, imagen-3.0-generate-001"
                  : imageProvider === "qwen"
                    ? " qwen-image-2.0-pro, wanx2.1-t2i-turbo, wanx2.1-t2i-plus"
                    : " dall-e-3, dall-e-2, gpt-image-1"}
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="imageBaseUrl">
                {imageProvider === "google"
                  ? "Google API 代理地址（可选）"
                  : imageProvider === "qwen"
                    ? "DashScope API 地址（可选）"
                    : "图像 API Base URL（可选）"}
              </Label>
              <Input
                {...register("imageBaseUrl")}
                id="imageBaseUrl"
                placeholder={
                  imageProvider === "google"
                    ? "无法直连时填写代理地址"
                    : imageProvider === "qwen"
                      ? "默认: https://dashscope.aliyuncs.com"
                      : "默认使用 OpenAI 官方地址"
                }
              />
              <p className="text-xs text-muted-foreground">
                {imageProvider === "google"
                  ? "无法直连 Google 时，可配置代理地址"
                  : imageProvider === "qwen"
                    ? "自定义 DashScope API 端点"
                    : "自定义 API 端点，支持 OpenAI 兼容服务"}
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="imageApiKey">
                {imageProvider === "google"
                  ? "Google API Key（可选）"
                  : imageProvider === "qwen"
                    ? "DashScope API Key（可选）"
                    : "图像模型 API Key（可选）"}
              </Label>
              <Input
                {...register("imageApiKey")}
                id="imageApiKey"
                type="password"
                placeholder={
                  imageProvider === "google"
                    ? "留空使用用户默认配置"
                    : imageProvider === "qwen"
                      ? "留空使用用户默认配置"
                      : "留空使用用户默认配置"
                }
              />
              <p className="text-xs text-muted-foreground">
                图像模型专用 API Key，留空则使用用户默认配置
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/projects/${projectId}`)}
          >
            取消
          </Button>
          <Button type="submit" disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "保存中..." : "保存设置"}
          </Button>
        </div>
      </form>
    </div>
  );
}
