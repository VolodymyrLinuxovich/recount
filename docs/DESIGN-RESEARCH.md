# Recount design research

Date: 2026-10-24. Scope: a phone-first Next.js app for uninsured and underinsured California patients who are often older, often have low vision, and often read Spanish first.

Part A lists what the sources say. Part B is a spec the team can build from today. Every color pair in Part B was checked with the WCAG 2.x relative luminance formula. The ratios are listed next to each token.

---

## Part A. Findings

### Forms and question pages (NHS, GOV.UK, USWDS, CMS)

- **One question per page.** Start with one question per page. Group questions only when research shows it helps, and then use a statement as the heading. Ask for each fact only once. Offer "I'm not sure" when it is a real answer. https://service-manual.nhs.uk/design-system/patterns/question-pages
- **Every question page has the same four parts.** A back link at the top, the question as the `<h1>` inside the `<label>` or `<legend>`, the input, and a button labelled "Continue" (not "Next"). Never reuse a heading on two pages. Show the section as a caption above the heading. Same source as above.
- **Keep progress simple.** "Question 3 of 9" is enough. Show a total only if you can count it reliably. Fix question order first, before adding an indicator. Same source as above.
- **The primary button sits left on GOV.UK and NHS.** On mobile it is full width. In a button group the primary comes first and the secondary follows. Groups sit side by side on wide screens and stack on mobile. Use one primary per page. Labels are sentence case and name the action, like "Save and continue". https://service-manual.nhs.uk/design-system/components/buttons and https://design-system.service.gov.uk/components/button/
- **Guard against double taps.** Older and motor-impaired users double tap. Guard against it on both the client and the server. Show a loading state on slow connections. Same two sources.
- **Avoid disabled buttons.** They have poor contrast and confuse people. Use them only if research supports them. https://service-manual.nhs.uk/design-system/components/buttons
- **How to write and place errors.** Put the message next to the field, below the label and hint, in red, with a red border. Say what went wrong and how to fix it. "Enter your name" is right. "This field is required" is not. Never use "please", "sorry", "valid", "invalid" or humor. Use the same wording in the error summary at the top. Keep everything the user typed. Don't use error styling to say someone is ineligible. https://design-system.service.gov.uk/components/error-message/
- **What a confirmation page needs.** A panel that says the task is done, a reference number, what happens next and when, contact details, likely next links, and a way to save a record such as a PDF. Some users bookmark it as a receipt. https://design-system.service.gov.uk/patterns/confirmation-pages/
- **Step indicators.** Use one only for 3 or more steps in a linear flow. Use short labels, one word if possible. Put the heading right below it with "Step X of Y". Pending steps must not look disabled. Mark the current step with `aria-current="true"` and add hidden status text. https://designsystem.digital.gov/components/step-indicator/
- **HealthCare.gov and Medicare.gov use the CMS Design System.** It is built on USWDS and Section 508. It is the closest US precedent for health and benefits forms. https://design.cms.gov/

### Low vision and older adults (WCAG 2.2, W3C WAI, NN/g, Apple)

- **Target size.** WCAG 2.2 SC 2.5.8 (AA) needs at least 24×24 CSS px, or 24 px of spacing. SC 2.5.5 (AAA) needs 44×44 px, and W3C advises meeting it for important controls. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- **Enhanced contrast.** SC 1.4.6 (AAA) needs 7:1 for normal text and 4.5:1 for large text. Large text means 24 px and up, or about 18.5 px bold and up. AA is 4.5:1 and 3:1. https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html
- **Reflow.** SC 1.4.10 (AA) says content must work at 320 CSS px wide with no horizontal scroll. That is the same as 400% zoom. https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- **Text spacing.** SC 1.4.12 (AA) says nothing may clip or overlap when users set line height to 1.5, paragraph spacing to 2× font size, letter spacing to 0.12 em, and word spacing to 0.16 em. https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html
- **What older users need.** Eyes lose contrast sensitivity and near focus. Hands lose fine motor control. Short-term memory and focus get weaker. The advice is strong contrast, adjustable text, big targets, simple and consistent navigation, clear feedback after each action, and few distractions. https://www.w3.org/WAI/older-users/
- **What NN/g saw in testing.** Tiny, light-colored text and tiny targets were the most common problems. Older users made more mistakes and blamed themselves. Strict input formats caused failures, such as rejecting hyphens in phone numbers or forcing a date picker. Make the default text bigger, let users resize it, accept many formats, and place errors where people will see them. https://www.nngroup.com/articles/usability-for-senior-citizens/
- **Apple's numbers.** iOS body text is 17 pt by default. Tap targets are at least 44×44 pt. iOS has system settings for Increase Contrast and Reduce Motion, and apps should respect both. Layouts should reflow at the largest Dynamic Type sizes, not truncate. https://developer.apple.com/design/human-interface-guidelines/accessibility
- **A font built for low vision.** Braille Institute designed Atkinson Hyperlegible so similar letters and numbers look different, which helps with 0/O, 1/l/I and 5/S. The free 2025 "Next" version has 7 weights plus a variable font and covers over 150 languages, Spanish accents included. Telling digits apart matters on a bill. https://www.brailleinstitute.org/freefont/

