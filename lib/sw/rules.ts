/** LD-FE-11 runtime route rules — pure matchers, unit-tested. */

export const API_ORIGIN = "https://api.simmaps.com";
export const PHOTO_ORIGIN = "https://photos.simmaps.com";

export function isApiRequest(url: URL): boolean {
  return url.origin === API_ORIGIN && url.pathname.startsWith("/v1/");
}

export function isPhotoRequest(url: URL): boolean {
  return url.origin === PHOTO_ORIGIN;
}

/** Only GET photo fetches are cacheable; uploads/other methods pass through. */
export function isCacheablePhoto(url: URL, method: string): boolean {
  return method === "GET" && isPhotoRequest(url);
}
