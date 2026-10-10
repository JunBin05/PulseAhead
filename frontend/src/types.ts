export type Urgency = 'urgent' | 'medium' | 'lower';

export type Phase =
  | 'arrival'
  | 'awaiting_space'
  | 'awaiting_clinician'
  | 'assessment_active'
  | 'disposition_processing';

export interface PatientDot {
  id: string;
  urgency: Urgency;
  phase: Phase;
  zone: number | null;
  has_space: boolean;
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
      owner: string;
    };
    clinician_slots: { total: number; busy: number; waiting: number; owner: string };
  };
  counts: { in_ed: number; arrived_total: number; departed_total: number };
  zones: Zone[];
  patients: PatientDot[];
  inbound_ambulances: unknown[];
  event_count: number;
}

export const ZONE_NAMES: Record<number, string> = {
  1: 'Arrival and triage',
  2: 'Doctor assessment',
  3: 'Diagnostics and testing',
  4: 'Disposition',
};