### Consumer health and billing products

- **Dollar For** is the closest comparison. Its first step is a short bilingual screener of about 6 questions, about 3 minutes, and it gives an answer right away. Only people who qualify go on to the longer form of about 15 minutes with pay stubs. Ask little, answer fast, then ask for paperwork. https://www.healthwellfoundation.org/realworldhealthcare/what-patients-dont-know-about-hospital-financial-assistance-but-should/ and https://triagecancer.org/dollar-for-charity-care
- **Zocdoc** splits a heavy healthcare form into steps. Users reach the useful part (finding a doctor) before they make an account. It uses a camera for the insurance card with a typed fallback, and calm microcopy for booking anxiety. https://goodux.appcues.com/blog/zocdocs-pain-free-healthcare-onboarding
- **Oscar's redesign** put messaging and plan facts at the top level. Help sits one tap away, not buried in menus. https://gdusa.com/?p=26805

### Mascots and helpers in health

- **Tone matters more than looks.** In a 3-country study with 60 older adults, participants wanted a coach with a supportive tone. They rejected an authoritarian or condescending one. https://pmc.ncbi.nlm.nih.gov/articles/PMC10251225/table/table1
- **The agent's looks matter at first glance and then fade.** In a JMIR Human Factors study, the agent's age and gender shaped first impressions only. Older participants saw no added value in having an agent in the health app. A helper has to earn its space through useful answers, not charm. https://humanfactors.jmir.org/2020/3/e19987/XML
- **Clear and quick beats lifelike.** For older adults, a clear and responsive voice drove engagement more than realism did. Some found the lifelike avatar emotionally distant. https://dl.eusset.eu/items/4e58874e-bbb8-4831-8824-60bd24fdc14f/full

### Motion

- **NN/g durations.** About 100 ms for small feedback such as a toggle. 200 to 300 ms for screen changes. Up to 400 ms only for large moves. Stay under 500 ms. Entrances should run a little longer than exits. Use ease-out for things coming in and ease-in for things going out. Never linear. Repeated animations should be shorter and subtler. https://www.nngroup.com/articles/animation-duration/
- **WCAG 2.3.3 (AAA) on motion.** Users must be able to turn off motion caused by their own actions unless it is essential. Decorative page transitions are not essential. `prefers-reduced-motion` is the sufficient technique (C39, SCR40). Fades of opacity or color don't count as motion. https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- **Material 3 easing.** Standard is `cubic-bezier(0.2, 0, 0, 1)`. Emphasized decelerate is `cubic-bezier(0.05, 0.7, 0.1, 1)` and emphasized accelerate is `cubic-bezier(0.3, 0, 0.8, 0.15)`. Durations come in short (50 to 200 ms), medium (250 to 400 ms) and long steps. https://m3.material.io/styles/motion/easing-and-duration/tokens-specs (the page renders client side and could not be fetched today. These values are the published M3 tokens and should be checked against the live page.)

### Spanish in US health

