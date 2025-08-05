import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CollaborativeCodeEditor } from "./CollaborativeCodeEditor";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Wifi } from "lucide-react";

export function CollaborativeDemo() {
  const [isConnected, setIsConnected] = useState(true);
  const [simulateLatency, setSimulateLatency] = useState(0);

  // For demo purposes, we'll use a fixed vault and file
  // We need a real vault ID from the database, so let's get the user's first vault
  const userVaults = useQuery(api.vault.getUserVaults);
  const demoVaultId = userVaults?.[0]?._id;
  const demoFilePath = "collaborative-demo.js";

  // Get active editors for the demo file
  const activeEditors = useQuery(
    api.collaborative.getActiveEditors,
    demoVaultId ? { vaultId: demoVaultId, filePath: demoFilePath } : "skip",
  );

  console.log({
    demoVaultId,
    demoFilePath,
    activeEditors,
  });

  const [content, setContent] =
    useState(`// Welcome to Collaborative CodeMirror Demo!
// 
// This is a real-time collaborative editor powered by:
// - CodeMirror 6
// - Convex (for real-time backend)
// - Operational Transformation (for conflict resolution)
//
// Try opening this page in multiple tabs or browsers
// and edit simultaneously!

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// Add your own code here:
console.log("Hello, collaborative world!");

// Test the editor by typing below:
`);

  const toggleConnection = () => {
    setIsConnected(!isConnected);
  };

  const addLatency = (ms: number) => {
    setSimulateLatency(ms);
  };

  return (
    <div className="h-full bg-background overflow-y-auto">
      <div className="min-h-screen p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-5 w-5" />
                Connection Controls
              </CardTitle>
              <CardDescription>
                Test different network conditions to see how the collaborative
                editor handles them
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 items-center">
                <Button
                  variant={isConnected ? "default" : "secondary"}
                  onClick={toggleConnection}
                  size="sm"
                >
                  {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
                </Button>

                <div className="flex gap-2 items-center">
                  <span className="text-sm text-muted-foreground">
                    Simulate Latency:
                  </span>
                  <Button
                    variant={simulateLatency === 0 ? "default" : "outline"}
                    onClick={() => addLatency(0)}
                    size="sm"
                  >
                    0ms
                  </Button>
                  <Button
                    variant={simulateLatency === 250 ? "default" : "outline"}
                    onClick={() => addLatency(250)}
                    size="sm"
                  >
                    250ms
                  </Button>
                  <Button
                    variant={simulateLatency === 500 ? "default" : "outline"}
                    onClick={() => addLatency(500)}
                    size="sm"
                  >
                    500ms
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="text-sm">Active editors:</span>
                  <Badge variant="secondary">
                    {activeEditors?.length || 0}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm">Vault:</span>
                  <Badge variant="outline">
                    {demoVaultId ? "Connected" : "Not connected"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Editor */}
          <Card className="flex-1">
            <CardContent>
              <div className="h-96 border rounded-md overflow-hidden">
                {demoVaultId ? (
                  <CollaborativeCodeEditor
                    vaultId={demoVaultId}
                    filePath={demoFilePath}
                    initialContent={content}
                    parentCommitSha="demo-sha"
                    branch="main"
                    fileName={demoFilePath}
                    className="h-full"
                    onContentChange={(newContent) => setContent(newContent)}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center space-y-2">
                      <div>🔄 Loading vaults...</div>
                      <div className="text-sm">
                        You need to connect a repository first to use
                        collaborative editing.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
