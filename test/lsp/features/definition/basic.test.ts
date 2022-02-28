import { testDefinition } from '../../../definitionHelper'
import { position, sameLineLocation } from '../../../util'
import { getDocUri } from '../../path'

describe('Should find definition', () => {
	const basic_uri = getDocUri('definition/basic.coffee')
	const chained_if_uri = getDocUri('definition/chained-if.coffee')
	const something_else_ext_uri = getDocUri('definition/item.something-else-than-coffee')

	it('finds definition for this.bbb', async () => {
		await testDefinition(basic_uri, position(6, 13), sameLineLocation(basic_uri, 4, 4, 4))
	})

	it('finds definition for lodash', async () => {
		const lodashDtsUri = getDocUri('node_modules/@types/lodash/index.d.ts')
		await testDefinition(basic_uri, position(0, 12), sameLineLocation(lodashDtsUri, 246, 12, 13))
	})

	// comprehensions introduce coffee code that is absent in js, and as such cannot be reverse mapped as is
	it('finds definition in comprehension', async () => {
		await testDefinition(basic_uri, position(11, 37), sameLineLocation(basic_uri, 10, 0, 15))
	})

	xit('finds definition in comprehension when variable is not a simple assignment', async () => {
		await testDefinition(basic_uri, position(14, 37), sameLineLocation(basic_uri, 13, 0, 15))
	})

	// TODO: Currently impossible, looks like CS source maps bug, and is same bug without the `if`
	xit('completes an if-statement with optional chaining and sub properties', async () => {
		await testDefinition(chained_if_uri, position(1, 20), sameLineLocation(chained_if_uri, 0, 13, 29))
	})

	// issue #9
	it('finds definition for altered file extension', async () => {
		// see fixture/.vscode/settings.json
		await testDefinition(basic_uri, position(8, 0), sameLineLocation(something_else_ext_uri, 0, 0, 15))
	})
})
