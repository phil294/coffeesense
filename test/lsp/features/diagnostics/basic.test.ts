import vscode from 'vscode'
import { testDiagnostics } from '../../../diagnosticHelper'
import { showFile } from '../../../editorHelper'
import { sameLineRange } from '../../../util'
import { getDocUri } from '../../path'

describe('Should find diagnostics', () => {

	it('shows diagnostic errors for coffeescript compilation errors', async () => {
		const docUri = getDocUri('diagnostics/compiler.coffee')
		await testDiagnostics(docUri, [
			{
				range: sameLineRange(0, 0, 3),
				severity: vscode.DiagnosticSeverity.Error,
				message: "reserved word 'var'"
			},
		])
	})

	it('shows diagnostic errors for @ts-check typescript errors, including jsdoc', async () => {
		const docUri = getDocUri('diagnostics/ts.coffee')
		await testDiagnostics(docUri, [
			{
				range: sameLineRange(2, 0, 14),
				severity: vscode.DiagnosticSeverity.Error,
				// This also tests basic "pushes down variable declaration to assignment" logic, as the type is fixed number, not number|string as it would be with classical cs compiler (declaration at file head)
				message: "Type 'string' is not assignable to type 'number'."
			},
			{
				range: sameLineRange(6, 14, 17),
				severity: vscode.DiagnosticSeverity.Error,
				message: "Argument of type 'number' is not assignable to parameter of type 'string'."
			},
			// be5e704: JSDoc errors shown at the next possible source code section
			{
				range: sameLineRange(12, 0, 26),
				severity: vscode.DiagnosticSeverity.Error,
				message: "Cannot find name 'ThisTypeDoesNotExist'."
			}
		])
	})

	// issue #8, and generic issue for testing syntax problems
	it('succeeds coffee compilation', async () => {
		const docUri = getDocUri('diagnostics/compiler-success.coffee')
		// demonstrated by returning ts errors
		await testDiagnostics(docUri, [
			{
				range: sameLineRange(7, 0, 20),
				severity: vscode.DiagnosticSeverity.Error,
				message: "Type 'string' is not assignable to type 'number'."
			}
		])
	})

	// TODO: go back to new CS branch, https://github.com/jashkenas/coffeescript/issues/5366#issuecomment-1021366654
	it('pushes down variable declaration to assignment even with comment block before it', async () => {
		const docUri = getDocUri('diagnostics/declaration-with-commentblock.coffee')
		await testDiagnostics(docUri, [
			{
				range: sameLineRange(3, 0, 15),
				severity: vscode.DiagnosticSeverity.Error,
				message: "Type 'string' is not assignable to type 'number'."
			}
		])
	})
})