- **Put the toggle where people will see it.** Use a prominent "Español" link on the English site that switches both ways. https://www.lep.gov/sites/lep/files/resources/gobiernousa_govpptforlepconference.pdf
- **Mark language in the markup.** For 2 languages, use the two-language selector. Set `<html lang>`. Wrap a language name written in the other language in `<span lang="es">` so screen readers say it correctly. https://designsystem.digital.gov/components/language-selector/
- **Use "usted" on the web.** US government Spanish style keeps "tú" for social media. https://headstart.gov/culture-language/article/style-guide-translations-spanish
- **Use the official glossary.** It includes "Spanish Health Care Terms in the United States". Use it so terms match what people see from Medi-Cal and Covered California. https://digital.gov/resources/spanish-language-style-guide-and-glossaries
- **Mixed language hurts.** The 2013 Spanish HealthCare.gov launch was criticized for text that mixed Spanish and English and read like machine translation. Navigators said users could not read it without help. https://dailysignal.com/?p=134699
- **Translation alone is not enough.** Test with Spanish speakers throughout development. Low enrollment was traced to messaging, not only translation quality. https://oldmagazine.uxpa.org/spanish-language-personas

### What this means for the current code

- `globals.css` uses about 30 one-off font sizes (12, 12.5, 14, 14.5, 15, 15.5, 16, 16.5, 17 px and more). The masthead, column, step bar and footer each set their own padding. That is the "chopped / not aligned" feel. The fix is one type scale, one spacing scale and one shared container, not new decoration.
- Body text is a serif (Source Serif 4) at 18 px, and headings use Fraunces. A serif body at phone sizes is harder for low-vision readers, and hyperlegible digits matter most on a bill.
- Today the only motion is `rise`, `spin` and `pulse`. There is no transition between steps, so users lose track of where they are.

---

## Part B. Spec for Recount

### B1. Type

**Fonts**
- Body, UI and numbers: **Atkinson Hyperlegible Next**, variable, from `next/font/google` with the `latin` and `latin-ext` subsets. Fallback is `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Use **Fraunces** for display only (the h1 and the wordmark), at 32 px and up. Never use it for body text or numbers.
- **Numbers:** add `font-variant-numeric: tabular-nums` to every amount, table and line item so dollar columns line up.

**Type scale.** Use only these sizes, set in rem so browser zoom and OS text size work.

| Token | Normal | High visibility | Line height | Use |
|---|---|---|---|---|
| `--fs-xs` | 0.875rem (14px) | 1.125rem (18px) | 1.45 | legal footnote only. Never for anything the user must act on |
| `--fs-sm` | 1rem (16px) | 1.25rem (20px) | 1.5 | hints, captions, "Step 2 of 4" |
| `--fs-md` | 1.125rem (18px) | 1.375rem (22px) | 1.55 | **body, inputs, buttons** |
| `--fs-lg` | 1.375rem (22px) | 1.625rem (26px) | 1.35 | h3, amounts in lists |
| `--fs-xl` | 1.625rem (26px) | 2rem (32px) | 1.25 | h2, key totals |
| `--fs-2xl` | `clamp(2rem, 1.5rem + 2.5vw, 2.5rem)` (32 to 40px) | `clamp(2.25rem, 1.75rem + 2.5vw, 2.75rem)` | 1.15 | h1, one per screen |
| `--fs-hero` | `clamp(2.5rem, 1.75rem + 4vw, 3.5rem)` | same + 0.25rem | 1.05 | the single big savings number |

**Weights**
- Body 400, labels and buttons 600, headings 600.
- Don't use weights under 400. Don't use italics for meaning.

**Line length**
- Prose: `max-width: 34em` (about 60 to 66 characters at 18px).
- Hints and error text: `max-width: 30em`.
- Never let a paragraph run the full width of a desktop screen.

**Spanish length.** Allow for Spanish strings being about 25% longer.
- No fixed-width buttons or chips.
- Every button label must wrap to 2 lines without clipping.
- Test the longest Spanish string at 320px.

**Text spacing (SC 1.4.12)**
- No fixed `height` on any box that holds text. Use `min-height`.
- Check with the WCAG text-spacing bookmarklet in both languages.

**Small text**
- Delete every size under 14px. That covers the current 12px and 12.5px.
- Mono (IBM Plex Mono) is only for showing CPT or revenue codes. Use it at `--fs-sm` or larger.

### B2. Color tokens

Ratios are text on `--bg`, then text on `--surface`. All body text pairs pass **AAA (7:1)** except where noted. Status colors pass AA for normal text and AAA for large text.

**Normal light** (keeps the warm "paper" identity)

| Token | Hex | On bg | On surface | Note |
|---|---|---|---|---|
| `--bg` | `#F7F3EA` | | | page |
| `--surface` | `#FFFFFF` | | | cards, inputs, bill sheet |
| `--ink` | `#16191F` | 15.9 | 17.6 | text |
| `--ink-2` | `#474C57` | 7.8 | 8.6 | secondary text (AAA) |
| `--border` | `#767B86` | 3.8 | 4.2 | input and control borders (SC 1.4.11 ≥3:1) |
| `--hairline` | `#DDD3C1` | | | decorative dividers only, never a control edge |
| `--primary` | `#155E63` | 6.7 | 7.5 | primary button fill, links |
| `--on-primary` | `#FFFFFF` | | 7.5 on primary | |
| `--danger` | `#B3261E` | 5.9 | 6.5 | errors, flagged charges. 5.6 on `--danger-bg #FBEAE8` |
| `--ok` | `#1E6B34` | 5.9 | 6.6 | success. 5.7 on `--ok-bg #E6F2E8` |
| `--warn` | `#7A4E00` | 6.5 | 7.2 | "check this" |
| `--focus` | `#1D4ED8` | 6.1 | 6.7 | focus ring |

