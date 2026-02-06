import { Layout } from "@/Layout";
import { SignInForm, useAutoSignIn } from "@/SignInForm";

import { VaultDashboard } from "@/components/VaultDashboard";
import { FileView } from "@/components/FileView";
import { AddRepository } from "@/components/AddRepository";
import { Authenticated, Unauthenticated, useConvexAuth } from "convex/react";
import { Routes, Route } from "react-router-dom";
import { useEffect } from "react";

function useCloseOAuthPopup() {
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (!isAuthenticated || !window.opener) return;

    const authKeys = Object.keys(localStorage).filter((k) =>
      k.startsWith("__convexAuth"),
    );
    const authTokens: Record<string, string> = {};
    for (const key of authKeys) {
      authTokens[key] = localStorage.getItem(key) ?? "";
    }

    // Log what we're sending for debugging
    console.log("[oauth-popup] authenticated, sending tokens", {
      keyCount: authKeys.length,
      keys: authKeys,
    });

    // Try writing directly to the parent's localStorage.
    try {
      const parentLS = window.opener.localStorage;
      for (const [key, value] of Object.entries(authTokens)) {
        parentLS.setItem(key, value);
      }
      console.log("[oauth-popup] wrote to parent localStorage");
      window.opener.location.reload();
      console.log("[oauth-popup] triggered parent reload");
    } catch (e) {
      console.log("[oauth-popup] direct access failed, using postMessage", e);
      window.opener.postMessage(
        { type: "convex-auth-tokens", tokens: authTokens },
        "*",
      );
    }

    // Don't auto-close yet — keep popup open so user can see debug info
    document.title = `Auth done! ${authKeys.length} keys. Will close in 3s...`;
    setTimeout(() => window.close(), 3000);
  }, [isAuthenticated]);
}

export default function App() {
  useCloseOAuthPopup();
  useAutoSignIn();

  return (
    <Layout>
      <>
        <Authenticated>
          <Routes>
            <Route path="/" element={<VaultDashboard />} />
            <Route path="/add" element={<AddRepository />} />
            <Route path="/vault/:owner/:repoName" element={<FileView />} />
            <Route path="/vault/:owner/:repoName/*" element={<FileView />} />

            {/* test route */}
            <Route path="/test" element={<div>Test</div>} />
          </Routes>
        </Authenticated>
        <Unauthenticated>
          <SignInForm />
        </Unauthenticated>
      </>
    </Layout>
  );
}
