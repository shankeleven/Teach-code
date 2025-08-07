import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Pen,
  Eraser,
  Square,
  Circle,
  Type,
  Undo,
  Redo,
  Download,
  Users,
  Trash2,
} from "lucide-react";

const CollaborativeWhiteboard = ({
  socketRef,
  roomId,
  elements,
  onElementsChange,
}) => {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#ffffff");
  const [strokeWidth, setStrokeWidth] = useState(2);
  // Remove local elements state - use props instead
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState("");
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [connectedUsers, setConnectedUsers] = useState(3);
  const [textInput, setTextInput] = useState({
    active: false,
    x: 0,
    y: 0,
    value: "",
  });

  // Generate unique ID for elements
  const generateId = () =>
    Date.now().toString(36) + Math.random().toString(36).substr(2);

  // Add element to canvas
  const addElement = useCallback(
    (element) => {
      const newElements = [
        ...elements,
        { ...element, id: element.id || generateId() },
      ];
      onElementsChange(newElements);
      // Add to history for undo/redo
      setHistory((prevHistory) => [
        ...prevHistory.slice(0, historyIndex + 1),
        newElements,
      ]);
      setHistoryIndex((prev) => prev + 1);
    },
    [elements, onElementsChange, historyIndex]
  );

  // Update existing element
  const updateElement = useCallback(
    (id, updates) => {
      const newElements = elements.map((el) =>
        el.id === id ? { ...el, ...updates } : el
      );
      onElementsChange(newElements);
    },
    [elements, onElementsChange]
  );

  // Get mouse position relative to canvas
  const getMousePos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e) => {
      const pos = getMousePos(e);
      setIsDrawing(true);
      setStartPos(pos);

      if (tool === "pen") {
        setCurrentPath(`M${pos.x},${pos.y}`);
        addElement({
          type: "path",
          path: `M${pos.x},${pos.y}`,
          stroke: color,
          strokeWidth,
          fill: "none",
        });
      } else if (tool === "text") {
        setTextInput({ active: true, x: pos.x, y: pos.y, value: "" });
      }
    },
    [tool, color, strokeWidth, getMousePos, addElement]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e) => {
      if (!isDrawing) return;

      const pos = getMousePos(e);

      if (tool === "pen") {
        const newPath = currentPath + ` L${pos.x},${pos.y}`;
        setCurrentPath(newPath);

        // Update the last element
        const newElements = [...elements];
        if (newElements.length > 0) {
          newElements[newElements.length - 1].path = newPath;
          onElementsChange(newElements);
        }
      }
    },
    [isDrawing, tool, currentPath, getMousePos]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(
    (e) => {
      if (!isDrawing) return;

      const pos = getMousePos(e);
      setIsDrawing(false);

      if (tool === "rectangle") {
        addElement({
          type: "rect",
          x: Math.min(startPos.x, pos.x),
          y: Math.min(startPos.y, pos.y),
          width: Math.abs(pos.x - startPos.x),
          height: Math.abs(pos.y - startPos.y),
          stroke: color,
          strokeWidth,
          fill: "none",
        });
      } else if (tool === "circle") {
        const radius = Math.sqrt(
          Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2)
        );
        addElement({
          type: "circle",
          cx: startPos.x,
          cy: startPos.y,
          r: radius,
          stroke: color,
          strokeWidth,
          fill: "none",
        });
      }
    },
    [isDrawing, tool, startPos, color, strokeWidth, getMousePos, addElement]
  );

  // Handle text input
  const handleTextSubmit = () => {
    if (textInput.value.trim()) {
      addElement({
        type: "text",
        x: textInput.x,
        y: textInput.y,
        text: textInput.value,
        fill: color,
        fontSize: 16,
        fontFamily: "Arial, sans-serif",
      });
    }
    setTextInput({ active: false, x: 0, y: 0, value: "" });
  };

  // Undo last action
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex((prev) => prev - 1);
      const previousState = history[historyIndex - 1];
      onElementsChange(previousState);
    }
  }, [historyIndex, history, onElementsChange]);

  // Redo action
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex((prev) => prev + 1);
      const nextState = history[historyIndex + 1];
      onElementsChange(nextState);
    }
  }, [historyIndex, history, onElementsChange]);

  // Clear canvas
  const clearCanvas = () => {
    onElementsChange([]);
    setHistory([[]]);
    setHistoryIndex(0);
  };

  // Generate SVG string for storage/export
  const generateSVG = () => {
    const svgElements = elements
      .map((el) => {
        switch (el.type) {
          case "path":
            return `<path d="${el.path}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" fill="${el.fill}" />`;
          case "rect":
            return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" fill="${el.fill}" />`;
          case "circle":
            return `<circle cx="${el.cx}" cy="${el.cy}" r="${el.r}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" fill="${el.fill}" />`;
          case "text":
            return `<text x="${el.x}" y="${el.y}" fill="${el.fill}" font-size="${el.fontSize}" font-family="${el.fontFamily}">${el.text}</text>`;
          default:
            return "";
        }
      })
      .join("\n    ");

    return `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
    ${svgElements}
  </svg>`;
  };

  // Download SVG
  const downloadSVG = () => {
    const svgContent = generateSVG();
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whiteboard-${roomId}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Render SVG elements
  const renderElements = () => {
    return elements.map((el) => {
      switch (el.type) {
        case "path":
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
        case "rect":
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
        case "circle":
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
        case "text":
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
    <div className="relative w-full h-full">
      {/* Floating Toolbar */}
      <div className="absolute top-2 left-2 z-10 bg-gray-800 border border-gray-700 rounded-lg p-2 flex items-center space-x-2 shadow-lg">
        {/* Tools */}
        <div className="flex items-center space-x-1 border-r border-gray-600 pr-2">
          {[
            { name: "pen", icon: Pen, label: "Pen" },
            { name: "rectangle", icon: Square, label: "Rectangle" },
            { name: "circle", icon: Circle, label: "Circle" },
            { name: "text", icon: Type, label: "Text" },
            { name: "eraser", icon: Eraser, label: "Eraser" },
          ].map(({ name, icon: Icon, label }) => (
            <button
              key={name}
              onClick={() => setTool(name)}
              className={`p-1.5 rounded ${
                tool === name
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-700"
              }`}
              title={label}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>

        {/* Color and Stroke */}
        <div className="flex items-center space-x-2 border-r border-gray-600 pr-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-6 h-6 rounded border border-gray-600 bg-gray-700"
            title="Color"
          />
          <input
            type="range"
            min="1"
            max="20"
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
            className="w-16 accent-blue-600"
            title={`Stroke: ${strokeWidth}`}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-1">
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="p-1.5 rounded text-gray-300 hover:bg-gray-700 disabled:opacity-50"
            title="Undo"
          >
            <Undo size={14} />
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="p-1.5 rounded text-gray-300 hover:bg-gray-700 disabled:opacity-50"
            title="Redo"
          >
            <Redo size={14} />
          </button>
          <button
            onClick={clearCanvas}
            className="p-1.5 rounded text-red-400 hover:bg-red-900/20"
            title="Clear"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Full Canvas */}
      <svg
        ref={canvasRef}
        width="100%"
        height="100vh"
        className="cursor-crosshair bg-gray-900"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setIsDrawing(false)}
      >
        {/* Grid pattern */}
        <defs>
          <pattern
            id="grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="#374151"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Render all elements */}
        {renderElements()}
      </svg>

      {/* Text input overlay */}
      {textInput.active && (
        <div
          className="absolute bg-gray-800 border border-gray-600 rounded shadow-lg p-2 z-20"
          style={{ left: textInput.x, top: textInput.y - 40 }}
        >
          <input
            type="text"
            value={textInput.value}
            onChange={(e) =>
              setTextInput((prev) => ({ ...prev, value: e.target.value }))
            }
            onKeyPress={(e) => e.key === "Enter" && handleTextSubmit()}
            onBlur={handleTextSubmit}
            autoFocus
            className="border border-gray-600 px-2 py-1 text-sm bg-gray-700 text-white placeholder-gray-400"
            placeholder="Enter text..."
          />
        </div>
      )}
    </div>
  );
};

export default CollaborativeWhiteboard;
