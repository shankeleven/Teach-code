
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Pen, Eraser, Square, Circle, Type, Undo, Redo, Download, Users, Trash2 } from 'lucide-react';

const CollaborativeWhiteboard = () => {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [elements, setElements] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [roomId, setRoomId] = useState('room-123');
  const [connectedUsers, setConnectedUsers] = useState(3);
  const [textInput, setTextInput] = useState({ active: false, x: 0, y: 0, value: '' });

  // Generate unique ID for elements
  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

  // Add element to canvas
  const addElement = useCallback((element) => {
    setElements(prev => {
      const newElements = [...prev, { ...element, id: element.id || generateId() }];
      // Add to history for undo/redo
      setHistory(prevHistory => [...prevHistory.slice(0, historyIndex + 1), newElements]);
      setHistoryIndex(prev => prev + 1);
      return newElements;
    });
  }, [historyIndex]);

  // Update existing element
  const updateElement = useCallback((id, updates) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  }, []);

  // Get mouse position relative to canvas
  const getMousePos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  // Handle mouse down
  const handleMouseDown = useCallback((e) => {
    const pos = getMousePos(e);
    setIsDrawing(true);
    setStartPos(pos);

    if (tool === 'pen') {
      setCurrentPath(`M${pos.x},${pos.y}`);
      addElement({
        type: 'path',
        path: `M${pos.x},${pos.y}`,
        stroke: color,
        strokeWidth,
        fill: 'none'
      });
    } else if (tool === 'text') {
      setTextInput({ active: true, x: pos.x, y: pos.y, value: '' });
    }
  }, [tool, color, strokeWidth, getMousePos, addElement]);

  // Handle mouse move
  const handleMouseMove = useCallback((e) => {
    if (!isDrawing) return;

    const pos = getMousePos(e);

    if (tool === 'pen') {
      const newPath = currentPath + ` L${pos.x},${pos.y}`;
      setCurrentPath(newPath);

      // Update the last element
      setElements(prev => {
        const newElements = [...prev];
        if (newElements.length > 0) {
          newElements[newElements.length - 1].path = newPath;
        }
        return newElements;
      });
    }
  }, [isDrawing, tool, currentPath, getMousePos]);

  // Handle mouse up
  const handleMouseUp = useCallback((e) => {
    if (!isDrawing) return;

    const pos = getMousePos(e);
    setIsDrawing(false);

    if (tool === 'rectangle') {
      addElement({
        type: 'rect',
        x: Math.min(startPos.x, pos.x),
        y: Math.min(startPos.y, pos.y),
        width: Math.abs(pos.x - startPos.x),
        height: Math.abs(pos.y - startPos.y),
        stroke: color,
        strokeWidth,
        fill: 'none'
      });
    } else if (tool === 'circle') {
      const radius = Math.sqrt(Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2));
      addElement({
        type: 'circle',
        cx: startPos.x,
        cy: startPos.y,
        r: radius,
        stroke: color,
        strokeWidth,
        fill: 'none'
      });
    }
  }, [isDrawing, tool, startPos, color, strokeWidth, getMousePos, addElement]);

  // Handle text input
  const handleTextSubmit = () => {
    if (textInput.value.trim()) {
      addElement({
        type: 'text',
        x: textInput.x,
        y: textInput.y,
        text: textInput.value,
        fill: color,
        fontSize: 16,
        fontFamily: 'Arial, sans-serif'
      });
    }
    setTextInput({ active: false, x: 0, y: 0, value: '' });
  };

  // Undo functionality
  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setElements(history[historyIndex - 1]);
    }
  };

  // Redo functionality
  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setElements(history[historyIndex + 1]);
    }
  };

  // Clear canvas
  const clearCanvas = () => {
    setElements([]);
    setHistory([[]]);
    setHistoryIndex(0);
  };

  // Generate SVG string for storage/export
  const generateSVG = () => {
    const svgElements = elements.map(el => {
      switch (el.type) {
        case 'path':
          return `<path d="${el.path}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" fill="${el.fill}" />`;
        case 'rect':
          return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" fill="${el.fill}" />`;
        case 'circle':
          return `<circle cx="${el.cx}" cy="${el.cy}" r="${el.r}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" fill="${el.fill}" />`;
        case 'text':
          return `<text x="${el.x}" y="${el.y}" fill="${el.fill}" font-size="${el.fontSize}" font-family="${el.fontFamily}">${el.text}</text>`;
        default:
          return '';
      }
    }).join('\n    ');

    return `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
    ${svgElements}
  </svg>`;
  };

  // Download SVG
  const downloadSVG = () => {
    const svgContent = generateSVG();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whiteboard-${roomId}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Simulate WebSocket connection for real-time collaboration
  useEffect(() => {
    // In a real implementation, you would:
    // 1. Connect to WebSocket server with roomId
    // 2. Listen for drawing events from other users
    // 3. Send drawing events to other users
    // 4. Load initial SVG state from server

    console.log('Connected to room:', roomId);
    console.log('SVG for storage:', generateSVG());
  }, [roomId, elements]);

  // Render SVG elements
  const renderElements = () => {
    return elements.map(el => {
      switch (el.type) {
        case 'path':
          return (
            <path
              key={el.id}
              d={el.path}
              stroke={el.stroke}
              strokeWidth={el.strokeWidth}
              fill={el.fill}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        case 'rect':
          return (
            <rect
              key={el.id}
              x={el.x}
              y={el.y}
              width={el.width}
              height={el.height}
              stroke={el.stroke}
              strokeWidth={el.strokeWidth}
              fill={el.fill}
            />
          );
        case 'circle':
          return (
            <circle
              key={el.id}
              cx={el.cx}
              cy={el.cy}
              r={el.r}
              stroke={el.stroke}
              strokeWidth={el.strokeWidth}
              fill={el.fill}
            />
          );
        case 'text':
          return (
            <text
              key={el.id}
              x={el.x}
              y={el.y}
              fill={el.fill}
              fontSize={el.fontSize}
              fontFamily={el.fontFamily}
            >
              {el.text}
            </text>
          );
        default:
          return null;
      }
    });
  };

  return (
    <div className="w-full h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-md p-4 flex items-center justify-between border-b">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-gray-800">Collaborative Whiteboard</h1>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Users size={16} />
            <span>{connectedUsers} users</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="px-3 py-1 border rounded text-sm"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b p-3 flex items-center space-x-4">
        {/* Tools */}
        <div className="flex items-center space-x-2 border-r pr-4">
          {[
            { name: 'pen', icon: Pen, label: 'Pen' },
            { name: 'rectangle', icon: Square, label: 'Rectangle' },
            { name: 'circle', icon: Circle, label: 'Circle' },
            { name: 'text', icon: Type, label: 'Text' },
            { name: 'eraser', icon: Eraser, label: 'Eraser' }
          ].map(({ name, icon: Icon, label }) => (
            <button
              key={name}
              onClick={() => setTool(name)}
              className={`p-2 rounded ${
                tool === name ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
              title={label}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>

        {/* Color and Stroke */}
        <div className="flex items-center space-x-3 border-r pr-4">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded border"
            title="Color"
          />
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">Stroke:</label>
            <input
              type="range"
              min="1"
              max="20"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
              className="w-20"
            />
            <span className="text-sm text-gray-600 w-6">{strokeWidth}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="p-2 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            title="Undo"
          >
            <Undo size={18} />
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="p-2 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            title="Redo"
          >
            <Redo size={18} />
          </button>
          <button
            onClick={clearCanvas}
            className="p-2 rounded text-red-600 hover:bg-red-50"
            title="Clear Canvas"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={downloadSVG}
            className="p-2 rounded text-green-600 hover:bg-green-50"
            title="Download SVG"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <svg
          ref={canvasRef}
          width="100%"
          height="100%"
          className="cursor-crosshair bg-white"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setIsDrawing(false)}
        >
          {/* Grid pattern */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f0f0f0" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Render all elements */}
          {renderElements()}
        </svg>

        {/* Text input overlay */}
        {textInput.active && (
          <div
            className="absolute bg-white border rounded shadow-lg p-2"
            style={{ left: textInput.x, top: textInput.y - 40 }}
          >
            <input
              type="text"
              value={textInput.value}
              onChange={(e) => setTextInput(prev => ({ ...prev, value: e.target.value }))}
              onKeyPress={(e) => e.key === 'Enter' && handleTextSubmit()}
              onBlur={handleTextSubmit}
              autoFocus
              className="border px-2 py-1 text-sm"
              placeholder="Enter text..."
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="bg-gray-50 border-t px-4 py-2 text-xs text-gray-500">
        Elements: {elements.length} | Tool: {tool} | Room: {roomId}
      </div>
    </div>
  );
};

export default CollaborativeWhiteboard;
