# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
React 19 + TypeScript + three + @react-three/fiber on Vite for the frontend; Python 3.12, SimPy and FastAPI for the engine and API. The built frontend is served from the same origin as the API. Decided in the approved spec.

## Users
An emergency department (ED) shift coordinator, working with triage charge nurses, the ED attending lead, lab and radiology managers, and the ward supervisor or bed manager. They are making live operational decisions during a busy shift: where patients are stuck, how long until the ED is congested, and which resource to activate now. A hackathon judge is a secondary audience for the same screens.

## Product Purpose
PulseAhead is a synthetic 3D operational digital twin of one fictional 24-space ED. It shows patient dots moving through four zones (arrival and triage, doctor assessment, diagnostics, disposition), forecasts when sustained congestion may begin, and compares six staff-approved operational actions against no action. Each approval is routed to the supervisor who owns the required resources, and the delayed effect is shown. Success means a coordinator can go from a building queue to an approved, understood action without hunting across screens.

## Positioning
A forecast with a decision attached: it estimates when sustained congestion starts, with chance and range, and ties each proposed action to the supervisor who actually owns the resources. It shows urgent-patient delay checks beside average savings, and returns "no action shown to help" instead of forcing a recommendation.

## Operating Context
Used during a shift by staff who read status quickly under pressure. Replay of synthetic shifts with play, pause, step, speed and reset; received ambulance announcements; zone drawers; review and approval dialogs. Also presented live to judges in a timed pitch (3 min plus 2 min Q&A, or 4 min demo plus 3 min Q&A).

## Capabilities and Constraints
- Synthetic data only; a persistent "Synthetic demo" label is required. Demo roles are not real authentication.
- The backend owns all state; the 3D scene shows only received simulation events.
- A matching 2D, keyboard and reduced-motion mode is required. Layouts at 375, 768, 1024 and 1440 px without page-level horizontal scroll; 4.5:1 text contrast and 44 px primary targets.
- Target 30 fps at 200 visible patient dots on the demo machine.
- No claims of clinical outcomes, ROI or validated hospital performance.
- Out of scope: real hospital data or integrations, autonomous clinical decisions, realistic hospital models, VR, production authentication.

## Brand Commitments
Name: PulseAhead. Wireframe layout is binding: "Simulation Window" title left in the header and textual Overall status right, controls and ambulance feed on the left, central four-node 3D scene, selected-zone drawer on the right. Calm light surfaces, readable system fonts, status shown with text and icon, never colour alone.

## Evidence on Hand
No real data, customers or benchmarks exist. All numbers come from the synthetic engine once built. Do not fabricate results; screens must show only values the backend produced.

## Product Principles
1. Truth over spectacle: the scene never shows progress the model has not produced.
2. One clear journey: start, spot the delay, inspect, compare, approve with the right owner, watch the effect.
3. Honest uncertainty: show chance, range and "Cannot assess" rather than a false countdown.
4. Resource owners decide: approvals follow resource ownership, not the clicked zone.
5. Never force a winner: no help is a valid answer.

## Accessibility & Inclusion
WCAG-style targets from the spec: 4.5:1 normal-text contrast, 44 px primary controls, visible focus, labelled controls, dialog focus management, reduced motion, and a keyboard-operable 2D equivalent of the 3D view.
