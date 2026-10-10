import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Accessible tabs (WAI-ARIA tablist). Every panel stays mounted and inactive ones are `hidden`, so
 * long-lived panels (the guided demo, the evaluation job) keep their state when another tab is open.
 */
export function Tabs({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
}: {
  tabs: TabDef[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    onChange(tabs[n].id);
    refs.current[n]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      move(i + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      move(i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      move(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      move(tabs.length - 1);
    }
  };
  return (
    <div className="tabs">
      <div className="tablist" role="tablist" aria-label={label}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={value === t.id}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={value === t.id ? 0 : -1}
            className="tab"
            data-testid={`tab-${idPrefix}-${t.id}`}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${idPrefix}-panel-${t.id}`}
          aria-labelledby={`${idPrefix}-tab-${t.id}`}
          hidden={value !== t.id}
          className="tabpanel"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
