/**
 * Type definitions for Alfred options page
 */

export interface AlfredSettings {
  themeCustomizer?: {
    inspector?: 'default' | 'disable' | 'restore';
    resizers?: {
      primarySidebar?: boolean;
      secondarySidebar?: boolean;
      mainHorizontal?: boolean;
      mainVertical?: boolean;
    };
  };
}
