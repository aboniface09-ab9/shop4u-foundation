/**
 * True only when `candidate` is an absolute http(s) URL on the same origin as
 * the request. Stops the PayFast return/cancel URLs being used as an open
 * redirect to a third-party site.
 */
export function isSameOriginUrl(candidate: string, requestUrl: string): boolean {
  try {
    const target = new URL(candidate);
    if (target.protocol !== "https:" && target.protocol !== "http:") return false;
    return target.origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}