**Normal dark** (from `prefers-color-scheme: dark`)

| Token | Hex | On bg | On surface |
|---|---|---|---|
| `--bg` | `#14130F` | | |
| `--surface` | `#1F1D19` | | |
| `--ink` | `#F1ECE1` | 15.8 | 14.3 |
| `--ink-2` | `#BDB6A8` | 9.2 | 8.4 |
| `--border` | `#8C877C` | 5.2 | 4.7 |
| `--primary` | `#7CC7CE` (text `--on-primary #0B1F21`, 8.9) | 9.7 | 8.8 |
| `--danger` | `#FF8A7A` | 8.1 | 7.4 |
| `--ok` | `#8FD19E` | 10.4 | 9.4 |
| `--warn` | `#E8BE6A` | 10.6 | 9.6 |
| `--focus` | `#9DBBFF` | 9.7 | 8.8 |

**High visibility, black on white** (`data-contrast="hv-light"`)

| Token | Hex | Ratio |
|---|---|---|
| `--bg` / `--surface` | `#FFFFFF` | |
| `--ink` | `#000000` | 21.0 |
| `--ink-2` | `#1F1F1F` | 16.5 |
| `--border` | `#000000` | 21.0 |
| `--primary` | `#00315C` (white text 13.2) | 13.2 |
| `--danger` | `#8E0000` | 9.8 |
| `--ok` | `#0B4F1C` | 9.8 |
| `--warn` | `#5C3A00` | 10.2 |
| `--focus` | `#0000EE` | 9.4 |

**High visibility, yellow on black** (`data-contrast="hv-dark"`)

| Token | Hex | Ratio |
|---|---|---|
| `--bg` / `--surface` | `#000000` | |
| `--ink` / `--ink-2` | `#FFFFFF` | 21.0 |
| `--border` | `#FFFFFF` | 21.0 |
| `--primary` | `#FFE600` (black text 16.6) | 16.6 |
| `--danger` | `#FF9C8F` | 10.4 |
| `--ok` | `#7CFF9B` | 16.6 |
| `--warn` | `#FFE600` | 16.6 |
| `--focus` | `#00E5FF` | 13.7 |

**High-visibility rules** (on top of the colors)
- Text uses the HV column of B1. That is a 22px base.
- Every target is at least 56px tall.
- Borders are 2px. The focus ring is 4px with a 3px offset.
- No shadows, no tinted backgrounds, no translucency.
- Every link is underlined.
- Status is shown by an icon plus a word, never by color alone. Use ✓ Correct, ! Check this, and ✕ Problem.
- On every screen, the button bar stacks with the primary on top.

