export type Urgency = 'urgent' | 'medium' | 'lower';

export type Phase =
  | 'awaiting_triage'
  | 'in_triage'
  | 'awaiting_space'
  | 'awaiting_clinician'
  | 'assessment_active'
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
  queue: number;
  active: number;
  awaiting_space?: number;
  awaiting_clinician?: number;
  capacity: { kind: string; shared_with_zone?: number } | null;
}

export type CongestionState = 'stable' | 'building' | 'confirmed';

export type AmbulanceStatus = 'en_route' | 'delayed' | 'cancelled' | 'arrived';

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
  freshness: { state_updated_at_min: number; age_min: number; note: string };
  overall_status: {
    state: CongestionState;
    label: string;
    onset_min: number | null;
    confirmed_min: number | null;
  };
  resources: {
    ed_spaces: {
      total: number;
      occupied: number;
      available_staffed: number;
      awaiting_space: number;
      general_total: number;
      general_occupied: number;
      owner: string;
    };
    resus_spaces: { total: number; occupied: number; available: number; awaiting: number; owner: string };
    clinician_slots: { total: number; busy: number; waiting: number; owner: string };
    triage_desk: {
      total: number;
      busy: number;
      waiting: number;
      owner: string;
      reserve_team: { size: number; active: boolean; owner: string; note: string };
    };
  };
  counts: { in_ed: number; arrived_total: number; departed_total: number };
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
}

export const ZONE_NAMES: Record<number, string> = {
  1: 'Arrival and triage',
  2: 'Doctor assessment',
  3: 'Diagnostics and testing',
  4: 'Disposition',
};
