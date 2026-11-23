# Project memory

## Product intent & audience

- Internal/admin-style application for managing people, access, and cost centers
- Authenticated users manage organizational data; sign-in is the landing page

## Brand personality & voice

- Functional, utility-focused internal tool; UI text uses clear, direct labels (e.g. "People & access", "Delete a cost center")

## Visual design & UX direction

- **Stack**: Vite + React; Supabase for auth and data
- **Auth UI**: `AuthScreen` component serves as landing/login page; sign-in form with email/password fields
- **Navigation**: Bottom-left user click-menu hosts admin tools (People & access, Delete a cost center, Change password)
- **Modals**: Modal components for secondary actions (e.g. `ChangePasswordModal`); pattern of modal + success confirmation
- **Icons**: Custom icon set in app; icons referenced by name (e.g. "lock", "check")
- **Components**: Reusable `Button` component; success/error feedback via `.success-banner` / `.error-banner` CSS classes in `index.css`
- **Styling**: Plain CSS in `index.css`, class-based (no CSS framework detected)

## Decisions, constraints & rationale

- **Supabase built-in auth methods** used for password flows: `resetPasswordForEmail` for forgot-password, `updateUser` for change-password — no custom backend or DB migrations needed
- **Forgot password**: Link on sign-in form opens inline reset form; pre-fills in-progress email; sends Supabase reset link; shows success banner
- **Change password**: Available to all signed-in users via bottom-left menu; modal with new password + confirm fields; updates via Supabase `updateUser`
- No server-side email configuration customization assumed; Supabase defaults accepted

## Open questions & assumptions

- Supabase project is configured with auth and password reset email templates enabled (assumed working)
- Password validation rules (min length, complexity) not specified — currently relies on Supabase defaults
- No password-strength meter or client-side validation requirements defined yet