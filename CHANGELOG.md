# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1.0] - 2026-04-13

### Added
- Auto-translate (输入即译): type and get translations after 350ms pause, no need to tap submit
- Scene switcher: choose between Chat, Business, and Writing translation tones
- Translation quality feedback: rate translations with thumbs up/down
- One-click bookmark: save translations directly to wordbook from the result card
- Behavioral analytics: track key user actions via Firebase Analytics
- Firestore `feedback` collection with admin-only read, field whitelist, and rating enum
- 21 regression tests for feedback flow, accessibility, race conditions, and security rules
- Progress indicator bar shown during auto-translate

### Fixed
- Feedback thumbs-down flow no longer loses data on network failure (state set after DB write)
- Feedback reason input capped at 500 chars (matches Firestore rule)
- 6 icon buttons now have proper aria-label and aria-pressed for screen readers
- Auto-translate and manual submit no longer race (debounce timer cleared on manual submit)
- AbortController properly cleaned up in finally block
- translateText prompt uses multi-turn format to prevent user input injection
- AI hint error on review page now shows specific error messages (region, busy, generic)
- Auto-translate defaults to off to reduce confusion and API waste
- Analytics trackEvent wrapped in try-catch to prevent crashes when unavailable

### Changed
- Auto-translate debounce reduced from 500ms to 350ms for faster response
- Lightning bolt toggle now shows "即译" text label explaining its purpose
