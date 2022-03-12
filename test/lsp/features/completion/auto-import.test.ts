import { testCompletion, testCompletionResolve } from '../../../completionHelper'
import { position, sameLineRange, textEdit } from '../../../util'
import { getDocUri } from '../../path'

describe('Should autocomplete via imports', () => {
	it('Should suggest a lodash export', async () => {
		const doc_uri = getDocUri('completion/autoimport.coffee')
		await testCompletion(doc_uri, position(1, 30), [
			'createCallback'
		]);
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
})