**How the mode is chosen**
- Add a "Display / Pantalla" button (an "Aa" icon plus the word) in the masthead, next to the language toggle.
- It opens a sheet with two choices. Text size: Standard or Large. Contrast: Standard, Black on white, or Yellow on black.
- The same choice also appears once on the first screen.
- Store it in `localStorage`, wrapped in try/catch, and apply it as `data-text` and `data-contrast` on `<html>` before first paint with a tiny inline script.
- Turn on Large and hv-light automatically when the system reports `prefers-contrast: more`.
- Under `forced-colors: active`, drop the custom colors and use system colors (`Canvas`, `CanvasText`, `ButtonText`, `Highlight`). Give every button a real `border: 2px solid` so it stays visible.

### B3. Spacing and grid

**Spacing scale.** Use only these values: 4, 8, 12, 16, 24, 32, 48, 64 px (`--sp-1` to `--sp-8`). Delete one-off values such as 6, 10, 14, 18, 22 and 28.

**One container for every horizontal band.** Masthead, step header, main, step bar and footer all use the same rule:
```css
.container { width: 100%; max-width: 40rem; /* 640px */ margin-inline: auto; padding-inline: var(--gutter); }
--gutter: 16px  (<= 359px)
          20px  (360-767px)
          24px  (>= 768px)
```
The wordmark, h1, inputs, button bar edges and footer text then share one left edge on every screen. This one change fixes most of the "not aligned" feel.

**Phone (< 768px)**
- One column, full-bleed cards. Use radius 0, or radius 12 with a 16px inset, but pick one and use it everywhere.
- Vertical rhythm: 24px between blocks, 8px from label to input, 4px from hint to input, 32px above each h2.

**Tablet and desktop (≥ 768px)**
- The same 640px column, centered.
- Don't widen the forms. A wide form is harder to scan, and line length goes past 75 characters.
- The bill review and audit tables may use a wider `max-width: 60rem` container. Their left edge still lines up with the masthead wordmark, because the masthead uses the same 60rem container on those pages.

**Desktop (≥ 1024px) with the side chat open**
```css
.layout { display: grid; grid-template-columns: minmax(0, 40rem) 22.5rem; gap: 48px; justify-content: center; }
```
The content column must not move or resize when the chat opens. If the viewport is too narrow for 640 + 48 + 360 (= 1048px plus gutters), the chat becomes an overlay sheet instead (see B10).

**Pinned step bar**
- Sized to its content. Never reserve a fixed `padding-bottom: 190px`.
- Measure the bar with a `ResizeObserver` and set `--bar-h`. The step screen gets `padding-bottom: calc(var(--bar-h) + 24px)`.

### B4. Button bar

**Layout.** Back on the left, primary on the right, side by side on every phone 360px and wider.
```
[ ‹ Back ]  [        Continue        ]
   1fr                2fr
```
- Height 56px (64px in HV). Gap 12px. Radius 12px.
- Label `--fs-md` 600, wrapping to 2 lines if needed. Min target 48×56.
- Bar padding: 12px on top, then `12px + env(safe-area-inset-bottom)` below.
- Bar background `--bg` with a 1px `--hairline` top border. No shadow in HV.

**Why primary goes on the right.** GOV.UK and NHS put the primary on the left because they stack buttons on mobile. With buttons side by side, Recount's flow moves forward to the right (see B5). So Back goes on the left, where the previous screen sits, and Continue goes on the right, under the thumb. Make the primary twice as wide so nobody has to guess which is which. Keep this order on every screen. Never swap it.

**Stacking.** At under 360px, or when `data-text="large"`, or when either label wraps past 2 lines, stack the buttons. Primary on top at full width, Back below as a full-width secondary.

**Colors**
- Primary: fill `--primary`, text `--on-primary`, no border. Pressed: `filter: brightness(0.92)` and `scale(0.98)` for 80ms.
- Secondary: transparent fill, 2px `--ink` border, `--ink` text. It is clearly a button, not a ghost.
- One primary per screen.
- Destructive actions such as "Delete this bill" never sit in the bar. They live in the page body, with a confirm step.

**Labels**
- Use verbs. "Continue / Continuar", "Take photo / Tomar foto", "Approve letter / Aprobar carta", "Back / Atrás". Never "Next", "OK" or "Submit".

