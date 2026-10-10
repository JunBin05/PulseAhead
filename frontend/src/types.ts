export type Urgency = 'urgent' | 'medium' | 'lower';

export type Phase =
  | 'awaiting_triage'
  | 'in_triage'
  | 'awaiting_space'
  | 'awaiting_clinician'
  | 'assessment_active'
  | 'awaiting_care_completion'
  | 'awaiting_lab'
  | 'in_lab'
  | 'awaiting_imaging'
  | 'in_imaging'
  | 'awaiting_result_review'
  | 'result_review_active'
  | 'awaiting_discharge'
  | 'awaiting_ward_bed'
  | 'awaiting_ward_allocation'
  | 'ward_allocation_active'
  | 'awaiting_transport'
  | 'in_transport'
  | 'disposition_processing';

export interface PatientDot {
  id: string;
  /** Supplied reporting urgency group (not assigned by the model). */
  urgency: Urgency;
  acuity_system: string;
  acuity_score: number;
  critical_bypass: boolean;
  arrival_mode: 'walk-in' | 'ambulance';
  ambulance_id: string | null;
  phase: Phase;
  zone: number | null;
  has_space: boolean;
  space_id: string | null;
  clinician_id: string | null;
  nurse_id: string | null;
  diagnostic_unit: string | null;
  tests_status: 'not_ordered' | 'none' | 'pending' | 'complete';
  tests_done: ('lab' | 'imaging')[];
  /** Supplied with the clinical decision; null until that decision is received. */
  disposition: 'home' | 'ward' | 'icu' | null;
  ward_bed_id: string | null;
  waiting_reason: string | null;
  care_status: 'none' | 'not_started' | 'in_progress' | 'complete';
  decision_received: boolean;
  triage_id: string | null;
  phase_since_min: number;
  minutes_in_phase: number;
  arrival_min: number;
}

export interface Zone {
  id: number;
  key: string;
  name: string;
  patient_count: number;
  patient_ids: string[];
  queue: number | null;
  active: number | null;
  awaiting_space?: number | null;
  awaiting_clinician?: number | null;
  awaiting_care_completion?: number | null;
  awaiting_result_review?: number | null;
  result_review_active?: number | null;
  lab_queue?: number | null;
  lab_active?: number | null;
  awaiting_discharge?: number | null;
  discharge_active?: number | null;
  awaiting_ward_bed?: number | null;
  awaiting_ward_allocation?: number | null;
  allocation_active?: number | null;
  awaiting_transport?: number | null;
  in_transport?: number | null;
  home_patients?: number;
  transfer_patients?: number;
  imaging_queue?: number | null;
  imaging_active?: number | null;
  capacity: { kind: string; shared_with_zone?: number } | null;
}

export interface DispService {
  servers: number;
  busy: number | null;
  waiting: number | null;
  /** False when a fixture declares this service's inputs missing (figures are then null). */
  inputs_ok?: boolean;
  owner: string;
  median_min: number;
  /** Units x 60 / mean disclosed task minutes; the same basis as the zone pressure panel's mu. */
  capacity_patients_per_hour: number;
}

export interface BedCounts {
  total: number;
  free: number;
  reserved: number;
  occupied: number;
  waiting: number;
}

export interface DiagService {
  servers: number;
  busy: number | null;
  waiting: number | null;
  inputs_ok?: boolean;
  owner: string;
  median_turnaround_min: number;
  capacity_tasks_per_hour: number;
  started_last_30_min: number | null;
  completed_last_30_min: number | null;
  recent_throughput_tasks_per_hour: number | null;
}

export type CongestionState = 'stable' | 'building' | 'confirmed';

export type LocalState = 'normal' | 'building' | 'overloaded' | 'unknown';

export type FailureCategory =
  | 'triage_arrival'
  | 'physician_space'
  | 'lab_imaging'
  | 'departure_ward_transport';

export interface ServiceRates {
  window_min: number;
  /** Received work (lambda) over the window; null when inputs are missing. */
  received_per_hour: number | null;
  /** Completed work over the same window; shown apart from capacity. */
  recent_throughput_per_hour: number | null;
  unit: string;
  servers?: number;
  capacity_per_hour: number | null;
  mean_task_min?: number;
  /** Lambda above mu: a pressure signal only, never a countdown. */
  pressure_signal: boolean | null;
  free_beds?: { ward: number; icu: number };
}

