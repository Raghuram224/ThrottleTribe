// Custom entry (Expo Router: https://docs.expo.dev/router/installation/). The location task must be defined before
// anything else loads: Expo Router evaluates route files lazily, so a headless background launch could otherwise
// deliver a location update before `_layout` ran ("No task registered for key expo-task-manager").
// Web resolves `background-task.web.ts`, which defines nothing.
import '@/lib/location/background-task';

// Always last: Expo Router registers the root component.
import 'expo-router/entry';
