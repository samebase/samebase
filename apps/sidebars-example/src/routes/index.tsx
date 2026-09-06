import { createFileRoute } from "@tanstack/react-router";
import { ExampleSidebarLayout } from "@/sidebars/ExampleSidebarLayout";

const EXAMPLE_LINKS = [
  {
    href: "https://github.com/samebase/sidebars",
    label: "Package source",
  },
  {
    href: "https://github.com/samebase/sidebars-example",
    label: "Example source",
  },
];

const LAYOUT_DETAILS = [
  { label: "Desktop", value: "Drag to resize" },
  { label: "Mobile", value: "Swipe between panes" },
  { label: "State", value: "Saved locally" },
];

function ExampleLinks() {
  return (
    <nav aria-label="Project links" className="example-links">
      {EXAMPLE_LINKS.map(({ href, label }) => (
        <a href={href} key={href} rel="noreferrer" target="_blank">
          {label}
        </a>
      ))}
    </nav>
  );
}

function ExampleMain() {
  return (
    <main className="example-main-content">
      <code>@samebase/sidebars</code>
      <h1>Two sidebars.</h1>
      <p>Drag the dividers. Use the top-right buttons to show or hide either sidebar.</p>
    </main>
  );
}

function LayoutDetails() {
  return (
    <dl className="example-details">
      {LAYOUT_DETAILS.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ExamplePage() {
  return (
    <ExampleSidebarLayout
      left={{
        content: <ExampleLinks />,
        header: <div className="example-pane-header">Links</div>,
        scrollRestorationId: "example-links",
      }}
      main={{
        content: <ExampleMain />,
        scrollRestorationId: "example-main",
      }}
      right={{
        content: <LayoutDetails />,
        header: <div className="example-pane-header">Behavior</div>,
        scrollRestorationId: "example-behavior",
      }}
    />
  );
}

export const Route = createFileRoute("/")({
  component: ExamplePage,
});
