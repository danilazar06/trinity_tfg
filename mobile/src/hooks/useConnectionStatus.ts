/**
 * Custom hook for managing real-time connection status
 * Provides connection status indicators and automatic reconnection
 */

import { useState, useEffect, useCallback } from 'react';
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
    console.log('🔄 Force reconnecting...');
    
    setConnectionInfo(prev => ({
      ...prev,
      status: 'connecting',
      reconnectionAttempts: prev.reconnectionAttempts + 1,
    }));

    try {
      await appSyncService.forceReconnection();
    } catch (error) {
      console.error('❌ Force reconnection failed:', error);
      
      setConnectionInfo(prev => ({
        ...prev,
        status: 'disconnected',
        lastDisconnectedAt: new Date(),
      }));
    }
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
export function useRoomSubscriptions(roomId: string | null) {
  const [subscriptions, setSubscriptions] = useState<{
    votes: (() => void) | null;
    matches: (() => void) | null;
    room: (() => void) | null;
  }>({
    votes: null,
    matches: null,
    room: null,
  });

  const [isSubscribed, setIsSubscribed] = useState(false);

  // Setup subscriptions with automatic reconnection
  const setupSubscriptions = useCallback(async (
    onVoteUpdate: (data: any) => void,
    onMatchFound: (data: any) => void,
    onRoomUpdate: (data: any) => void
  ) => {
    if (!roomId || isSubscribed) return;

    console.log('🔔 Setting up room subscriptions with auto-reconnection for room:', roomId);
    
    try {
      // Setup all subscriptions with reconnection
      const [votesCleanup, matchesCleanup, roomCleanup] = await Promise.all([
        appSyncService.subscribeWithReconnection(roomId, 'votes', onVoteUpdate),
        appSyncService.subscribeWithReconnection(roomId, 'matches', onMatchFound),
        appSyncService.subscribeWithReconnection(roomId, 'room', onRoomUpdate),
      ]);

      setSubscriptions({
        votes: votesCleanup,
        matches: matchesCleanup,
        room: roomCleanup,
      });

      setIsSubscribed(true);
      console.log('✅ All room subscriptions established with auto-reconnection');

    } catch (error) {
      console.error('❌ Failed to setup room subscriptions:', error);
    }
  }, [roomId, isSubscribed]);

  // Cleanup subscriptions
  const cleanupSubscriptions = useCallback(() => {
    console.log('🧹 Cleaning up room subscriptions');
    
    Object.values(subscriptions).forEach(cleanup => {
      if (cleanup) {
        cleanup();
      }
    });

    setSubscriptions({
      votes: null,
      matches: null,
      room: null,
    });

    setIsSubscribed(false);
  }, [subscriptions]);

  // Cleanup on unmount or roomId change
  useEffect(() => {
    return cleanupSubscriptions;
  }, [roomId]);

  return {
    setupSubscriptions,
    cleanupSubscriptions,
    isSubscribed,
  };
}