import { parseLandingCopyMarkdown } from "@/lib/landingCopy";

const LANDING_COPY_LIST_PADDING_START_STYLE = "13.7812px";
const LANDING_COPY_LIST_TEXT_INDENT_STYLE = "-7.78125px";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderLandingCopyShellHtml(markdown: string): string {
  const { bullets, slogan } = parseLandingCopyMarkdown(markdown);
  const lines: string[] = [];

  if (slogan.length > 0) {
    lines.push(
      `<div class="cm-line cm-landing-copy-heading" style="padding-bottom: 5px;"><span>${escapeHtml(
        slogan,
      )}</span></div>`,
    );
  }

  if (slogan.length > 0 && bullets.length > 0) {
    lines.push('<div class="cm-line cm-landing-copy-gap"><br /></div>');
  }

  for (const [index, bullet] of bullets.entries()) {
    const firstListClassName = index === 0 ? " cm-landing-copy-list-first" : "";
    lines.push(
      `<div class="cm-line cm-landing-copy-list${firstListClassName}" style="padding-inline-start: ${LANDING_COPY_LIST_PADDING_START_STYLE}; text-indent: ${LANDING_COPY_LIST_TEXT_INDENT_STYLE};"><span class="cm-rendered-list-mark" aria-hidden="true">•</span> ${escapeHtml(
        bullet,
      )}</div>`,
    );
  }

  return `<div class="min-h-[1rem] text-sm"><div class="cm-editor cm-landing-copy"><div class="cm-scroller"><div spellcheck="false" autocorrect="off" autocapitalize="off" writingsuggestions="false" translate="no" contenteditable="false" class="cm-content cm-lineWrapping" role="textbox" aria-multiline="true" aria-readonly="true" data-language="markdown">${lines.join("")}</div></div></div></div>`;
}
