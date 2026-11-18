import { PublicLandingPrimaryAction } from "@/components/LandingPreviewPage";
import { buttonVariants } from "@/components/ui/button";
import {
  BASE_TEMPLATE,
  IDENTITY_HUB_TEMPLATE,
  TEMPLATES,
  type Template,
  type TemplateSetting,
} from "@/lib/templates";
import { cn } from "@/lib/utils";
import {
  LANDING_PREVIEW_ARTICLE_TEST_ID,
  LANDING_PREVIEW_TEST_ID,
  TEMPLATES_ROUTE,
} from "@/routeSearch/landingPreview";
import { SIGN_IN_WITH_OAUTH_BUTTON_CLASS_NAME } from "@/SignInWithOAuth";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

/** A template text field with its backtick spans as code. */
function TemplateText({ text }: { text: string }) {
  return text.split("`").map((part, index) =>
    index % 2 === 1 ? (
      <code
        className="border bg-accent px-1 py-0.5 font-mono text-[0.8125rem] text-accent-foreground"
        key={`${index}:${part}`}
      >
        {part}
      </code>
    ) : (
      part
    ),
  );
}

function TemplatesArticle({ children }: { children: ReactNode }) {
  return (
    <div data-testid={LANDING_PREVIEW_TEST_ID} className="flex min-h-0 flex-1 flex-col">
      <article
        className="mx-auto w-full max-w-[1100px] px-6 pb-32 pt-10 @2xl:px-10 @3xl:pt-14"
        data-testid={LANDING_PREVIEW_ARTICLE_TEST_ID}
      >
        {children}
      </article>
    </div>
  );
}

function ExternalButton({
  children,
  href,
  primary,
}: {
  children: ReactNode;
  href: string;
  primary: boolean;
}) {
  return (
    <a
      className={cn(
        buttonVariants({ variant: primary ? "default" : "outline" }),
        SIGN_IN_WITH_OAUTH_BUTTON_CLASS_NAME,
        "no-underline",
      )}
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
      <ArrowUpRight aria-hidden className="ml-1.5" />
    </a>
  );
}

function TemplateCard({ template }: { template: Template }) {
  return (
    <Link
      className="flex h-full flex-col border border-border text-foreground no-underline hover:bg-muted"
      to={template.route}
    >
      <img
        alt=""
        className="aspect-[16/10] w-full border-b border-border bg-white object-contain"
        height={template.image.height}
        src={template.image.src}
        width={template.image.width}
      />
      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{template.name}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-primary">{template.summary}</p>
        <p className="mt-auto pt-4 font-mono text-[13px] text-muted-foreground">
          {template.repository}
        </p>
      </div>
    </Link>
  );
}

export function TemplatesGalleryPage() {
  return (
    <TemplatesArticle>
      <h1 className="text-[clamp(34px,4.6cqw,52px)] font-bold leading-[1.06] tracking-[-0.035em]">
        Templates
      </h1>
      <p className="mt-5 max-w-[58ch] text-lg leading-relaxed text-primary">
        Public GitHub repositories that deploy themselves with Alchemy. Samebase creates a web app
        from one in a click, and each page lists the settings to do it yourself.
      </p>
      <ul className="mt-10 grid gap-6 @3xl:grid-cols-2">
        {TEMPLATES.map((template) => (
          <li key={template.route}>
            <TemplateCard template={template} />
          </li>
        ))}
      </ul>
    </TemplatesArticle>
  );
}

function SettingRow({ setting }: { setting: TemplateSetting }) {
  return (
    <li className="grid gap-x-8 gap-y-2 p-4 @2xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <div>
        {setting.names.map((name) => (
          <code className="block break-all font-mono text-[13px] font-semibold" key={name}>
            {name}
          </code>
        ))}
        <p className="mt-1 text-[13px] text-muted-foreground">
          {setting.optional ? `${setting.kind}, optional` : setting.kind}
        </p>
      </div>
      <div className="text-[15px] leading-relaxed text-primary">
        <p>
          <TemplateText text={setting.value} />
        </p>
        {setting.samebase === null ? null : (
          <p className="mt-2">
            <span className="font-semibold text-foreground">With Samebase:</span> {setting.samebase}
          </p>
        )}
      </div>
    </li>
  );
}

