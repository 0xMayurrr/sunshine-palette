import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../lib/auth-context";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 text-foreground relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-md text-center space-y-5">
        <div className="inline-flex items-center justify-center size-20 rounded-2xl bg-primary/10 border border-primary/20 shadow-xs mb-2">
          <span className="font-display text-3xl font-black text-primary">404</span>
        </div>

        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Page not found<span className="text-primary">.</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            The page you are looking for doesn't exist, has been moved, or is temporarily unavailable.
          </p>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-display text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 hover:scale-[1.02] transition-all cursor-pointer"
          >
            <span>Return to Calendar</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 text-foreground relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-destructive/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-md text-center space-y-5">
        <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive shadow-xs mb-2">
          <span className="font-display text-2xl font-black">!</span>
        </div>

        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            This page didn't load
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Something unexpected occurred. You can try reloading or return to your calendar workspace.
          </p>
        </div>

        <div className="pt-2 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 font-display text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition-all cursor-pointer"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-5 font-display text-sm font-bold text-foreground shadow-xs hover:bg-accent transition-all"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Buildicy Calendar" },
      { name: "description", content: "A focused calendar for Buildicy meetings." },
      { property: "og:title", content: "Buildicy Calendar" },
      { property: "og:description", content: "A focused calendar for Buildicy meetings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
