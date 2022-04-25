import assert from 'assert'
import vscode from 'vscode'
import { showFile } from '../../../editorHelper'
import { position } from '../../../util'
import { getDocUri } from '../../path'

describe('Should provide signature hints', () => {

    const signature_label = 'signature_hint_func(param1: any, param2: any): void'
	const doc_uri = getDocUri('signature-hint/basic.coffee')
    for(const line_no of [2,4,6,8]) {
    	it('suggests params in line_no ' + line_no, async () => {
		    await testSignatureHints(doc_uri, position(line_no, 20), signature_label)
    	})
    }

	it('suggests params in an indented function invocation with a trailing space as trigger character', async () => {
		// This works because the space is converted into 𝆮 and thus survives the compilation
		await testSignatureHints(getDocUri('signature-hint/indented-space.coffee'), position(2, 39), 'signature_hint_indented_space_func(param1: any, param2: any): void')
	})

	it('suggests params in an indented function invocation with a trailing opened parentheses as trigger character', async () => {
		// Requires aggressive preprocessing to insert closing brace, as fake line hack
		// fails because the error line is further down than the brace line.
		// This only happens in indented scenario though.
		await testSignatureHints(getDocUri('signature-hint/indented-brace.coffee'), position(2, 39), 'signature_hint_indented_brace_func(param1: any, param2: any): void')
	})
})

async function testSignatureHints(docUri: vscode.Uri, position: vscode.Position, expected_signature_label: string) {
	await showFile(docUri)

	const result = (await vscode.commands.executeCommand(
		'vscode.executeSignatureHelpProvider',
		docUri,
		position
	)) as vscode.SignatureHelp
    
    assert.strictEqual(result?.signatures[0]?.label, expected_signature_label)
}
