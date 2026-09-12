import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

export type SafeLinkPreview = {
  url: string;
  title: string;
  description?: string;
  siteName: string;
  domain: string;
  image?: string;
  favicon?: string;
};

type SafeResponse = {
  body: Buffer;
  contentType: string;
  finalUrl: URL;
};

const MAX_HTML_BYTES = 512_000;
const MAX_ASSET_BYTES = 5_000_000;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 5_000;

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  const [a, b] = octets;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b !== undefined && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && octets[2] === 100) ||
    (a === 203 && b === 0 && octets[2] === 113) ||
    (a !== undefined && a >= 224)
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0] ?? address;

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:") ||
    (normalized.startsWith("::ffff:") &&
      isPrivateIpv4(normalized.slice("::ffff:".length)))
  );
}

function isPublicAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return !isPrivateIpv4(address);
  if (version === 6) return !isPrivateIpv6(address);
  return false;
}

async function validateUrl(input: string) {
  const url = new URL(input);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }
  if (url.username || url.password)
    throw new Error("URL credentials are not allowed");
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Non-standard ports are not allowed");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Local network hosts are not allowed");
  }

  const literalVersion = isIP(hostname);
  const addresses = literalVersion
    ? [{ address: hostname, family: literalVersion }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new Error("Private or unresolved hosts are not allowed");
  }

  return { url, addresses };
}

async function requestUrl(
  input: string,
  options: { maxBytes: number; accept: string },
  redirects = 0,
): Promise<SafeResponse> {
  const { url, addresses } = await validateUrl(input);
  const selected = addresses[0];
  if (!selected) throw new Error("Host did not resolve");

  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: "GET",
        headers: {
          accept: options.accept,
          "accept-encoding": "identity",
          "user-agent": "UnlumenLinkPreview/1.0 (+https://ui.unlumen.com)",
        },
        lookup: (_hostname, lookupOptions, callback) => {
          if (typeof lookupOptions === "object" && lookupOptions.all) {
            callback(null, [selected]);
            return;
          }

          callback(null, selected.address, selected.family as 4 | 6);
        },
      },
      (response) => {
        const status = response.statusCode ?? 500;
        const location = response.headers.location;

        if (status >= 300 && status < 400 && location) {
          response.resume();
          if (redirects >= MAX_REDIRECTS) {
            reject(new Error("Too many redirects"));
            return;
          }

          const redirectUrl = new URL(location, url).toString();
          void requestUrl(redirectUrl, options, redirects + 1).then(
            resolve,
            reject,
          );
          return;
        }

        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`Remote server returned ${status}`));
          return;
        }

        const declaredLength = Number(response.headers["content-length"] ?? 0);
        if (declaredLength > options.maxBytes) {
          response.destroy(new Error("Remote response is too large"));
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;

        response.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > options.maxBytes) {
            response.destroy(new Error("Remote response is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks),
            contentType: String(response.headers["content-type"] ?? ""),
            finalUrl: url,
          });
        });
        response.on("error", reject);
      },
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("Remote request timed out"));
    });
    request.on("error", reject);
    request.end();
  });
}

function decodeEntities(value: string) {
  const entities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };

  return value
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(
      /&([a-z]+);/gi,
      (entity, name: string) => entities[name.toLowerCase()] ?? entity,
    )
    .replace(/\s+/g, " ")
    .trim();
}

function getAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] ? decodeEntities(match[2]) : undefined;
}

function getMeta(html: string, keys: string[]) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = getAttribute(tag, "property") ?? getAttribute(tag, "name");
    if (key && keys.includes(key.toLowerCase())) {
      const content = getAttribute(tag, "content");
      if (content) return content;
    }
  }
  return undefined;
}

function getFavicon(html: string) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = getAttribute(tag, "rel")?.toLowerCase();
    if (rel?.split(/\s+/).includes("icon")) return getAttribute(tag, "href");
  }
  return undefined;
}

function resolveRemoteUrl(value: string | undefined, base: URL) {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export async function getSafeLinkPreview(
  input: string,
): Promise<SafeLinkPreview> {
  const response = await requestUrl(input, {
    maxBytes: MAX_HTML_BYTES,
    accept: "text/html,application/xhtml+xml",
  });

  if (!response.contentType.toLowerCase().includes("text/html")) {
    throw new Error("The URL did not return HTML");
  }

  const html = response.body.toString("utf8");
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const domain = response.finalUrl.hostname.replace(/^www\./, "");
  const title =
    getMeta(html, ["og:title", "twitter:title"]) ??
    (titleTag ? decodeEntities(titleTag.replace(/<[^>]+>/g, "")) : undefined) ??
    domain;
  const siteName =
    getMeta(html, ["og:site_name"]) ?? domain.split(".")[0] ?? domain;

  return {
    url: response.finalUrl.toString(),
    title: title.slice(0, 200),
    description: getMeta(html, [
      "og:description",
      "twitter:description",
      "description",
    ])?.slice(0, 500),
    siteName: siteName.slice(0, 80),
    domain,
    image: resolveRemoteUrl(
      getMeta(html, ["og:image:secure_url", "og:image", "twitter:image"]),
      response.finalUrl,
    ),
    favicon: resolveRemoteUrl(
      getFavicon(html) ?? "/favicon.ico",
      response.finalUrl,
    ),
  };
}

export async function getSafeRemoteAsset(input: string) {
  const response = await requestUrl(input, {
    maxBytes: MAX_ASSET_BYTES,
    accept:
      "image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml",
  });

  if (!response.contentType.toLowerCase().startsWith("image/")) {
    throw new Error("The URL did not return an image");
  }

  return { body: response.body, contentType: response.contentType };
}
