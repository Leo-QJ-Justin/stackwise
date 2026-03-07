import { NextRequest, NextResponse } from "next/server";
import { classifyAndStore } from "@/lib/classify";

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const { name, description } = body;

  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  try {
    const result = await classifyAndStore({
      name,
      description: description ?? undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[classify] error:", error);
    const message = error instanceof Error ? error.message : "Classification failed";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
