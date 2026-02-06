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
    if (isAuthenticated && window.opener) {
      // Send auth tokens to the parent window before closing.
      // Iframes may have partitioned localStorage so they can't
      // read tokens stored by a top-level popup directly.
      const authTokens: Record<string, string> = {};
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("__convexAuth")) {
          authTokens[key] = localStorage.getItem(key) ?? "";
        }
      }
      window.opener.postMessage(
        { type: "convex-auth-tokens", tokens: authTokens },
        "*",
      );
      window.close();
    }
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
