import React, { useState, useRef, useEffect, useCallback } from "react";
import { Pen, Eraser, Square, Circle, Undo, Redo, Trash2, MousePointer } from "lucide-react";

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
  const [tempElement, setTempElement] = useState(null); // preview while drawing
  const [selectedId, setSelectedId] = useState(null);
  const [action, setAction] = useState("none"); // none | drawing | moving
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [preMoveSnapshot, setPreMoveSnapshot] = useState(null);

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

  // Simple hit test for select/erase/move (checks from top-most)
  const hitTest = useCallback(
    (point) => {
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (el.type === "rect") {
          if (
            point.x >= el.x &&
            point.x <= el.x + el.width &&
            point.y >= el.y &&
            point.y <= el.y + el.height
          ) {
            return el;
          }
        } else if (el.type === "circle") {
          const dx = point.x - el.cx;
          const dy = point.y - el.cy;
          if (Math.sqrt(dx * dx + dy * dy) <= el.r) return el;
        } else if (el.type === "text") {
          const fontSize = el.fontSize || 16;
          const width = (el.text?.length || 0) * fontSize * 0.6;
          const height = fontSize * 1.2;
          if (
            point.x >= el.x &&
            point.x <= el.x + width &&
            point.y >= el.y - height &&
            point.y <= el.y
          ) {
            return el;
          }
        } else if (el.type === "path") {
          // crude path hit test: bounding box only for performance
          try {
            const coords = el.path
              .replace(/[ML]/g, "")
              .trim()
              .split(" ")
              .map((p) => p.split(",").map(Number));
            let minX = Infinity,
              minY = Infinity,
              maxX = -Infinity,
              maxY = -Infinity;
            coords.forEach(([x, y]) => {
              if (!isNaN(x) && !isNaN(y)) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
              }
            });
            if (
              point.x >= minX - 4 &&
              point.x <= maxX + 4 &&
              point.y >= minY - 4 &&
              point.y <= maxY + 4
            )
              return el;
          } catch {}
        }
      }
      return null;
    },
    [elements]
  );

  // Handle mouse down
  const handleMouseDown = useCallback(
  (e) => {
      const pos = getMousePos(e);
      setStartPos(pos);

      if (tool === "pen") {
        setIsDrawing(true);
        setCurrentPath(`M${pos.x},${pos.y}`);
        addElement({
          type: "path",
          path: `M${pos.x},${pos.y}`,
          stroke: color,
          strokeWidth,
          fill: "none",
        });
        setAction("drawing");
        return;
      }

      if (tool === "rectangle" || tool === "circle") {
        setIsDrawing(true);
        setAction("drawing");
        setTempElement({
          type: tool === "rectangle" ? "rect" : "circle",
          x: pos.x,
          y: pos.y,
          cx: pos.x,
          cy: pos.y,
          width: 0,
          height: 0,
          r: 0,
          stroke: color,
          strokeWidth,
          fill: "none",
        });
        return;
      }

      if (tool === "eraser" || tool === "select") {
        const hit = hitTest(pos);
        if (tool === "eraser") {
          if (hit) {
            onElementsChange(elements.filter((el) => el.id !== hit.id));
            // record history
            setHistory((prev) => [
              ...prev.slice(0, historyIndex + 1),
              elements.filter((el) => el.id !== hit.id),
            ]);
            setHistoryIndex((prev) => prev + 1);
          }
          return;
        }
        if (hit) {
          setSelectedId(hit.id);
          setAction("moving");
          // save snapshot for history on mouseup
          setPreMoveSnapshot(elements);
          if (hit.type === "rect") {
            setDragOffset({ x: pos.x - hit.x, y: pos.y - hit.y });
          } else if (hit.type === "circle") {
            setDragOffset({ x: pos.x - hit.cx, y: pos.y - hit.cy });
          } else if (hit.type === "text") {
            setDragOffset({ x: pos.x - hit.x, y: pos.y - hit.y });
          } else if (hit.type === "path") {
            setDragOffset({ x: pos.x, y: pos.y });
          }
        } else {
          setSelectedId(null);
        }
        return;
      }
    },
  [tool, color, strokeWidth, getMousePos, addElement, hitTest, elements, onElementsChange, historyIndex]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
  (e) => {
      const pos = getMousePos(e);

      if (action === "moving" && selectedId) {
        const newEls = elements.map((el) => {
          if (el.id !== selectedId) return el;
          if (el.type === "rect") {
            return { ...el, x: pos.x - dragOffset.x, y: pos.y - dragOffset.y };
          }
          if (el.type === "circle") {
            return { ...el, cx: pos.x - dragOffset.x, cy: pos.y - dragOffset.y };
          }
          if (el.type === "text") {
            return { ...el, x: pos.x - dragOffset.x, y: pos.y - dragOffset.y };
          }
          if (el.type === "path") {
            // translate path by delta from last move event (approximate: recompute from start)
            return el; // skipping complex path move for now
          }
          return el;
        });
        onElementsChange(newEls);
        return;
      }

      if (!isDrawing) return;

      if (tool === "pen") {
        const newPath = currentPath + ` L${pos.x},${pos.y}`;
        setCurrentPath(newPath);

        // Update the last element
        const newElements = [...elements];
        if (newElements.length > 0) {
          newElements[newElements.length - 1].path = newPath;
          onElementsChange(newElements);
        }
        return;
      }

      if (tool === "rectangle" && tempElement) {
        const x = Math.min(startPos.x, pos.x);
        const y = Math.min(startPos.y, pos.y);
        const width = Math.abs(pos.x - startPos.x);
        const height = Math.abs(pos.y - startPos.y);
        setTempElement((t) => ({ ...t, type: "rect", x, y, width, height }));
        return;
      }
      if (tool === "circle" && tempElement) {
        const r = Math.sqrt(
          Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2)
        );
        setTempElement((t) => ({ ...t, type: "circle", cx: startPos.x, cy: startPos.y, r }));
        return;
      }
    },
  [isDrawing, tool, currentPath, getMousePos, tempElement, startPos, selectedId, elements, dragOffset, action, onElementsChange]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(
  (e) => {
      const pos = getMousePos(e);

      if (action === "moving") {
        setAction("none");
        setSelectedId((id) => id);
        // push to history
        setHistory((prev) => [...prev.slice(0, historyIndex + 1), elements]);
        setHistoryIndex((prev) => prev + 1);
        setPreMoveSnapshot(null);
        return;
      }

      if (!isDrawing) return;
      setIsDrawing(false);
      setAction("none");

      if (tool === "rectangle") {
        const rect = {
          type: "rect",
          x: Math.min(startPos.x, pos.x),
          y: Math.min(startPos.y, pos.y),
          width: Math.abs(pos.x - startPos.x),
          height: Math.abs(pos.y - startPos.y),
          stroke: color,
          strokeWidth,
          fill: "none",
        };
        addElement(rect);
        setTempElement(null);
      } else if (tool === "circle") {
        const radius = Math.sqrt(
          Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2)
        );
        const circle = {
          type: "circle",
          cx: startPos.x,
          cy: startPos.y,
          r: radius,
          stroke: color,
          strokeWidth,
          fill: "none",
        };
        addElement(circle);
        setTempElement(null);
      }
    },
  [isDrawing, tool, startPos, color, strokeWidth, getMousePos, addElement, action, elements, historyIndex]
  );

  // Text feature removed

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
              opacity={selectedId === el.id ? 0.9 : 1}
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
              style={{ cursor: tool === "select" ? "move" : "inherit" }}
              opacity={selectedId === el.id ? 0.95 : 1}
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
              style={{ cursor: tool === "select" ? "move" : "inherit" }}
              opacity={selectedId === el.id ? 0.95 : 1}
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
              style={{ cursor: tool === "select" ? "move" : "text" }}
            >
              {el.text}
            </text>
          );
        default:
          return null;
      }
    });
  };

  // Text feature removed

  return (
    <div className="relative w-full h-full">
      {/* Floating Toolbar */}
  <div className="absolute top-2 left-2 z-10 bg-gray-800 border border-gray-700 rounded-lg p-2 flex items-center space-x-2 shadow-lg">
        {/* Tools */}
        <div className="flex items-center space-x-1 border-r border-gray-600 pr-2">
          {[
            { name: "select", icon: MousePointer, label: "Select/Move" },
            { name: "pen", icon: Pen, label: "Pen" },
            { name: "rectangle", icon: Square, label: "Rectangle" },
            { name: "circle", icon: Circle, label: "Circle" },
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
        className={`bg-gray-900 ${tool === "select" ? "cursor-default" : "cursor-crosshair"}`}
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

        {/* Selection highlight */}
        {selectedId &&
          (() => {
            const sel = elements.find((el) => el.id === selectedId);
            if (!sel) return null;
            if (sel.type === "rect") {
              return (
                <rect
                  x={sel.x - 2}
                  y={sel.y - 2}
                  width={sel.width + 4}
                  height={sel.height + 4}
                  stroke="#60a5fa"
                  strokeWidth={1}
                  fill="none"
                  strokeDasharray="4 2"
                  pointerEvents="none"
                />
              );
            }
            if (sel.type === "circle") {
              return (
                <circle
                  cx={sel.cx}
                  cy={sel.cy}
                  r={sel.r + 3}
                  stroke="#60a5fa"
                  strokeWidth={1}
                  fill="none"
                  strokeDasharray="4 2"
                  pointerEvents="none"
                />
              );
            }
            if (sel.type === "text") {
              const fontSize = sel.fontSize || 16;
              const width = (sel.text?.length || 0) * fontSize * 0.6;
              const height = fontSize * 1.2;
              return (
                <rect
                  x={sel.x - 2}
                  y={sel.y - height - 2}
                  width={width + 4}
                  height={height + 4}
                  stroke="#60a5fa"
                  strokeWidth={1}
                  fill="none"
                  strokeDasharray="4 2"
                  pointerEvents="none"
                />
              );
            }
            return null;
          })()}

        {/* Temp element preview while drawing */}
        {tempElement && tempElement.type === "rect" && (
          <rect
            x={tempElement.x}
            y={tempElement.y}
            width={tempElement.width}
            height={tempElement.height}
            stroke={tempElement.stroke}
            strokeWidth={tempElement.strokeWidth}
            fill="rgba(59,130,246,0.08)"
            strokeDasharray="4 2"
          />
        )}
        {tempElement && tempElement.type === "circle" && (
          <circle
            cx={tempElement.cx}
            cy={tempElement.cy}
            r={tempElement.r}
            stroke={tempElement.stroke}
            strokeWidth={tempElement.strokeWidth}
            fill="rgba(59,130,246,0.08)"
            strokeDasharray="4 2"
          />
        )}
      </svg>

      {/* Text input overlay */}
  {/* Text feature removed */}
    </div>
  );
};

export default CollaborativeWhiteboard;
