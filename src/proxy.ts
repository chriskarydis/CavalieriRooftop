import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Public, localised pages only: not the API, the management app, Next internals or files.
  matcher: "/((?!api|manage|_next|_vercel|.*\..*).*)",
};
