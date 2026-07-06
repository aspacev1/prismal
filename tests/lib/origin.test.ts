import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/origin";

function makeRequest(origin: string | null, url = "http://localhost:3000/api/register") {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new NextRequest(url, {
    method: "POST",
    headers,
  });
}

describe("assertSameOrigin", () => {
  afterEach(() => {
    delete process.env.DOMAIN;
  });

  it("allows a request with a matching origin", () => {
    expect(assertSameOrigin(makeRequest("http://localhost:3000"))).toBeNull();
  });

  it("allows a request with no origin header", () => {
    expect(assertSameOrigin(makeRequest(null))).toBeNull();
  });

  it("rejects a request with a mismatched origin", () => {
    const result = assertSameOrigin(makeRequest("http://evil.example.com"));
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  it("uses DOMAIN env var when set — allows matching browser origin", () => {
    process.env.DOMAIN = "https://myapp.example.com";
    expect(assertSameOrigin(makeRequest("https://myapp.example.com"))).toBeNull();
  });

  it("uses DOMAIN env var when set — rejects non-matching origin", () => {
    process.env.DOMAIN = "https://myapp.example.com";
    // Browser sends the public origin; request.url is still localhost (as inside a container)
    const result = assertSameOrigin(makeRequest("https://myapp.example.com", "http://localhost:3000/api/x"));
    expect(result).toBeNull();
  });

  it("uses DOMAIN env var when set — rejects a spoofed localhost origin", () => {
    process.env.DOMAIN = "https://myapp.example.com";
    const result = assertSameOrigin(makeRequest("http://localhost:3000"));
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  it("falls back to request.url origin when DOMAIN is unset", () => {
    delete process.env.DOMAIN;
    expect(assertSameOrigin(makeRequest("http://localhost:3000"))).toBeNull();
  });
});