**Disabled and loading**
- Don't use disabled buttons. Let the user tap, then show the error (B7).
- While loading, the label becomes "Reading your bill… / Leyendo su factura…" with a 16px spinner. The button keeps its width, sets `aria-disabled="true"` and ignores repeat taps.
- Guard against double submits on the server too.

**Back link.** NHS also puts a back link at the top of each question page. Recount keeps Back in the bar, so don't add a second one at the top. Browser back must return the previous step in its last state (use the `?step=` URL state).

### B5. Step change motion

**Step change motion spec**

| | Forward (Continue) | Backward (Back) |
|---|---|---|
| Outgoing content | `opacity 1→0`, `translateX(0→-24px)`, **160ms**, `cubic-bezier(0.3, 0, 0.8, 0.15)` (ease-in) | `translateX(0→+24px)`, same |
| Incoming content | `opacity 0→1`, `translateX(+32px→0)`, **260ms**, `cubic-bezier(0.2, 0, 0, 1)` (ease-out), starts at 120ms | `translateX(-32px→0)`, same |
| Total | about 380ms | about 380ms |

**Rules**
- Animate only `.step-body` and the h1. The masthead, progress bar and button bar stay still, which keeps the screen anchored.
- Animate only `transform` and `opacity`.
- Scroll to the top before the incoming content enters.
- Move focus to the new h1 (`tabindex="-1"`) when the content enters, so screen readers announce the new step.
- Use the View Transitions API (`document.startViewTransition`) where it exists, with `view-transition-name: step`. Elsewhere use a CSS class swap. Never block input for more than 380ms.

**Reduced motion fallback** (`prefers-reduced-motion: reduce`, or the Display setting "Reduce motion")
- No translation. Crossfade opacity only, over 120ms. Opacity is allowed under WCAG 2.3.3.
- Turn off the button press scale, the progress bar fill animation and every spinner rotation. Use a static "…" with a text label instead.

**Other motion tokens**
- Press feedback: 80ms.
- Progress segment fill: 200ms ease-out.
- Sheet open (chat, display settings): 280ms `cubic-bezier(0.05, 0.7, 0.1, 1)`. Sheet close: 200ms ease-in.
- Error message appear: opacity only, 150ms. Errors must never slide or shake.
- Bill reading: show the real steps in a checklist (StepLog), each with a 200ms check-in. Don't use a spinner on its own if it may run more than 1s. Any looping pulse is opacity only, at a 1.6s period, and stops under reduced motion.

### B6. Success and confirmation

**When to use it.** Two moments: "You likely qualify" and "Your letters are ready".

**Layout, top to bottom**
1. **Panel.** Full container width, `--ok-bg` fill, 4px `--ok` left border, 24px padding. The ✓ icon is 56px, drawn as an SVG stroke.
   - The circle draws over 400ms ease-out, then the check draws over 300ms starting at 150ms. Total under 700ms. It plays once.
   - Under reduced motion, show it finished. No confetti, no sound, no bounce.
2. **Heading** (h1, inside the panel). State the result plainly, hedged where the law requires it. "You likely qualify for free care at Hospital X" / "Es probable que usted califique para atención gratuita en el Hospital X". Never say "Guaranteed" or "You saved $X". Say "Could lower your bill by up to $X".
3. **Reference** in the panel: "Case RC-7K2Q", tabular mono, with a Copy button (48px).
4. **What happens next.** A numbered list of 3 to 4 steps, each with who does it and when. Example: "1. You send the letter to the billing office (today). 2. The hospital reviews it. 3. If you don't hear back in 30 days, come back and we'll help you follow up." Give real legal deadlines only when the policy or the law states one, and link the source.
5. **Save a record.** Buttons for Download PDF, Print and Email it to myself. No account needed.
6. **Help.** A link to a real-person help line (for example, Health Consumer Alliance for California patients), plus "Ask the helper".
7. **Button bar:** primary "Send your letters / Enviar sus cartas". The secondary goes back to the review.

**Other rules**
- The page must be revisitable from a bookmark (it reads from `/case/[id]`).
- Don't put links inside a solid green panel unless they reach 3:1. With the `--ok-bg` tint, normal link colors pass.

### B7. First screens and context

People are anxious about money and about photographing a medical document. Before any camera, they need to know four things: what this does, what it costs, what happens to the photo, and that nothing is sent without their approval.

