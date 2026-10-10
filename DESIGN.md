---
name: PulseAhead
description: Synthetic 3D operational twin of a fictional 24-space emergency department.
colors:
  accent: "#0a6680"
  accent-hover: "#085469"
  accent-pressed: "#064557"
  accent-ink: "#ffffff"
  accent-soft: "#dcecf1"
  ground: "#f2f5f7"
  surface: "#ffffff"
  surface-sunken: "#e9eef2"
  line: "#d3dae1"
  line-strong: "#b4bfca"
  ink: "#15202b"
  ink-muted: "#46535f"
  ink-faint: "#5c6874"
  status-normal-ink: "#14663e"
  status-normal-tint: "#e0f1e7"
  status-pressure-ink: "#7a4d00"
  status-pressure-tint: "#fdf0cc"
  status-overload-ink: "#a4231a"
  status-overload-tint: "#fce6e3"
  status-unknown-ink: "#44505b"
  status-unknown-tint: "#e6eaee"
  urgency-urgent: "#b4281f"
  urgency-medium: "#b8700a"
  urgency-lower: "#1f6f8f"
  scene-ground: "#e4eaef"
  scene-platform: "#f8fafb"
  scene-platform-edge: "#b3bec8"
typography:
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.45
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  sm: "6px"
  md: "8px"
  pill: "999px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-sunken}"
  segmented-option-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    height: "44px"
  zone-button-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  status-badge-normal:
    backgroundColor: "{colors.status-normal-tint}"
    textColor: "{colors.status-normal-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  status-badge-pressure:
    backgroundColor: "{colors.status-pressure-tint}"
    textColor: "{colors.status-pressure-ink}"
    rounded: "{rounded.md}"
    height: "44px"
  status-badge-overload:
    backgroundColor: "{colors.status-overload-tint}"
    textColor: "{colors.status-overload-ink}"
    rounded: "{rounded.md}"
    height: "44px"
  synthetic-chip:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
    height: "32px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "16px"
  tag:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
---

# Design System: PulseAhead

## Overview

**Creative North Star: "The Charge Desk"**

PulseAhead is the calm, well-lit station a shift coordinator stands at to read the whole floor at a glance. Surfaces are light and cool-neutral, and most of the screen is quiet on purpose. The eye goes to the one place where flow is stuck: a status badge, a queue count, or a cluster of dots in the scene. Status is always spoken plainly in words, with an icon, and never by colour alone.

Density is operational, not editorial. A three-column workspace holds controls and feeds on the left, the isometric four-zone scene in the centre, and the selected-zone drawer on the right. Numbers use tabular figures and sit right-aligned in key/value lists, so a coordinator can compare them down a column. Exactly one accent, Deep Clinical Teal, marks primary actions and the current selection, and nothing else.

The 3D scene is a simple isometric diagram, not a realistic hospital. Flat pale platforms with hairline edges, small coloured patient dots and DOM labels carry the meaning. Depth exists only to show four zones in sequence.

**Key Characteristics:**
- Light, cool-neutral ground with white panels; one teal accent.
- Status always uses text, an icon and a tint together.
- System font stack, a compact type scale and tabular numerals.
- 44px minimum targets on every control; a visible 3px teal focus ring.
- A simple isometric scene; its labels are DOM text, so they stay readable at any zoom.

## Colors

A cool, low-chroma neutral world with one deep teal accent and four strictly reserved status hues.

### Primary
- **Deep Clinical Teal** (`accent`): primary buttons, the selected zone button and platform outline, the selected speed option, and the focus ring. Hover darkens it to `accent-hover` and press to `accent-pressed`. **Clinical Teal Wash** (`accent-soft`) is the selected-state fill behind teal text.

### Neutral
- **Charge Desk Ground** (`ground`): the page background behind panels.
- **Clean Sheet White** (`surface`): panels, header, zone bar and default buttons.
- **Recessed Tray** (`surface-sunken`): hover fill, disabled fill, the Synthetic demo chip and tags.
- **Hairline** (`line`) and **Firm Hairline** (`line-strong`): panel borders and dividers; button and chip outlines.
- **Chart Ink** (`ink`): primary text. **Muted Ink** (`ink-muted`): labels, secondary text and scene area labels. **Faint Ink** (`ink-faint`): disabled text only.
- **Scene Floor** (`scene-ground`), **Platform White** (`scene-platform`) and **Platform Edge** (`scene-platform-edge`): the 3D scene's background, zone platforms and their hairline edges.

### Status and urgency
- **Stable Green**, **Pressure Amber**, **Overload Red** and **Unknown Slate** each come as an ink/tint pair (`status-*-ink` on `status-*-tint`, each ≥4.5:1). They are used only for status badges and banners, and each has a fixed icon: check, triangle, octagon, question mark.
- **Urgency dots:** `urgency-urgent` (largest dot), `urgency-medium` and `urgency-lower` (smallest dot). Size and the legend text distinguish them as well as hue.

### Named Rules
**The One Accent Rule.** Teal means "action or current selection". It never signals status, urgency or decoration.

**The Never Colour Alone Rule.** Every status or urgency colour is paired with text and an icon or size difference. A screen read in greyscale must lose no meaning.

## Typography

**Display Font:** none. The product has no display tier.
**Body Font:** the system UI stack (`ui-sans-serif, system-ui, Segoe UI, Roboto, …`).

