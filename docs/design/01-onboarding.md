# 01 — Onboarding: welcome → name → home

**Purpose:** get a new rider from install to Home (or into the ride they were invited to) in two
screens, with no account and no password.
**One-second glance:** "This app shows my group who is ahead, behind or stopped — I just need a name."

Routes: `(onboarding)/welcome.tsx`, `(onboarding)/name.tsx`. Guest by default: anonymous sign-in
(`ensureSignedIn()`) happens on the welcome button press. There is no "done" screen — finishing the
name step lands on Home (or Join if a deep-link code is pending); an extra screen would only add a tap.

## Welcome

```
┌──────────────────────────────────┐
│                                  │
│  Throttle Tribe            (28)  │
│  Ride together. Nobody gets      │
│  left behind.              (16m) │
│                                  │
│  ┌──┐ See who's ahead and        │
│  │▶ │ who's behind          (20) │
│  └──┘                            │
│  ┌──┐ Know when someone stops    │
│  │⏸ │ or loses signal            │
│  └──┘                            │
│  ┌──┐ Hold SOS to alert your     │
│  │⚠ │ whole group                │
│  └──┘                            │
│                                  │
│  No sign-up. Just your name. (14)│
│ ┌──────────────────────────────┐ │
│ │        Get started           │ │ primary
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```
Layout (top→bottom, `Screen`, body gap 24):
- Title `welcome.title` 28/700 `text`; tagline `welcome.tagline` 16 `textMuted`, gap 8.
- Three points, gap 16. Each: icon tile 48×48 radius 12 filled with the matching status colour
  (`moving`, `stopped`, `sosStrong`) and the glyph in `onStatus.*` 20; text 20/600 `text`, max 2 lines.
  (Introduces the colour language before the first ride.)
- Footer: note `welcome.noSignup` 14 `textMuted` centred, then primary BigButton `welcome.cta`.

States:
- Pressing CTA → button `loading` while `ensureSignedIn()` runs → `router.push('/name')`.
- Network error → keep screen, show inline text under the note, 16 `text` with ⚠ prefix:
  `welcome.errorNetwork`; button label becomes `common.tryAgain`.
- Already signed in but no profile (reinstall/retry) → skip sign-in, go straight to name.
- Light/dark: tokens only; the icon tiles are scheme-independent.

## Name

```
┌──────────────────────────────────┐
│ ‹                                │
│  What should riders call    (28) │
│  you?                            │
│  Shown to your group on the map  │
│  and in alerts.            (16m) │
│ ┌──────────────────────────────┐ │
│ │ Arun                     (20)│ │ 56 tall
│ └──────────────────────────────┘ │
│  Short names are easier to read  │
│  at a glance.        12/40 (14m) │
│                                  │
│ ┌──────────────────────────────┐ │
│ │          Continue            │ │ primary
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```
- Top bar back (to welcome).
- Heading `name.title` 28/700; subtitle `name.subtitle` 16 `textMuted`.
- `AppTextInput`: autofocus, `autoCapitalize="words"`, `autoCorrect={false}`, `maxLength={40}`,
  `returnKeyType="done"` (submits when valid), `textContentType="nickname"`.
- Helper row: `name.hint` left (14 muted) + counter `n/40` right (14 muted, tabular). Counter turns
  into ⚠ `name.errorTooLong` only if paste exceeds 40 (maxLength normally prevents it).
- Footer primary `name.cta`. Disabled until `trim().length` is 1–40.
- Keyboard: footer rises with the keyboard (`KeyboardAvoidingView` behaviour `padding` iOS,
  `height` Android) so Continue is always reachable.

Interactions:
- Continue → `saveProfile(name)` (button loading) →
  - pending join code stored (from deep link, see 03) → `replace('/join?code=…')`
  - else → `replace('/home')`, and Home shows toast `home.toastWelcome` ("You're all set, Arun") 3 s.
- Errors: `network` → inline ⚠ `errors.network`, keep text; `not_authenticated` → `errors.not_authenticated`
  with button `common.tryAgain` that re-runs `ensureSignedIn()` then saves.

## Accessibility
- Welcome points are one accessible element each: label = the point text (icons decorative).
- Input label `name.a11yInput`; counter announced only on blur ("12 of 40 characters").
- Supports dynamic type up to 2.0; layout scrolls if needed (body in ScrollView, footer pinned).
- Contrast: all text uses `text`/`textMuted` on `bg` (≥ 10:1 light, ≥ 12:1 dark).

## Copy
Keys `welcome.*`, `name.*` in `09-states-copy.md`. Marketing may refine `welcome.tagline` and the three points.

## Acceptance checklist
- [ ] No password, email or phone field anywhere.
- [ ] Anonymous sign-in happens only after "Get started"; retry works offline → online.
- [ ] Continue disabled for empty/whitespace names; name trimmed before save; 40 char cap.
- [ ] Continue visible above the keyboard on a 6" phone.
- [ ] Pending deep-link code resumes Join after naming.
- [ ] Back on welcome does nothing (no back stack); Android back exits the app.
