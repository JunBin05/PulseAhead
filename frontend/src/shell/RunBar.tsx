import type { RefObject } from 'react';
import { IconPause, IconPlay, IconReset, IconStep } from '../icons';
import type { Snapshot } from '../types';

/** One compact row of replay controls under the header (start, play, step, speed, reset). */
export function RunBar({
  snap,
  playing,
  speed,
  speeds,
  stepMinutes,
  onStart,
  onTogglePlay,
  onStep,
  onSpeed,
  onReset,
  playRef,
}: {
  snap: Snapshot | null;
  playing: boolean;
  speed: number;
  speeds: readonly number[];
  stepMinutes: number;
  onStart: () => void;
  onTogglePlay: () => void;
  onStep: () => void;
  onSpeed: (s: number) => void;
  onReset: () => void;
  playRef: RefObject<HTMLButtonElement | null>;
}) {
  if (!snap) {
    return (
      <section className="run-bar" aria-label="Simulation controls">
        <p className="run-note">
          PulseAhead shows where patients wait in a fictional emergency department and how long until congestion
          sets in. Start the simulation to watch synthetic patients move through four zones.
        </p>
        <button className="btn btn-primary" onClick={onStart} data-testid="start">
          <IconPlay /> Start simulation
        </button>
      </section>
    );
  }
  return (
    <section className="run-bar" aria-label="Simulation controls">
      <button
        ref={playRef}
        className="btn btn-primary"
        onClick={onTogglePlay}
        aria-pressed={playing}
        data-testid="play-pause"
      >
        {playing ? <IconPause /> : <IconPlay />}
        {playing ? 'Pause' : 'Play'}
      </button>
      <button
        className="btn"
        onClick={onStep}
        // Not disabled while a request is in flight: that would drop keyboard focus.
        disabled={playing}
        data-testid="step"
        title={`Advance ${stepMinutes} simulated minutes`}
      >
        <IconStep /> Step {stepMinutes} min
      </button>
      <span className="field-label" id="speed-l">
        Speed (sim min per second)
      </span>
      <div className="segmented" role="group" aria-labelledby="speed-l">
        {speeds.map((s) => (
          <button key={s} aria-pressed={speed === s} onClick={() => onSpeed(s)} data-testid={`speed-${s}`}>
            {s}×
          </button>
        ))}
      </div>
      <button className="btn" onClick={onReset} data-testid="reset">
        <IconReset /> Reset replay
      </button>
      <span className="run-note muted">
        {snap.scenario_name} · seed {snap.seed} · run {snap.run_number} · state v{snap.version}
      </span>
    </section>
  );
}
