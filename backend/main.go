package main

import (
    "log"
    "net/http"
    "sync"

    "github.com/google/uuid"
    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
    CheckOrigin: func(r *http.Request) bool {
        return true
    },
}

type Client struct {
    SocketId string `json:"socketId"`
    Username string `json:"username"`
}

var (
    rooms      = make(map[string]map[*websocket.Conn]Client)
    roomsMutex = sync.RWMutex{}
)

func handleConnections(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Println(err)
        return
    }
    defer conn.Close()

    q := r.URL.Query()
    roomId := q.Get("roomId")
    username := q.Get("username")
    socketId := uuid.New().String()

    // --- Write to map (Locked) ---
    roomsMutex.Lock()
    if rooms[roomId] == nil {
        rooms[roomId] = make(map[*websocket.Conn]Client)
    }
    rooms[roomId][conn] = Client{SocketId: socketId, Username: username}

    // Get copies of data needed for broadcast
    var connectionsToNotify []*websocket.Conn
    var currentClients []Client
    for c, client := range rooms[roomId] {
        connectionsToNotify = append(connectionsToNotify, c)
        currentClients = append(currentClients, client)
    }
    roomsMutex.Unlock()
    // --- End of Locked section ---

    // Welcome message to the new client (No lock needed)
    conn.WriteJSON(map[string]interface{}{
        "action": "WELCOME",
        "payload": map[string]interface{}{"socketId": socketId},
    })

    // Broadcast new user joined (No lock needed)
    joinPayload := map[string]interface{}{
        "clients":  currentClients,
        "username": username,
        "socketId": socketId,
    }
    for _, c := range connectionsToNotify {
        c.WriteJSON(map[string]interface{}{"action": "USER_JOINED", "payload": joinPayload})
    }

    log.Printf("Client %s (%s) connected to room %s", username, socketId, roomId)

    for {
        var msg map[string]interface{}
        err := conn.ReadJSON(&msg)
        if err != nil {
            // --- Write to map (Locked) ---
            roomsMutex.Lock()
            clientThatLeft := rooms[roomId][conn]
            delete(rooms[roomId], conn)

            // Get copies of data needed for broadcast
            var connsToNotifyLeave []*websocket.Conn
            var updatedClients []Client
            for c, client := range rooms[roomId] {
                connsToNotifyLeave = append(connsToNotifyLeave, c)
                updatedClients = append(updatedClients, client)
            }
            roomsMutex.Unlock()
            // --- End of Locked section ---

            // Broadcast user left (No lock needed)
            leavePayload := map[string]interface{}{
                "clients":  updatedClients,
                "username": clientThatLeft.Username,
                "socketId": clientThatLeft.SocketId,
            }
            for _, c := range connsToNotifyLeave {
                c.WriteJSON(map[string]interface{}{"action": "USER_LEFT", "payload": leavePayload})
            }

            log.Printf("Client %s (%s) disconnected from room %s", clientThatLeft.Username, clientThatLeft.SocketId, roomId)
            break
        }

        action, _ := msg["action"].(string)
        payload, _ := msg["payload"].(map[string]interface{})

        log.Printf("Received action '%s' in room %s", action, roomId)

        // --- Get sender info (Read Locked) ---
        roomsMutex.RLock()
        senderClient := rooms[roomId][conn]
        roomsMutex.RUnlock()
        // --- End of Locked section ---

        switch action {
        case "WEBRTC_OFFER", "WEBRTC_ANSWER", "WEBRTC_ICE_CANDIDATE":
            targetSocketId, _ := payload["socketId"].(string)
            
            // --- Find target connection (Read Locked) ---
            roomsMutex.RLock()
            var targetConn *websocket.Conn
            for c, client := range rooms[roomId] {
                if client.SocketId == targetSocketId {
                    targetConn = c
                    break
                }
            }
            roomsMutex.RUnlock()
            // --- End of Locked section ---

            // Relay the message to the target client (No lock needed)
            if targetConn != nil {
                payload["fromSocketId"] = senderClient.SocketId
                targetConn.WriteJSON(map[string]interface{}{
                    "action":  action,
                    "payload": payload,
                })
            }

        case "USER_SPEAKING", "USER_STOPPED_SPEAKING":
            // --- Get connections to notify (Read Locked) ---
            roomsMutex.RLock()
            var connsToNotifyMsg []*websocket.Conn
            for c := range rooms[roomId] {
                connsToNotifyMsg = append(connsToNotifyMsg, c)
            }
            roomsMutex.RUnlock()
            // --- End of Locked section ---

            // Broadcast message (No lock needed)
            log.Printf("Broadcasting action '%s' to %d clients in room %s", action, len(connsToNotifyMsg), roomId)
            for _, c := range connsToNotifyMsg {
                c.WriteJSON(map[string]interface{}{"action": action, "payload": payload})
            }

        default:
            // --- Get connections to notify (Read Locked) ---
            roomsMutex.RLock()
            var connsToNotifyMsg []*websocket.Conn
            for c := range rooms[roomId] {
                connsToNotifyMsg = append(connsToNotifyMsg, c)
            }
            roomsMutex.RUnlock()
            // --- End of Locked section ---

            // Broadcast message (No lock needed)
            log.Printf("Broadcasting action '%s' to %d clients in room %s", action, len(connsToNotifyMsg), roomId)
            for _, c := range connsToNotifyMsg {
                c.WriteJSON(map[string]interface{}{"action": action, "payload": payload})
            }
        }
    }
}

func main() {
    http.HandleFunc("/ws", handleConnections)

    log.Println("http server started on :5000")
    err := http.ListenAndServe(":5000", nil)
    if err != nil {
        log.Fatal("ListenAndServe: ", err)
    }
}