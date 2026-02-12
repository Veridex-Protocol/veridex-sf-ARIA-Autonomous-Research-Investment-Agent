import { useEffect, useState, useRef } from 'react';

export type AgentEvent = {
    type: string;
    data: any;
    timestamp: number;
};

export function useAgentEvents(url: string = 'ws://localhost:4000/ws') {
    const [events, setEvents] = useState<AgentEvent[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        const connect = () => {
            try {
                const ws = new WebSocket(url);
                wsRef.current = ws;

                ws.onopen = () => {
                    console.log('Connected to agent events stream');
                    setIsConnected(true);
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        const newEvent = {
                            type: data.type || 'unknown',
                            data: data.data || data,
                            timestamp: Date.now(),
                        };

                        setEvents((prev) => [newEvent, ...prev].slice(0, 50)); // Keep last 50 events
                    } catch (err) {
                        console.error('Failed to parse websocket message:', err);
                    }
                };

                ws.onclose = () => {
                    console.log('Disconnected from agent events stream');
                    setIsConnected(false);
                    // Reconnect after 3s
                    setTimeout(connect, 3000);
                };

                ws.onerror = (err) => {
                    console.error('WebSocket error:', err);
                    ws.close();
                };
            } catch (err) {
                console.error('WebSocket connection failed:', err);
            }
        };

        connect();

        return () => {
            wsRef.current?.close();
        };
    }, [url]);

    return { events, isConnected };
}
