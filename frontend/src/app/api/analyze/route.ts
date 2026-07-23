import { NextRequest, NextResponse } from "next/server";
import { GeneratedPrompt } from "@/lib/types";
import { analyzeWebsite } from "@/lib/analyze";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = body.url as string;
    const prompts = body.prompts as GeneratedPrompt[];

    if (!url || !prompts || !Array.isArray(prompts)) {
      return NextResponse.json(
        { error: "URL and prompts are required" },
        { status: 400 }
      );
    }

    const result = await analyzeWebsite({ url, prompts });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error analyzing website:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to analyze website",
      },
      { status: 500 }
    );
  }
}
