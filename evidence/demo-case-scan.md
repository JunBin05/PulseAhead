# Demo case scan (non-test seeds only: development, tuning, demo)

Scanned 49 shifts at warning threshold 0.6 (model mc-flow-2). **No episode qualified** (lead >= 30 min, >= 2 supported drivers, a feasible supported action). No demo case is written; the demo reports that honestly.

- 35 early-warned episode(s): fewer than two supported drivers
- 2 early-warned episode(s): lead 1.0 min is under 30
- 1 early-warned episode(s): lead 10.0 min is under 30
- 3 early-warned episode(s): lead 11.0 min is under 30
- 1 early-warned episode(s): lead 13.0 min is under 30
- 1 early-warned episode(s): lead 15.0 min is under 30
- 2 early-warned episode(s): lead 16.0 min is under 30
- 1 early-warned episode(s): lead 17.0 min is under 30
- 1 early-warned episode(s): lead 2.0 min is under 30
- 1 early-warned episode(s): lead 21.0 min is under 30
- 1 early-warned episode(s): lead 24.0 min is under 30
- 5 early-warned episode(s): lead 25.0 min is under 30
- 1 early-warned episode(s): lead 26.0 min is under 30
- 1 early-warned episode(s): lead 27.0 min is under 30
- 3 early-warned episode(s): lead 3.0 min is under 30
- 2 early-warned episode(s): lead 4.0 min is under 30
- 1 early-warned episode(s): lead 5.0 min is under 30
- 2 early-warned episode(s): lead 9.0 min is under 30
- 5 early-warned episode(s): no feasible, supported action for the alerted zone
- 5 early-warned episode(s): overall-ED episode: the demo case is a local service alert

## Finding (49 shifts: development, tuning and the new non-test `demo` partition)
74 early-warned episodes; 5 have at least two supported drivers and 30+ min lead (diagnostic-delay 3031 space T+345 lead 79; mixed-cascade 3051 space, 3052 space, 3054 space x2, up to three drivers, lead 61 to 84 min). All five are staffed-ED-space overloads, for which this build has **no** action preset (staffed surge spaces are "not modeled"), so none has a feasible supported action and none qualifies. Nothing was relaxed.
