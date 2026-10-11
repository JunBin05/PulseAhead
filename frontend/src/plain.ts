/**
 * Plain-language reasons for alerts and suggested actions.
 *
 * Everything here is hand-written wording over facts the screen already received (queues, who is
 * busy, ambulances due, bed availability). It never introduces a new number: counts become words, and
 * at most one time is quoted. The figures behind a statement stay in the collapsed detail drawers.
 */
import type { ComparisonRow, ForecastAlert, Snapshot } from './types';

export interface PlainCause {
  /** One short sentence naming what is going wrong. */
  headline: string;
  /** What is driving it, in everyday words, strongest first. */
  because: string[];
  /** Why it matters to patients and staff. */
  whyItMatters: string;
}

type Kind = ForecastAlert['kind'] | undefined;

/** A count as a word: no table of numbers for people to decode. */
export function fewWords(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'some';
  if (n <= 0) return 'no';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  if (n === 3) return 'three';
  if (n <= 5) return 'several';
  return 'many';
}

const people = (n: number | null | undefined): string => `${fewWords(n)} ${n === 1 ? 'person' : 'people'}`;

/** How sure the forecast is, in a word. */
export function chanceWords(chance: number | null | undefined): string {
  if (chance === null || chance === undefined) return 'possible';
  if (chance >= 0.85) return 'very likely';
  if (chance >= 0.6) return 'likely';
  if (chance >= 0.35) return 'possible';
  return 'unlikely';
}

/** "in about 35 minutes", or "soon" when no time is known. */
export function inAbout(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'soon';
  const m = Math.max(0, Math.round(minutes));
  if (m <= 5) return 'within minutes';
  if (m < 60) return `in about ${Math.round(m / 5) * 5} minutes`;
  return 'in about an hour';
}

function ambulancesSoon(snap: Snapshot): { runs: number; patients: number } {
  const t = snap.sim_time_min;
  const soon = (snap.inbound_ambulances ?? []).filter(
    (a) => a.status !== 'cancelled' && a.status !== 'arrived' && a.eta_min - t <= 30,
  );
  return { runs: soon.length, patients: soon.reduce((n, a) => n + a.patient_count, 0) };
}

const verb = (kind: Kind, now: string, soon: string, hot: string): string =>
  kind === 'overloaded' ? hot : kind === 'building' ? now : soon;

/**
 * What is going wrong in this service and why, from received facts only. `kind` only changes the tense:
 * a forecast warning says "may", a building one says "is getting", an overloaded one says "is".
 */
