import assert from 'assert'
import vscode from 'vscode'
import { showFile } from '../../../editorHelper'
import { getDocUri } from '../../path'

describe('Document symbols: export default (anonymous)', () => {
	const classDoc = getDocUri('document-symbols/export-default-class.coffee')
	const fnDoc = getDocUri('document-symbols/export-default-fn.coffee')
	const objDoc = getDocUri('document-symbols/export-default-object.coffee')

	const findByName = (list: vscode.DocumentSymbol[]|undefined, name: string): vscode.DocumentSymbol | undefined => {
		if (!list) return undefined
		for (const s of list) {
			if (s.name === name) return s
			const found = findByName(s.children, name)
			if (found) return found
		}
		return undefined
	}

	it('shows class members inside export default', async () => {
		await showFile(classDoc)
		const symbols = (await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', classDoc)) as vscode.DocumentSymbol[]
		if (!symbols || symbols.length === 0) throw new Error('No document symbols returned')

		const def = findByName(symbols, 'default')
		assert.ok(def, 'default export missing')
		// ensure class member is present
		const greet = findByName(symbols, 'greet')
		assert.ok(greet, 'greet missing in exported class')
	})

	it('shows inner assignments / functions inside export default function', async () => {
		await showFile(fnDoc)
		const symbols = (await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', fnDoc)) as vscode.DocumentSymbol[]
		if (!symbols || symbols.length === 0) throw new Error('No document symbols returned')

		const def = findByName(symbols, 'default')
		assert.ok(def, 'default export missing')
		const inner = findByName(symbols, 'inner')
		assert.ok(inner, 'inner function/assignment inside exported function missing')
	})

	it('shows object properties inside export default object', async () => {
		await showFile(objDoc)
		const symbols = (await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', objDoc)) as vscode.DocumentSymbol[]
		if (!symbols || symbols.length === 0) throw new Error('No document symbols returned')

		const def = findByName(symbols, 'default')
		assert.ok(def, 'default export missing')
		const a = findByName(symbols, 'a')
		assert.ok(a, 'property a missing in exported object')
		const nestedC = findByName(symbols, 'c')
		assert.ok(nestedC, 'nested property c missing in exported object')
	})
})
