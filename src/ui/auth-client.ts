import { createAuthClient } from "better-auth/react";

/** Browser client for staff sign-in and sign-out; talks to /api/auth on the same origin. */
export const authClient = createAuthClient();
