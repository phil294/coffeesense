import { testCompletion, testCompletionResolve } from '../../../completionHelper'
import { position, sameLineRange, textEdit } from '../../../util'
import { getDocUri } from '../../path'

describe('Should autocomplete via imports', () => {
	it('Should suggest a lodash export', async () => {
		const doc_uri = getDocUri('completion/autoimport.coffee')
		await testCompletion({ doc_uri, position: position(1, 30), expected_items: [
			'createCallback'
		] });
	})
	it('Should insert an auto inserted import statement', async () => {
		const doc_uri = getDocUri('completion/autoimport.coffee')
		await testCompletionResolve(
			doc_uri,
			position(1, 30),
			[
				{
					label: 'createCallback',
					additionalTextEdits: [
						textEdit(sameLineRange(0, 0, 0), 'import { createCallback } from "lodash"\n'),
					]
				}
			],
		)
	})

	it('Should auto add to an existing import statement', async () => {
		const doc_uri = getDocUri('completion/autoimport-add.coffee')
		await testCompletionResolve(
			doc_uri,
			position(2, 6),
			[{
					label: 'curryRight',
					additionalTextEdits: [ textEdit(sameLineRange(0, 14, 14), ', curryRight') ]
			}]
		)
	})

	it('Should auto add to a long existing import statement', async () => {
		// long ones are wrapped by compiler into multiple js lines, so this needs extra handling
		const doc_uri = getDocUri('completion/autoimport-add-long.coffee')
		await testCompletionResolve(
			doc_uri,
			position(2, 6),
			[{
					label: 'curryRight',
					additionalTextEdits: [ textEdit(sameLineRange(0, 98, 98), ', curryRight') ]
			}]
		)
	})

	// issue #10
	it('[JSX fake line test] Should auto add a jsx import to an existing import statement without messing up previous imports when the current line is invalid due to an open brace (non-fixable by fake line insertion)', async () => {
		const doc_uri = getDocUri('completion/autoimport-add-jsx.coffee')
		await testCompletionResolve(
			doc_uri,
			position(6, 17),
			[{
					label: 'JSXItem2',
					additionalTextEdits: [ textEdit(sameLineRange(1, 17, 17), ', JSXItem2') ]
			}]
		)
	})

	it('[JSX fake line test] Should auto add a jsx import to an existing yet manually altered (spaces etc) import statement without messing up previous imports when the current line is invalid due to an open brace (non-fixable by fake line insertion)', async () => {
		const doc_uri = getDocUri('completion/autoimport-add-jsx-altered-import.coffee')
		await testCompletionResolve(
			doc_uri,
			position(6, 17),
			[{
					label: 'JSXItem2',
					additionalTextEdits: [ textEdit(sameLineRange(1, 16, 16), ', JSXItem2') ]
			}]
		)
	})
})
