import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const hasKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 20;

  return NextResponse.json(
    {
      ok: true,
      hasKey,
      hint: hasKey
        ? "OPENAI_API_KEY is present."
        : "Missing OPENAI_API_KEY. Add it in your environment variables.",
      time: new Date().toISOString(),
    },
    { status: 200 }
  );
}