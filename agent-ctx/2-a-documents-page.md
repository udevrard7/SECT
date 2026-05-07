# Task 2-a: Documents Page Component

## Agent: Documents Page Agent

## Summary
Created a comprehensive document management page component at `/src/components/documents/documents-page.tsx`.

## Key Implementation Details

### Component: `DocumentsPage` (named export)
- `'use client'` directive
- All UI text in French
- Emerald/teal color scheme throughout

### Features Implemented
1. **Header** — "Mes Documents" title, subtitle, "Nouveau document" button
2. **Upload Dialog** — Drag-and-drop zone, file input, preview with remove, loading state, FormData POST to `/api/documents`
3. **Document Grid** — Responsive 1-4 column grid of Cards with file type icons, truncated names, sizes, French dates, status badges
4. **Analysis Detail Sheet** — Right-side panel with résumé, themes (emerald badges), concepts (teal outline badges), volume estimé (colored bars), re-analyze button, generate questions button
5. **Empty State** — FolderOpen icon, descriptive text, CTA button
6. **Loading State** — Skeleton cards with pulse animation
7. **Polling** — 5-second interval for EN_COURS documents, auto-start/stop

### Utility Functions
- `formatFileSize(bytes)` → "1.5 Mo", "256 Ko"
- `formatDate(date)` → "12 juin 2026"
- `getFileIcon(doc)` → colored icon ReactNode by file type
- `getStatusLabel(status)` → French label
- `getStatusBadgeClasses(status)` → Tailwind classes per status
- `parseJsonSafe<T>(value, fallback)` → safe JSON.parse with try/catch
- `truncateFileName(name, maxLen)` → smart truncation preserving extension

### API Integration
- `POST /api/documents` — Upload (FormData: file + userId)
- `GET /api/documents?userId=xxx` — List documents
- `POST /api/documents/[id]/analyze` — Re-trigger analysis
- `GET /api/documents/[id]` — Get single document details

### Store Usage
- `useAuthStore` — for userId
- `useNavigationStore` — `setCurrentPage('questions-ia', { documentId })` for navigation

### Lint Status
✅ ESLint passes clean
