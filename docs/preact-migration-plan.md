# Preact Migration Plan for Options Page

## Overview
This document outlines the migration strategy for converting the Alfred extension's options page from vanilla HTML/TypeScript to Preact, aligning with the existing Preact setup already used in other entrypoints.

## Current State Analysis

### Current Architecture
- **Location**: `/entrypoints/options/`
- **Structure**: Vanilla HTML/TypeScript with HTML template imports
- **Styling**: CSS with Shopify Polaris Web Components
- **Components**:
  - `nav.html` - Navigation sidebar
  - `settings.html` - Settings page content
  - `changelog.html` - Changelog display
- **Main Logic**: `options.main.ts` handles initialization, navigation, and settings management

### Existing Preact Infrastructure
- **Already Configured**: Preact is installed and configured in `wxt.config.ts`
- **Other Preact Pages**:
  - `/entrypoints/collaborator-access.content/`
  - `/entrypoints/appstore-partners.content/`
- **Build System**: Vite with Preact preset configured

## Migration Strategy

### Phase 1: Setup and Configuration (Day 1)
1. **Create new Preact entry point**
   - Create `/entrypoints/options.tsx` as the main Preact entry
   - Update `index.html` to load the Preact app
   - Ensure Shopify Polaris Web Components compatibility

2. **File Structure**
   ```
   /entrypoints/options/
   ├── index.html (simplified)
   ├── options.tsx (new main entry)
   ├── App.tsx (main component)
   ├── components/
   │   ├── Navigation.tsx
   │   ├── Settings.tsx
   │   └── Changelog.tsx
   ├── hooks/
   │   └── useSettings.ts
   └── types.ts
   ```

### Phase 2: Component Migration (Day 2-3)

#### Navigation Component
- Convert `nav.html` to `Navigation.tsx`
- Implement routing using Preact Router or custom state management
- Maintain URL state management for deep linking

#### Settings Component
- Convert `settings.html` to `Settings.tsx`
- Create reusable form components for Polaris elements
- Implement proper state management for settings

#### Changelog Component
- Convert `changelog.html` to `Changelog.tsx`
- Keep existing changelog generation logic
- Consider using markdown renderer for better maintainability

### Phase 3: State Management (Day 3-4)

1. **Settings State**
   - Create custom hook `useSettings` for settings management
   - Implement storage integration with `getItem`/`setItem`
   - Handle default settings merging

2. **Navigation State**
   - Implement router or custom navigation state
   - Maintain browser history API integration
   - Support URL parameters for direct page access

3. **Loading States**
   - Convert loading spinner to Preact component
   - Implement proper loading state management
   - Add error boundaries for graceful error handling

### Phase 4: Feature Enhancements (Day 4-5)

1. **Improved Type Safety**
   - Leverage TypeScript with Preact for better type inference
   - Create proper prop types for all components
   - Use generics for reusable components

2. **Performance Optimizations**
   - Implement code splitting for changelog data
   - Use Preact's memo/lazy for optimization
   - Reduce bundle size with tree shaking

3. **Developer Experience**
   - Hot Module Replacement (HMR) for faster development
   - Component isolation for easier testing
   - Better separation of concerns

### Phase 5: Testing and Migration (Day 5-6)

1. **Testing Strategy**
   - Unit tests for individual components
   - Integration tests for settings persistence
   - Manual testing of all existing functionality

2. **Migration Checklist**
   - [ ] All navigation paths work correctly
   - [ ] Settings save and load properly
   - [ ] Changelog displays correctly
   - [ ] Polaris components render properly
   - [ ] No regression in functionality
   - [ ] Bundle size is acceptable

## Implementation Details

### Key Components to Create

1. **App.tsx**
   ```tsx
   // Main app component with routing and state management
   import { Navigation } from './components/Navigation';
   import { Settings } from './components/Settings';
   import { Changelog } from './components/Changelog';
   ```

2. **useSettings Hook**
   ```tsx
   // Custom hook for settings management
   - Handle loading/saving settings
   - Provide settings context to components
   - Manage default values
   ```

3. **Polaris Integration**
   ```tsx
   // Wrapper components for Polaris web components
   - Type-safe wrappers for Polaris elements
   - Event handling integration
   - Proper ref forwarding
   ```

## Benefits of Migration

1. **Component Reusability**: Share components across different parts of the extension
2. **Better State Management**: Predictable state updates with hooks
3. **Improved DX**: Hot reload, better TypeScript integration
4. **Maintainability**: Cleaner code structure, easier to test
5. **Performance**: Virtual DOM, lazy loading, code splitting
6. **Consistency**: Align with other Preact-based entrypoints

## Risk Mitigation

1. **Gradual Migration**: Keep old implementation until new one is stable
2. **Feature Parity**: Ensure all existing features work identically
3. **Rollback Plan**: Keep git history clean for easy rollback
4. **Testing**: Comprehensive testing before replacing old version

## Timeline

- **Week 1**: Setup, component migration, and state management
- **Week 2**: Testing, optimization, and deployment

## Success Criteria

- All existing functionality preserved
- No increase in bundle size > 20%
- Improved loading performance
- Clean, maintainable code structure
- Full TypeScript coverage

## Next Steps

1. Create feature branch `feature/preact-options-page`
2. Set up basic Preact structure
3. Migrate components one by one
4. Implement comprehensive testing
5. Deploy to staging for testing
6. Merge to main after approval