export function plainCause(service: string, snap: Snapshot, kind?: Kind): PlainCause {
  const svc = snap.pressure.services[service];
  const q = svc?.queue ?? null;
  const rates = svc?.rates;
  const flooded = !!rates?.pressure_signal;
  const amb = ambulancesSoon(snap);
  const r = snap.resources;
  const because: string[] = [];
  const add = (s: string | false | null | undefined) => {
    if (s) because.push(s);
  };
  const ambLine =
    amb.runs > 0
      ? `An ambulance is due within half an hour and will add ${amb.patients === 1 ? 'a patient' : 'more patients'} to the pile.`
      : null;
  const floodLine = flooded ? 'More work is arriving than the team on shift can get through.' : null;

  switch (service) {
    case 'imaging':
    case 'lab': {
      const d = r.diagnostics[service];
      const word = service === 'imaging' ? 'scans' : 'blood and lab tests';
      const unit = service === 'imaging' ? 'scanner' : 'lab';
      add(q && q > 0 ? `${people(q)} are waiting for ${word}.` : `Few people are waiting for ${word} yet, but more are on their way.`);
      add(d.busy !== null && d.busy >= d.servers && `The ${unit} is already working flat out.`);
      add(floodLine);
      add(ambLine);
      return {
        headline: `${service === 'imaging' ? 'Imaging' : 'The lab'} ${verb(kind, 'is getting', 'may soon get', 'is')} backed up.`,
        because,
        whyItMatters:
          'Doctors cannot decide what to do for these patients until the results are back, so they stay in their ED bed longer and the next patient waits longer for one.',
      };
    }
    case 'space': {
      const sp = r.ed_spaces;
      add(sp.awaiting_space && sp.awaiting_space > 0 ? `${people(sp.awaiting_space)} are waiting for a free, staffed ED bed.` : null);
      add(sp.available_staffed !== null && sp.available_staffed <= 1 && 'Almost every staffed bed is taken.');
      add(floodLine);
      add(ambLine);
      return {
        headline: `The ED is ${verb(kind, 'running', 'close to running', 'out of')} ${kind === 'overloaded' ? 'free beds.' : 'out of free beds.'}`,
        because,
        whyItMatters: 'Patients who have arrived sit in the waiting area instead of being seen, and ambulance crews cannot hand over.',
      };
    }
    case 'triage': {
      add(q && q > 0 ? `${people(q)} are waiting to be checked in at triage.` : null);
      add(floodLine);
      add(ambLine);
      return {
        headline: `Triage ${verb(kind, 'is getting', 'may soon get', 'is')} swamped.`,
        because,
        whyItMatters: 'Until a patient is triaged nobody knows how urgent they are, so a sick patient could wait unseen in the queue.',
      };
    }
    case 'assessment': {
      add(q && q > 0 ? `${people(q)} are waiting for a doctor.` : null);
      add(r.clinician_slots.busy !== null && r.clinician_slots.busy >= r.clinician_slots.total && 'Every doctor is already with a patient.');
      add(floodLine);
      add(ambLine);
      return {
        headline: `Doctors ${verb(kind, 'are getting', 'may soon be', 'are')} stretched too thin.`,
        because,
        whyItMatters: 'Patients wait longer to be seen and to hear their results, and the longest waits fall on whoever arrives next.',
      };
    }
    case 'transport': {
      add(q && q > 0 ? `${people(q)} are cleared for a ward but still in the ED, waiting for someone to take them.` : null);
      add(r.disposition.transport.busy !== null && r.disposition.transport.busy >= r.disposition.transport.servers && 'The transport team is fully busy.');
      add(floodLine);
      return {
        headline: `Moving patients out to the wards ${verb(kind, 'is getting', 'may soon get', 'is')} stuck.`,
        because,
        whyItMatters: 'Patients who are ready to leave keep taking up ED beds, so new patients cannot be given one.',
      };
    }
    case 'allocation': {
      add(q && q > 0 ? `${people(q)} have been told they need a ward bed, but the paperwork to place them is waiting.` : null);
      add(floodLine);
      return {
        headline: `Placing patients on wards ${verb(kind, 'is getting', 'may soon get', 'is')} slow.`,
        because,
        whyItMatters: 'Patients stay in ED beds for longer than they need to, which holds up everyone behind them.',
      };
    }
    case 'discharge': {
      add(q && q > 0 ? `${people(q)} are cleared to go home but are still waiting to be processed.` : null);
      add(floodLine);
      return {
        headline: `Sending patients home ${verb(kind, 'is getting', 'may soon get', 'is')} slow.`,
        because,
        whyItMatters: 'Beds stay occupied by people who are ready to leave.',
      };
    }
    case 'ward_beds': {
      const b = r.disposition.beds;
      const free = b.ward.free + b.icu.free;
      add(free === 0 ? 'There is no free ward or intensive-care bed right now.' : free <= 1 ? 'There is almost no free ward or intensive-care bed.' : null);
      add(q && q > 0 ? `${people(q)} are waiting in the ED for a bed upstairs.` : null);
      add('This is a hospital-wide shortage; the ED cannot fix it by itself.');
      return {
        headline: `The wards ${verb(kind, 'are getting', 'may soon be', 'are')} too full to take patients from the ED.`,
        because,
        whyItMatters: 'Admitted patients are stuck in ED beds, which is the main reason the ED then fills up.',
      };
    }
    default: {
      add(q && q > 0 ? `${people(q)} are waiting.` : null);
      add(floodLine);
      add(ambLine);
      return {
        headline: `${svc?.name ?? 'This area'} ${verb(kind, 'is getting', 'may soon get', 'is')} overloaded.`,
        because,
        whyItMatters: 'Patients wait longer than they should.',
      };
    }
  }
}

/** One sentence the alert strip and popup can use on its own. */
export function plainAlertLine(a: ForecastAlert, snap: Snapshot): string {
  const c = plainCause(a.service, snap, a.kind);
  if (a.kind === 'overloaded') return `${c.headline} ${c.because[0] ?? ''}`.trim();
  return `${c.headline} ${c.because[0] ?? ''}`.trim();
}

// -- actions ------------------------------------------------------------------------------------

const AREA: Record<string, string> = {
  imaging: 'imaging',
  lab: 'the lab',
  space: 'ED beds',
  triage: 'triage',
  assessment: 'doctors',
  transport: 'patient transport',
  allocation: 'ward placement',
  discharge: 'sending patients home',
  ward_beds: 'ward beds',
};

/** The area of the ED an action works on, in a few words. */
export function plainArea(service: string): string {
  return AREA[service] ?? service;
}

