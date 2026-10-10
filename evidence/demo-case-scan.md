# Demo case scan (non-test seeds only: development, tuning, demo)

Scanned 49 shifts, forecast every 15 min at 50 futures; 1 qualifying early-warned episodes (lead >= 30 min, >= 2 supported drivers, a feasible supported action for the alerted zone).

## Chosen

Chosen from 1 qualifying early-warned episodes on non-test seeds (development, tuning, demo) (49 shifts scanned): 2 supported drivers (boarding, diagnostics), a forecast-risk alert 61 min before onset, and a supported not top for zone 2. A demo case, not held-out evidence.

## Qualifying

- mixed-cascade seed 3052 (demo): space onset T+346, alert T+285 (lead 61), drivers ['boarding', 'diagnostics'], overall Stable, action staffed_surge_space:space supported_not_top

## Not qualifying (early-warned episodes)

- normal seed 1002: lab onset T+261: lead 21.0 min is under 30
- normal seed 1002: imaging onset T+359: fewer than two supported drivers
- normal seed 1002: ward_beds onset T+509: fewer than two supported drivers
- normal seed 3001: ward_beds onset T+369: lead 9.0 min is under 30
- normal seed 3003: imaging onset T+153: lead 3.0 min is under 30
- normal seed 3003: ward_beds onset T+368: fewer than two supported drivers
- busy-recovers seed 7: ward_beds onset T+393: fewer than two supported drivers
- busy-recovers seed 7: ward_beds onset T+501: fewer than two supported drivers
- busy-recovers seed 1011: lab onset T+145: lead 25.0 min is under 30
- busy-recovers seed 1011: imaging onset T+205: lead 25.0 min is under 30
- busy-recovers seed 1011: ward_beds onset T+175: fewer than two supported drivers
- busy-recovers seed 1011: ward_beds onset T+259: lead 4.0 min is under 30
- busy-recovers seed 1012: ward_beds onset T+449: fewer than two supported drivers
- busy-recovers seed 3011: space onset T+565: lead 25.0 min is under 30
- busy-recovers seed 3011: imaging onset T+364: fewer than two supported drivers
- busy-recovers seed 3011: ward_beds onset T+423: fewer than two supported drivers
- busy-recovers seed 3012: lab onset T+162: lead 27.0 min is under 30
- busy-recovers seed 3012: imaging onset T+477: fewer than two supported drivers
- busy-recovers seed 3012: ward_beds onset T+517: fewer than two supported drivers
- busy-recovers seed 3013: lab onset T+173: fewer than two supported drivers
- busy-recovers seed 3013: ward_beds onset T+354: fewer than two supported drivers
- arrival-surge seed 1021: imaging onset T+422: lead 2.0 min is under 30
- arrival-surge seed 1022: lab onset T+181: lead 16.0 min is under 30
- arrival-surge seed 1022: ward_beds onset T+255: fewer than two supported drivers
- arrival-surge seed 3021: ward_beds onset T+537: fewer than two supported drivers
- arrival-surge seed 3022: ward_beds onset T+504: fewer than two supported drivers
- arrival-surge seed 3023: lab onset T+596: lead 11.0 min is under 30
- arrival-surge seed 3023: ward_beds onset T+582: fewer than two supported drivers
- diagnostic-delay seed 1031: overall onset T+372: overall-ED episode: the demo case is a local service alert
- diagnostic-delay seed 1031: space onset T+310: fewer than two supported drivers
- diagnostic-delay seed 1032: space onset T+511: fewer than two supported drivers
- diagnostic-delay seed 3031: space onset T+370: lead 25.0 min is under 30
- diagnostic-delay seed 3031: ward_beds onset T+535: lead 25.0 min is under 30
- diagnostic-delay seed 3032: space onset T+328: lead 13.0 min is under 30
- diagnostic-delay seed 3032: space onset T+578: fewer than two supported drivers
- diagnostic-delay seed 3032: lab onset T+422: fewer than two supported drivers
- diagnostic-delay seed 3032: imaging onset T+135: lead 15.0 min is under 30
- diagnostic-delay seed 3032: ward_beds onset T+565: fewer than two supported drivers
- diagnostic-delay seed 3033: overall onset T+396: overall-ED episode: the demo case is a local service alert
- diagnostic-delay seed 3033: space onset T+365: fewer than two supported drivers
- diagnostic-delay seed 3034: imaging onset T+150: fewer than two supported drivers
- diagnostic-delay seed 3034: ward_beds onset T+530: fewer than two supported drivers
- boarding-blockage seed 1041: ward_beds onset T+159: lead 9.0 min is under 30
- boarding-blockage seed 1042: triage onset T+545: lead 5.0 min is under 30
- boarding-blockage seed 1042: lab onset T+581: lead 26.0 min is under 30
- boarding-blockage seed 3041: overall onset T+464: overall-ED episode: the demo case is a local service alert
- boarding-blockage seed 3041: space onset T+380: fewer than two supported drivers
- boarding-blockage seed 3042: imaging onset T+341: lead 11.0 min is under 30
- boarding-blockage seed 3044: space onset T+575: fewer than two supported drivers
- mixed-cascade seed 7: ward_beds onset T+271: lead 1.0 min is under 30
- mixed-cascade seed 1052: space onset T+595: fewer than two supported drivers
- mixed-cascade seed 1052: imaging onset T+164: fewer than two supported drivers
- mixed-cascade seed 1052: ward_beds onset T+206: lead 11.0 min is under 30
- mixed-cascade seed 3051: space onset T+484: lead 4.0 min is under 30
- mixed-cascade seed 3051: imaging onset T+123: lead 3.0 min is under 30
- mixed-cascade seed 3052: overall onset T+377: overall-ED episode: the demo case is a local service alert
- mixed-cascade seed 3052: triage onset T+137: lead 17.0 min is under 30
- mixed-cascade seed 3053: lab onset T+535: lead 10.0 min is under 30
- mixed-cascade seed 3053: imaging onset T+121: lead 16.0 min is under 30
- mixed-cascade seed 3054: overall onset T+485: overall-ED episode: the demo case is a local service alert
- mixed-cascade seed 3054: space onset T+421: no feasible, supported action for the alerted zone
- no-effective-action seed 3062: ward_beds onset T+166: lead 1.0 min is under 30
- no-effective-action seed 3064: discharge onset T+183: lead 3.0 min is under 30
