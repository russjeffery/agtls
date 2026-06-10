export function Logo({ height = 32 }: { height?: number }) {
  const width = (height / 48) * 240;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 240 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Agent Tools"
    >
      <style>{`
        .cursor { animation: blink 1.2s infinite steps(2); }
        .brand-mark { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        svg:hover .brand-mark { transform: scale(1.05); }
        svg:hover .anim-path { stroke: #f4f6f5; }
        svg:hover .t { stroke: #5fd089; }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>

      <g className="brand-mark" style={{ transformOrigin: "24px 24px" }}>
        <path className="anim-path" d="M 13 36 L 24 12 L 35 36" stroke="#5fd089" strokeWidth="4" strokeLinecap="butt" strokeLinejoin="miter" />
        <path className="t" d="M 18 24 L 30 24" stroke="#fff" strokeWidth="4" strokeLinecap="butt" strokeLinejoin="miter" />
        <path className="t" d="M 24 24 L 24 36" stroke="#fff" strokeWidth="4" strokeLinecap="butt" strokeLinejoin="miter" />
        {/* <rect className="cursor" x="22" y="16.5" width="4" height="4" fill="#f4f6f5" /> */}
      </g>

      <text
        x="58"
        y="30"
        fontFamily="'Spline Sans Mono', 'Fira Code', monospace"
        fontSize="20"
        fontWeight="700"
        letterSpacing="-0.8"
        fill="#f4f6f5"
      >
        agent<tspan fill="#5fd089">tools</tspan>
      </text>
    </svg>
  );
}
