import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { SERVER_URL } from '../config';

// Store on global so Expo Fast Refresh HMR doesn't reset this to null.
// Module-level vars reset on hot-reload; global persists across HMR cycles.
const SOCKET_KEY = '__pokerSocket__';

function getSocket() {
  if (!global[SOCKET_KEY]) {
    console.log('[socket] creating new socket to', SERVER_URL);
    const s = io(SERVER_URL, { transports: ['websocket'] });
    s.on('connect', () => console.log('[socket] connected, id=', s.id));
    s.on('disconnect', (reason) => console.log('[socket] disconnected:', reason));
    s.on('connect_error', (err) => console.error('[socket] connect_error:', err.message));
    global[SOCKET_KEY] = s;
  }
  return global[SOCKET_KEY];
}

export function useSocket(handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const socket = getSocket();

    const entries = Object.entries(handlersRef.current);
    const bound = entries.map(([event, handler]) => {
      const fn = (...args) => {
        console.log('[socket] received:', event, args);
        handler(...args);
      };
      socket.on(event, fn);
      return [event, fn];
    });

    return () => {
      bound.forEach(([event, fn]) => socket.off(event, fn));
    };
  }, []);

  const emit = useCallback((event, data) => {
    const socket = getSocket();
    console.log('[socket] emit:', event, data, '| connected:', socket.connected);
    socket.emit(event, data);
  }, []);

  return emit;
}
