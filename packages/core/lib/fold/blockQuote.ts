import { Decoration, WidgetType } from '@codemirror/view';
import { foldableSyntaxFacet } from './core';

class BlockQuoteVerticalLine extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-blockquote-vertical-line';
    return span;
  }

  ignoreEvent(_event: Event) {
    return false;
  }
}

export const blockQuoteExtension = foldableSyntaxFacet.of({
  nodePath: (nodePath) =>
    nodePath.endsWith('Blockquote/QuoteMark') ||
    nodePath.endsWith('Blockquote/Paragraph/QuoteMark'),
  onFold: (_state, node) => {
    return Decoration.replace({ widget: new BlockQuoteVerticalLine() }).range(
      node.from,
      node.to,
    );
  },
});
