import { Layout } from "@/Layout";
import { SignInForm } from "@/SignInForm";

import { GitHubRepositories } from "@/components/GitHubRepositories";
import { RepositoryReadme } from "@/components/RepositoryReadme";
import { Button } from "@/components/ui/button";
import { Authenticated, Unauthenticated } from "convex/react";
import { Routes, Route } from "react-router-dom";

import { useState } from "react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"repositories">("repositories");

  return (
    <Layout>
      <>
        <Authenticated>
          <Routes>
            <Route
              path="/"
              element={
                <div className="flex h-full flex-col">
                  {/* Tab Navigation */}
                  <div className="border-b">
                    <div className="container flex gap-2 px-4 py-2">
                      <Button
                        variant={
                          activeTab === "repositories" ? "default" : "ghost"
                        }
                        size="sm"
                        onClick={() => setActiveTab("repositories")}
                      >
                        Repositories
                      </Button>
                    </div>
                  </div>

                  {/* Tab Content */}
                  <div className="flex-1 overflow-hidden">
                    <div className="h-full overflow-y-auto">
                      <GitHubRepositories />
                    </div>
                  </div>
                </div>
              }
            />
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
