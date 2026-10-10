# Demo case scan (development and tuning seeds only)

Scanned 21 shifts, forecast every 15 min at 50 futures; 1 qualifying early-warned episodes (lead >= 30 min, >= 2 supported drivers, a feasible supported action for the alerted zone).

## Chosen

Chosen from 1 qualifying early-warned episodes on development/tuning seeds (21 shifts scanned): 2 supported drivers (diagnostics, arrivals), a forecast-risk alert 40 min before onset, and a best action for zone 3. A demo case, not held-out evidence.

## Qualifying

- busy-recovers seed 1011 (tuning): lab onset T+145, alert T+105 (lead 40), drivers ['diagnostics', 'arrivals'], overall Stable, action diagnostic_reserve:lab best_action

## Not qualifying (early-warned episodes)

- normal seed 1002: lab onset T+261: fewer than two supported drivers
- normal seed 1002: lab onset T+312: fewer than two supported drivers
- normal seed 1002: imaging onset T+359: fewer than two supported drivers
- normal seed 1002: ward_beds onset T+509: fewer than two supported drivers
- busy-recovers seed 7: ward_beds onset T+393: fewer than two supported drivers
- busy-recovers seed 7: ward_beds onset T+501: fewer than two supported drivers
- busy-recovers seed 1011: imaging onset T+205: fewer than two supported drivers
- busy-recovers seed 1011: ward_beds onset T+175: fewer than two supported drivers
- busy-recovers seed 1011: ward_beds onset T+259: lead 4.0 min is under 30
- busy-recovers seed 1012: triage onset T+559: lead 19.0 min is under 30
- busy-recovers seed 1012: triage onset T+598: fewer than two supported drivers
- busy-recovers seed 1012: lab onset T+575: lead 20.0 min is under 30
- busy-recovers seed 1012: ward_beds onset T+449: fewer than two supported drivers
- arrival-surge seed 1021: imaging onset T+422: lead 2.0 min is under 30
- arrival-surge seed 1022: lab onset T+181: lead 16.0 min is under 30
- arrival-surge seed 1022: lab onset T+257: fewer than two supported drivers
- arrival-surge seed 1022: ward_beds onset T+255: fewer than two supported drivers
- diagnostic-delay seed 1031: overall onset T+372: overall-ED episode: the demo case is a local service alert
- diagnostic-delay seed 1031: space onset T+310: fewer than two supported drivers
- diagnostic-delay seed 1031: lab onset T+534: lead 9.0 min is under 30
- diagnostic-delay seed 1032: triage onset T+486: fewer than two supported drivers
- diagnostic-delay seed 1032: space onset T+511: fewer than two supported drivers
- boarding-blockage seed 1041: ward_beds onset T+159: lead 9.0 min is under 30
- boarding-blockage seed 1042: triage onset T+545: lead 5.0 min is under 30
- boarding-blockage seed 1042: lab onset T+581: lead 26.0 min is under 30
- boarding-blockage seed 1042: ward_beds onset T+164: fewer than two supported drivers
- mixed-cascade seed 7: ward_beds onset T+271: fewer than two supported drivers
- mixed-cascade seed 1051: imaging onset T+143: lead 8.0 min is under 30
- mixed-cascade seed 1051: ward_beds onset T+149: lead 14.0 min is under 30
- mixed-cascade seed 1052: space onset T+595: fewer than two supported drivers
- mixed-cascade seed 1052: imaging onset T+164: fewer than two supported drivers
- mixed-cascade seed 1052: ward_beds onset T+206: lead 26.0 min is under 30
- no-effective-action seed 1061: imaging onset T+138: fewer than two supported drivers
- no-effective-action seed 1062: ward_beds onset T+343: lead 13.0 min is under 30
