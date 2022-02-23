import { testDefinition } from '../../../definitionHelper'
import { position, sameLineLocation } from '../../../util'
import { getDocUri } from '../../path'

describe('Should find definition', () => {
	const basic_uri = getDocUri('definition/basic.coffee')
	const chained_if_uri = getDocUri('definition/chained-if.coffee')

	it('finds definition for this.bbb', async () => {
		await testDefinition(basic_uri, position(5, 13), sameLineLocation(basic_uri, 3, 4, 4))
	})

	it('finds definition for lodash', async () => {
		const lodashDtsUri = getDocUri('node_modules/@types/lodash/index.d.ts')
		await testDefinition(basic_uri, position(0, 12), sameLineLocation(lodashDtsUri, 246, 12, 13))
	})

	// TODO: Currently impossible, looks like CS source maps bug, and is same bug without the `if`
	xit('completes an if-statement with optional chaining and sub properties', async () => {
		await testDefinition(chained_if_uri, position(1, 20), sameLineLocation(chained_if_uri, 0, 13, 29))
	})
})
