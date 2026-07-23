import { NextRequest, NextResponse } from "next/server";
import { generateBuyerPrompts } from "@/lib/prompts/generate";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const prompts = await generateBuyerPrompts(url);
    return NextResponse.json({ prompts });
  } catch (error) {
    console.error("Error generating prompts:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate prompts. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
