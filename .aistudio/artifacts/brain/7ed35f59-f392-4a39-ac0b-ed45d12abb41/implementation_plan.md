# Implementation Plan: Fix Theme System (Revised)

The user reports that the theme toggle is entirely non-functional. I will audit and rebuild the theme synchronization logic, focusing on replacing imperative DOM manipulation with a robust, CSS-variable-based approach.

## Goal
Restore functional light/dark mode switching across the entire application.

## Planned Steps

### 1. Audit Current Implementation
*   Verify `ThemeProvider` is correctly wrapping the `MainApp` component.
*   Identify why `applyTheme` might be failing or being overridden by CSS defaults.
*   Check for conflicting CSS rules in `index.css` that might be enforcing dark mode regardless of the `light` class.

### 2. Standardize Theme Application (Robust CSS-Variable Approach)
*   Remove all imperative `document.body.style` manipulations.
*   Update `index.css` to use CSS variables for all colors, scoped strictly to `.dark` and `.light` classes on `document.documentElement`.
*   Ensure all components use these variables (e.g., `bg-[var(--bg-app)]`) instead of hardcoded color values.
*   Update the `themeContext.tsx` `applyTheme` function to only toggle these classes on the root element.

### 3. Verification & Sync
*   Ensure `index.html` bootstrap script correctly reads `localStorage` and applies the class before the React app mounts to prevent FOUC.
*   Test theme toggle across all major components (`Header`, `HomeScreen`, `SettingsModal`, `RosterTab`, `SendHistoryModal`).
*   Verify theme persistence across browser reloads.
