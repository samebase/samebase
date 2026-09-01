import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

function HumanCheckpointPage() {
  const [complete, setComplete] = useState(false);

  return (
    <main
      className="human-checkpoint-page"
      data-human-checkpoint-state={complete ? "complete" : "waiting"}
    >
      <section aria-live="polite" className="human-checkpoint-content">
        <h1>{complete ? "Checkpoint complete" : "Human checkpoint"}</h1>
        <p>{complete ? "Return to Scout to continue." : "This step needs a person."}</p>

        {!complete && (
          <button onClick={() => setComplete(true)} type="button">
            Complete checkpoint
          </button>
        )}
      </section>
    </main>
  );
}

export const Route = createFileRoute("/human-checkpoint")({
  component: HumanCheckpointPage,
  head: () => ({
    meta: [{ title: "Human checkpoint" }],
  }),
});
