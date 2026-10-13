import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';

/** Longest we hold the first paint for the fonts; after that the system font is used (14 §0.1). */
const FONT_TIMEOUT_MS = 1500;

/** Web: load Inter at runtime. Resolves true when loaded, failed, or after the timeout. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);
  return loaded || !!error || timedOut;
}
