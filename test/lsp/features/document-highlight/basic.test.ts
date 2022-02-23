import assert from 'assert'
import vscode from 'vscode'
import { showFile } from '../../../editorHelper'
import { position, sameLineRange } from '../../../util'
import { getDocUri } from '../../path'

describe('Should do documentHighlight', () => {
	const docUri = getDocUri('document-highlight/basic.coffee')

	it('shows highlights for variables', async () => {
		await testHighlight(docUri, position(0, 8), [
			{ kind: vscode.DocumentHighlightKind.Text, range: sameLineRange(1, 12, 21) }
		])
	})
})

async function testHighlight(
	docUri: vscode.Uri,
	position: vscode.Position,
	expectedHighlights: vscode.DocumentHighlight[]
) {
	await showFile(docUri)

	const result = (await vscode.commands.executeCommand(
		'vscode.executeDocumentHighlights',
		docUri,
		position
	)) as vscode.DocumentHighlight[]

	expectedHighlights.forEach(eh => {
		assert.ok(result.some(h => isEqualHighlight(h, eh)))
	})

	function isEqualHighlight(h1: vscode.DocumentHighlight, h2: vscode.DocumentHighlight) {
		return h1.kind === h2.kind && h1.range.isEqual(h2.range)
	}
}