**Screen 1: Start**
- h1: "Check your ER bill for errors and free care" / "Revise su factura de emergencias para encontrar errores y atención gratuita".
- Three short lines, each starting with an icon:
  - "Free. No account." / "Gratis. Sin cuenta."
  - "About 5 minutes. You need your bill." / "Unos 5 minutos. Necesita su factura."
  - "Nothing is sent to the hospital unless you approve it." / "No enviamos nada al hospital sin su aprobación."
- Show the language toggle and the Display button here, large and labelled.
- Primary: "Start / Empezar". Secondary link: "How it works".

**Screen 2: How it works.** Can be skipped. Shown once and remembered.
- Three numbered steps with one small illustration each: "1. Take a photo of your bill. 2. Answer 3 questions. 3. Review and send the letters we draft for you." Say "you send" explicitly, so no one thinks Recount contacts the hospital.
- **Privacy line.** One sentence that states exactly what happens to the photo (where it is processed, how long it is kept, who can see it), linked to details. It must match the real backend. Don't write it until it is confirmed. No padlock icon as a stand-in for a fact.

**Screen 3: Before the camera** (photo tips)
- Show one sample bill photo with 3 callouts: "Lay it flat", "All 4 corners showing", "Good light, no shadow".
- Tell people where to find the right page: "The page with the list of charges, often called an itemized bill". Then add "Don't have it? We'll help you ask for it" as a link to the itemized-bill letter.
- Buttons: "Take photo / Tomar foto" is primary. "Upload a file / Subir un archivo" is secondary. Under them, a text link: "Type it in instead".

**Eligibility answers first.** Follow the Dollar For pattern. Ask the 3 questions before or right after the photo, and show "You likely qualify" fast. Ask for documents only after the user has seen value.

### B8. Form fields

**One question per screen.** That gives three screens: household size, income, insurance status. Each question is the h1, inside the `<label>` or `<legend>`. The caption above it reads "Question 2 of 3 / Pregunta 2 de 3".

**Required and optional**
- Every field is required unless marked.
- Mark only optional fields, with "(optional) / (opcional)" in the label.
- Never use asterisks.
- Where it is a real answer, offer "I'm not sure / No estoy seguro(a)" as the last option, and say what happens if they pick it.

**Labels and hints**
- The label is always visible above the input. Never use a placeholder as a label, and don't use placeholders at all.
- The hint sits below the label in `--fs-sm` `--ink-2`, linked with `aria-describedby`. Example: "Include everyone you claim on your taxes."

**Inputs**
- Height at least 56px (64px in HV). Text `--fs-md`, which must stay at 16px or more to stop iOS zoom.
- 2px `--border`, radius 8px. On focus the border turns `--focus` and gains a 3px outer ring.

**Pick the right control**
- Household size: a stepper with 56px − and + buttons and a typed number field in between, range 1 to 20.
- Income: `inputmode="decimal"`, with the period as radios (Per year, Per month, Per week, Per hour). Accept "$52,000", "52000", "52k" and "52 000". Show the parsed value back: "That's $52,000 a year".
- Insured: radios, each 56px tall with the full row tappable. Use radios, not toggle chips. Options are Yes, No, and "Yes, but it didn't cover this visit".

**Validation**
- Validate on Continue, not on every keystroke or on blur.
- Keep what the user typed.

**Errors**
- Put a 4px `--danger` bar on the left of the field group.
- The message goes between the hint and the input, in `--danger`, at `--fs-md` 600, starting with hidden "Error:" text.
- If there is more than one error, show a summary at the top that takes focus (`role="alert"`) and links to each field.
- Wording follows GOV.UK, in both languages. "Enter how many people live in your household / Escriba cuántas personas viven en su hogar". "Enter your income as a number, like 32000 / Escriba sus ingresos como un número, por ejemplo 32000". No "please", no "invalid", no humor.

**Ineligible is not an error.** "You may not qualify for free care" is a result screen in neutral colors, with next options (a discount, a payment plan, the itemized bill review). It never uses red error styling.

### B9. Helper

**Role.** A guide who explains, never a cheerleader or a salesperson.

