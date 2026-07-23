import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function absUrl(base: string, maybe: string | undefined | null): string | null {
  if (!maybe) return null;
  try {
    return new URL(maybe, base).toString();
  } catch {
    return null;
  }
}

function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      "i"
    );
    const m = html.match(re) || html.match(re2);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function pageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1]?.trim() || null;
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try {
        return String.fromCodePoint(parseInt(d, 10));
      } catch {
        return "";
      }
    })
    .replace(/[\u0000-\u001F\u007F-\u009F\uFFFD\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: NextRequest) {
  const domain = (req.nextUrl.searchParams.get("domain") || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .split("/")[0];

  if (!domain || !domain.includes(".")) {
    return NextResponse.json({ error: "domain required" }, { status: 400 });
  }

  const site = `https://${domain}`;
  try {
    const res = await fetch(site, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VizionPreview/1.0; +https://localhost)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(4000),
      redirect: "follow",
    });
    const html = await res.text();
    const title = decodeEntities(
      metaContent(html, ["og:title", "twitter:title"]) ||
        pageTitle(html) ||
        domain
    );
    const descriptionRaw = metaContent(html, [
      "og:description",
      "twitter:description",
      "description",
    ]);
    const description = descriptionRaw
      ? decodeEntities(descriptionRaw).slice(0, 180)
      : null;
    const image =
      absUrl(
        site,
        metaContent(html, ["og:image", "twitter:image", "twitter:image:src"])
      ) || null;

    return NextResponse.json({
      domain,
      url: site,
      title: title.slice(0, 120) || domain,
      description,
      image,
    });
  } catch {
    return NextResponse.json({
      domain,
      url: site,
      title: domain,
      description: null,
      image: null,
    });
  }
}
