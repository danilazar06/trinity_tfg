/**
 * Custom hook for managing real-time connection status
 * Provides connection status indicators and automatic reconnection
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { appSyncService } from '../services/appSyncService';
import { networkService } from '../services/networkService';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface ConnectionInfo {
  status: ConnectionStatus;
  isOnline: boolean;
  reconnectionAttempts: number;
  lastConnectedAt?: Date;
  lastDisconnectedAt?: Date;
}

export interface UseConnectionStatusReturn {
  connectionInfo: ConnectionInfo;
  forceReconnect: () => Promise<void>;
  isHealthy: boolean;
}

/**
 * Hook for monitoring real-time connection status
 */
export function useConnectionStatus(): UseConnectionStatusReturn {
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    status: 'disconnected',
    isOnline: networkService.isConnected(),
    reconnectionAttempts: 0,
  });

  // Force reconnection
  const forceReconnect = useCallback(async () => {
    setConnectionInfo(prev => ({
      ...prev,
      status: 'connecting',
      reconnectionAttempts: prev.reconnectionAttempts + 1,
    }));

    // Trigger AppSync reconnection
    appSyncService.forceReconnection();
  }, []);

  // Monitor network connectivity
  useEffect(() => {
    const handleNetworkChange = (networkState: any) => {
      const isConnected = networkState.isConnected && networkState.isInternetReachable !== false;
      console.log(`🌐 Network status changed: ${isConnected ? 'online' : 'offline'}`);

      setConnectionInfo(prev => ({
        ...prev,
        isOnline: isConnected,
      }));

      // If network comes back online and we're disconnected, attempt reconnection
      if (isConnected && connectionInfo.status === 'disconnected') {
        forceReconnect();
      }
    };

    // Subscribe to network changes
    const unsubscribe = networkService.addNetworkListener(handleNetworkChange);

    return unsubscribe;
  }, [connectionInfo.status, forceReconnect]);

  // Monitor AppSync connection status
  useEffect(() => {
    const unsubscribe = appSyncService.subscribeToConnectionStatus((status) => {
      console.log(`📡 AppSync connection status: ${status}`);

      setConnectionInfo(prev => ({
        ...prev,
        status,
        lastConnectedAt: status === 'connected' ? new Date() : prev.lastConnectedAt,
        lastDisconnectedAt: status === 'disconnected' ? new Date() : prev.lastDisconnectedAt,
      }));
    });

    return unsubscribe;
  }, []);

  // Determine if connection is healthy
  return {
    connectionInfo,
    forceReconnect,
    isHealthy: connectionInfo.isOnline && connectionInfo.status === 'connected',
  };
}

/**
 * Hook for managing room-specific real-time subscriptions with automatic reconnection
 */
export function useRoomSubscriptions() {
  // Legacy state kept to avoid compilation errors if used elsewhere, but ideally unused
  const [subscriptions, setSubscriptions] = useState<{
    votes: (() => void) | null;
    matches: (() => void) | null;
    room: (() => void) | null;
  }>({
    votes: null,
    matches: null,
    room: null,
  });

  const subscriptionsRef = useRef<{
    votes: (() => void) | null;
    matches: (() => void) | null;
    room: (() => void) | null;
  }>({
    votes: null,
    matches: null,
    room: null,
  });

  const isSubscribedRef = useRef(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Subscribe to room updates
  const subscribeToRoom = useCallback(async (
    roomId: string,
    callbacks: {
      onVoteUpdate: (data: any) => void;
      onMatchFound: (data: any) => void;
      onRoomUpdate: (data: any) => void;
    }
  ) => {
    if (isSubscribedRef.current) {
      console.log('⚠️ Already subscribed to room updates, skipping...');
      return;
    }

    console.log(`📡 Establishing REAL WebSocket subscriptions for room ${roomId}`);
    isSubscribedRef.current = true;
    setIsSubscribed(true); // Update UI state

    try {
      // 1. Subscribe to Vote Updates
      const voteSub = await appSyncService.subscribeWithReconnection(
        roomId,
        'enhanced-votes',
        callbacks.onVoteUpdate
      );

      // 2. Subscribe to Match Found
      const matchSub = await appSyncService.subscribeWithReconnection(
        roomId,
        'enhanced-matches',
        callbacks.onMatchFound
      );

      // 3. Subscribe to Room State/Updates
      const roomSub = await appSyncService.subscribeWithReconnection(
        roomId,
        'room-state',
        callbacks.onRoomUpdate
      );

      subscriptionsRef.current = {
        votes: voteSub,
        matches: matchSub,
        room: roomSub,
      };

      console.log(`✅ Subscriptions active for room ${roomId}`);
    } catch (error) {
      console.error('❌ Error setting up subscriptions:', error);
      // Revert status on error
      isSubscribedRef.current = false;
      setIsSubscribed(false);
    }
  }, []);

  // Unsubscribe from room updates
  const unsubscribeFromRoom = useCallback((roomId: string) => {
    console.log('🧹 Cleaning up room subscriptions for room:', roomId);

    Object.values(subscriptionsRef.current).forEach(cleanup => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          console.warn('Error cleanup subscription:', e);
        }
      }
    });

    subscriptionsRef.current = {
      votes: null,
      matches: null,
      room: null,
    };

    isSubscribedRef.current = false;
    setIsSubscribed(false);
  }, []);

  // Legacy methods for backward compatibility
  const setupSubscriptions = useCallback(async (
    onVoteUpdate: (data: any) => void,
    onMatchFound: (data: any) => void,
    onRoomUpdate: (data: any) => void
  ) => {
    console.warn('⚠️ setupSubscriptions is deprecated, use subscribeToRoom instead');
  }, []);

  const cleanupSubscriptions = useCallback(() => {
    console.warn('⚠️ cleanupSubscriptions is deprecated, use unsubscribeFromRoom instead');
  }, []);

  return {
    subscribeToRoom,
    unsubscribeFromRoom,
    // Legacy methods for backward compatibility
    setupSubscriptions,
    cleanupSubscriptions,
    isSubscribed,
  };
}