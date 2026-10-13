// NetInfo's web reachability check defaults to HEAD "/", which on GitHub Pages is not this app
// (a 404 each poll, and a console error). Point it at a file that always exists under the base path.
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  NetInfo.configure({
    reachabilityUrl: `${process.env.EXPO_BASE_URL ?? '/throttletribe/app'}/manifest.webmanifest`,
    reachabilityMethod: 'HEAD',
    reachabilityTest: async (response) => response.status === 200,
    reachabilityLongTimeout: 60 * 1000,
    reachabilityShortTimeout: 5 * 1000,
    reachabilityRequestTimeout: 15 * 1000,
  });
}
