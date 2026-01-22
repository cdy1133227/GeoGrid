
import React, { useState, useMemo, useCallback } from 'react';
import { Point, Segment, LineType, LevelConfig } from './types';
import { pointsEqual, distSq, segmentsEqual, getGridClippedLine } from './geometryUtils';

const GRID_SIZE = 7;
const CELL_SIZE = 50;
const PADDING = 30;
const BOARD_SIZE = (GRID_SIZE - 1) * CELL_SIZE + PADDING * 2;
const SNAP_THRESHOLD = 0.4;

interface LevelEditorProps {
  onBack: () => void;
}

const LevelEditor: React.FC<LevelEditorProps> = ({ onBack }) => {
  // Metadata
  const [levelId, setLevelId] = useState(101);
  const [title, setTitle] = useState('新关卡');
  const [description, setDescription] = useState('描述你的关卡目标...');
  const [defaultLineType, setDefaultLineType] = useState<LineType>(LineType.SEGMENT);

  // Editor Mode State
  const [editLayer, setEditLayer] = useState<'initial' | 'goal'>('initial');
  const [editShape, setEditShape] = useState<'point' | 'line'>('point');
  const [lineType, setLineType] = useState<LineType>(LineType.SEGMENT);

  // Contents
  const [initialPoints, setInitialPoints] = useState<Point[]>([]);
  const [initialSegments, setInitialSegments] = useState<Segment[]>([]);
  const [goalPoints, setGoalPoints] = useState<Point[]>([]);
  const [goalSegments, setGoalSegments] = useState<Segment[]>([]);

  // Interaction State
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null);

  const snap = (gridX: number, gridY: number) => {
    const rx = Math.round(gridX);
    const ry = Math.round(gridY);
    if (Math.abs(gridX - rx) < SNAP_THRESHOLD && Math.abs(gridY - ry) < SNAP_THRESHOLD) {
      return { x: rx, y: ry };
    }
    return null;
  };

  const getGridCoords = (clientX: number, clientY: number, svg: SVGSVGElement) => {
    const CTM = svg.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    return {
      x: (clientX - CTM.e - PADDING * CTM.a) / (CELL_SIZE * CTM.a),
      y: (clientY - CTM.f - PADDING * CTM.d) / (CELL_SIZE * CTM.d)
    };
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getGridCoords(e.clientX, e.clientY, e.currentTarget);
    const snapped = snap(coords.x, coords.y);
    if (!snapped) return;

    const p: Point = { ...snapped, id: `p-${Date.now()}` };

    if (editShape === 'point') {
      if (editLayer === 'initial') {
        if (!initialPoints.find(ip => pointsEqual(ip, p))) setInitialPoints([...initialPoints, p]);
      } else {
        if (!goalPoints.find(gp => pointsEqual(gp, p))) setGoalPoints([...goalPoints, p]);
      }
    } else {
      setDragStart(p);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getGridCoords(e.clientX, e.clientY, e.currentTarget);
    setMousePos(coords);
  };

  const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (editShape === 'line' && dragStart) {
      const coords = getGridCoords(e.clientX, e.clientY, e.currentTarget);
      const snapped = snap(coords.x, coords.y);
      if (snapped && !pointsEqual(dragStart, snapped)) {
        const seg: Segment = { p1: dragStart, p2: { ...snapped, id: `p-end-${Date.now()}` }, id: `s-${Date.now()}`, type: lineType };
        if (editLayer === 'initial') {
          setInitialSegments([...initialSegments, seg]);
        } else {
          setGoalSegments([...goalSegments, seg]);
        }
      }
    }
    setDragStart(null);
  };

  const removeItem = (type: 'ip' | 'is' | 'gp' | 'gs', id: string) => {
    if (type === 'ip') setInitialPoints(initialPoints.filter(p => p.id !== id));
    if (type === 'is') setInitialSegments(initialSegments.filter(s => s.id !== id));
    if (type === 'gp') setGoalPoints(goalPoints.filter(p => p.id !== id));
    if (type === 'gs') setGoalSegments(goalSegments.filter(s => s.id !== id));
  };

  const generatedJson = useMemo(() => {
    const config: LevelConfig = {
      id: levelId,
      title,
      description,
      lineType: defaultLineType,
      initial: {
        points: initialPoints.map(p => ({ x: p.x, y: p.y })),
        segments: initialSegments.map(s => ({ p1: { x: s.p1.x, y: s.p1.y }, p2: { x: s.p2.x, y: s.p2.y }, type: s.type }))
      },
      goals: {
        points: goalPoints.map(p => ({ x: p.x, y: p.y })),
        segments: goalSegments.map(s => ({ p1: { x: s.p1.x, y: s.p1.y }, p2: { x: s.p2.x, y: s.p2.y }, type: s.type }))
      }
    };
    return JSON.stringify(config, null, 2);
  }, [levelId, title, description, initialPoints, initialSegments, goalPoints, goalSegments, defaultLineType]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedJson);
    alert('JSON 已复制到剪贴板');
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-white">
      {/* Left Sidebar: Settings */}
      <div className="w-full md:w-80 border-r border-[#D9C4A9] p-6 overflow-y-auto shrink-0 bg-[#FDF7EE]">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={onBack} className="text-[#CC6633] hover:underline flex items-center gap-1 font-bold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/></svg> 返回
          </button>
          <h2 className="text-xl font-bold">关卡编辑</h2>
        </div>

        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-xs uppercase font-bold text-[#8B7E66] mb-1">关卡 ID</label>
            <input type="number" value={levelId} onChange={e => setLevelId(Number(e.target.value))} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-xs uppercase font-bold text-[#8B7E66] mb-1">标题</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-xs uppercase font-bold text-[#8B7E66] mb-1">默认工具</label>
            <select value={defaultLineType} onChange={e => setDefaultLineType(e.target.value as LineType)} className="w-full border p-2 rounded">
              <option value={LineType.SEGMENT}>线段 (Segment)</option>
              <option value={LineType.RAY}>射线 (Ray)</option>
              <option value={LineType.LINE}>直线 (Line)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase font-bold text-[#8B7E66] mb-1">目标描述</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full border p-2 rounded h-20" />
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="font-bold border-b pb-2">当前内容</h3>
          <div className="text-sm space-y-2 max-h-64 overflow-y-auto">
             {initialPoints.map(p => <div key={p.id} className="flex justify-between items-center bg-gray-50 p-1 rounded"><span>初始点: ({p.x}, {p.y})</span><button onClick={() => removeItem('ip', p.id)} className="text-red-500">×</button></div>)}
             {initialSegments.map(s => <div key={s.id} className="flex justify-between items-center bg-gray-50 p-1 rounded"><span>初始{s.type}: {s.p1.x},{s.p1.y}→{s.p2.x},{s.p2.y}</span><button onClick={() => removeItem('is', s.id)} className="text-red-500">×</button></div>)}
             {goalPoints.map(p => <div key={p.id} className="flex justify-between items-center bg-blue-50 p-1 rounded"><span>目标点: ({p.x}, {p.y})</span><button onClick={() => removeItem('gp', p.id)} className="text-red-500">×</button></div>)}
             {goalSegments.map(s => <div key={s.id} className="flex justify-between items-center bg-blue-50 p-1 rounded"><span>目标{s.type}: {s.p1.x},{s.p1.y}→{s.p2.x},{s.p2.y}</span><button onClick={() => removeItem('gs', s.id)} className="text-red-500">×</button></div>)}
          </div>
        </div>
      </div>

      {/* Center: Interactive Board */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-white relative">
        <div className="flex gap-2 mb-4 shrink-0">
          <div className="flex bg-[#F5E6D3] p-1 rounded-lg">
            <button onClick={() => setEditLayer('initial')} className={`px-4 py-1 rounded-md text-sm font-bold transition-all ${editLayer === 'initial' ? 'bg-[#CC6633] text-white shadow-sm' : 'text-[#8B7E66]'}`}>初始层</button>
            <button onClick={() => setEditLayer('goal')} className={`px-4 py-1 rounded-md text-sm font-bold transition-all ${editLayer === 'goal' ? 'bg-[#3366CC] text-white shadow-sm' : 'text-[#8B7E66]'}`}>目标层</button>
          </div>
          <div className="flex bg-[#F5E6D3] p-1 rounded-lg">
            <button onClick={() => setEditShape('point')} className={`px-4 py-1 rounded-md text-sm font-bold transition-all ${editShape === 'point' ? 'bg-gray-700 text-white' : 'text-[#8B7E66]'}`}>点</button>
            <button onClick={() => setEditShape('line')} className={`px-4 py-1 rounded-md text-sm font-bold transition-all ${editShape === 'line' ? 'bg-gray-700 text-white' : 'text-[#8B7E66]'}`}>线</button>
          </div>
          {editShape === 'line' && (
             <div className="flex bg-[#F5E6D3] p-1 rounded-lg">
               <button onClick={() => setLineType(LineType.SEGMENT)} className={`px-3 py-1 rounded-md text-xs font-bold ${lineType === LineType.SEGMENT ? 'bg-gray-700 text-white' : 'text-[#8B7E66]'}`}>段</button>
               <button onClick={() => setLineType(LineType.RAY)} className={`px-3 py-1 rounded-md text-xs font-bold ${lineType === LineType.RAY ? 'bg-gray-700 text-white' : 'text-[#8B7E66]'}`}>射</button>
               <button onClick={() => setLineType(LineType.LINE)} className={`px-3 py-1 rounded-md text-xs font-bold ${lineType === LineType.LINE ? 'bg-gray-700 text-white' : 'text-[#8B7E66]'}`}>直</button>
             </div>
          )}
        </div>

        <svg 
          viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} 
          className="w-full max-w-[600px] aspect-square bg-[#FDF7EE] border-2 border-[#D9C4A9] rounded-xl shadow-lg cursor-crosshair touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {Array.from({ length: GRID_SIZE }).map((_, i) => (
            <React.Fragment key={i}>
              <line x1={PADDING} y1={PADDING + i * CELL_SIZE} x2={BOARD_SIZE - PADDING} y2={PADDING + i * CELL_SIZE} stroke="#D9C4A9" strokeOpacity="0.4" />
              <line x1={PADDING + i * CELL_SIZE} y1={PADDING} x2={PADDING + i * CELL_SIZE} y2={BOARD_SIZE - PADDING} stroke="#D9C4A9" strokeOpacity="0.4" />
            </React.Fragment>
          ))}

          {initialSegments.map(s => {
            const {start, end} = getGridClippedLine(s.p1, s.p2, s.type || LineType.SEGMENT);
             return <g key={s.id}><line x1={PADDING + s.p1.x * CELL_SIZE} y1={PADDING + s.p1.y * CELL_SIZE} x2={PADDING + s.p2.x * CELL_SIZE} y2={PADDING + s.p2.y * CELL_SIZE} stroke="#4A3D33" strokeWidth="3" /><line x1={PADDING+start.x*CELL_SIZE} y1={PADDING+start.y*CELL_SIZE} x2={PADDING+end.x*CELL_SIZE} y2={PADDING+end.y*CELL_SIZE} stroke="#4A3D33" strokeWidth="1" strokeDasharray="4 4" strokeOpacity="0.3" /></g>
          })}
          {goalSegments.map(s => {
            const {start, end} = getGridClippedLine(s.p1, s.p2, s.type || LineType.SEGMENT);
            return <g key={s.id}><line x1={PADDING + s.p1.x * CELL_SIZE} y1={PADDING + s.p1.y * CELL_SIZE} x2={PADDING + s.p2.x * CELL_SIZE} y2={PADDING + s.p2.y * CELL_SIZE} stroke="#3366CC" strokeWidth="4" strokeOpacity="0.6" /><line x1={PADDING+start.x*CELL_SIZE} y1={PADDING+start.y*CELL_SIZE} x2={PADDING+end.x*CELL_SIZE} y2={PADDING+end.y*CELL_SIZE} stroke="#3366CC" strokeWidth="1" strokeDasharray="4 4" strokeOpacity="0.2" /></g>
          })}

          {initialPoints.map(p => <circle key={p.id} cx={PADDING + p.x * CELL_SIZE} cy={PADDING + p.y * CELL_SIZE} r="5" fill="#4A3D33" />)}
          {goalPoints.map(p => <circle key={p.id} cx={PADDING + p.x * CELL_SIZE} cy={PADDING + p.y * CELL_SIZE} r="6" fill="none" stroke="#3366CC" strokeWidth="2" />)}

          {dragStart && mousePos && (
             <line x1={PADDING + dragStart.x * CELL_SIZE} y1={PADDING + dragStart.y * CELL_SIZE} x2={PADDING + mousePos.x * CELL_SIZE} y2={PADDING + mousePos.y * CELL_SIZE} stroke={editLayer === 'initial' ? '#4A3D33' : '#3366CC'} strokeWidth="2" strokeDasharray="2 2" />
          )}
        </svg>

        <div className="mt-4 text-sm text-[#8B7E66] italic">提示: 线段/射线/直线的起点和终点必须在网格交点上。</div>
      </div>

      {/* Right Sidebar: Output */}
      <div className="w-full md:w-80 border-l border-[#D9C4A9] p-6 flex flex-col bg-[#F9F9F9]">
        <h3 className="font-bold mb-4">JSON 配置导出</h3>
        <textarea readOnly value={generatedJson} className="flex-1 font-mono text-xs p-3 border rounded bg-white resize-none" />
        <button onClick={copyToClipboard} className="mt-4 w-full bg-[#CC6633] text-white py-2 rounded-lg font-bold hover:bg-[#A35229] transition-colors">复制 JSON</button>
      </div>
    </div>
  );
};

export default LevelEditor;