export interface PressureService {
  id: string;
  zone: number;
  name: string;
  category: FailureCategory;
  state: LocalState;
  queue: number | null;
  queue_label: string;
  threshold: number | null;
  capacity_unavailable: boolean | null;
  inputs_ok: boolean;
  onset_min: number | null;
  confirmed_min: number | null;
  elapsed_min: number | null;
  confirms_in_min: number | null;
  recovery_since_min: number | null;
  rates: ServiceRates;
}

export interface PressureAlert {
  service: string;
  zone: number;
  state: 'building' | 'overloaded';
  category: FailureCategory;
  category_label: string;
  affected_patients: number | null;
  urgent_group_waiting: number;
  onset_min: number | null;
  confirmed_min: number | null;
  /** More than one failure category is active across the ED right now. */
  mixed: boolean;
  /** Labels of the other active categories. */
  also_active: string[];
  evidence: string;
}

export interface Pressure {
  rule: {
    confirm_after_minutes: number;
    clear_after_minutes: number;
    thresholds: Record<string, number>;
    rate_window_minutes: number;
    note: string;
  };
  services: Record<string, PressureService>;
  zones: { zone: number; state: LocalState; label: string; services: string[] }[];
  alerts: PressureAlert[];
  mixed: boolean;
  mixed_label: string | null;
  any_unknown: boolean;
  episodes: Record<string, { onset_min: number; confirmed_min: number; cleared_min: number | null }[]>;
}

export type AmbulanceStatus = 'en_route' | 'delayed' | 'cancelled' | 'arrived';

export type FeedStatus = 'fresh' | 'stale' | 'missing';

/** One data source and how current its newest valid update is. */
export interface Feed {
  id: string;
  label: string;
  essential: boolean;
  last_update_min: number | null;
  age_min: number | null;
  status: FeedStatus;
  limitation: string | null;
  guidance: string | null;
  resumed_at_min?: number | null;
  note?: string;
}

/** One message the feeds delivered that was ignored, refused or flagged. */
export interface IngestItem {
  id: string | null;
  kind: 'duplicate' | 'out_of_order' | 'quarantined' | 'outlier_kept';
  source: string;
  type: string | null;
  event_time_min: number | null;
  received_min: number;
  subject: string | null;
  reason: string;
}

export interface DataQuality {
  assessable: boolean;
  reasons: string[];
  essential_sources: string[];
  stale_after_min: number;
  heartbeat_every_min: number;
  counts: { accepted: number; duplicates: number; out_of_order: number; quarantined: number; outliers_kept: number };
  sequence_gaps: { after: string; before: string; missing: number }[];
  recent: IngestItem[];
}

export interface Freshness {
  state_updated_at_min: number;
  age_min: number;
  note: string;
  stale_after_min?: number;
  heartbeat_every_min?: number;
  oldest_essential_age_min?: number | null;
  essential_ok?: boolean;
}

export interface Announcement {
  id: string;
  received_min: number;
  eta_min: number;
  eta_uncertainty_min: number;
  minutes_overdue: number | null;
  patient_count: number;
  /** Supplied acuity per patient when the crew reported it; null when not yet known. */
  acuity: { acuity: string; urgency: Urgency; critical_bypass: boolean }[] | null;
  source_updated_min: number;
  status: AmbulanceStatus;
  closed_min: number | null;
}

