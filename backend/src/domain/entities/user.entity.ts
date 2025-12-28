export interface User {
  id: string; // Cognito Sub (UUID)
  email: string;
  username: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Campos adicionales de Cognito
  cognitoUsername?: string;
  phoneNumber?: string;
  phoneNumberVerified?: boolean;
  displayName?: string; // Nombre completo del usuario
  avatarUrl?: string;
  // Campos de Google Auth
  googleId?: string;
  isGoogleLinked?: boolean;
  authProviders?: string[];
  lastGoogleSync?: Date;
}

export interface CreateUserDto {
  email: string;
  username: string;
  password: string;
  phoneNumber?: string;
  displayName?: string;
}

export interface LoginUserDto {
  email: string;
  password: string;
}

export interface ConfirmSignUpDto {
  email: string;
  confirmationCode: string;
}

export interface ResendConfirmationDto {
  email: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  email: string;
  confirmationCode: string;
  newPassword: string;
}

export interface UserProfile {
  id: string;
  sub: string; // Alias for id - compatibility with JWT/Cognito
  email: string;
  username: string;
  emailVerified: boolean;
  createdAt: Date;
  phoneNumber?: string;
  displayName?: string;
  avatarUrl?: string;
  // Campos de Google Auth
  googleId?: string;
  isGoogleLinked?: boolean;
  authProviders?: string[];
}

export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}
