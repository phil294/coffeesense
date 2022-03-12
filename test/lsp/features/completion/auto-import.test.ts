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
	it('Should add an auto inserted import statement', async () => {
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
			3
		)
	})
})
