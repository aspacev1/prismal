import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/origin";

function makeRequest(origin: string | null) {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new NextRequest("http://localhost:3000/api/register", {
    method: "POST",
    headers,
  });
}

describe("assertSameOrigin", () => {
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
});
