
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Point, Segment, LevelGroup, LineType } from './types';
import { getIntersection, pointsEqual, distSq, segmentsEqual, getGridClippedLine } from './geometryUtils';
import LevelEditor from './LevelEditor';

// Constants
const GRID_SIZE = 7;
const CELL_SIZE = 60;
const PADDING = 40;
const BOARD_SIZE = (GRID_SIZE - 1) * CELL_SIZE + PADDING * 2;
const SNAP_THRESHOLD = 0.4; // In grid units
const DRAG_THRESHOLD_PX = 8; // Pixels to move before starting a drag
const EPSILON = 0.0001;

export type View = 'HOME' | 'LEVEL_SELECT' | 'PLAY' | 'EDITOR';

interface HistoryState {
  points: Point[];
  segments: Segment[];
}

const App: React.FC = () => {
  const [levelGroups, setLevelGroups] = useState<LevelGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('HOME');
  const [levelIndex, setLevelIndex] = useState(0);
  
  // Board State
  const [visiblePoints, setVisiblePoints] = useState<Point[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  
  // History State
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [isLevelCleared, setIsLevelCleared] = useState(false);
  const [clearedLevelIds, setClearedLevelIds] = useState<number[]>([]);

  // Interaction State
  const [dragStartPoint, setDragStartPoint] = useState<Point | null>(null);
  const [dragSnapPoint, setDragSnapPoint] = useState<Point | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<{x: number, y: number} | null>(null);
  const [startMouseScreenPos, setStartMouseScreenPos] = useState<{x: number, y: number} | null>(null);
  const [isActuallyDragging, setIsActuallyDragging] = useState(false);

  // Fetch levels on mount
  useEffect(() => {
    fetch('levels.json')
      .then(res => res.json())
      .then(data => {
        setLevelGroups(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load levels:', err);
        setIsLoading(false);
      });
  }, []);

  const allLevels = useMemo(() => levelGroups.flatMap(group => group.levels), [levelGroups]);
  const currentLevel = allLevels[levelIndex];

  const resetInteraction = useCallback(() => {
    setDragStartPoint(null);
    setDragSnapPoint(null);
    setCurrentMousePos(null);
    setStartMouseScreenPos(null);
    setIsActuallyDragging(false);
  }, []);

  const commitToHistory = useCallback((newPoints: Point[], newSegments: Segment[]) => {
    const newState = { points: newPoints, segments: newSegments };
    setHistory(prev => {
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
    setVisiblePoints(newPoints);
    setSegments(newSegments);
  }, [historyIndex]);

  const resetLevel = useCallback(() => {
    if (!currentLevel) return;

    const initPoints: Point[] = (currentLevel.initial.points || []).map((p, i) => ({
      x: p.x,
      y: p.y,
      id: `init-p-${i}`,
      label: p.label,
      isInitial: true
    }));

    const initSegments: Segment[] = (currentLevel.initial.segments || []).map((s, i) => ({
      p1: { x: s.p1.x, y: s.p1.y, id: `init-s-p1-${i}` },
      p2: { x: s.p2.x, y: s.p2.y, id: `init-s-p2-${i}` },
      id: `init-s-${i}`,
      isInitial: true,
      type: s.type || LineType.SEGMENT
    }));

    setIsLevelCleared(false);
    resetInteraction();
    
    const startState = { points: initPoints, segments: initSegments };
    setHistory([startState]);
    setHistoryIndex(0);
    setVisiblePoints(initPoints);
    setSegments(initSegments);
  }, [currentLevel, resetInteraction]);

  useEffect(() => {
    if (currentView === 'PLAY' && currentLevel) {
      resetLevel();
    }
  }, [levelIndex, currentView, resetLevel, currentLevel]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const state = history[prevIndex];
      setHistoryIndex(prevIndex);
      setVisiblePoints(state.points);
      setSegments(state.segments);
      setIsLevelCleared(false); 
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const state = history[nextIndex];
      setHistoryIndex(nextIndex);
      setVisiblePoints(state.points);
      setSegments(state.segments);
    }
  }, [history, historyIndex]);

  const allDiscoverablePoints = useMemo(() => {
    const points: Point[] = [];
    const addPoint = (x: number, y: number, source: string) => {
      if (x < -EPSILON || x > GRID_SIZE - 1 + EPSILON || y < -EPSILON || y > GRID_SIZE - 1 + EPSILON) return;
      const p = { x, y };
      if (!points.find(existing => pointsEqual(existing, p))) {
        points.push({ ...p, id: `potential-${source}-${points.length}`, isIntersection: true });
      }
    };
    for (let x = 0; x < GRID_SIZE; x++) for (let y = 0; y < GRID_SIZE; y++) addPoint(x, y, 'grid');
    segments.forEach((s, idx) => {
      for (let j = idx + 1; j < segments.length; j++) {
        const crossing = getIntersection(s, segments[j]);
        if (crossing) addPoint(crossing.x, crossing.y, 'seg-seg');
      }
      const { p1, p2 } = s;
      const type = s.type || LineType.SEGMENT;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      for (let k = 0; k < GRID_SIZE; k++) {
        if (Math.abs(dx) > EPSILON) {
          const t = (k - p1.x) / dx;
          let valid = type === LineType.SEGMENT ? (t >= -EPSILON && t <= 1 + EPSILON) : (type === LineType.RAY ? t >= -EPSILON : true);
          if (valid) addPoint(k, p1.y + t * dy, 'seg-grid-v');
        }
      }
      for (let k = 0; k < GRID_SIZE; k++) {
        if (Math.abs(dy) > EPSILON) {
          const t = (k - p1.y) / dy;
          let valid = type === LineType.SEGMENT ? (t >= -EPSILON && t <= 1 + EPSILON) : (type === LineType.RAY ? t >= -EPSILON : true);
          if (valid) addPoint(p1.x + t * dx, k, 'seg-grid-h');
        }
      }
    });
    return points;
  }, [segments]);

  useEffect(() => {
    if (!currentLevel?.goals || isLevelCleared) return;
    const pointsCleared = !currentLevel.goals.points || currentLevel.goals.points.every(gp => visiblePoints.some(vp => pointsEqual(vp, gp)));
    const segmentsCleared = !currentLevel.goals.segments || currentLevel.goals.segments.every(gs => segments.some(s => segmentsEqual(s, gs)));
    if (pointsCleared && segmentsCleared && (currentLevel.goals.points || currentLevel.goals.segments)) {
      setIsLevelCleared(true);
      if (!clearedLevelIds.includes(currentLevel.id)) setClearedLevelIds(prev => [...prev, currentLevel.id]);
    }
  }, [segments, visiblePoints, currentLevel, isLevelCleared, clearedLevelIds]);

  const getGridCoords = (clientX: number, clientY: number, svg: SVGSVGElement) => {
    const CTM = svg.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    return {
      x: (clientX - CTM.e - PADDING * CTM.a) / (CELL_SIZE * CTM.a),
      y: (clientY - CTM.f - PADDING * CTM.d) / (CELL_SIZE * CTM.d)
    };
  };

  const findNearestPoint = (gridX: number, gridY: number) => {
    let closest: Point | null = null;
    let minD = SNAP_THRESHOLD;
    const candidates = [...visiblePoints, ...allDiscoverablePoints];
    for (const p of candidates) {
      const d = Math.sqrt(distSq(p, { x: gridX, y: gridY }));
      if (d < minD) { minD = d; closest = p; }
    }
    return closest;
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isLevelCleared) return;
    const coords = getGridCoords(e.clientX, e.clientY, e.currentTarget);
    const startPoint = findNearestPoint(coords.x, coords.y);
    if (startPoint) {
      setDragStartPoint(startPoint);
      setStartMouseScreenPos({ x: e.clientX, y: e.clientY });
      setIsActuallyDragging(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getGridCoords(e.clientX, e.clientY, e.currentTarget);
    setCurrentMousePos(coords);
    if (dragStartPoint && startMouseScreenPos) {
      const dx = e.clientX - startMouseScreenPos.x;
      const dy = e.clientY - startMouseScreenPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) {
        setIsActuallyDragging(true);
        setDragSnapPoint(findNearestPoint(coords.x, coords.y));
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragStartPoint) { resetInteraction(); return; }
    const coords = getGridCoords(e.clientX, e.clientY, e.currentTarget);
    const endPoint = findNearestPoint(coords.x, coords.y);
    if (isActuallyDragging) {
      if (endPoint && !pointsEqual(dragStartPoint, endPoint)) {
        const lineType = currentLevel.lineType || LineType.SEGMENT;
        if (!segments.some(s => segmentsEqual(s, { p1: dragStartPoint, p2: endPoint, type: lineType }))) {
          let newPoints = [...visiblePoints];
          if (!newPoints.find(vp => pointsEqual(vp, dragStartPoint))) newPoints.push({ ...dragStartPoint, id: `revealed-s-${Date.now()}`, isIntersection: true });
          if (!newPoints.find(vp => pointsEqual(vp, endPoint))) newPoints.push({ ...endPoint, id: `revealed-e-${Date.now()}`, isIntersection: true });
          commitToHistory(newPoints, [...segments, { p1: dragStartPoint, p2: endPoint, id: `seg-${Date.now()}`, type: lineType }]);
        }
      }
    } else {
      const p = findNearestPoint(coords.x, coords.y);
      if (p) {
        if (!visiblePoints.find(vp => pointsEqual(vp, p))) {
          commitToHistory([...visiblePoints, { ...p, id: `revealed-${Date.now()}`, isIntersection: true }], segments);
        }
      }
    }
    resetInteraction();
  };

  const startGroup = (group: LevelGroup) => {
    const firstUnfinishedIndex = allLevels.findIndex(l => group.levels.some(gl => gl.id === l.id) && !clearedLevelIds.includes(l.id));
    setLevelIndex(firstUnfinishedIndex !== -1 ? firstUnfinishedIndex : allLevels.findIndex(l => l.id === group.levels[0].id));
    setCurrentView('PLAY');
  };

  const isGoalSegment = (s: Segment) => currentLevel.goals.segments?.some(gs => segmentsEqual(s, gs));
  const isGoalPoint = (p: Point) => currentLevel.goals.points?.some(gp => pointsEqual(p, gp));

  if (isLoading) return <div className="h-full w-full bg-[#F5E6D3] flex items-center justify-center"><p className="text-[#CC6633] text-xl font-bold animate-pulse tracking-widest uppercase">载入中...</p></div>;

  return (
    <div className="h-full w-full flex flex-col bg-[#F5E6D3] overflow-hidden select-none font-serif relative">
      {currentView === 'HOME' && (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-in fade-in duration-1000">
          <h1 className="text-6xl font-bold tracking-tight text-[#4A3D33] mb-4">GeoGrid</h1>
          <p className="text-xl italic text-[#CC6633] tracking-widest uppercase opacity-80 mb-12">Geometry Master</p>
          <div className="flex flex-col gap-4">
            <button onClick={() => setCurrentView('LEVEL_SELECT')} className="w-64 bg-[#CC6633] text-white py-4 px-8 rounded-full text-xl font-bold hover:bg-[#A35229] transition-all shadow-lg">开始挑战</button>
            <button onClick={() => setCurrentView('EDITOR')} className="w-64 border-2 border-[#CC6633] text-[#CC6633] py-4 px-8 rounded-full text-xl font-bold hover:bg-[#CC6633] hover:text-white transition-all shadow-sm">关卡编辑器</button>
          </div>
        </div>
      )}

      {currentView === 'LEVEL_SELECT' && (
        <div className="flex flex-col h-full p-8 max-w-2xl mx-auto w-full animate-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center mb-12 shrink-0">
            <button onClick={() => setCurrentView('HOME')} className="w-10 h-10 rounded-full border border-[#D9C4A9] flex items-center justify-center text-[#CC6633] bg-white shadow-sm hover:bg-gray-50 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            </button>
            <h2 className="text-3xl font-bold text-[#4A3D33]">章节目录</h2>
            <div className="w-10" />
          </div>
          <div className="flex-1 overflow-y-auto pb-8 space-y-6">
            {levelGroups.map((group) => (
              <button key={group.id} onClick={() => startGroup(group)} className="w-full bg-white p-6 rounded-2xl border-2 border-[#D9C4A9] text-left group hover:border-[#CC6633] transition-all hover:shadow-lg">
                <div className="flex justify-between mb-2"><h3 className="text-2xl font-bold group-hover:text-[#CC6633] transition-colors">{group.name}</h3><span className="text-sm font-mono text-[#8B7E66]">{group.levels.filter(l => clearedLevelIds.includes(l.id)).length}/{group.levels.length}</span></div>
                <div className="w-full bg-[#F5E6D3] h-1.5 rounded-full overflow-hidden"><div className="bg-[#CC6633] h-full transition-all duration-500" style={{ width: `${(group.levels.filter(l => clearedLevelIds.includes(l.id)).length / group.levels.length) * 100}%` }} /></div>
              </button>
            ))}
          </div>
        </div>
      )}

      {currentView === 'EDITOR' && (
        <LevelEditor onBack={() => setCurrentView('HOME')} />
      )}

      {currentView === 'PLAY' && currentLevel && (
        <div className="flex flex-col h-full w-full max-w-lg mx-auto p-4 shrink-0 overflow-hidden animate-in fade-in">
          {/* Top Bar: Back, Title, Controls */}
          <div className="flex items-center justify-between w-full shrink-0 h-16 gap-2">
            <button onClick={() => setCurrentView('LEVEL_SELECT')} className="w-10 h-10 rounded-full border border-[#D9C4A9] bg-white flex items-center justify-center text-[#CC6633] shadow-sm shrink-0 active:scale-90 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            
            <div className="flex-1 text-center min-w-0 px-2 flex items-center justify-center">
               <h4 className="text-lg font-bold text-[#4A3D33] truncate">{currentLevel.title}</h4>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button onClick={undo} disabled={historyIndex <= 0} className={`w-9 h-9 rounded-full border border-[#D9C4A9] bg-white flex items-center justify-center shadow-sm transition-all active:scale-90 ${historyIndex <= 0 ? 'opacity-30' : 'text-[#4A3D33] hover:bg-gray-50'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
              </button>
              <button onClick={redo} disabled={historyIndex >= history.length - 1} className={`w-9 h-9 rounded-full border border-[#D9C4A9] bg-white flex items-center justify-center shadow-sm transition-all active:scale-90 ${historyIndex >= history.length - 1 ? 'opacity-30' : 'text-[#4A3D33] hover:bg-gray-50'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
              </button>
              <button onClick={resetLevel} className="w-9 h-9 rounded-full border border-[#D9C4A9] bg-white flex items-center justify-center text-[#8B7E66] shadow-sm hover:bg-gray-50 active:scale-90 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
            </div>
          </div>

          {/* Board Container */}
          <div className="flex-1 flex items-center justify-center min-h-0 py-4 relative">
            <div className="relative aspect-square w-full max-h-full flex items-center justify-center">
              <svg 
                viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} 
                className="w-full h-full cursor-crosshair touch-none select-none bg-[#FDF7EE] rounded-2xl shadow-xl border-4 border-[#D9C4A9]"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={resetInteraction}
              >
                {/* Grid Lines */}
                {Array.from({ length: GRID_SIZE }).map((_, i) => (
                  <React.Fragment key={i}>
                    <line x1={PADDING} y1={PADDING + i * CELL_SIZE} x2={BOARD_SIZE - PADDING} y2={PADDING + i * CELL_SIZE} stroke="#D9C4A9" strokeOpacity="0.3" strokeWidth="1" />
                    <line x1={PADDING + i * CELL_SIZE} y1={PADDING} x2={PADDING + i * CELL_SIZE} y2={BOARD_SIZE - PADDING} stroke="#D9C4A9" strokeOpacity="0.3" strokeWidth="1" />
                  </React.Fragment>
                ))}
                
                {/* Constructed Segments/Rays/Lines */}
                {segments.map((seg) => {
                  const isGoal = isGoalSegment(seg);
                  const color = isLevelCleared && isGoal ? "#FACC15" : (seg.isInitial ? "#4A3D33" : "#CC6633");
                  const { start, end } = getGridClippedLine(seg.p1, seg.p2, seg.type || LineType.SEGMENT);
                  return (
                    <g key={seg.id}>
                      <line x1={PADDING + seg.p1.x * CELL_SIZE} y1={PADDING + seg.p1.y * CELL_SIZE} x2={PADDING + seg.p2.x * CELL_SIZE} y2={PADDING + seg.p2.y * CELL_SIZE} stroke={color} strokeWidth={isLevelCleared && isGoal ? "5" : (seg.isInitial ? "3" : "2.5")} strokeLinecap="round" className="transition-all duration-300" />
                      {seg.type !== LineType.SEGMENT && <line x1={PADDING + start.x * CELL_SIZE} y1={PADDING + start.y * CELL_SIZE} x2={PADDING + end.x * CELL_SIZE} y2={PADDING + end.y * CELL_SIZE} stroke={color} strokeWidth="1.5" strokeDasharray="4 4" strokeOpacity="0.6" />}
                    </g>
                  );
                })}

                {/* Ghost Dragging Line */}
                {isActuallyDragging && dragStartPoint && currentMousePos && (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1={PADDING + dragStartPoint.x * CELL_SIZE} y1={PADDING + dragStartPoint.y * CELL_SIZE} x2={PADDING + (dragSnapPoint ? dragSnapPoint.x : currentMousePos.x) * CELL_SIZE} y2={PADDING + (dragSnapPoint ? dragSnapPoint.y : currentMousePos.y) * CELL_SIZE} stroke="#CC6633" strokeWidth="2" strokeOpacity="0.4" />
                    {(currentLevel.lineType === LineType.RAY || currentLevel.lineType === LineType.LINE) && (
                      <line x1={PADDING + getGridClippedLine(dragStartPoint, dragSnapPoint || (currentMousePos as any), currentLevel.lineType).start.x * CELL_SIZE} y1={PADDING + getGridClippedLine(dragStartPoint, dragSnapPoint || (currentMousePos as any), currentLevel.lineType).start.y * CELL_SIZE} x2={PADDING + getGridClippedLine(dragStartPoint, dragSnapPoint || (currentMousePos as any), currentLevel.lineType).end.x * CELL_SIZE} y2={PADDING + getGridClippedLine(dragStartPoint, dragSnapPoint || (currentMousePos as any), currentLevel.lineType).end.y * CELL_SIZE} stroke="#CC6633" strokeWidth="1" strokeOpacity="0.2" strokeDasharray="3 3" />
                    )}
                  </g>
                )}

                {/* Snapping Circle */}
                {isActuallyDragging && dragSnapPoint && <circle cx={PADDING + dragSnapPoint.x * CELL_SIZE} cy={PADDING + dragSnapPoint.y * CELL_SIZE} r="8" fill="none" stroke="#CC6633" strokeWidth="1.5" style={{ pointerEvents: 'none' }} />}
                
                {/* Visible Points */}
                {visiblePoints.map((p) => {
                  const isGoal = isGoalPoint(p);
                  const color = isLevelCleared && isGoal ? "#FACC15" : "#4A3D33";
                  const radius = p.isInitial ? 4.5 : 3.5;
                  return (
                    <g key={p.id} style={{ pointerEvents: 'none' }}>
                      <circle cx={PADDING + p.x * CELL_SIZE} cy={PADDING + p.y * CELL_SIZE} r={isLevelCleared && isGoal ? radius + 2 : radius} fill={isLevelCleared && isGoal ? "#FACC15" : (p.isInitial ? "#4A3D33" : "#FFFFFF")} stroke={color} strokeWidth={isLevelCleared && isGoal ? "2" : "1.5"} className="transition-all duration-300" />
                      {p.label && <text x={PADDING + p.x * CELL_SIZE + 10} y={PADDING + p.y * CELL_SIZE - 10} className="text-sm font-bold fill-[#4A3D33] select-none">{p.label}</text>}
                    </g>
                  );
                })}

                {/* Interactive Hidden Points Area */}
                {!isLevelCleared && allDiscoverablePoints.map(p => (
                  <circle key={p.id} cx={PADDING + p.x * CELL_SIZE} cy={PADDING + p.y * CELL_SIZE} r="14" fill="transparent" className="hover:fill-[#CC6633]/10 transition-colors" />
                ))}
              </svg>
            </div>
          </div>

          {/* Bottom Area: Navigation Flanking Prompt */}
          <div className="shrink-0 mb-4 px-1 md:px-2">
            <div className="flex items-center gap-2 w-full min-h-[100px] md:min-h-[120px]">
              {/* Previous Level Trigger */}
              <button 
                onClick={() => levelIndex > 0 && setLevelIndex(levelIndex - 1)} 
                disabled={levelIndex === 0} 
                className={`group flex items-center justify-center relative w-12 md:w-16 h-20 md:h-24 transition-opacity ${levelIndex === 0 ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}
              >
                 <div className="absolute inset-0 border-l-[6px] border-y-[6px] border-[#F8A88B] rounded-l-2xl"></div>
                 <svg className="w-8 h-8 md:w-10 md:h-10 text-[#CC6633] group-active:scale-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
              </button>

              {/* Description Prompt Center */}
              <div className="flex-1 flex items-center justify-center text-center py-4 bg-[#F5E6D3]/30 rounded-lg">
                 <p className={`text-sm md:text-lg font-bold leading-relaxed px-1 md:px-2 select-none ${isLevelCleared ? 'text-[#CC6633]' : 'text-[#4A3D33]'}`}>
                    {isLevelCleared ? (levelIndex === allLevels.length - 1 ? "恭喜你通关了所有关卡！" : "挑战成功！点击右侧进入下一关。") : currentLevel.description}
                 </p>
              </div>

              {/* Next Level Trigger */}
              <button 
                onClick={() => {
                   if (isLevelCleared && levelIndex < allLevels.length - 1) {
                     setLevelIndex(levelIndex + 1);
                   }
                }} 
                disabled={!isLevelCleared || levelIndex === allLevels.length - 1} 
                className={`group flex items-center justify-center relative w-12 md:w-16 h-20 md:h-24 transition-opacity ${(!isLevelCleared || levelIndex === allLevels.length - 1) ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}
              >
                 <div className="absolute inset-0 border-r-[6px] border-y-[6px] border-[#F8A88B] rounded-r-2xl"></div>
                 <svg className="w-8 h-8 md:w-10 md:h-10 text-[#CC6633] group-active:scale-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
