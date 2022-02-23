import assert from 'assert'
import vscode, { Uri } from 'vscode'
import { showFile } from '../../../editorHelper'
import { position } from '../../../util'
import { getDocUri } from '../../path'

describe('Should provide signature hints', () => {
	const docUri = getDocUri('signature-hint/basic.coffee')

    const signature_label = 'signature_hint_func(param1: any, param2: any): void'
    for(const line_no of [2,4,6,8]) {
    	it('suggest params in line_no ' + line_no, async () => {
		    await testSignatureHints(docUri, position(line_no, 20), signature_label)
    	})
    }
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
