import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/settings";
import { PROVIDERS } from "@/lib/shared";

const ALLOWED_KEYS = ["provider", "model", "search_model", "watchlist", "github_token"];

function maskKey(value: string | null): string {
  if (!value) return "";
  return value.length > 4 ? `...${value.slice(-4)}` : "****";
}

export async function GET() {
  try {
    const result: Record<string, string | null> = {};
    for (const key of ALLOWED_KEYS) {
      result[key] = getSetting(key);
    }
    // Return masked per-provider API keys
    const apiKeys: Record<string, string> = {};
    for (const p of PROVIDERS) {
      if (p.needsKey) {
        const val = getSetting(`api_key:${p.id}`);
        apiKeys[p.id] = maskKey(val);
      }
    }
    // Fallback: if legacy "api_key" exists but no per-provider key for current provider
    const currentProvider = result.provider ?? "openrouter";
    if (!getSetting(`api_key:${currentProvider}`)) {
      const legacy = getSetting("api_key");
      if (legacy) apiKeys[currentProvider] = maskKey(legacy);
    }
    result.api_keys = JSON.stringify(apiKeys);
    // Mask sensitive tokens before sending to client
    if (result.github_token) {
      result.github_token = maskKey(result.github_token);
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[settings] Failed to read settings:", error);
    return NextResponse.json(
      { error: "Failed to read settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    for (const [key, value] of Object.entries(body)) {
      if (key === "api_key" && typeof value === "string" && body.provider) {
        // Store as per-provider key
        setSetting(`api_key:${body.provider}`, value);
      } else if (ALLOWED_KEYS.includes(key) && typeof value === "string") {
        setSetting(key, value);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[settings] Failed to update settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
