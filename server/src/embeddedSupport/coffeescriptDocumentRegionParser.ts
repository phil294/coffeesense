import type { TextDocument } from 'vscode-languageserver-textdocument';
import { LanguageId } from './embeddedSupport';

export type RegionType = 'script' | 'custom';

export interface EmbeddedRegion {
  languageId: LanguageId;
  start: number;
  end: number;
  type: RegionType;
}

export function parseCoffeescriptDocumentRegions(document: TextDocument) {
  let regions: EmbeddedRegion[] = []
  const text = document.getText();
  if(document.uri.endsWith('.vue')) {
    const vueMatch = text.match(/(.*)(<script\s+lang=["']coffee(?:script)?["']\s*>\s*)(.+?)(\s*<\/script\s*>)(.*)/si)
    if(vueMatch) {
      regions = [
        {
          languageId: 'javascript',
          start: vueMatch[1]!.length + vueMatch[2]!.length,
          end: vueMatch[1]!.length + vueMatch[2]!.length + vueMatch[3]!.length,
          type: 'script'
        }
      ];
    }
  }
  if(!regions.length) {
    regions = [
      {
        // TODO: why javascript? shouldn't this be LANGUAGE_ID aka coffeescript?
        languageId: 'javascript',
        start: 0,
        end: text.length,
        type: 'script'
      }
    ];
  }
  return {
    importedScripts: [],
    regions
  };
}
