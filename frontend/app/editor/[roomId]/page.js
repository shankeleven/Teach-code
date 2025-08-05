'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import Editor from '../../../components/Editor';
import Client from '../../../components/Client';
import hark from 'hark';

export default function EditorPage() {
    const [clients, setClients] = useState([]);
    const [code, setCode] = useState('');
    const [theme, setTheme] = useState('dracula');
    const [language, setLanguage] = useState('javascript');
    const [isMuted, setIsMuted] = useState(true);
    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const selfSocketId = useRef(null);
    const peerConnections = useRef({});
    const audioStreams = useRef({});
    const searchParams = useSearchParams();
    const params = useParams();
    const username = searchParams.get('username');
    const roomId = params.roomId;

    useEffect(() => {
        const init = async () => {
            socketRef.current = new WebSocket(`ws://localhost:5000/ws?roomId=${roomId}&username=${username}`);

            socketRef.current.onopen = () => {
                console.log('Connected to WebSocket');
            };

            socketRef.current.onmessage = async (event) => {
                const { action, payload } = JSON.parse(event.data);

                switch (action) {
                    case 'WELCOME':
                        selfSocketId.current = payload.socketId;
                        break;
                    case 'USER_JOINED':
                        setClients(payload.clients);
                        // For each new user, create a new peer connection
                        payload.clients.forEach(client => {
                            if (client.socketId !== selfSocketId.current && !peerConnections.current[client.socketId]) {
                                setupPeerConnection(client.socketId);
                            }
                        });
                        break;
                    case 'USER_LEFT':
                        console.log(`${payload.username} left`);
                        // Close peer connection and remove audio element
                        if (peerConnections.current[payload.socketId]) {
                            peerConnections.current[payload.socketId].close();
                            delete peerConnections.current[payload.socketId];
                        }
                        if (audioStreams.current[payload.socketId]) {
                            const audioEl = document.getElementById(`audio-${payload.socketId}`);
                            if (audioEl) audioEl.remove();
                            delete audioStreams.current[payload.socketId];
                        }
                        setClients(payload.clients);
                        break;
                    case 'CODE_CHANGE':
                        setCode(payload.code);
                        codeRef.current = payload.code;
                        break;
                    case 'LANGUAGE_CHANGE':
                        setLanguage(payload.language);
                        break;
                    case 'WEBRTC_OFFER':
                        await handleOffer(payload);
                        break;
                    case 'WEBRTC_ANSWER':
                        await handleAnswer(payload);
                        break;
                    case 'WEBRTC_ICE_CANDIDATE':
                        await handleIceCandidate(payload);
                        break;
                    case 'USER_SPEAKING':
                        // Add speaking indicator
                        setClients(prevClients => prevClients.map(c => c.socketId === payload.socketId ? { ...c, speaking: true } : c));
                        break;
                    case 'USER_STOPPED_SPEAKING':
                        // Remove speaking indicator
                        setClients(prevClients => prevClients.map(c => c.socketId === payload.socketId ? { ...c, speaking: false } : c));
                        break;
                }
            };
        };
        init();

        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
            // Clean up peer connections and audio streams
            Object.values(peerConnections.current).forEach(pc => pc.close());
            if (window.localStream) {
                window.localStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [roomId, username]);

    const setupPeerConnection = (targetSocketId) => {
        peerConnections.current[targetSocketId] = new RTCPeerConnection();

        // Add local audio stream to the peer connection
        if (window.localStream) {
            window.localStream.getTracks().forEach(track => {
                peerConnections.current[targetSocketId].addTrack(track, window.localStream);
            });
        }

        // Handle incoming tracks
        peerConnections.current[targetSocketId].ontrack = (event) => {
            const remoteStream = event.streams[0];
            audioStreams.current[targetSocketId] = remoteStream;
            let audioEl = document.getElementById(`audio-${targetSocketId}`);
            if (!audioEl) {
                audioEl = document.createElement('audio');
                audioEl.id = `audio-${targetSocketId}`;
                audioEl.autoplay = true;
                document.body.appendChild(audioEl);
            }
            audioEl.srcObject = remoteStream;
        };

        // Handle ICE candidates
        peerConnections.current[targetSocketId].onicecandidate = (event) => {
            if (event.candidate) {
                socketRef.current.send(JSON.stringify({
                    action: 'WEBRTC_ICE_CANDIDATE',
                    payload: {
                        socketId: targetSocketId,
                        candidate: event.candidate,
                    },
                }));
            }
        };

        // Create and send offer
        peerConnections.current[targetSocketId].createOffer()
            .then(offer => peerConnections.current[targetSocketId].setLocalDescription(offer))
            .then(() => {
                socketRef.current.send(JSON.stringify({
                    action: 'WEBRTC_OFFER',
                    payload: {
                        socketId: targetSocketId,
                        sdp: peerConnections.current[targetSocketId].localDescription,
                    },
                }));
            });
    };

    const handleOffer = async (payload) => {
        const { fromSocketId, sdp } = payload;
        setupPeerConnection(fromSocketId);
        await peerConnections.current[fromSocketId].setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await peerConnections.current[fromSocketId].createAnswer();
        await peerConnections.current[fromSocketId].setLocalDescription(answer);
        socketRef.current.send(JSON.stringify({
            action: 'WEBRTC_ANSWER',
            payload: {
                socketId: fromSocketId,
                sdp: peerConnections.current[fromSocketId].localDescription,
            },
        }));
    };

    const handleAnswer = async (payload) => {
        const { fromSocketId, sdp } = payload;
        await peerConnections.current[fromSocketId].setRemoteDescription(new RTCSessionDescription(sdp));
    };

    const handleIceCandidate = async (payload) => {
        const { fromSocketId, candidate } = payload;
        await peerConnections.current[fromSocketId].addIceCandidate(new RTCIceCandidate(candidate));
    };

    const toggleMute = async () => {
        if (typeof window === 'undefined' || !navigator.mediaDevices) {
            console.error("MediaDevices API not supported.");
            return;
        }

        if (isMuted) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                window.localStream = stream;
                const speechEvents = hark(stream, {});
                speechEvents.on('speaking', () => {
                    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                        socketRef.current.send(JSON.stringify({ action: 'USER_SPEAKING', payload: { socketId: selfSocketId.current } }));
                    }
                });
                speechEvents.on('stopped_speaking', () => {
                    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                        socketRef.current.send(JSON.stringify({ action: 'USER_STOPPED_SPEAKING', payload: { socketId: selfSocketId.current } }));
                    }
                });
                // Add stream to all existing peer connections
                Object.values(peerConnections.current).forEach(pc => {
                    stream.getTracks().forEach(track => pc.addTrack(track, stream));
                });
                setIsMuted(false);
            } catch (err) {
                console.error("Error accessing microphone:", err);
            }
        } else {
            if (window.localStream) {
                window.localStream.getTracks().forEach(track => track.stop());
            }
            setIsMuted(true);
        }
    };

    const onCodeChange = (newCode) => {
        codeRef.current = newCode;
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
                action: 'CODE_CHANGE',
                payload: { code: newCode },
            }));
        }
    };

    const onLanguageChange = (newLanguage) => {
        setLanguage(newLanguage);
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
                action: 'LANGUAGE_CHANGE',
                payload: { language: newLanguage },
            }));
        }
    };

    function copyRoomId() {
        navigator.clipboard.writeText(roomId);
    }

    function leaveRoom() {
        window.location.href = '/';
    }

    return (
        <div className="mainWrap">
            <div className="aside">
                <div className="asideInner">
                    <div className="logo">
                        <img
                            className="logoImage"
                            src="/code-sync.png"
                            alt="logo"
                        />
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
                    <select id="theme-select" value={theme} onChange={(e) => setTheme(e.target.value)}>
                        <option value="dracula">Dracula</option>
                        <option value="github">GitHub</option>
                        <option value="vscode">VS Code</option>
                        <option value="xcode">Xcode</option>
                    </select>
                </div>
                <div className="select-container">
                    <label htmlFor="language-select">Language:</label>
                    <select id="language-select" value={language} onChange={(e) => onLanguageChange(e.target.value)}>
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
                    {isMuted ? 'Mic Off' : 'Mic On'}
                </button>
                <button className="btn copyBtn" onClick={copyRoomId}>
                    Copy ROOM ID
                </button>
                <button className="btn leaveBtn" onClick={leaveRoom}>
                    Leave
                </button>
            </div>
            <div className="editorWrap">
                <Editor
                    socketRef={socketRef}
                    roomId={roomId}
                    onCodeChange={onCodeChange}
                    code={code}
                    theme={theme}
                    language={language}
                />
            </div>
        </div>
    );
}