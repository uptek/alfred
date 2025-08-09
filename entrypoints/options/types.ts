/**
 * Type definitions for Alfred options page
 */

export interface AlfredSettings {
  // General Settings
  enabled: boolean;
  theme: 'light' | 'dark' | 'auto';

  // Feature Toggles
  features: {
    themeCustomizer: boolean;
    appStoreEnhancements: boolean;
    collaboratorAccess: boolean;
    partnerFeatures: boolean;
  };

  // Theme Customizer Options
  themeCustomizer: {
    showResizeIndicators: boolean;
    defaultPrimarySidebarWidth: number;
    defaultSecondarySidebarWidth: number;
    rememberPositions: boolean;
    animationSpeed: 'instant' | 'fast' | 'smooth';
  };

  // App Store Search Options
  appStoreSearch: {
    showIndexNumbers: boolean;
    indexStyle: 'badge' | 'inline' | 'tooltip';
    startingIndex: number;
  };

  // Advanced Settings
  advanced: {
    analytics: boolean;
    debugMode: boolean;
    consoleLogging: 'none' | 'errors' | 'verbose';
    performanceMode: 'standard' | 'high';
  };
}

export type SettingKey = keyof AlfredSettings;
export type FeatureKey = keyof AlfredSettings['features'];
