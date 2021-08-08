import { getCoffeescriptDocumentRegions } from '../../embeddedSupport/embeddedSupport';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FILE_EXTENSION, LANGUAGE_ID } from '../../language';

export function parseCoffeescriptScript(text: string): string {
  const doc = TextDocument.create(`test://test/test.${FILE_EXTENSION}`, LANGUAGE_ID, 0, text);
  const regions = getCoffeescriptDocumentRegions(doc);
  const script = regions.getSingleTypeDocument('script');
  return script.getText();
}
