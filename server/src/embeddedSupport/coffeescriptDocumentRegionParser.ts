import type { TextDocument } from 'vscode-languageserver-textdocument';
import { LanguageId } from './embeddedSupport';

export type RegionType = 'script' | 'custom';

export interface EmbeddedRegion {
  languageId: LanguageId;
  start: number;
  end: number;
  type: RegionType;
}

export function parseVueDocumentRegions(document: TextDocument) {
  const text = document.getText();
  const regions: EmbeddedRegion[] = [
    {
      languageId: 'javascript',
      start: 0,
      end: text.length,
      type: 'script'
    }
  ];
  return {
    importedScripts: [],
    regions
  };
}
