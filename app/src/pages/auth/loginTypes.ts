declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: GoogleIdConfiguration) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          prompt?: (momentListener?: (notification: GooglePromptNotification) => void) => void;
          disableAutoSelect?: () => void;
        };
      };
    };
  }
}

export type GoogleIdConfiguration = {
  client_id: string;
  callback: (response: { credential?: string }) => void;
  ux_mode?: 'popup' | 'redirect';
  auto_select?: boolean;
};

export type GooglePromptNotification = {
  isNotDisplayed: () => boolean;
  getNotDisplayedReason: () => string;
  isSkippedMoment: () => boolean;
  getSkippedReason: () => string;
};

export type AuthMode = 'login' | 'register';

export type GraphPoint = {
  id: number;
  x: number;
  y: number;
  color: string;
  links: number[];
};

export const NODE_COLORS = ['#6366f1', '#38bdf8', '#22d3ee', '#f97316', '#22c55e', '#f43f5e', '#a855f7'];

export const randomColor = () => NODE_COLORS[Math.floor(Math.random() * NODE_COLORS.length)];
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
