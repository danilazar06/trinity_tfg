export interface GoogleUser {
  id: string;
  name: string | null;
  email: string;
  photo: string | null;
  familyName: string | null;
  givenName: string | null;
}

export interface AuthResult {
  success: boolean;
  user?: GoogleUser;
  error?: string;
  errorCode?: string;
  idToken?: string;
  accessToken?: string;
}

export interface AuthenticationStrategy {
  name: string;
  isAvailable(): Promise<boolean>;
  signIn(): Promise<AuthResult>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<GoogleUser | null>;
  configure?(): Promise<void>;
}

export interface GoogleSignInConfig {
  webClientId: string;
  iosClientId?: string;
  androidClientId?: string;
  scopes: string[];
  offlineAccess: boolean;
  hostedDomain?: string;
  forceCodeForRefreshToken?: boolean;
}

export interface SignInOptions {
  loginHint?: string;
  prompt?: 'none' | 'consent' | 'select_account';
}

export enum GoogleSignInError {
  SIGN_IN_CANCELLED = 'SIGN_IN_CANCELLED',
  SIGN_IN_REQUIRED = 'SIGN_IN_REQUIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PLAY_SERVICES_NOT_AVAILABLE = 'PLAY_SERVICES_NOT_AVAILABLE',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface GoogleSignInCapabilities {
  nativeSignInAvailable: boolean;
  webSignInAvailable: boolean;
  playServicesAvailable: boolean;
  configurationValid: boolean;
  environment: 'expo-go' | 'development-build' | 'production' | 'web';
}