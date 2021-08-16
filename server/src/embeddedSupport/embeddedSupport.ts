import { Position, Range } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseCoffeescriptDocumentRegions, EmbeddedRegion } from './coffeescriptDocumentRegionParser';
import { LANGUAGE_ID } from '../language';
import transpile_service from '../services/transpileService';
import { logger } from '../log';


export type LanguageId = typeof LANGUAGE_ID | 'javascript' | 'typescript' | 'unknown';

export interface LanguageRange extends Range {
  languageId: LanguageId;
  attributeValue?: boolean;
}

export interface CoffeescriptDocumentRegions {
  /**
   * Get a document where all regions of `type` RegionType is preserved
   * Whereas other regions are replaced with whitespaces
   */
  getSingleTypeDocument(type: RegionType): TextDocument;

  /**
   * Get a list of ranges that has `RegionType`
   */
  getLanguageRangesOfType(type: RegionType): LanguageRange[];

  /**
   * Get all language ranges inside document
   */
  getAllLanguageRanges(): LanguageRange[];

  /**
   * Get language for determining
   */
  getLanguageAtPosition(position: Position): LanguageId;

  getImportedScripts(): string[];
}

type RegionType = 'script' | 'custom';

const defaultLanguageIdForBlockTypes: { [type: string]: string } = {
  script: 'javascript'
};

export function getCoffeescriptDocumentRegions(document: TextDocument): CoffeescriptDocumentRegions {
  const { regions, importedScripts } = parseCoffeescriptDocumentRegions(document);

  return {
    getSingleTypeDocument: (type: RegionType) => getSingleTypeDocument(document, regions, type),

    getLanguageRangesOfType: (type: RegionType) => getLanguageRangesOfType(document, regions, type),

    getAllLanguageRanges: () => getAllLanguageRanges(document, regions),
    getLanguageAtPosition: (position: Position) => getLanguageAtPosition(document, regions, position),
    getImportedScripts: () => importedScripts
  };
}

function getAllLanguageRanges(document: TextDocument, regions: EmbeddedRegion[]): LanguageRange[] {
  return regions.map(r => {
    return {
      languageId: r.languageId,
      start: document.positionAt(r.start),
      end: document.positionAt(r.end)
    };
  });
}

function getLanguageAtPosition(document: TextDocument, regions: EmbeddedRegion[], position: Position): LanguageId {
  const offset = document.offsetAt(position);
  for (const region of regions) {
    if (region.start <= offset) {
      if (offset <= region.end) {
        return region.languageId;
      }
    } else {
      break;
    }
  }
  return LANGUAGE_ID;
}

// This is where the real CS doc is being transformed into a "virtual" JS document.
// The only function as there is only one language / mode handled in CoffeeSense.
// (the actual virtual word is used by vetur for two different things:
// 1. artificial vue template js files, most of the time. Removed from this repo
// 2. any virtual doc. rarely called that way, but present, see isVirtualCoffeeFile)
export function getSingleTypeDocument(
  document: TextDocument,
  regions: EmbeddedRegion[],
  type: RegionType
): TextDocument {
  const oldContent = document.getText();
  let newContent = oldContent
    .split('\n')
    .map(line => ' '.repeat(line.length))
    .join('\n');

  let langId = defaultLanguageIdForBlockTypes[type];

  for (const r of regions) {
    if (r.type === type) {
      newContent = newContent.slice(0, r.start) + oldContent.slice(r.start, r.end) + newContent.slice(r.end);
      langId = r.languageId;
    }
  }
  // newContent is coffee

  try {
    newContent = transpile_service.transpile(document).js || document.getText()
  } catch(e) {
    logger.logInfo('TRANSPILATION FAILED ' + document.uri + ' ' + JSON.stringify(e))
  }
  // now it's JS (or if failed, coffee as a fallback)
  // source map etc are saved in transpileService to be retrievable in js language service methods

  return TextDocument.create(document.uri, langId || '', document.version, newContent);
}

export function getLanguageRangesOfType(
  document: TextDocument,
  regions: EmbeddedRegion[],
  type: RegionType
): LanguageRange[] {
  const result = [];

  for (const r of regions) {
    if (r.type === type) {
      result.push({
        start: document.positionAt(r.start),
        end: document.positionAt(r.end),
        languageId: r.languageId
      });
    }
  }

  return result;
}
