import React from 'react';
import { STATUS_COLORS } from '../graph/statusMeta';

const C = {
  m: STATUS_COLORS.mastered.stroke,
  b: STATUS_COLORS.blind_spot.stroke,
  f: STATUS_COLORS.frontier.stroke,
  y: STATUS_COLORS.false_positive.stroke,
  u: STATUS_COLORS.untested.stroke,
};

const DOTS: Array<[number, number, string]> = [
  [70, 196, C.m],
  [215, 92, C.u],
  [340, 168, C.f],
  [470, 62, C.m],
  [585, 150, C.b],
  [690, 208, C.u],
  [790, 88, C.y],
  [905, 170, C.f],
  [1020, 74, C.u],
  [1135, 182, C.m],
];

const LINKS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [2, 4], [4, 5], [4, 6], [6, 7], [5, 7], [7, 8], [8, 9], [7, 9],
];

/** Purely decorative map shown only while a new session is still empty. */
export const HeroGraph: React.FC<{ visible: boolean }> = ({ visible }) => (
  <svg
    aria-hidden
    data-testid="hero-graph"
    viewBox="0 0 1200 240"
    preserveAspectRatio="xMidYMid slice"
    className={`hero-motion hero-graph pointer-events-none absolute inset-x-0 top-6 h-[260px] w-full ${visible ? 'opacity-100' : 'opacity-0'}`}
  >
    {LINKS.map(([a, b]) => (
      <line key={`${a}-${b}`} x1={DOTS[a][0]} y1={DOTS[a][1]} x2={DOTS[b][0]} y2={DOTS[b][1]} stroke="#3f3f46" strokeWidth={1} />
    ))}
    {DOTS.map(([x, y, color], i) => (
      <g key={`${x}-${y}`}>
        <circle className="hero-graph-halo" cx={x} cy={y} r={15} fill={color} style={{ animationDelay: `${i * -0.7}s` }} />
        <circle cx={x} cy={y} r={6} fill={color} />
      </g>
    ))}
  </svg>
);
