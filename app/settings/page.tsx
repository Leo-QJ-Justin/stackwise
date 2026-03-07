"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [searchModel, setSearchModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setApiKey(data.openrouter_api_key ?? "");
        setDefaultModel(data.default_model ?? "");
        setSearchModel(data.search_model ?? "");
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        openrouter_api_key: apiKey,
        default_model: defaultModel,
        search_model: searchModel,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mx-auto max-w-xl p-8">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6 gap-1 cursor-pointer">
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </Link>

      <h1 className="font-mono text-xl font-bold text-primary">Settings</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Configure your LLM provider for tool classification.
      </p>

      <div className="flex flex-col gap-6">
        <div>
          <label className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            OpenRouter API Key
          </label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-or-..."
          />
        </div>

        <div>
          <label className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Default Model
          </label>
          <Input
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="anthropic/claude-sonnet-4"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Used for tool classification. Any OpenRouter model ID.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Search Model
          </label>
          <Input
            value={searchModel}
            onChange={(e) => setSearchModel(e.target.value)}
            placeholder="perplexity/sonar"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Web-search-enabled model for when GitHub README is unavailable.
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="cursor-pointer w-fit gap-1.5"
        >
          <Save className="size-3.5" />
          {saved ? "Saved" : saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