**Character:** native, neutral and fast to read under pressure. Weight (600–650), not size, carries the hierarchy.

### Hierarchy
- **Title** (650, 1.3125rem, −0.01em): "Simulation Window" in the header only.
- **Headline** (650, 1rem): panel headings and the status badge label.
- **Body** (400, 0.875rem, 1.45, tabular numerals): all running text and key/value lists. Values are 650 and right-aligned.
- **Label** (600, 0.75rem): meta labels, field labels, zone numbers, scene zone labels and tags. Scene area labels use 11px Muted Ink.

### Named Rules
**The Tabular Count Rule.** Every number a coordinator compares (counts, spaces, times) uses tabular numerals and sits in a consistent, right-aligned column.

## Layout

There are three columns on wide screens: left controls and feeds (300px), the flexible central scene, and the right drawer (340px). Gaps and padding are 16px. Panels stack in their column with 16px between them.

- **≤1180px:** two columns (280px plus the scene); the drawer drops to a full-width row.
- **≤760px:** one column with 12px padding; the scene is 300px tall and the zone bar becomes 2 × 2.

There is no page-level horizontal scroll at 375, 768, 1024 or 1440px. The header wraps: the title stays left and the Overall status flows right. Spacing follows a 4px base (4, 8, 12, 16, 24, 32).

The scene canvas is `clamp(340px, 52vh, 560px)` tall. The camera is fixed and the zoom fits the world to the canvas. Below 560px of canvas width, the scene switches to compact labels (zone numbers and exits only); the zone buttons under the map carry the full names and counts.

## Elevation & Depth

Panels are flat and lifted by a whisper-soft ambient shadow. Their outline comes from a hairline border; the shadow only separates a panel from the ground. Nothing gets deeper on hover. Real depth belongs only to the isometric scene, where platforms are lit flatly (ambient 1.7, directional 1.5) so they read as pale slabs, not glossy objects.

### Shadow Vocabulary
- **Panel lift** (`box-shadow: 0 1px 2px rgba(21,32,43,.06), 0 4px 14px rgba(21,32,43,.06)`): every panel and the scene frame. This is the only shadow.

### Named Rules
**The Flat Panel Rule.** One shadow value, used at rest only. State changes use fill and border, never extra elevation.

## Shapes

Corners are gently rounded: 8px on panels, buttons, zone buttons and status badges, and 6px on small floating labels. Pills (999px) are used only for the Synthetic demo chip and tags. Dividers and outlines are 1px hairlines. Patient dots are spheres sized by urgency. Zone platforms are square slabs, with exit pads as lower, smaller squares.

## Components

### Buttons
- **Shape:** gently rounded (8px), at least 44 × 44px, 16px horizontal padding, 600 weight, with an icon before the label.
- **Primary:** Deep Clinical Teal with white text (Start, Play/Pause). Hover and press darken the teal.
- **Secondary:** white with a Firm Hairline outline (Step, Reset). Hover uses Recessed Tray.
- **Disabled:** Recessed Tray fill with Faint Ink text. Don't disable a control while a request is in flight; doing so drops keyboard focus. Ignore the duplicate instead.
- **Focus:** a 3px teal outline with a 2px offset on every focusable element.

### Segmented speed control
Four equal 44px options in one outlined group. The selected option has a Clinical Teal Wash fill, teal text and a 3px teal underline, and exposes `aria-pressed`.

### Status badge
A 44px-tall rounded block: the icon, then the label in 650 weight, with the status ink on its tint and a 30% ink border. It always appears with the "Overall status" label above it.

### Panels and key/value lists
White, 8px corners, hairline border, panel lift and 16px padding. Headings are 1rem/650. Key/value rows show a Muted Ink term with a 650, right-aligned value.

### Zone buttons
A row of four cards under the scene, each showing the zone number (label), name (650) and patient count (label). Selected: teal border, inset ring and Clinical Teal Wash. They toggle the right-hand drawer and work from the keyboard. They are the accessible twin of clicking a platform.

### Scene labels
DOM text projected over the fixed isometric camera; it never catches pointer events. Zone labels are small rounded white cards ("2 · Doctor assessment · 2") placed off each platform's front edge. Area labels are plain 11px Muted Ink text that starts just behind the first dot of its own row and stays on its own platform.

### Banners
Full-width messages under the header. An error banner uses the Overload ink/tint pair, states the last valid simulated time and how old it is, and offers Retry. A pending banner uses Unknown Slate.

## Do's and Don'ts

### Do:
- **Do** show every status with text, an icon and its ink/tint pair together.
- **Do** keep every interactive target at least 44px and keep the 3px teal focus ring visible.
- **Do** right-align numbers in key/value lists, using tabular numerals.
- **Do** place scene labels on their own platform and check them for overlap at 375 and 1440px.
- **Do** keep the "Synthetic demo" chip in the header on every screen.

### Don't:
- **Don't** use teal for status, urgency or decoration.
- **Don't** add a second shadow or deeper elevation for hover or selection.
- **Don't** put configuration or dense controls inside the 3D scene; they belong in the side panels.
- **Don't** let a scene label run past its platform onto a neighbouring zone.
- **Don't** use a display font, gradients or glossy materials; the scene stays a flat, pale diagram.