export interface Snapshot {
  api_version: string;
  replay_id: string;
  run_number: number;
  version: number;
  profile_id: string;
  scenario: string;
  scenario_name: string;
  seed: number;
  synthetic: boolean;
  sim_time_min: number;
  freshness: Freshness;
  feeds: Record<string, Feed>;
  data_quality: DataQuality;
  overall_status: {
    state: CongestionState;
    label: string;
    /** False when an essential feed is older than ten simulated minutes (the label then reads Cannot assess). */
    assessable: boolean;
    reasons: string[];
    last_valid_label?: string;
    onset_min: number | null;
    confirmed_min: number | null;
    recovering: boolean;
    recovery_since_min: number | null;
    /** A zone is locally overloaded. Independent of the overall ED rule. */
    local_alert: boolean;
  };
  pressure: Pressure;
  resources: {
    ed_spaces: {
      total: number;
      occupied: number;
      available_staffed: number | null;
      awaiting_space: number | null;
      general_total: number;
      general_occupied: number;
      staffed_total: number;
      unstaffed_total: number;
      unstaffed_empty: number;
      owner: string;
    };
    resus_spaces: {
      total: number;
      occupied: number;
      available: number | null;
      unstaffed_empty: number;
      awaiting: number | null;
      owner: string;
    };
    disposition: {
      unit: string;
      discharge: DispService;
      allocation: DispService;
      transport: DispService;
      beds: {
        owner: string;
        ward: BedCounts;
        icu: BedCounts;
        list: { id: string; type: 'ward' | 'icu'; state: 'free' | 'reserved' | 'occupied' }[];
      };
      boarding: number;
      note: string;
    };
    diagnostics: {
      unit: string;
      window_min: number;
      lab: DiagService;
      imaging: DiagService;
      note: string;
    };
    staff: {
      doctors: { id: string; name: string; on_duty: boolean; patient_id: string | null; owner: string }[];
      reserve_physician: { id: string; name: string; active: boolean; owner: string; note: string };
      nurses: {
        id: string;
        name: string;
        on_duty: boolean;
        covers: string[];
        occupied: number;
        empty: number;
        owner: string;
      }[];
      on_duty_nurses: string[];
      off_duty_nurses: string[];
      unstaffed_empty_spaces: { count: number; space_ids: string[]; reason: string | null };
      note: string;
    };
    clinician_slots: { total: number; busy: number | null; waiting: number | null; owner: string };
    triage_desk: {
      total: number;
      busy: number | null;
      waiting: number | null;
      owner: string;
      reserve_team: { size: number; active: boolean; owner: string; note: string };
    };
  };
  counts: {
    in_ed: number;
    arrived_total: number;
    departed_total: number;
    departed_home: number;
    departed_ward: number;
  };
  zones: Zone[];
  patients: PatientDot[];
  inbound_ambulances: Announcement[];
  inbound_summary: {
    ambulances: number;
    patients: number;
    delayed: number;
    feed_last_update_min: number | null;
  };
  ambulance_announcements: Announcement[];
  event_count: number;
  /** Services a fixture declares missing; their figures are null rather than exact. */
  limited_services?: string[];
}

export const ZONE_NAMES: Record<number, string> = {
  1: 'Arrival and triage',
  2: 'Doctor assessment',
  3: 'Diagnostics and testing',
  4: 'Disposition',
};

/** One line of a zone's queues: a waiting line (`queue`) or work under way (`active`, with its slots). */
export interface ZoneQueueLine {
  id: string;
  label: string;
  count: number | null;
  kind: 'queue' | 'active';
  of: number | null;
}

export interface ZoneUnit {
  id: string;
  label: string;
  busy: number | null;
  servers: number;
  waiting: number | null;
  owner: string;
  reserve_team_active?: boolean;
}

export interface ZoneCapacity {
  kind: 'none' | 'shared_ed_spaces' | 'spaces_retained';
  text: string;
  shared_with_zone?: number;
  total?: number;
  occupied?: number;
  available_staffed?: number;
  staffed_total?: number;
  resus?: { total: number; available: number; awaiting: number };
  held_by_patients_here?: number;
  ward_beds?: { free: number; reserved: number; occupied: number; total: number };
  icu_beds?: { free: number; reserved: number; occupied: number; total: number };
}

/** `GET /api/v1/replays/{id}/zones/{zone}`: one zone at the replay's current version. */
export interface ZoneDetail {
  api_version: string;
  replay_id: string;
  run_number: number;
  version: number;
  sim_time_min: number;
  freshness: Freshness;
  zone: { id: number; key: string; name: string; patient_count: number; counts: Record<string, number> };
  roster: PatientDot[];
  queues: ZoneQueueLine[];
  units: ZoneUnit[];
  capacity: ZoneCapacity;
  staff: {
    doctors: { id: string; name: string; on_duty: boolean; owner: string; patient_id: string | null; assigned: boolean }[];
    nurses: { id: string; name: string; on_duty: boolean; owner: string; patient_ids: string[]; space_ids: string[] }[];
    note: string;
    off_duty_nurses: string[];
  };
  pressure: { state: LocalState; label: string; service_ids: string[]; alerts: PressureAlert[] };
  summary: {
    state: LocalState;
    headline: string;
    cause: string | null;
    blocked_reason: string | null;
    overall_status_label: string;
    note: string;
  };
}
