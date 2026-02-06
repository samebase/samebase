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
