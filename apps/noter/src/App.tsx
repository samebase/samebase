import { Layout } from "@/Layout";
import { SignInForm, useAutoSignIn, setAuthFlag, clearAuthFlag } from "@/SignInForm";

import { VaultDashboard } from "@/components/VaultDashboard";
import { FileView } from "@/components/FileView";
import { AddRepository } from "@/components/AddRepository";
import { ChatFab } from "@/components/ChatFab";
import { CodespaceChatOnlyView } from "@/components/CodespaceChatOnlyView";
import { NetlifyOAuthCallback } from "@/components/NetlifyOAuthCallback";
import { Button } from "@/components/ui/button";
import {
  Authenticated,
  Unauthenticated,
  useConvexAuth,
  useQuery,
} from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import { Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";

function isChatOnlyCodespaceRoute(pathname: string): boolean {
  return /^\/vault\/[^/]+\/[^/]+\/[^/]+\/chat\/?$/.test(pathname);
}

function useCloseOAuthPopup(pathname: string) {
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (!isAuthenticated) return;
    if (pathname.startsWith("/oauth/netlify")) return;

    // Remember that this user has authenticated, so we can auto-login next time
    if (!window.opener) {
      setAuthFlag();
    }

    if (!window.opener) return;

    const authKeys = Object.keys(localStorage).filter((k) =>
      k.startsWith("__convexAuth"),
    );
    const authTokens: Record<string, string> = {};
    for (const key of authKeys) {
      authTokens[key] = localStorage.getItem(key) ?? "";
    }

    // Try writing directly to the parent's localStorage.
    try {
      const parentLS = window.opener.localStorage;
      for (const [key, value] of Object.entries(authTokens)) {
        parentLS.setItem(key, value);
      }
      window.opener.location.reload();
    } catch {
      // Cross-origin or security restriction — fall back to postMessage
      window.opener.postMessage(
        { type: "convex-auth-tokens", tokens: authTokens },
        "*",
      );
    }

    window.close();
  }, [isAuthenticated, pathname]);
}

function ApprovalGate({ children }: { children: React.ReactNode }) {
  const isApproved = useQuery(api.users.isCurrentUserApproved);
  const { signOut } = useAuthActions();

  // Still loading auth state — render nothing to avoid flicker
  if (isApproved === undefined) return null;

  if (!isApproved) {
    return (
      <div className="container my-auto">
        <div className="max-w-[384px] mx-auto flex flex-col items-center gap-4 py-16 text-center">
          <h2 className="font-semibold text-xl tracking-tight">
            You're on the waitlist
          </h2>
          <p className="text-muted-foreground text-sm">
            We'll let you know when your spot opens up.
          </p>
          <Button variant="outline" onClick={() => { clearAuthFlag(); void signOut(); }}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  useAutoSignIn();
  const location = useLocation();
  useCloseOAuthPopup(location.pathname);
  const showChatFab = !isChatOnlyCodespaceRoute(location.pathname);

  return (
    <Layout>
      <>
        <Authenticated>
          <ApprovalGate>
            <Routes>
              <Route path="/" element={<VaultDashboard />} />
              <Route path="/add" element={<AddRepository />} />
              <Route path="/oauth/netlify/callback" element={<NetlifyOAuthCallback />} />
              <Route
                path="/vault/:owner/:repoName/:branch/chat"
                element={<CodespaceChatOnlyView />}
              />
              <Route path="/vault/:owner/:repoName" element={<FileView />} />
              <Route path="/vault/:owner/:repoName/*" element={<FileView />} />

              {/* test route */}
              <Route path="/test" element={<div>Test</div>} />
            </Routes>
            {showChatFab && <ChatFab />}
          </ApprovalGate>
        </Authenticated>
        <Unauthenticated>
          <SignInForm />
        </Unauthenticated>
      </>
    </Layout>
  );
}
