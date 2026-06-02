import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { SERVER_URL } from '../config';

let socketInstance = null;

function getSocket() {
  if (!socketInstance) {
    socketInstance = io(SERVER_URL, {
      path: '/socket.io',
      transports: ['websocket'],
    });
    socketInstance.on('connect', () => console.log('[socket] connected:', socketInstance.id));
    socketInstance.on('disconnect', (r) => console.log('[socket] disconnected:', r));
    socketInstance.on('connect_error', (e) => console.error('[socket] connect_error:', e.message));
  }
  return socketInstance;
}

export function useSocket(handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const socket = getSocket();
    const bound = Object.entries(handlersRef.current).map(([event, handler]) => {
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

  return useCallback((event, data) => {
    const socket = getSocket();
    console.log('[socket] emit:', event, data);
    socket.emit(event, data);
  }, []);
}
