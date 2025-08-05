'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import Editor from '../../../components/Editor';
import Client from '../../../components/Client';

export default function EditorPage() {
    const [clients, setClients] = useState([]);
    const [code, setCode] = useState('');
    const [theme, setTheme] = useState('dracula');
    const [language, setLanguage] = useState('javascript');
    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const selfSocketId = useRef(null);
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

            socketRef.current.onmessage = (event) => {
                const { action, payload } = JSON.parse(event.data);

                switch (action) {
                    case 'WELCOME':
                        selfSocketId.current = payload.socketId;
                        break;
                    case 'USER_JOINED':
                        setClients(payload.clients);
                        // A new user has joined, if it's not me, I'll send them my code
                        if (payload.socketId !== selfSocketId.current) {
                            console.log(`${payload.username} joined`);
                            // Send code to the new user
                            socketRef.current.send(JSON.stringify({
                                action: 'SYNC_CODE',
                                payload: {
                                    code: codeRef.current,
                                    socketId: payload.socketId,
                                },
                            }));
                        }
                        break;
                    case 'USER_LEFT':
                        console.log(`${payload.username} left`);
                        setClients(payload.clients);
                        break;
                    case 'CODE_CHANGE':
                        // Update our local state and ref
                        setCode(payload.code);
                        codeRef.current = payload.code;
                        break;
                    case 'LANGUAGE_CHANGE':
                        setLanguage(payload.language);
                        break;
                }
            };
        };
        init();

        // Cleanup on component unmount
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
        // This effect should only run once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onCodeChange = (newCode) => {
        // Update our own editor state immediately
        setCode(newCode);
        // Keep the ref updated
        codeRef.current = newCode;
        // Send the change to the server
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