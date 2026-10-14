// Browsers forbid setting User-Agent from script.
export function routingHeaders(): Record<string, string> {
  return {};
}
