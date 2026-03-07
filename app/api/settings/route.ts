import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/settings";

const ALLOWED_KEYS = ["provider", "api_key", "model", "search_model"];

export async function GET() {
  try {
    const result: Record<string, string | null> = {};
    for (const key of ALLOWED_KEYS) {
      const value = getSetting(key);
      // Mask the API key — only return last 4 chars for display
      if (key === "api_key" && value) {
        result[key] = value.length > 4 ? `...${value.slice(-4)}` : "****";
      } else {
        result[key] = value;
      }
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
      if (ALLOWED_KEYS.includes(key) && typeof value === "string") {
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
