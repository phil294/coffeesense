import assert from 'assert'
import vscode from 'vscode'
import { showFile } from '../../../editorHelper'
import { getDocUri } from '../../path'

describe('Should provide document symbols (outline)', () => {
	const doc = getDocUri('document-symbols/basic.coffee')

	it('lists top-level and class symbols', async () => {
		await showFile(doc)
		const symbols = (await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', doc)) as vscode.DocumentSymbol[]
		if (!symbols || symbols.length === 0) {
			throw new Error('No document symbols returned')
		}

		const findByName = (list: vscode.DocumentSymbol[]|undefined, name: string): vscode.DocumentSymbol | undefined => {
			if (!list) return undefined
			for (const s of list) {
				if (s.name === name) return s
				const found = findByName(s.children, name)
				if (found) return found
			}
			return undefined
		}

		const person = findByName(symbols, 'Person')
		assert.ok(person, 'Person symbol missing')
		const constructor = findByName(person?.children, 'constructor')
		assert.ok(constructor, 'constructor missing in Person')
		const greet = findByName(person?.children, 'greet')
		assert.ok(greet, 'greet missing in Person')

		const square = findByName(symbols, 'square') || findByName(symbols, 'square =')
		assert.ok(square, 'square symbol missing')
	})
})
