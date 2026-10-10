import type { ReactNode } from 'react';

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconCheck = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.8 2.8L16 9.5" />
  </Svg>
);
export const IconTriangle = () => (
  <Svg>
    <path d="M12 3.5 21 19.5H3z" />
    <path d="M12 10v4.5M12 17.2v.1" />
  </Svg>
);
export const IconOctagon = () => (
  <Svg>
    <path d="M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z" />
    <path d="M12 8v5M12 16v.1" />
  </Svg>
);
export const IconUnknown = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5M12 16.8v.1" />
  </Svg>
);
export const IconPlay = () => (
  <Svg>
    <path d="M7 4.5v15l12-7.5z" />
  </Svg>
);
export const IconPause = () => (
  <Svg>
    <path d="M8 5v14M16 5v14" />
  </Svg>
);
export const IconStep = () => (
  <Svg>
    <path d="M6 5v14l9-7z" />
    <path d="M19 5v14" />
  </Svg>
);
export const IconReset = () => (
  <Svg>
    <path d="M4 12a8 8 0 1 0 2.6-5.9" />
    <path d="M4 4v4.5h4.5" />
  </Svg>
);
export const IconClock = () => (
  <Svg size={16}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
