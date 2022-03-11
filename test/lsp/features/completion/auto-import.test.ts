import { testCompletion, testCompletionResolve } from '../../../completionHelper'
import { position, sameLineRange, sleep, textEdit } from '../../../util'
import { getDocUri } from '../../path'

describe('Should autocomplete via imports', () => {
	it('Should suggest a lodash export', async () => {
		const doc_uri = getDocUri('completion/autoimport.coffee')
		await testCompletion(doc_uri, position(1, 19), [
			'createCallback'
		]);
	})
	// TODO: why doesn't this work? In testing, there are zero additionalTextEdits, but it does actually work when trying manually. Sleep and/or testCompletion directly before didn't help.
	// Once that is fixed, the auto import logic needs to be tested as well: Adding to existing import, not in first line, and imports spread over multiple lines.
	xit('Should add an auto inserted import statement', async () => {
		const doc_uri = getDocUri('completion/autoimport.coffee')
		await testCompletionResolve(
			doc_uri,
			position(1, 30),
			[
				{
					label: 'createCallback',
					additionalTextEdits: [
						textEdit(sameLineRange(0, 0, 0), 'import { createCallback } from "lodash"\n'),
						textEdit(sameLineRange(1, 30, 30), 'k'),
					]
				}
			],
			3
		)
	})
})
