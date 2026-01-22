
import { Point, Segment, LineType } from './types';

const EPSILON = 0.0001;
const GRID_MIN = 0;
const GRID_MAX = 6;

function checkConstraint(t: number, type: LineType = LineType.SEGMENT): boolean {
  switch (type) {
    case LineType.SEGMENT:
      return t >= -EPSILON && t <= 1 + EPSILON;
    case LineType.RAY:
      return t >= -EPSILON;
    case LineType.LINE:
      return true;
    default:
      return t >= -EPSILON && t <= 1 + EPSILON;
  }
}

export function getIntersection(s1: Segment, s2: Segment): Point | null {
  const x1 = s1.p1.x, y1 = s1.p1.y;
  const x2 = s1.p2.x, y2 = s1.p2.y;
  const x3 = s2.p1.x, y3 = s2.p1.y;
  const x4 = s2.p2.x, y4 = s2.p2.y;

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (Math.abs(denom) < EPSILON) return null;

  const t = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const u = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  // Check if intersection is valid based on line types
  if (checkConstraint(t, s1.type) && checkConstraint(u, s2.type)) {
    const ix = x1 + t * (x2 - x1);
    const iy = y1 + t * (y2 - y1);

    // Keep it within grid boundaries (with small margin)
    if (ix >= GRID_MIN - EPSILON && ix <= GRID_MAX + EPSILON && 
        iy >= GRID_MIN - EPSILON && iy <= GRID_MAX + EPSILON) {
      return {
        x: ix,
        y: iy,
        id: `int-${Math.random()}`,
        isIntersection: true
      };
    }
  }

  return null;
}

export function pointsEqual(p1: { x: number; y: number }, p2: { x: number; y: number }): boolean {
  return Math.abs(p1.x - p2.x) < EPSILON && Math.abs(p1.y - p2.y) < EPSILON;
}

export function segmentsEqual(s1: Segment, s2: { p1: { x: number; y: number }; p2: { x: number; y: number }; type?: LineType }): boolean {
    const typeMatch = (s1.type || LineType.SEGMENT) === (s2.type || LineType.SEGMENT);
    if (!typeMatch) return false;

    // For segments, endpoints order doesn't matter
    if ((s1.type || LineType.SEGMENT) === LineType.SEGMENT) {
      return (pointsEqual(s1.p1, s2.p1) && pointsEqual(s1.p2, s2.p2)) ||
             (pointsEqual(s1.p1, s2.p2) && pointsEqual(s1.p2, s2.p1));
    }
    
    // For rays, p1 is the origin, must match exactly
    if (s1.type === LineType.RAY) {
      // P1 must be equal. P2 just defines the direction, but in this game usually users snap to specific points
      // so we check if the direction vector matches.
      if (!pointsEqual(s1.p1, s2.p1)) return false;
      const v1 = { x: s1.p2.x - s1.p1.x, y: s1.p2.y - s1.p1.y };
      const v2 = { x: s2.p2.x - s2.p1.x, y: s2.p2.y - s2.p1.y };
      const mag1 = Math.sqrt(v1.x**2 + v1.y**2);
      const mag2 = Math.sqrt(v2.x**2 + v2.y**2);
      // Normalize dot product
      const dot = (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2);
      return Math.abs(dot - 1) < EPSILON;
    }

    // For lines, any two points defining the same line
    const crossProduct = (s1.p2.x - s1.p1.x) * (s2.p2.y - s2.p1.y) - (s1.p2.y - s1.p1.y) * (s2.p2.x - s2.p1.x);
    if (Math.abs(crossProduct) > EPSILON) return false;
    // Check if s2.p1 lies on line s1
    const dist = (s1.p2.x - s1.p1.x) * (s2.p1.y - s1.p1.y) - (s1.p2.y - s1.p1.y) * (s2.p1.x - s1.p1.x);
    return Math.abs(dist) < EPSILON;
}

export function distSq(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
}

/**
 * Clips a line/ray to the grid boundaries for rendering extensions.
 */
export function getGridClippedLine(p1: Point, p2: Point, type: LineType): { start: Point, end: Point } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  
  let tMin = -1e9;
  let tMax = 1e9;

  // Liang-Barsky-ish clipping against [0, 6]
  const p = [-dx, dx, -dy, dy];
  const q = [p1.x - GRID_MIN, GRID_MAX - p1.x, p1.y - GRID_MIN, GRID_MAX - p1.y];

  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < EPSILON) {
      if (q[i] < 0) return { start: p1, end: p1 };
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > tMin) tMin = t;
      } else {
        if (t < tMax) tMax = t;
      }
    }
  }

  // Adjust tMin and tMax based on type
  if (type === LineType.SEGMENT) {
    tMin = Math.max(tMin, 0);
    tMax = Math.min(tMax, 1);
  } else if (type === LineType.RAY) {
    tMin = Math.max(tMin, 0);
  }

  return {
    start: { x: p1.x + tMin * dx, y: p1.y + tMin * dy, id: 'clip-start' },
    end: { x: p1.x + tMax * dx, y: p1.y + tMax * dy, id: 'clip-end' }
  };
}
