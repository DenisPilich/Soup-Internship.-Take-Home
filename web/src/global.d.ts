import type { RunState } from './runStore';

declare global {
  interface Window {
    // Read-only test hook: the exact state the page renders from.
    __getRunState?: () => RunState;
  }
}

export {};
