/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
import { 
  Box, 
  Upload, 
  Download, 
  Settings, 
  BarChart3, 
  AlertCircle, 
  CheckCircle2,
  Trash2,
  Maximize2,
  Weight,
  Layers,
  ZoomIn,
  ZoomOut,
  Hand,
  Rotate3d,
  RefreshCw,
  Menu,
  X,
  Gamepad2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import Plot from 'react-plotly.js';
import { Packer, Bin, Item, PackedItem, PackingResult } from './lib/binpacking';

import { RotateCcw, MoveUp, MoveDown, MoveLeft, MoveRight, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

// Types for CSV data
interface CSVRow {
  Item_code: string;
  Carton_count: string;
  Length: string;
  Width: string;
  Height: string;
  Weight: string;
  Allow_Rotation?: string;
  Fragility?: string;
}

const CONTAINER_TYPES = [
  {
    id: '40-standard',
    name: "40-Foot Standard 40' (12.19 m) 8' (2.44 m) 8'6\" (2.59 m)",
    width: 244,
    height: 259,
    depth: 1219,
    maxWeight: 26700,
    minCBM: 59
  },
  {
    id: '40-high-cube',
    name: "40-Foot High Cube 40' (12.19 m) 8' (2.44 m) 9'6\" (2.90 m)",
    width: 244,
    height: 290,
    depth: 1219,
    maxWeight: 26500,
    minCBM: 66
  }
];

export default function App() {
  // Container State
  const [selectedContainerId, setSelectedContainerId] = useState('40-high-cube');
  
  const binConfig = useMemo(() => 
    CONTAINER_TYPES.find(c => c.id === selectedContainerId) || CONTAINER_TYPES[1]
  , [selectedContainerId]);

  // Items State
  const [items, setItems] = useState<Item[]>([]);
  const [rejectedItems, setRejectedItems] = useState<{id: string, name: string, reason: string}[]>([]);
  const [results, setResults] = useState<{
    results: PackingResult[];
    unpacked: Item[];
  } | null>(null);
  
  const [activeBinIndex, setActiveBinIndex] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isControlSuiteOpen, setIsControlSuiteOpen] = useState(false);
  const [cameraState, setCameraState] = useState({ 
    eye: { x: 1.8, y: 1.2, z: 1.8 },
    center: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 }
  });

  // Color Mapping for Item Codes (SKU Level)
  const itemColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const uniqueCodes = Array.from(new Set(items.map(i => i.name))) as string[];
    uniqueCodes.forEach((code, idx) => {
      map[code] = `hsl(${(idx * 137.5) % 360}, 70%, 50%)`;
    });
    return map;
  }, [items]);

  const [isPacking, setIsPacking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle CSV Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedItems: Item[] = [];
        const rejected: {id: string, name: string, reason: string}[] = [];
        
        results.data.forEach((row, idx) => {
          const count = parseInt(row.Carton_count) || 1;
          const w = parseFloat(row.Width) * 100;
          const h = parseFloat(row.Height) * 100;
          const d = parseFloat(row.Length) * 100;
          const wt = parseFloat(row.Weight);
          const allowRot = row.Allow_Rotation?.toUpperCase() === 'TRUE';
          const fragility = parseInt(row.Fragility || '1') || 1;

          if (isNaN(w) || isNaN(h) || isNaN(d)) {
            rejected.push({ id: `err-${idx}`, name: row.Item_code || 'Unknown', reason: 'Invalid dimensions' });
            return;
          }

          for (let i = 0; i < count; i++) {
            parsedItems.push({
              id: `${row.Item_code}-${i}-${Math.random().toString(36).substr(2, 5)}`,
              name: row.Item_code,
              width: w,
              height: h,
              depth: d,
              weight: wt,
              allowRotation: allowRot,
              fragility: fragility
            });
          }
        });

        setRejectedItems(rejected);
        setItems(parsedItems);
      },
      error: (error) => {
        console.error('CSV Parsing Error:', error);
        alert('Error parsing CSV file. Please ensure it follows the required format.');
      }
    });
  };

  // Run Packing Optimization
  const runOptimization = () => {
    if (items.length === 0) return;
    setIsPacking(true);
    
    setTimeout(() => {
      const packer = new Packer(binConfig, binConfig.minCBM);
      items.forEach(item => packer.addItem(item));
      const outcome = packer.packAll();
      setResults(outcome);
      setActiveBinIndex(0);
      setIsPacking(false);
    }, 100);
  };

  // Export to Excel
  const exportToExcel = () => {
    if (!results) return;

    const exportData: any[] = [];
    results.results.forEach((binResult) => {
      binResult.packed.forEach((item, index) => {
        exportData.push({
          'Container ID': binResult.binId,
          'Loading Sequence': index + 1,
          'Item Code': item.name,
          'Fragility': item.fragility,
          'X Position (cm)': parseFloat(item.x.toFixed(2)),
          'Y Position (cm)': parseFloat(item.y.toFixed(2)),
          'Z Position (cm)': parseFloat(item.z.toFixed(2)),
          'Width (cm)': parseFloat(item.actualWidth.toFixed(2)),
          'Height (cm)': parseFloat(item.actualHeight.toFixed(2)),
          'Depth (cm)': parseFloat(item.actualDepth.toFixed(2)),
          'Weight (kg)': item.weight,
          'Rotation Type': item.rotation
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Loading Sequence');
    XLSX.writeFile(wb, 'Multi_Container_Loading_Sequence.xlsx');
  };

  // 3D Visualization Data
  const plotData = useMemo(() => {
    if (!results || !results.results[activeBinIndex]) return [];

    const currentBin = results.results[activeBinIndex];
    const traces: any[] = [];

    // Container Outline
    traces.push({
      type: 'mesh3d',
      x: [0, binConfig.width, binConfig.width, 0, 0, binConfig.width, binConfig.width, 0],
      y: [0, 0, binConfig.height, binConfig.height, 0, 0, binConfig.height, binConfig.height],
      z: [0, 0, 0, 0, binConfig.depth, binConfig.depth, binConfig.depth, binConfig.depth],
      i: [7, 0, 0, 0, 4, 4, 6, 6, 4, 0, 3, 2],
      j: [3, 4, 1, 2, 5, 6, 5, 2, 0, 1, 6, 3],
      k: [0, 7, 2, 3, 6, 7, 1, 1, 5, 5, 7, 6],
      opacity: 0.05,
      color: '#141414',
      name: 'Container',
      hoverinfo: 'skip'
    });

    // Floor Grid
    const gridSpacing = 50; // 50cm grid
    const gridX: (number | null)[] = [];
    const gridZ: (number | null)[] = [];
    const gridY: (number | null)[] = [];

    for (let x = 0; x <= binConfig.width; x += gridSpacing) {
      gridX.push(x, x, null);
      gridZ.push(0, binConfig.depth, null);
      gridY.push(0, 0, null);
    }
    for (let z = 0; z <= binConfig.depth; z += gridSpacing) {
      gridX.push(0, binConfig.width, null);
      gridZ.push(z, z, null);
      gridY.push(0, 0, null);
    }

    traces.push({
      type: 'scatter3d',
      mode: 'lines',
      x: gridX,
      y: gridY,
      z: gridZ,
      line: { color: '#141414', width: 1, opacity: 0.2 },
      name: 'Floor Grid',
      hoverinfo: 'skip',
      showlegend: false
    });

    // Orientation Labels
    traces.push({
      type: 'scatter3d',
      mode: 'text',
      x: [binConfig.width / 2, 0, 0],
      y: [-20, binConfig.height / 2, -20],
      z: [-20, -20, binConfig.depth / 2],
      text: ['WIDTH (X)', 'HEIGHT (Y)', 'DEPTH (Z)'],
      textfont: { family: 'JetBrains Mono', size: 12, color: '#141414' },
      hoverinfo: 'skip',
      showlegend: false
    });

    // Packed Items
    currentBin.packed.forEach((item) => {
      const x0 = item.x, x1 = item.x + item.actualWidth;
      const y0 = item.y, y1 = item.y + item.actualHeight;
      const z0 = item.z, z1 = item.z + item.actualDepth;
      const color = itemColorMap[item.name] || '#888';

      // Box Mesh
      traces.push({
        type: 'mesh3d',
        x: [x0, x1, x1, x0, x0, x1, x1, x0],
        y: [y0, y0, y1, y1, y0, y0, y1, y1],
        z: [z0, z0, z0, z0, z1, z1, z1, z1],
        i: [0, 0, 4, 4, 0, 0, 2, 2, 0, 0, 1, 1],
        j: [1, 2, 5, 6, 1, 5, 3, 7, 3, 7, 2, 6],
        k: [2, 3, 6, 7, 5, 4, 7, 6, 7, 4, 6, 5],
        opacity: 0.9,
        flatshading: true,
        lighting: {
          ambient: 0.5,
          diffuse: 0.8,
          specular: 0.1,
          roughness: 0.5,
          fresnel: 0.2
        },
        color: color,
        name: item.name,
        hoverinfo: 'name+text',
        text: `Item: ${item.name}<br>Fragility: ${item.fragility}<br>Pos: (${item.x.toFixed(0)}, ${item.y.toFixed(0)}, ${item.z.toFixed(0)})<br>Dim: ${item.actualWidth.toFixed(0)}x${item.actualHeight.toFixed(0)}x${item.actualDepth.toFixed(0)}<br>Weight: ${item.weight}kg`
      });

      // Box Outlines (Scatter3d)
      traces.push({
        type: 'scatter3d',
        mode: 'lines',
        x: [x0, x1, x1, x0, x0, null, x0, x1, x1, x0, x0, null, x0, x0, null, x1, x1, null, x1, x1, null, x0, x0],
        y: [y0, y0, y1, y1, y0, null, y0, y0, y1, y1, y0, null, y0, y0, null, y0, y0, null, y1, y1, null, y1, y1],
        z: [z0, z0, z0, z0, z0, null, z1, z1, z1, z1, z1, null, z0, z1, null, z0, z1, null, z0, z1, null, z0, z1],
        line: { color: '#000000', width: 4 },
        hoverinfo: 'skip',
        showlegend: false
      });
    });

    return traces;
  }, [results, activeBinIndex, binConfig, itemColorMap]);

  const handleCameraAction = (type: 'rotate' | 'pan' | 'zoom', axis: 'x' | 'y' | 'z', amount: number) => {
    setCameraState(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      
      if (type === 'rotate') {
        next.eye[axis] += amount;
      } else if (type === 'pan') {
        next.center[axis] += amount;
      } else if (type === 'zoom') {
        // Zoom by scaling the eye vector relative to center
        const dx = prev.eye.x - prev.center.x;
        const dy = prev.eye.y - prev.center.y;
        const dz = prev.eye.z - prev.center.z;
        const factor = 1 - amount; // amount > 0 for zoom in
        next.eye.x = prev.center.x + dx * factor;
        next.eye.y = prev.center.y + dy * factor;
        next.eye.z = prev.center.z + dz * factor;
      }
      
      return next;
    });
  };

  const resetCamera = () => {
    setCameraState({ 
      eye: { x: 1.8, y: 1.2, z: 1.8 },
      center: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 }
    });
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-[#141414]/5 rounded-sm transition-colors lg:hidden"
          >
            {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-[#141414]/5 rounded-sm transition-colors hidden lg:block"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-serif italic tracking-tight flex items-center gap-3">
              <Box className="w-8 h-8" />
              PackMaster 3D
            </h1>
            <p className="text-xs uppercase tracking-widest opacity-50 font-mono mt-1">Container Optimization Engine v1.0</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsControlSuiteOpen(!isControlSuiteOpen)}
            className={`flex items-center gap-2 px-4 py-2 border border-[#141414] transition-colors text-sm font-medium ${isControlSuiteOpen ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414] hover:text-[#E4E3E0]'}`}
          >
            <Gamepad2 className="w-4 h-4" />
            3D Controls
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors text-sm font-medium"
          >
            <Upload className="w-4 h-4" />
            Upload CSV
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".csv" 
            className="hidden" 
          />
          
          <button 
            onClick={runOptimization}
            disabled={items.length === 0 || isPacking}
            className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-[#E4E3E0] hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-30"
          >
            {isPacking ? 'Optimizing...' : 'Run Optimizer'}
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 min-h-[calc(100vh-100px)] relative overflow-hidden">
        {/* Sidebar Controls */}
        <AnimatePresence mode="wait">
          {isSidebarOpen && (
            <motion.aside 
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="lg:col-span-3 border-r border-[#141414] p-6 space-y-8 bg-[#E4E3E0] z-20 absolute lg:relative h-full w-80 lg:w-auto shadow-2xl lg:shadow-none"
            >
              <section>
                <div className="flex justify-between items-center mb-4 lg:hidden">
                  <h2 className="text-xs font-mono uppercase tracking-widest opacity-50 flex items-center gap-2">
                    <Settings className="w-3 h-3" />
                    Settings
                  </h2>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-1"><X className="w-4 h-4" /></button>
                </div>
                <h2 className="text-xs font-mono uppercase tracking-widest opacity-50 mb-4 hidden lg:flex items-center gap-2">
                  <Settings className="w-3 h-3" />
                  Optimization Settings
                </h2>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] uppercase font-bold mb-2">Container Type</p>
                <div className="space-y-2">
                  {CONTAINER_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setSelectedContainerId(type.id)}
                      className={`w-full p-2 text-left border transition-all ${
                        selectedContainerId === type.id 
                          ? 'border-[#141414] bg-[#141414] text-[#E4E3E0]' 
                          : 'border-[#141414]/20 hover:border-[#141414]'
                      }`}
                    >
                      <p className="text-[10px] font-bold">{type.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xs font-mono uppercase tracking-widest opacity-50 mb-4 flex items-center gap-2">
              <BarChart3 className="w-3 h-3" />
              Current Queue
            </h2>
            <div className="bg-[#141414]/5 p-4 rounded-sm border border-[#141414]/10">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium">Total Items</span>
                <span className="font-mono text-sm">{items.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium">Total Volume</span>
                <span className="font-mono text-sm">
                  {(items.reduce((acc, i) => acc + (i.width * i.height * i.depth), 0) / 1000000).toFixed(2)} m³
                </span>
              </div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#141414]/10">
                <span className="text-xs font-medium">Theoretical Bins</span>
                <span className="font-mono text-sm">
                  {Math.ceil((items.reduce((acc, i) => acc + (i.width * i.height * i.depth), 0) / 1000000) / binConfig.minCBM)}
                </span>
              </div>
              {items.length > 0 && (
                <button 
                  onClick={() => {setItems([]); setResults(null);}}
                  className="mt-4 w-full py-2 text-[10px] uppercase font-bold border border-[#141414]/20 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear Queue
                </button>
              )}
            </div>
          </section>

          {rejectedItems.length > 0 && (
            <section>
              <h2 className="text-xs font-mono uppercase tracking-widest text-red-600 mb-4 flex items-center gap-2">
                <AlertCircle className="w-3 h-3" />
                Rejected Items ({rejectedItems.length})
              </h2>
              <div className="bg-red-50 border border-red-200 p-3 rounded-sm space-y-2 max-h-40 overflow-auto">
                {rejectedItems.map(item => (
                  <div key={item.id} className="text-[10px]">
                    <span className="font-bold">{item.name}:</span> {item.reason}
                  </div>
                ))}
              </div>
            </section>
          )}

          {results && (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <h2 className="text-xs font-mono uppercase tracking-widest opacity-50 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3" />
                Optimization Results
              </h2>
              <div className="bg-[#141414] text-[#E4E3E0] p-3 rounded-sm">
                <p className="text-[9px] uppercase opacity-60 mb-1">Containers Required</p>
                <p className="text-xl font-mono">{results.results.length}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#141414] text-[#E4E3E0] p-3 rounded-sm">
                  <p className="text-[9px] uppercase opacity-60 mb-1">Efficiency (Avg)</p>
                  <p className="text-xl font-mono">
                    {(results.results.reduce((acc, r) => acc + r.efficiency, 0) / results.results.length).toFixed(1)}%
                  </p>
                </div>
                <div className="bg-[#141414] text-[#E4E3E0] p-3 rounded-sm">
                  <p className="text-[9px] uppercase opacity-60 mb-1">Unpacked</p>
                  <p className="text-xl font-mono">{results.unpacked.length}</p>
                </div>
              </div>
              
              <button 
                onClick={exportToExcel}
                className="w-full py-3 bg-emerald-600 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export Full Sequence
              </button>
            </motion.section>
          )}
        </motion.aside>
      )}
    </AnimatePresence>

    {/* Visualization Area */}
    <div className={`${isSidebarOpen ? 'lg:col-span-9' : 'lg:col-span-12'} flex flex-col transition-all duration-300`}>
          {results && results.results.length > 1 && (
            <div className="bg-white border-b border-[#141414] p-2 flex gap-2 overflow-x-auto">
              {results.results.map((bin, idx) => (
                <button
                  key={bin.binId}
                  onClick={() => setActiveBinIndex(idx)}
                  className={`px-4 py-1 text-[10px] font-mono uppercase border transition-all whitespace-nowrap ${
                    activeBinIndex === idx 
                      ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' 
                      : 'border-[#141414]/20 hover:border-[#141414]'
                  }`}
                >
                  {bin.binId} ({bin.efficiency.toFixed(0)}%)
                </button>
              ))}
            </div>
          )}
          
          <div className="flex-1 relative bg-[#DCDAD7] min-h-[500px]">
            {items.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center opacity-30">
                <Box className="w-24 h-24 mb-6" />
                <h3 className="text-2xl font-serif italic">No Data Loaded</h3>
                <p className="max-w-xs text-sm mt-2">Upload a CSV file with headers: Item_code, Carton_count, Length, Width, Height, Weight.</p>
              </div>
            ) : (
              <div className="w-full h-full">
                <Plot
                  data={plotData}
                  layout={{
                    autosize: true,
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    margin: { l: 0, r: 0, b: 0, t: 0 },
                    scene: {
                      aspectmode: 'data',
                      xaxis: { title: 'WIDTH (X)', showgrid: false, zeroline: true, backgroundcolor: '#f0f0f0', showbackground: true },
                      yaxis: { title: 'HEIGHT (Y)', showgrid: false, zeroline: true, backgroundcolor: '#f5f5f5', showbackground: true },
                      zaxis: { title: 'DEPTH (Z)', showgrid: false, zeroline: true, backgroundcolor: '#e0e0e0', showbackground: true },
                      camera: cameraState
                    },
                    showlegend: false,
                  }}
                  useResizeHandler={true}
                  style={{ width: '100%', height: '100%' }}
                  config={{ displayModeBar: true, responsive: true }}
                />
              </div>
            )}
            
            {results && results.results[activeBinIndex] && (
              <div className="absolute bottom-6 left-6 right-6 flex flex-wrap gap-4">
                <div className="bg-white/90 backdrop-blur-md border border-[#141414]/10 p-3 rounded-sm shadow-lg flex items-center gap-3 min-w-[140px]">
                  <div className="p-2 bg-[#141414] text-[#E4E3E0] rounded-sm">
                    <Maximize2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[9px] uppercase font-bold opacity-50">Volume Util %</p>
                    <p className="text-sm font-mono font-bold text-emerald-600">
                      {results.results[activeBinIndex].efficiency.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="bg-white/90 backdrop-blur-md border border-[#141414]/10 p-3 rounded-sm shadow-lg flex items-center gap-3 min-w-[140px]">
                  <div className="p-2 bg-[#141414] text-[#E4E3E0] rounded-sm">
                    <Box className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[9px] uppercase font-bold opacity-50">Carton Volume</p>
                    <p className="text-sm font-mono font-bold">
                      {results.results[activeBinIndex].totalCBM.toFixed(2)} m³
                    </p>
                  </div>
                </div>
                <div className="bg-white/90 backdrop-blur-md border border-[#141414]/10 p-3 rounded-sm shadow-lg flex items-center gap-3 min-w-[140px]">
                  <div className="p-2 bg-[#141414] text-[#E4E3E0] rounded-sm">
                    <Weight className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[9px] uppercase font-bold opacity-50">Weight Cap %</p>
                    <p className="text-sm font-mono font-bold text-blue-600">
                      {results.results[activeBinIndex].weightCapacityPercent.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="bg-white/90 backdrop-blur-md border border-[#141414]/10 p-3 rounded-sm shadow-lg flex items-center gap-3 min-w-[140px]">
                  <div className="p-2 bg-[#141414] text-[#E4E3E0] rounded-sm">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[9px] uppercase font-bold opacity-50">Total Cartons</p>
                    <p className="text-sm font-mono font-bold">{results.results[activeBinIndex].cartonCount}</p>
                  </div>
                </div>
                <div className="bg-white/90 backdrop-blur-md border border-[#141414]/10 p-3 rounded-sm shadow-lg flex items-center gap-3 min-w-[140px]">
                  <div className="p-2 bg-amber-500 text-white rounded-sm">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[9px] uppercase font-bold opacity-50">Empty Space</p>
                    <p className="text-sm font-mono font-bold">{results.results[activeBinIndex].emptyCBM.toFixed(2)} m³ ({results.results[activeBinIndex].emptyPercent.toFixed(1)}%)</p>
                  </div>
                </div>
                
                {results.results[activeBinIndex].balanceWarning && (
                  <div className="bg-red-600 text-white p-3 rounded-sm shadow-lg flex items-center gap-3 animate-pulse">
                    <AlertCircle className="w-5 h-5" />
                    <div>
                      <p className="text-[9px] uppercase font-bold">Balance Warning</p>
                      <p className="text-[10px] font-medium">CoG exceeds ±5% threshold!</p>
                    </div>
                  </div>
                )}

                {results.results[activeBinIndex].weight6050Warning && (
                  <div className="bg-orange-600 text-white p-3 rounded-sm shadow-lg flex items-center gap-3 animate-pulse">
                    <Weight className="w-5 h-5" />
                    <div>
                      <p className="text-[9px] uppercase font-bold">Weight Rule Warning</p>
                      <p className="text-[10px] font-medium">60/50 Weight Distribution exceeded!</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rotation Controls */}
            <AnimatePresence>
              {isControlSuiteOpen && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: -20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -20 }}
                  className="absolute top-6 right-6 flex flex-col gap-4 z-30"
                >
                  <div className="bg-white/90 backdrop-blur-md border border-[#141414]/10 p-3 rounded-sm shadow-lg flex flex-col gap-4 w-48">
                    <div className="flex justify-between items-center border-b border-[#141414]/10 pb-2">
                      <p className="text-[10px] uppercase font-bold opacity-50">3D Control Suite</p>
                      <button onClick={() => setIsControlSuiteOpen(false)} className="p-1 hover:bg-gray-200 rounded-full transition-colors"><X className="w-3 h-3" /></button>
                    </div>
                    
                    {/* Rotation */}
                <div className="space-y-2">
                  <p className="text-[8px] uppercase font-bold opacity-40 flex items-center gap-1">
                    <Rotate3d className="w-2 h-2" /> Rotate
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    <div />
                    <button onClick={() => handleCameraAction('rotate', 'y', 0.2)} className="p-1.5 hover:bg-gray-200 rounded border border-[#141414]/5 transition-colors" title="Rotate Up"><ArrowUp className="w-3 h-3 mx-auto" /></button>
                    <div />
                    <button onClick={() => handleCameraAction('rotate', 'x', -0.2)} className="p-1.5 hover:bg-gray-200 rounded border border-[#141414]/5 transition-colors" title="Rotate Left"><ArrowLeft className="w-3 h-3 mx-auto" /></button>
                    <button onClick={resetCamera} className="p-1.5 bg-[#141414] text-white rounded hover:opacity-80 transition-opacity flex items-center justify-center" title="Reset View"><RefreshCw className="w-3 h-3" /></button>
                    <button onClick={() => handleCameraAction('rotate', 'x', 0.2)} className="p-1.5 hover:bg-gray-200 rounded border border-[#141414]/5 transition-colors" title="Rotate Right"><ArrowRight className="w-3 h-3 mx-auto" /></button>
                    <div />
                    <button onClick={() => handleCameraAction('rotate', 'y', -0.2)} className="p-1.5 hover:bg-gray-200 rounded border border-[#141414]/5 transition-colors" title="Rotate Down"><ArrowDown className="w-3 h-3 mx-auto" /></button>
                    <div />
                  </div>
                </div>

                {/* Panning */}
                <div className="space-y-2">
                  <p className="text-[8px] uppercase font-bold opacity-40 flex items-center gap-1">
                    <Hand className="w-2 h-2" /> Pan
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    <div />
                    <button onClick={() => handleCameraAction('pan', 'y', 0.1)} className="p-1.5 hover:bg-gray-200 rounded border border-[#141414]/5 transition-colors" title="Pan Up"><MoveUp className="w-3 h-3 mx-auto" /></button>
                    <div />
                    <button onClick={() => handleCameraAction('pan', 'x', -0.1)} className="p-1.5 hover:bg-gray-200 rounded border border-[#141414]/5 transition-colors" title="Pan Left"><MoveLeft className="w-3 h-3 mx-auto" /></button>
                    <div className="flex items-center justify-center opacity-20"><Hand className="w-3 h-3" /></div>
                    <button onClick={() => handleCameraAction('pan', 'x', 0.1)} className="p-1.5 hover:bg-gray-200 rounded border border-[#141414]/5 transition-colors" title="Pan Right"><MoveRight className="w-3 h-3 mx-auto" /></button>
                    <div />
                    <button onClick={() => handleCameraAction('pan', 'y', -0.1)} className="p-1.5 hover:bg-gray-200 rounded border border-[#141414]/5 transition-colors" title="Pan Down"><MoveDown className="w-3 h-3 mx-auto" /></button>
                    <div />
                  </div>
                </div>

                {/* Zoom */}
                <div className="space-y-2">
                  <p className="text-[8px] uppercase font-bold opacity-40 flex items-center gap-1">
                    <Maximize2 className="w-2 h-2" /> Zoom
                  </p>
                  <div className="flex gap-1">
                    <button onClick={() => handleCameraAction('zoom', 'x', 0.1)} className="flex-1 p-2 hover:bg-gray-200 rounded border border-[#141414]/5 transition-colors flex items-center justify-center gap-2 text-[9px] font-bold uppercase" title="Zoom In">
                      <ZoomIn className="w-3 h-3" /> In
                    </button>
                    <button onClick={() => handleCameraAction('zoom', 'x', -0.1)} className="flex-1 p-2 hover:bg-gray-200 rounded border border-[#141414]/5 transition-colors flex items-center justify-center gap-2 text-[9px] font-bold uppercase" title="Zoom Out">
                      <ZoomOut className="w-3 h-3" /> Out
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

          {/* Data Table / Log */}
          <div className="h-64 border-t border-[#141414] bg-white overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white border-b border-[#141414] z-10">
                <tr>
                  <th className="p-3 text-[10px] uppercase font-mono opacity-50">Seq</th>
                  <th className="p-3 text-[10px] uppercase font-mono opacity-50">Container</th>
                  <th className="p-3 text-[10px] uppercase font-mono opacity-50">Item Code</th>
                  <th className="p-3 text-[10px] uppercase font-mono opacity-50">Dimensions (WxHxD)</th>
                  <th className="p-3 text-[10px] uppercase font-mono opacity-50">Position (X,Y,Z)</th>
                  <th className="p-3 text-[10px] uppercase font-mono opacity-50">Weight</th>
                  <th className="p-3 text-[10px] uppercase font-mono opacity-50">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141414]/5">
                {results ? (
                  <>
                    {results.results.map((bin) => (
                      bin.packed.map((item, idx) => (
                        <tr key={item.id} className={`hover:bg-[#141414]/5 transition-colors ${results.results[activeBinIndex].binId === bin.binId ? 'bg-emerald-50/30' : ''}`}>
                          <td className="p-3 font-mono text-xs">{idx + 1}</td>
                          <td className="p-3 font-mono text-xs font-bold">{bin.binId}</td>
                          <td className="p-3 font-medium text-xs">{item.name}</td>
                          <td className="p-3 font-mono text-xs">{item.actualWidth.toFixed(2)}x{item.actualHeight.toFixed(2)}x{item.actualDepth.toFixed(2)}</td>
                          <td className="p-3 font-mono text-xs">({item.x.toFixed(2)}, {item.y.toFixed(2)}, {item.z.toFixed(2)})</td>
                          <td className="p-3 font-mono text-xs">{item.weight} kg</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-bold uppercase">Packed</span>
                          </td>
                        </tr>
                      ))
                    ))}
                    {results.unpacked.map((item) => (
                      <tr key={item.id} className="bg-red-50/50 hover:bg-red-50 transition-colors">
                        <td className="p-3 font-mono text-xs">-</td>
                        <td className="p-3 font-mono text-xs">-</td>
                        <td className="p-3 font-medium text-xs">{item.name}</td>
                        <td className="p-3 font-mono text-xs">{item.width}x{item.height}x{item.depth}</td>
                        <td className="p-3 font-mono text-xs">-</td>
                        <td className="p-3 font-mono text-xs">{item.weight} kg</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[9px] font-bold uppercase">No Fit</span>
                        </td>
                      </tr>
                    ))}
                  </>
                ) : (
                  items.map((item, idx) => (
                    <tr key={item.id} className="opacity-50">
                      <td className="p-3 font-mono text-xs">{idx + 1}</td>
                      <td className="p-3 font-mono text-xs">-</td>
                      <td className="p-3 font-medium text-xs">{item.name}</td>
                      <td className="p-3 font-mono text-xs">{item.width}x{item.height}x{item.depth}</td>
                      <td className="p-3 font-mono text-xs">-</td>
                      <td className="p-3 font-mono text-xs">{item.weight} kg</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[9px] font-bold uppercase">Pending</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Footer / Status Bar */}
      <footer className="border-t border-[#141414] p-3 bg-[#141414] text-[#E4E3E0] flex justify-between items-center text-[10px] font-mono uppercase tracking-widest">
        <div className="flex gap-6">
          <span>System: Active</span>
          <span>Engine: Heuristic 3D-FFD</span>
        </div>
        <div>
          {items.length > 0 ? `${items.length} Items in Queue` : 'Ready for input'}
        </div>
      </footer>
    </div>
  );
}
