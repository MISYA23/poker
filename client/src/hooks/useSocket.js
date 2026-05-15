import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

let socketInstance = null;

function getSocket() {
  if (!socketInstance) {
    console.log('[socket] creating new socket to', window.location.origin);
    socketInstance = io(window.location.origin, { path: '/socket.io' });

    socketInstance.on('connect', () => console.log('[socket] connected, id=', socketInstance.id));
    socketInstance.on('disconnect', (reason) => console.log('[socket] disconnected:', reason));
    socketInstance.on('connect_error', (err) => console.error('[socket] connect_error:', err.message));
  }
  return socketInstance;
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
