"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { PROVIDERS } from "@/lib/shared";

export default function SettingsPage() {
  const [provider, setProvider] = useState("openrouter");
  const [apiKey, setApiKey] = useState("");
  // Stores masked keys per provider from the server
  const [apiKeyMasks, setApiKeyMasks] = useState<Record<string, string>>({});
  const [apiKeyChanged, setApiKeyChanged] = useState(false);
  const [model, setModel] = useState("");
  const [searchModel, setSearchModel] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [githubTokenMask, setGithubTokenMask] = useState("");
  const [githubTokenChanged, setGithubTokenChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => {
        if (!res.ok) throw new Error(`Settings fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setProvider(data.provider ?? "openrouter");
        setModel(data.model ?? "");
        setSearchModel(data.search_model ?? "");
        if (data.github_token) {
          setGithubTokenMask(data.github_token);
        }
        if (data.api_keys) {
          try {
            setApiKeyMasks(JSON.parse(data.api_keys));
          } catch {}
        }
      })
      .catch((err) => console.error("[settings] Failed to load:", err));
  }, []);

  const selectedProvider = PROVIDERS.find((p) => p.id === provider);
  const needsKey = selectedProvider?.needsKey ?? true;
  const currentMask = apiKeyMasks[provider] ?? "";

  function handleProviderChange(newProvider: string) {
    setProvider(newProvider);
    const p = PROVIDERS.find((x) => x.id === newProvider);
    if (p?.defaultModel) {
      setModel(p.defaultModel);
    } else {
      setModel("");
    }
    // Reset the "editing" state — the mask for the new provider is already in apiKeyMasks
    setApiKey("");
    setApiKeyChanged(false);
  }

  async function handleSave() {
    setSaving(true);
    const payload: Record<string, string> = {
      provider,
      model,
      search_model: searchModel,
    };
    if (apiKeyChanged) {
      payload.api_key = apiKey;
    }
    if (githubTokenChanged) {
      payload.github_token = githubToken;
    }
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("[settings] Save failed:", res.status);
      setSaving(false);
      return;
    }
    setSaving(false);
    setSaved(true);
    if (apiKeyChanged) {
      const mask = apiKey.length > 4 ? `...${apiKey.slice(-4)}` : "****";
      setApiKeyMasks((prev) => ({ ...prev, [provider]: mask }));
      setApiKey("");
      setApiKeyChanged(false);
    }
    if (githubTokenChanged) {
      const mask = githubToken.length > 4 ? `...${githubToken.slice(-4)}` : "****";
      setGithubTokenMask(mask);
      setGithubToken("");
      setGithubTokenChanged(false);
    }
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
            Provider
          </label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            <optgroup label="Local (no API key)">
              {PROVIDERS.filter((p) => p.group === "local").map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </optgroup>
            <optgroup label="Cloud Providers">
              {PROVIDERS.filter((p) => p.group === "cloud").map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </optgroup>
            <optgroup label="Meta Providers (200+ models)">
              {PROVIDERS.filter((p) => p.group === "meta").map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </optgroup>
          </select>
          {selectedProvider && (
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedProvider.hint}
            </p>
          )}
        </div>

        {needsKey && (
          <div>
            <label className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              API Key
            </label>
            <Input
              type="password"
              value={apiKeyChanged ? apiKey : ""}
              onChange={(e) => {
                setApiKey(e.target.value);
                setApiKeyChanged(true);
              }}
              placeholder={currentMask || "Enter API key..."}
            />
            {currentMask && !apiKeyChanged && (
              <p className="mt-1 text-xs text-muted-foreground">
                Key saved ({currentMask}). Enter a new value to replace it.
              </p>
            )}
          </div>
        )}

        {provider !== "claude-cli" && (
          <div>
            <label className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Model
            </label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={selectedProvider?.defaultModel ?? "model-id"}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Model ID for tool classification.
            </p>
          </div>
        )}

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

        <div>
          <label className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            GitHub Token
          </label>
          <Input
            type="password"
            value={githubTokenChanged ? githubToken : ""}
            onChange={(e) => {
              setGithubToken(e.target.value);
              setGithubTokenChanged(true);
            }}
            placeholder={githubTokenMask || "ghp_... (optional)"}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {githubTokenMask && !githubTokenChanged
              ? `Token saved (${githubTokenMask}). Enter a new value to replace it.`
              : "Increases GitHub API rate limit from 60 to 5,000 req/hr for README fetching."}
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
