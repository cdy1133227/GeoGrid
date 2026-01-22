
export enum LineType {
  SEGMENT = 'SEGMENT',
  RAY = 'RAY',
  LINE = 'LINE'
}

export interface Point {
  x: number;
  y: number;
  id: string;
  isIntersection?: boolean;
  label?: string;
  // Track if the point was part of the level's initial setup
  isInitial?: boolean;
}

export interface Segment {
  p1: Point;
  p2: Point;
  id: string;
  isInitial?: boolean;
  type?: LineType;
}

export interface LevelConfig {
  id: number;
  title: string;
  description: string;
  lineType?: LineType; // The tool used in this level
  initial: {
    points?: { x: number; y: number; label?: string }[];
    segments?: { p1: { x: number; y: number }; p2: { x: number; y: number }; type?: LineType }[];
  };
  goals: {
    points?: { x: number; y: number }[];
    segments?: { p1: { x: number; y: number }; p2: { x: number; y: number }; type?: LineType }[];
  };
}

export interface LevelGroup {
  id: number;
  name: string;
  levels: LevelConfig[];
}

export enum Tool {
  SELECT = 'SELECT',
  POINT = 'POINT',
  LINE = 'LINE',
}