function TemplatePage({ template }: { template: Template }) {
  const repositoryUrl = `https://github.com/${template.repository}`;

  return (
    <TemplatesArticle>
      <Link
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary no-underline hover:text-foreground"
        to={TEMPLATES_ROUTE}
      >
        <ArrowLeft aria-hidden className="size-4" />
        Templates
      </Link>
      <h1 className="mt-6 text-[clamp(34px,4.6cqw,52px)] font-bold leading-[1.06] tracking-[-0.035em]">
        {template.name}
      </h1>
      <p className="mt-5 max-w-[62ch] text-lg leading-relaxed text-primary">
        {template.description}
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {template.createdBySamebase ? <PublicLandingPrimaryAction /> : null}
        <ExternalButton href={`${repositoryUrl}/generate`} primary={!template.createdBySamebase}>
          Use this template
        </ExternalButton>
        <ExternalButton href={template.demo.href} primary={false}>
          {template.demo.label}
        </ExternalButton>
      </div>

      <div className="mt-10 grid gap-8 @4xl:grid-cols-[minmax(0,1fr)_13rem]">
        <img
          alt={template.image.alt}
          className="w-full border border-border bg-white"
          height={template.image.height}
          src={template.image.src}
          width={template.image.width}
        />
        <dl className="grid content-start gap-x-8 gap-y-5 @xl:grid-cols-3 @4xl:grid-cols-1">
          <div>
            <dt className="text-sm font-semibold">Repository</dt>
            <dd className="mt-1 text-sm text-primary">
              <a
                className="underline decoration-current underline-offset-4 hover:text-foreground"
                href={repositoryUrl}
                rel="noreferrer"
                target="_blank"
              >
                {template.repository}
              </a>
            </dd>
          </div>
          {template.details.map((detail) => (
            <div key={detail.label}>
              <dt className="text-sm font-semibold">{detail.label}</dt>
              {detail.values.map((value) => (
                <dd className="mt-1 text-sm text-primary" key={value}>
                  {value}
                </dd>
              ))}
            </div>
          ))}
        </dl>
      </div>

      <section aria-labelledby="settings" className="mt-16 max-w-[820px]">
        <h2 className="text-2xl font-semibold tracking-[-0.02em]" id="settings">
          Settings
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-primary">
          GitHub Actions secrets and variables, in the repository's Settings, then Secrets and
          variables, then Actions.
        </p>
        {template.settingGroups.map((group) => (
          <div className="mt-8" key={group.heading}>
            <h3 className="text-base font-semibold">{group.heading}</h3>
            <ul className="mt-3 divide-y divide-border border border-border">
              {group.settings.map((setting) => (
                <SettingRow key={setting.names[0]} setting={setting} />
              ))}
            </ul>
            {group.after === null ? null : (
              <p className="mt-3 text-[15px] leading-relaxed text-primary">
                <TemplateText text={group.after} />
              </p>
            )}
          </div>
        ))}
      </section>

      <section aria-labelledby="by-hand" className="mt-16 max-w-[820px]">
        <h2 className="text-2xl font-semibold tracking-[-0.02em]" id="by-hand">
          By hand
        </h2>
        <ol className="mt-6 grid gap-5">
          {template.steps.map((step, index) => (
            <li className="grid grid-cols-[26px_minmax(0,1fr)] gap-x-3" key={step.heading}>
              <p aria-hidden className="pt-0.5 font-mono text-sm text-secondary">
                {index + 1}
              </p>
              <div>
                <h3 className="text-base font-semibold tracking-[-0.01em]">{step.heading}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-primary">
                  <TemplateText text={step.body} />
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-[15px] leading-relaxed text-primary">
          The{" "}
          <a
            className="underline decoration-current underline-offset-4 hover:text-foreground"
            href={`${repositoryUrl}#readme`}
            rel="noreferrer"
            target="_blank"
          >
            README
          </a>{" "}
          has every step and command.
        </p>
      </section>
    </TemplatesArticle>
  );
}

export function TemplateBasePage() {
  return <TemplatePage template={BASE_TEMPLATE} />;
}

export function TemplateIdentityHubPage() {
  return <TemplatePage template={IDENTITY_HUB_TEMPLATE} />;
}
