import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/settings";

const ALLOWED_KEYS = ["openrouter_api_key", "default_model", "search_model"];

export async function GET() {
  const result: Record<string, string | null> = {};
  for (const key of ALLOWED_KEYS) {
    result[key] = getSetting(key);
  }
  return NextResponse.json(result);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_KEYS.includes(key) && typeof value === "string") {
      setSetting(key, value);
    }
  }
  return NextResponse.json({ ok: true });
}
