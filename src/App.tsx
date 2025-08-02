import { Layout } from "@/Layout";
import { SignInForm } from "@/SignInForm";

import { VaultDashboard } from "@/components/VaultDashboard";
import { RepositoryReadme } from "@/components/RepositoryReadme";
import { AddRepository } from "@/components/AddRepository";
import { Authenticated, Unauthenticated } from "convex/react";
import { Routes, Route } from "react-router-dom";

export default function App() {
  return (
    <Layout>
      <>
        <Authenticated>
          <Routes>
            <Route path="/" element={<VaultDashboard />} />
            <Route path="/add" element={<AddRepository />} />
            <Route
              path="/vault/:owner/:repoName"
              element={<RepositoryReadme />}
            />
            <Route
              path="/vault/:owner/:repoName/*"
              element={<RepositoryReadme />}
            />
          </Routes>
        </Authenticated>
        <Unauthenticated>
          <SignInForm />
        </Unauthenticated>
      </>
    </Layout>
  );
}
