import { describe, expect, it } from "vitest";
import {
  isApiRequest,
  isCacheablePhoto,
  isPhotoRequest,
} from "@lib/sw/rules";

const u = (s: string) => new URL(s);

describe("sw route rules (LD-FE-11)", () => {
  it("API requests are /v1/* on api.simmaps.com only", () => {
    expect(isApiRequest(u(`https://api.simmaps.com/v1/doses`))).toBe(true);
    expect(isApiRequest(u(`https://api.simmaps.com/v1`))).toBe(false);
    expect(isApiRequest(u(`https://api.simmaps.com/health`))).toBe(false);
    expect(isApiRequest(u(`https://photos.simmaps.com/v1/x`))).toBe(false);
    expect(isApiRequest(u("https://api.simmaps.com.evil.com/v1/x"))).toBe(
      false,
    );
  });

  it("photos match photos.simmaps.com origin only", () => {
    expect(isPhotoRequest(u(`https://photos.simmaps.com/catalog/e1/A/x.jpg`))).toBe(true);
    expect(isPhotoRequest(u("https://photos.simmaps.com.evil.com/x"))).toBe(
      false,
    );
    expect(isPhotoRequest(u(`https://api.simmaps.com/v1/x`))).toBe(false);
  });

  it("only GET photo requests are cacheable", () => {
    const url = u(`https://photos.simmaps.com/a.jpg`);
    expect(isCacheablePhoto(url, "GET")).toBe(true);
    expect(isCacheablePhoto(url, "HEAD")).toBe(false);
    expect(isCacheablePhoto(url, "PUT")).toBe(false);
  });

  it("API calls bypass cache; photos and app shell do not", () => {
    expect(isApiRequest(u(`https://api.simmaps.com/v1/me`))).toBe(true);
    expect(isApiRequest(u(`https://photos.simmaps.com/a.jpg`))).toBe(false);
    expect(isApiRequest(u("https://app.simmaps.com/today"))).toBe(false);
  });
});
