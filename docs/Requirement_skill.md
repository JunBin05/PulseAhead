---
name: track-1-completion
description: Enforce a mandatory completion checklist for Track 1 predictive-model projects. Use during Track 1 project work, when reviewing priorities, and before declaring a project finished or ready to pitch or submit.
---

# Track 1 completion checklist

Help the team answer the judging question: **Does our model help someone make a better decision, and can we prove it?**

Keep the work practical, the checklist short, and explanations natural. Choose the simplest approach that meets the requirements.

## How to use it

1. Read the current project and available evidence. Reuse existing work.
2. Create or update `TRACK_1_CHECKLIST.md` in the project root using the checklist below. Preserve verified progress and recheck items affected by changes.
3. Work through Priority 1, then Priority 2, then Priority 3. Address gaps within the user's authorized task; list broader gaps as remaining work.
4. Before calling the whole project finished, ready to pitch, or ready to submit, review every item. Tick an item only when observed evidence supports it, and add one short evidence note beside it. Plans and unsupported claims stay unchecked.

The project is **Ready** only when every applicable item is checked. Otherwise report **Not ready**, the remaining unchecked items, and the next useful action. A specific subtask can be complete while the project remains not ready; keep those statuses separate.

All checklist items are mandatory. Only the shortlisted-team pitch requirement is conditional. Missing data, untested behavior, or missing evidence are gaps, not reasons to mark an item inapplicable. If a gap cannot be resolved with available access or information, state the blocker honestly.

## Priority 1 — Make the prediction useful

- [ ] **Problem and user:** Name the specific real-world problem, who benefits, and the decision they need to make before a failure or loss becomes costly.
- [ ] **Detect:** Demonstrate a working prediction, forecast, or unusual-pattern detection from data that gives the user time to act.
- [ ] **Categorize:** Explain the type of issue or predicted outcome, beyond simply saying something is abnormal.
- [ ] **Prioritize:** Put findings in a clear order using relevant business impact, financial cost, operational risk, or urgency. Explain the basis simply.
- [ ] **Explain:** Give understandable reasons tied to the actual inputs or model output so a non-expert can understand the finding. State uncertainty where it affects the decision.
- [ ] **Recommend action:** Show what the user should do next and how the prediction informs that action.

## Priority 2 — Prove it is dependable and worthwhile

- [ ] **Prediction evidence:** Record the data source and show a relevant result on data held apart from training or tuning where applicable. Use a suitable metric and a simple baseline where meaningful. Clearly label synthetic data, simulated outputs, and limitations; claims must match what was demonstrated.
- [ ] **Robustness:** Check representative noisy or unfamiliar inputs and record how the solution behaves, including when it cannot give a useful answer.
- [ ] **False alarms:** Check normal cases as well as problem cases, report false alarms, and justify the alert threshold or equivalent decision rule for the intended use.
- [ ] **Measurable impact:** Show a concrete benefit, such as time saved, cost avoided, reduced risk, or fewer missed failures. Include the calculation and realistic assumptions; label estimates as estimates.
- [ ] **Better-decision proof:** Walk through a realistic case showing the decision with the model versus the current approach, and connect the improvement to the evidence above.

## Priority 3 — Be ready to show it

- [ ] **Working demo:** Run the main path from input to prediction, issue category, priority, explanation, and recommended action. Show a normal case and a meaningful problem case.
- [ ] **Pitch and Q&A:** Rehearse the local format: 3 minutes of live presentation plus 2 minutes of Q&A. Prepare clear answers about the user, data, model evidence, false alarms, limitations, and impact. If shortlisted, also rehearse the global format: 4 minutes of demo plus 3 minutes of Q&A.

## Keep the scope simple

The attached Track 1 slides supply the requirements: predict early, support decisions, detect, categorize, prioritize, explain, handle noisy or unfamiliar data, minimize false alarms, and demonstrate measurable impact. The data checks and evidence notes above are practical ways to prove those requirements, not additional organizer rules.

The suggested industries are examples, not separate tasks: predictive maintenance, supply chain anomalies, quality or defects, renewable energy, batteries, and financial audit or fraud. Stay with the team's chosen problem. Track 2 agentic-solution requirements do not apply.

Use the supplied pitch timings unless the team has newer organizer instructions. Avoid adding features just to fill the checklist; close each gap with the smallest useful change or demonstration.

When reporting progress, show the checked and unchecked items with brief evidence, then **Ready** or **Not ready**. Keep the report natural and easy for the team to act on.
