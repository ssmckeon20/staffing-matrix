# Project memory

## Product intent & audience

- Internal scheduling/shift management application for teams, shifts, and coverage data
- Also manages people, access, and cost centers; authenticated users; sign-in is landing page
- AI assistant feature helps users ask open-ended questions about schedules

## Brand personality & voice

- Functional, utility-focused internal tool; UI text uses clear, direct labels

## Visual design & UX direction

- **Stack**: Vite + React; Supabase for auth and data
- **Auth UI**: `AuthScreen` as landing/login; email/password fields; forgot-password inline form
- **Navigation**: Bottom-left user click-menu hosts admin tools (People & access, Delete a cost center, Change password)
- **Modals**: Modal + success confirmation pattern (e.g. `ChangePasswordModal`)
- **Chat UI**: Existing chat interface for AI assistant; preserved during AI upgrade
- **Components**: Reusable `Button`; success/error feedback via `.success-banner` / `.error-banner` in `index.css`
- **Icons**: Custom icon set referenced by name (e.g. "lock", "check")
- **Styling**: Plain CSS in `index.css`, class-based (no framework)

## Decisions, constraints & rationale

- **Supabase auth**: Built-in methods for password flows (`resetPasswordForEmail`, `updateUser`); no custom backend
- **AI upgrade**: Replacing keyword-matching assistant logic with Gemini 2.5 Flash via server-side edge function
- **Edge function**: Receives schedule data + user question, calls Gemini 2.5 Flash, returns AI response
- **Schedule data packaging**: Team, shifts, and coverage data compressed into compact summary for AI context
- **Proposal/approval system**: Existing system for AI-suggested changes; preserved during upgrade
- **API key**: Gemini API key configured and in place
- Supabase defaults accepted for email templates and password validation

## Open questions & assumptions

- Supabase project configured with auth and password reset email templates (assumed working)
- Password validation rules unspecified; relies on Supabase defaults
- No password-strength meter or client-side validation requirements defined
- Edge function deployment details and Supabase function configuration not yet confirmed
- Gemini API rate limits and error-handling strategy not yet defined
- Token/cost budget for schedule data packaging not established