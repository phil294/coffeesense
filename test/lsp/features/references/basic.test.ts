import assert from 'assert'
import vscode, { Uri } from 'vscode'
import { showFile } from '../../../editorHelper'
import { position } from '../../../util'
import { getDocUri } from '../../path'

describe('Should find references', () => {
	const docUri = getDocUri('references/basic.coffee')
	const itemUri = getDocUri('references/item.coffee')

	it('finds references for variable', async () => {
		await testReferences(docUri, position(0, 0), [
			{ uri: docUri, line: 0 },
			{ uri: docUri, line: 2 },
			{ uri: itemUri, line: 0 },
		])
	})
})

async function testReferences(docUri: vscode.Uri, position: vscode.Position, expectedLocations: {uri: Uri, line: number}[]) {
	await showFile(docUri)

	const result = (await vscode.commands.executeCommand(
		'vscode.executeReferenceProvider',
		docUri,
		position
	)) as vscode.Location[]

	expectedLocations.forEach(el => {
		assert.ok(
			result.some(l => {
				return l.range.start.line === el.line && l.uri.fsPath === el.uri.fsPath
			})
		)
	})
}