**How it looks**
- A simple glyph, a magnifier or a lantern, in `--primary`, at 32px.
- No face with big eyes. No idle animation. No speech bubbles that pop up uninvited.
- It reads as a tool, not a cartoon. That matters for older users and for a money topic.

**Where it appears**
- One line of plain context at the top of hard screens, such as "Why we ask about income".
- The "Ask a question" entry point to the side chat.
- One sentence on the result screen.
- It never appears on the camera screen, on error messages, or in the letters themselves.

**Tone**
- Calm and respectful. "Usted" in Spanish, always.
- Short sentences at a 6th to 8th grade reading level. One idea per message.
- Use "we" for Recount and "you" for the patient. Name things exactly: "charity care", "discount payment", "itemized bill".

**It must never**
1. Promise an outcome or a dollar amount ("You'll pay $0!"). Say "likely" and show the reason.
2. Give legal advice or claim to be a lawyer. Link the statute or policy instead.
3. Celebrate debt, joke about money or illness, or use emoji in serious contexts.
4. Use guilt, streaks, countdowns or "Don't give up!" nudges, Duolingo style.
5. Ask for an SSN, bank details, passwords or payment. If someone types them into the chat, warn them and don't store them.
6. Send anything to the hospital or anyone else. The patient sends it.
7. Pretend to be human. The first chat message says it is automated, and every answer has a "Talk to a person" path.
8. Shame the user ("You should have…") or blame them for errors.
9. Interrupt. It speaks only when the user arrives at a screen or asks.

**Three names that work in English and Spanish**
- **Lupa.** Spanish for magnifying glass, fits "reading your bill", and is easy to say in English.
- **Faro.** Spanish for lighthouse ("guides you"), and two simple syllables in both languages.
- **Lumi.** From *luz* and *lumen*, "brings light", neutral, with no gender and no meaning that needs translating.

Check each name against existing health or finance brands before you pick one.

### B10. Side chat

**Phone (< 1024px)**
- Entry point: a labelled button, "? Ask a question / Hacer una pregunta", 48px tall, in the masthead or in the row under the step bar. Never use a floating bubble over content or over the primary button.
- It opens as a bottom sheet at `height: 92dvh`, with radius 16 on top, a drag handle and a 48px "Close / Cerrar" text button.
- The page behind gets a 40% `--ink` scrim and `inert`. Focus moves to the chat input, and closing returns focus to the trigger.
- The input sits above the keyboard (`interactive-widget=resizes-content`, or `visualViewport`).

**Desktop (≥ 1024px and wide enough for 640 + 48 + 360)**
- A 360px right column, with `position: sticky; top: 24px; max-height: calc(100dvh - 48px)`.
- It opens and closes in place. The content column doesn't move (B3).
- When there isn't room, use a right-side overlay panel, 400px wide, with the same focus rules as the phone sheet.

**Both sizes**
- The first message names what the chat is: "I'm an automated helper. I can explain your bill and California's rules. I can't see anything outside this case."
- Message text uses `--fs-md`.
- Answers that cite a rule link the source.
- New messages are announced with `aria-live="polite"`.
- The chat uses the same language as the page. Changing the toggle switches the chat UI, and new answers come in the new language.

### B11. Language

**Toggle placement and labels**
- The toggle sits top right of the masthead on every screen, and big on screen 1.
- It is a two-option segmented control (current style is fine at 48px), labelled "English" and "Español", each in its own language with `lang="es"` on "Español".
- It sets `<html lang>` and persists.

**No mixed-language screens**
- Every string goes through `strings.ts`, including errors, the alt text, `aria-label`s, the PDF and the chat UI.
- Add a CI test that fails if a Spanish render contains a key with no Spanish value.

**The one exception is the hospital letter.** The letter may need to be in English for the billing office.
- Show it in a box clearly labelled "Carta en inglés (para el hospital)".
- Put a Spanish version right beside it (desktop) or in a tab (phone) titled "Lo que dice su carta".
- The patient approves after reading the Spanish.
- Offer "Send it in Spanish" too where the hospital accepts it.

**Terms and review**
- Use the digital.gov health glossary terms. "Atención caritativa" for charity care, "pago con descuento" for discount payment, "factura detallada" for itemized bill, "ingresos del hogar" for household income.
- A native speaker reviews every string. No raw machine translation in production.
