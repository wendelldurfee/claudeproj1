import type { ExamBank } from '../../src/core/types';
import { CLOUD_BANK } from './cloud';
import { NETWORKING_BANK } from './networking';

/**
 * Banks bundled with the app and installed on first launch.
 *
 * These are original questions written for this project — the app is the
 * simulator, and real exam content comes from whatever you import.
 */
export const SAMPLE_BANKS: ExamBank[] = [NETWORKING_BANK, CLOUD_BANK];

export { CLOUD_BANK, NETWORKING_BANK };
