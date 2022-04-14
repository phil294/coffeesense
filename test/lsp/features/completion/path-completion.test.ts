import { position } from '../../../util'
import { testCompletion } from '../../../completionHelper'
import { CompletionItemKind } from 'vscode'
import { getDocUri } from '../../path'

describe('Should do path completion for import', () => {
	const doc_uri = getDocUri('completion/path.coffee')

	it('completes local file names when importing', async () => {
		await testCompletion({ doc_uri, position: position(0, 20), expected_items: [
			{
				label: 'item.coffee',
				kind: CompletionItemKind.File
			}
		], allow_unspecified: true })
	})
})
