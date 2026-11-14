import { NextResponse } from "next/server";
import { CONTENT_OPTIONS, exaRequest } from "@/lib/exa";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { url } = await request.json() as { url?: string };
    if (!url) return NextResponse.json({ error: "A source URL is required." }, { status: 400 });
    const data = await exaRequest("/findSimilar", { url, numResults: 5, excludeSourceDomain: false, contents: CONTENT_OPTIONS });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Similar source search failed." }, { status: 502 });
  }
}
