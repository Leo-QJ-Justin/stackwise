import { NextRequest, NextResponse } from "next/server";
import { classifyAndStore } from "@/lib/classify";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const result = await classifyAndStore({
      name,
      description: description ?? undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[classify] error:", error);
    return NextResponse.json(
      { error: "Classification failed" },
      { status: 500 }
    );
  }
}