/** What the action physically does, with no jargon. */
export function plainWhatItDoes(row: ComparisonRow): string {
  switch (row.service) {
    case 'allocation':
      return 'Brings in one extra coordinator to match patients who need a ward bed with the beds that are free.';
    case 'transport':
      return 'Adds one extra transport team so patients who are ready for a ward leave the ED sooner.';
    case 'discharge':
      return 'Adds one extra person to finish the paperwork for patients who are cleared to go home.';
    case 'lab':
      return 'Opens one extra lab slot so waiting blood and lab tests are done sooner.';
    case 'imaging':
      return 'Opens one extra imaging slot so waiting scans are done sooner.';
    case 'space':
      return 'Opens a spare, staffed ED bed so patients waiting for a bed can be seen sooner.';
    default:
      return row.effect;
  }
}

function plainBlocked(row: ComparisonRow): string {
  const text = row.reasons.join(' ').toLowerCase();
  if (text.includes('another action')) return 'Another fix is already under way, and only one can run at a time.';
  if (text.includes('suitable bed')) {
    return 'Patients here are waiting for a free bed, not for paperwork. An extra coordinator cannot create a bed, so it would not help.';
  }
  if (text.includes('not current') || text.includes('cannot be assessed')) {
    return 'The information needed to judge this is out of date, so it is not suggested.';
  }
  if (text.includes('declared reserve is not available')) return 'The spare resource it relies on is not available.';
  const idle: Record<string, string> = {
    lab: 'No tests are waiting for the lab right now, so an extra slot would sit idle.',
    imaging: 'No scans are waiting right now, so an extra slot would sit idle.',
    transport: 'No patient is waiting to be moved to a ward right now, so an extra team would have nothing to do.',
    discharge: 'No patient is cleared and waiting to go home right now, so an extra person would have nothing to do.',
    allocation: 'No patient is waiting to be placed on a ward right now, so an extra coordinator would have nothing to do.',
    space: 'There is no need for a spare bed right now.',
  };
  return idle[row.service] ?? 'Nobody is waiting for what this would add, so it would not help right now.';
}

/** Why this action is, or is not, on the list. One or two plain sentences. */
export function plainActionReason(row: ComparisonRow, isTop: boolean): string {
  const what = plainWhatItDoes(row);
  if (!row.feasible) return plainBlocked(row);
  switch (row.rank?.label) {
    case 'best_action':
      return isTop ? what : `${what} It also helps.`;
    case 'supported_not_top':
      return `${what} In our practice runs it also helped, but by less than the top choice.`;
    case 'no_action_shown_to_help':
      return `${what} In our practice runs it did not make a clear enough difference to be worth using staff on right now.`;
    case 'needs_review':
      return `${what} We cannot yet be sure it will not delay urgent patients, so a person should look at it first.`;
    case 'urgent_delay_check_failed':
      return `${what} In our practice runs it made urgent patients wait longer, so we do not suggest it.`;
    case 'cannot_assess':
      return 'Some of the information needed is missing or out of date, so we cannot judge this.';
    default:
      return what;
  }
}

/** Why the top suggestion is first, set against the others on the list. */
export function plainWhyTop(top: ComparisonRow, rows: ComparisonRow[], alertService?: string | null): string[] {
  const out: string[] = [];
  if (alertService && top.service === alertService) {
    out.push('It goes straight at the part of the ED that is about to jam up, rather than somewhere else.');
  } else {
    out.push('It relieves the pressure point that is holding the rest of the ED back.');
  }
  out.push('Across our practice runs it gave the clearest saving in waiting time.');
  out.push('Urgent patients did not end up waiting longer because of it.');
  const others = rows.filter((r) => r.id !== top.id);
  const alsoHelps = others.filter((r) => r.feasible && (r.rank?.label === 'supported_not_top' || r.rank?.label === 'best_action'));
  const noHelp = others.filter((r) => r.feasible && r.rank?.label !== 'supported_not_top' && r.rank?.label !== 'best_action');
  const blocked = others.filter((r) => !r.feasible);
  if (alsoHelps.length) out.push(`${alsoHelps.map((r) => r.name).join(' and ')} also helped, but by less.`);
  if (noHelp.length) out.push(`${noHelp.map((r) => r.name).join(' and ')} did not make enough difference.`);
  if (blocked.length) out.push(`${blocked.length === 1 ? 'One option' : 'Some options'} cannot be used right now (see below).`);
  const wait = (top.review_min ?? 0) + (top.setup_min ?? 0);
  if (wait > 0) out.push(`It takes about ${wait} minutes to sign off and set up, so the sooner it is approved the more it helps.`);
  return out;
}
