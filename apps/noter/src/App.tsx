import { Layout } from "@/Layout";
import { SignInForm } from "@/SignInForm";

import { VaultDashboard } from "@/components/VaultDashboard";
import { FileView } from "@/components/FileView";
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
