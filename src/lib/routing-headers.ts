// Request headers for the routing service. The OSRM demo policy asks for an identifying User-Agent
// (docs/design/21 §5.1). Browsers forbid setting it, so the web build sends none (routing-headers.web.ts).
import Constants from 'expo-constants';

/** TODO(team): append the support URL once it is chosen: `ThrottleTribe/<version> (+https://...)`. */
export function routingHeaders(): Record<string, string> {
  return { 'User-Agent': `ThrottleTribe/${Constants.expoConfig?.version ?? '1.0.0'}` };
}
