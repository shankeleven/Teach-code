"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams, useParams } from "next/navigation";
import Editor from "../../../components/Editor";
import Client from "../../../components/Client";
import CollaborativeWhiteboard from "../../../components/Whiteboard.jsx";
import hark from "hark";

export default function EditorPage() {
  const [clients, setClients] = useState([]);
  const [code, setCode] = useState("");
  const [theme, setTheme] = useState("dracula");
  const [language, setLanguage] = useState("javascript");
  const [view, setView] = useState("editor");
  const [isMuted, setIsMuted] = useState(true);

  const socketRef = useRef(null);
  const codeRef = useRef(null);
  const selfSocketId = useRef(null);
  const peerConnections = useRef({});
  const audioStreams = useRef({});

  const searchParams = useSearchParams();
  const params = useParams();
  const username = searchParams.get("username");
  const roomId = params.roomId;

  // --- WebRTC Functions ---
  const createPeerConnection = (targetSocketId, isCaller) => {
    const pc = new RTCPeerConnection();

    if (window.localStream) {
      window.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, window.localStream);
      });
    }

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      audioStreams.current[targetSocketId] = remoteStream;
      let audioEl = document.getElementById(`audio-${targetSocketId}`);
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.id = `audio-${targetSocketId}`;
        audioEl.autoplay = true;
        document.body.appendChild(audioEl);
      }
      audioEl.srcObject = remoteStream;
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.send(
          JSON.stringify({
            action: "WEBRTC_ICE_CANDIDATE",
            payload: { socketId: targetSocketId, candidate: event.candidate },
          })
        );
      }
    };

    if (isCaller) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socketRef.current.send(
            JSON.stringify({
              action: "WEBRTC_OFFER",
              payload: { socketId: targetSocketId, sdp: pc.localDescription },
            })
          );
        });
    }

    peerConnections.current[targetSocketId] = pc;
    return pc;
  };

  const handleOffer = async (payload) => {
    const { fromSocketId, sdp } = payload;
    const pc = createPeerConnection(fromSocketId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current.send(
      JSON.stringify({
        action: "WEBRTC_ANSWER",
        payload: { socketId: fromSocketId, sdp: pc.localDescription },
      })
    );
  };

  const handleAnswer = async (payload) => {
    const { fromSocketId, sdp } = payload;
    await peerConnections.current[fromSocketId].setRemoteDescription(
      new RTCSessionDescription(sdp)
    );
  };

  const handleIceCandidate = async (payload) => {
    const { fromSocketId, candidate } = payload;
    await peerConnections.current[fromSocketId].addIceCandidate(
      new RTCIceCandidate(candidate)
    );
  };

  // --- WebSocket Connection ---
  useEffect(() => {
    // Guard against connecting without necessary info
    if (!roomId || !username) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    // Use localhost in development, same host in production
    const wsHost =
      process.env.NODE_ENV === "development"
        ? "localhost:5000"
        : window.location.host;
    const wsUrl = `${protocol}://${wsHost}/ws?roomId=${roomId}&username=${username}`;

    socketRef.current = new WebSocket(wsUrl);

    socketRef.current.onopen = () => {
      console.log("SUCCESS: WebSocket connection established.");
    };

    socketRef.current.onerror = (error) => {
      console.error("ERROR: WebSocket connection failed:", error);
    };

    socketRef.current.onclose = () => {
      console.log("INFO: WebSocket connection closed.");
    };

    socketRef.current.onmessage = (event) => {
      const { action, payload } = JSON.parse(event.data);
      console.log(`RECEIVED: action '${action}'`, payload);

      switch (action) {
        case "WELCOME":
          selfSocketId.current = payload.socketId;
          break;
        case "USER_JOINED":
          setClients(payload.clients);
          if (payload.socketId === selfSocketId.current) {
            payload.clients.forEach((client) => {
              if (client.socketId !== selfSocketId.current) {
                createPeerConnection(client.socketId, true);
              }
            });
          }
          break;
        case "USER_LEFT":
          if (peerConnections.current[payload.socketId]) {
            peerConnections.current[payload.socketId].close();
            delete peerConnections.current[payload.socketId];
          }
          if (audioStreams.current[payload.socketId]) {
            const audioEl = document.getElementById(
              `audio-${payload.socketId}`
            );
            if (audioEl) audioEl.remove();
            delete audioStreams.current[payload.socketId];
          }
          setClients(payload.clients);
          break;
        case "CODE_CHANGE":
          // Only update if it's different from current code to prevent loops
          if (payload.code !== codeRef.current) {
            codeRef.current = payload.code;
            setCode(payload.code);
          }
          break;
        case "LANGUAGE_CHANGE":
          setLanguage(payload.language);
          break;
        case "WEBRTC_OFFER":
          handleOffer(payload);
          break;
        case "WEBRTC_ANSWER":
          handleAnswer(payload);
          break;
        case "WEBRTC_ICE_CANDIDATE":
          handleIceCandidate(payload);
          break;
        case "USER_SPEAKING":
          setClients((prev) =>
            prev.map((c) =>
              c.socketId === payload.socketId ? { ...c, speaking: true } : c
            )
          );
          break;
        case "USER_STOPPED_SPEAKING":
          setClients((prev) =>
            prev.map((c) =>
              c.socketId === payload.socketId ? { ...c, speaking: false } : c
            )
          );
          break;
        // Whiteboard events are handled inside the component itself
      }
    };

    // Cleanup on component unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      if (window.localStream) {
        window.localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [roomId, username]);

  // --- Action Handlers ---
  const debounceTimeoutRef = useRef(null);

  const onCodeChange = (newCode) => {
    // Update local state immediately for responsive UI
    setCode(newCode);
    codeRef.current = newCode;

    // Debounce WebSocket sending to avoid spam
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      if (
        socketRef.current &&
        socketRef.current.readyState === WebSocket.OPEN
      ) {
        console.log(`SENDING: action 'CODE_CHANGE'`);
        socketRef.current.send(
          JSON.stringify({
            action: "CODE_CHANGE",
            payload: { code: newCode },
          })
        );
      }
    }, 300); // 300ms debounce
  };

  const onLanguageChange = (newLanguage) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      console.log(`SENDING: action 'LANGUAGE_CHANGE'`);
      socketRef.current.send(
        JSON.stringify({
          action: "LANGUAGE_CHANGE",
          payload: { language: newLanguage },
        })
      );
    }
  };

  const toggleMute = async () => {
    if (isMuted) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        window.localStream = stream;
        const speechEvents = hark(stream, {});
        speechEvents.on("speaking", () => {
          if (
            socketRef.current &&
            socketRef.current.readyState === WebSocket.OPEN
          ) {
            socketRef.current.send(
              JSON.stringify({
                action: "USER_SPEAKING",
                payload: { socketId: selfSocketId.current },
              })
            );
          }
        });
        speechEvents.on("stopped_speaking", () => {
          if (
            socketRef.current &&
            socketRef.current.readyState === WebSocket.OPEN
          ) {
            socketRef.current.send(
              JSON.stringify({
                action: "USER_STOPPED_SPEAKING",
                payload: { socketId: selfSocketId.current },
              })
            );
          }
        });
        Object.values(peerConnections.current).forEach((pc) => {
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        });
        setIsMuted(false);
      } catch (err) {
        console.error("Error accessing microphone:", err);
      }
    } else {
      if (window.localStream) {
        window.localStream.getTracks().forEach((track) => track.stop());
      }
      setIsMuted(true);
    }
  };

  function copyRoomId() {
    navigator.clipboard.writeText(roomId);
  }

  function leaveRoom() {
    window.location.href = "/";
  }

  // --- Render ---
  if (!roomId || !username) {
    return <div>Loading or invalid room...</div>;
  }

  return (
    <div className="mainWrap">
      <div className="aside">
        <div className="asideInner">
          <div className="logo">
            <img className="logoImage" src="/code-sync.png" alt="logo" />
          </div>
          <h3>Connected</h3>
          <div className="clientsList">
            {clients.map((client) => (
              <Client
                key={client.socketId}
                username={client.username}
                speaking={client.speaking}
              />
            ))}
          </div>
        </div>
        <div className="select-container">
          <label htmlFor="theme-select">Theme:</label>
          <select
            id="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="dracula">Dracula</option>
            <option value="github">GitHub</option>
            <option value="vscode">VS Code</option>
            <option value="xcode">Xcode</option>
          </select>
        </div>
        <div className="select-container">
          <label htmlFor="language-select">Language:</label>
          <select
            id="language-select"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="go">Go</option>
            <option value="cpp">C++</option>
            <option value="java">Java</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
          </select>
        </div>
        <button className="btn micBtn" onClick={toggleMute}>
          {isMuted ? "Mic Off" : "Mic On"}
        </button>
        <button className="btn copyBtn" onClick={copyRoomId}>
          Copy ROOM ID
        </button>
        <button className="btn leaveBtn" onClick={leaveRoom}>
          Leave
        </button>
      </div>
      <div className="editorWrap">
        <div className="toggle-buttons">
          <button onClick={() => setView("editor")}>Editor</button>
          <button onClick={() => setView("whiteboard")}>Whiteboard</button>
        </div>
        {view === "editor" ? (
          <Editor
            socketRef={socketRef}
            roomId={roomId}
            onCodeChange={onCodeChange}
            code={code}
            theme={theme}
            language={language}
          />
        ) : (
          <CollaborativeWhiteboard socketRef={socketRef} roomId={roomId} />
        )}
      </div>
    </div>
  );
}
