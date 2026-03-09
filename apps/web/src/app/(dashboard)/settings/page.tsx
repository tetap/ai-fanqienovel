"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save } from "lucide-react";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

export default function UserSettingsPage() {
  const { alert } = useAlertDialog();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [aiProvider, setAiProvider] = useState("openai");
  const [aiModel, setAiModel] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [imageProvider, setImageProvider] = useState("openai");
  const [imageModel, setImageModel] = useState("");
  const [imageApiKey, setImageApiKey] = useState("");
  const [imageBaseUrl, setImageBaseUrl] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/user/settings");
      if (response.ok) {
        const data = await response.json();
        const s = data.settings;
        setAiProvider(s.aiProvider || "openai");
        setAiModel(s.aiModel || "");
        setAiApiKey(s.aiApiKey || "");
        setAiBaseUrl(s.aiBaseUrl || "");
        setImageProvider(s.imageProvider || "openai");
        setImageModel(s.imageModel || "");
        setImageApiKey(s.imageApiKey || "");
        setImageBaseUrl(s.imageBaseUrl || "");
      }
    } catch (error) {
      console.error("获取设置失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiProvider: aiProvider || null,
          aiModel: aiModel || null,
          aiApiKey: aiApiKey || null,
          aiBaseUrl: aiBaseUrl || null,
          imageProvider: imageProvider || null,
          imageModel: imageModel || null,
          imageApiKey: imageApiKey || null,
          imageBaseUrl: imageBaseUrl || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`保存失败: ${error.error || "未知错误"}`, "error");
        return;
      }

      alert("保存成功", "success");
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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">用户设置</h1>
          <p className="text-muted-foreground mt-1">
            配置默认的 AI 服务，新项目将自动使用此配置
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* AI 配置 */}
        <Card>
          <CardHeader>
            <CardTitle>AI 配置</CardTitle>
            <CardDescription>
              配置默认使用的 AI 服务和模型，项目未单独配置时将使用此设置
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="aiProvider">AI 提供商</Label>
              <Select
                value={aiProvider}
                onValueChange={setAiProvider}
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
                id="aiModel"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
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
                id="aiBaseUrl"
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
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
              <Label htmlFor="aiApiKey">API Key</Label>
              <Input
                id="aiApiKey"
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder="留空使用系统环境变量"
              />
              <p className="text-xs text-muted-foreground">
                配置 AI 服务的 API Key，留空使用系统环境变量
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
                value={imageProvider}
                onValueChange={setImageProvider}
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
                id="imageModel"
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value)}
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
                id="imageBaseUrl"
                value={imageBaseUrl}
                onChange={(e) => setImageBaseUrl(e.target.value)}
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
                id="imageApiKey"
                type="password"
                value={imageApiKey}
                onChange={(e) => setImageApiKey(e.target.value)}
                placeholder={
                  imageProvider === "google"
                    ? "留空使用系统环境变量"
                    : imageProvider === "qwen"
                      ? "留空使用系统环境变量"
                      : "留空使用系统环境变量"
                }
              />
              <p className="text-xs text-muted-foreground">
                图像模型专用 API Key，留空使用系统环境变量
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "保存中..." : "保存设置"}
          </Button>
        </div>
      </div>
    </div>
  );
}
