import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getAWSConfig } from '../config/aws-config';
import { appSyncService } from './appSyncService';

// Detectar si estamos en desarrollo o producción
const getApiUrl = () => {
  // Use AppSync GraphQL for all operations
  // Fallback REST API only for legacy compatibility
  const PROD_API_URL = 'https://api.trinity.app/api'; // URL de producción (fallback)
  
  // In development, prefer AppSync over local REST API
  return PROD_API_URL;
};

const API_BASE_URL = getApiUrl();

// AWS Configuration
const AWS_CONFIG = getAWSConfig();

interface RequestConfig {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

// Callback para manejar logout automático en caso de 401
let onUnauthorizedCallback: (() => void) | null = null;

export const setOnUnauthorizedCallback = (callback: () => void) => {
  onUnauthorizedCallback = callback;
};

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Try to get Cognito tokens first (new format)
    try {
      const storedTokens = await AsyncStorage.getItem('cognitoTokens');
      if (storedTokens) {
        const tokens = JSON.parse(storedTokens);
        if (tokens.accessToken) {
          headers.Authorization = `Bearer ${tokens.accessToken}`;
          return headers;
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not load Cognito tokens:', error);
    }
    
    // Fallback to legacy authToken format
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn('⚠️ Could not load auth token:', error);
    }
    
    return headers;
  }

  private async request<T>(endpoint: string, config: RequestConfig): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        // Si es 401 y no es un endpoint de auth, hacer logout automático
        if (response.status === 401 && !endpoint.startsWith('/auth/')) {
          if (onUnauthorizedCallback) {
            onUnauthorizedCallback();
          }
        }
        throw { response: { data, status: response.status } };
      }
      
      return data;
    } catch (error) {
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, {
      method: 'POST',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, {
      method: 'PUT',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, { method: 'DELETE', headers });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

// AWS AppSync Integration
export const useAppSync = () => {
  console.log('🔗 Using AWS AppSync for GraphQL operations');
  console.log('📍 Region:', AWS_CONFIG.region);
  console.log('🔗 GraphQL Endpoint:', AWS_CONFIG.graphqlEndpoint);
  
  // Defensive check: ensure appSyncService exists
  if (!appSyncService) {
    console.error('❌ AppSync service is not initialized');
    
    // Return dummy functions that throw meaningful errors
    const createUnavailableFunction = (operationName: string) => {
      return () => {
        throw new Error(`AppSync service is not available. Cannot perform ${operationName}. Please check your authentication status.`);
      };
    };
    
    return {
      // Room operations - dummy functions
      createRoom: createUnavailableFunction('createRoom'),
      createRoomDebug: createUnavailableFunction('createRoomDebug'),
      createRoomSimple: createUnavailableFunction('createRoomSimple'),
      joinRoom: createUnavailableFunction('joinRoom'),
      getRoom: createUnavailableFunction('getRoom'),
      getUserRooms: createUnavailableFunction('getUserRooms'),
      
      // Voting operations - dummy functions
      vote: createUnavailableFunction('vote'),
      
      // Movie operations - dummy functions
      getMovies: createUnavailableFunction('getMovies'),
      getMovieDetails: createUnavailableFunction('getMovieDetails'),
      
      // AI operations - dummy functions
      getAIRecommendations: createUnavailableFunction('getAIRecommendations'),
      
      // Real-time subscriptions - dummy functions
      subscribeToVoteUpdates: createUnavailableFunction('subscribeToVoteUpdates'),
      subscribeToMatchFound: createUnavailableFunction('subscribeToMatchFound'),
      
      // Health check - dummy function
      healthCheck: createUnavailableFunction('healthCheck'),
    };
  }
  
  // Defensive binding: check each method exists before binding
  const safeBindMethod = (methodName: string) => {
    if (appSyncService && typeof appSyncService[methodName] === 'function') {
      return appSyncService[methodName].bind(appSyncService);
    } else {
      console.warn(`⚠️ AppSync method ${methodName} is not available`);
      return () => {
        throw new Error(`AppSync method ${methodName} is not available. Service may not be fully initialized.`);
      };
    }
  };
  
  return {
    // Room operations via AppSync
    createRoom: safeBindMethod('createRoom'),
    createRoomDebug: safeBindMethod('createRoomDebug'),
    createRoomSimple: safeBindMethod('createRoomSimple'),
    joinRoom: safeBindMethod('joinRoom'),
    getRoom: safeBindMethod('getRoom'),
    getUserRooms: safeBindMethod('getUserRooms'),
    
    // Voting operations via AppSync
    vote: safeBindMethod('vote'),
    
    // Movie operations via AppSync
    getMovies: safeBindMethod('getMovies'),
    getMovieDetails: safeBindMethod('getMovieDetails'),
    
    // AI operations via AppSync
    getAIRecommendations: safeBindMethod('getAIRecommendations'),
    
    // Real-time subscriptions
    subscribeToVoteUpdates: safeBindMethod('subscribeToVoteUpdates'),
    subscribeToMatchFound: safeBindMethod('subscribeToMatchFound'),
    
    // Health check
    healthCheck: safeBindMethod('healthCheck'),
  };
};
