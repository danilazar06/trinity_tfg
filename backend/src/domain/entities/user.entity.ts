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
}

export interface CreateUserDto {
  email: string;
  username: string;
  password: string;
  phoneNumber?: string;
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
  email: string;
  username: string;
  emailVerified: boolean;
  createdAt: Date;
  phoneNumber?: string;
}

export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}