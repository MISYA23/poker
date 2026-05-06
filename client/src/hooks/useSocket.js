import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

let socketInstance = null;

function getSocket() {
  if (!socketInstance) {
    socketInstance = io(window.location.origin, { path: '/socket.io' });
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
      const fn = (...args) => handler(...args);
      socket.on(event, fn);
      return [event, fn];
    });

    return () => {
      bound.forEach(([event, fn]) => socket.off(event, fn));
    };
  }, []);

  const emit = useCallback((event, data) => {
    getSocket().emit(event, data);
  }, []);

  return emit;
}
