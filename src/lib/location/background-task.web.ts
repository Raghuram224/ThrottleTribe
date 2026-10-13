// Web has no expo-task-manager (isAvailableAsync is always false there) and no background
// location: tracking runs in the page (tracking.web.ts). Only the shared name is exported.
import { LOCATION_TASK_NAME } from './ride-config';

export const LOCATION_TASK = LOCATION_TASK_NAME;
