import type { Express, RequestHandler } from "express";

export interface SessionUser {
  claims: {
    sub: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    profile_image_url?: string;
    exp?: number;
  };
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

export interface AuthProvider {
  setup(app: Express): Promise<void>;
  registerRoutes(app: Express): void;
  isAuthenticated: RequestHandler;
}
