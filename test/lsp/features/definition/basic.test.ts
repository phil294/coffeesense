import assert from 'assert'
import { testDefinition } from '../../../definitionHelper'
import { location, position, sameLineLocation } from '../../../util'
import { getDocUri } from '../../path'

describe('Should find definition', () => {
	const basic_uri = getDocUri('definition/basic.coffee')

	it('finds definition for this.bbb', async () => {
		await testDefinition(basic_uri, position(8, 13), sameLineLocation(basic_uri, 6, 4, 4))
	})

	it('finds definition for lodash', async () => {
		const lodashDtsUri = getDocUri('node_modules/@types/lodash/index.d.ts')
		await testDefinition(basic_uri, position(0, 12), location(lodashDtsUri, 243, 0, 20185, 0))
	})

	// comprehensions introduce coffee code that is absent in js, and as such cannot be reverse mapped,
	// but match should be possible by reverse/upwards basic word match
	it('finds definition in comprehension', async () => {
		await testDefinition(basic_uri, position(13, 37), sameLineLocation(basic_uri, 12, 0, 15))
	})

	it('fails: finds definition in comprehension when variable is not a simple assignment', async () => {
		await assert.rejects(testDefinition(basic_uri, position(16, 37), sameLineLocation(basic_uri, 15, 0, 15)))
	})

	// TODO: Currently impossible, looks like CS source maps bug, and is same bug without the `if`
	xit('completes an if-statement with optional chaining and sub properties', async () => {
		const uri = getDocUri('definition/chained-if.coffee')
		await testDefinition(uri, position(1, 20), sameLineLocation(uri, 0, 13, 29))
	})

	// issue #9
	it('finds definition from file with altered file extension', async () => {
		// see fixture/.vscode/settings.json
		// why 15 tho??
		await testDefinition(basic_uri, position(10, 0), sameLineLocation(getDocUri('definition/item.something-else-than-coffee'), 0, 0, 15))
	})

	// issue #12
	it('finds definition from coffee file without file extension', async () => {
		await testDefinition(basic_uri, position(18, 0), sameLineLocation(getDocUri('definition/item-def-1.coffee'), 0, 0, 15))
	})
	it('finds definition from js file without file extension', async () => {
		await testDefinition(basic_uri, position(19, 0), sameLineLocation(getDocUri('definition/item-def-2.js'), 0, 0, 18))
	})

	it('finds definition in and from jsdoc, both inline and block, # and *', async () => {
		await testDefinition(basic_uri, position(28, 13), sameLineLocation(basic_uri, 22, 17, 26))
		await testDefinition(basic_uri, position(31, 25), sameLineLocation(basic_uri, 24, 20, 29))
		await testDefinition(basic_uri, position(35, 13), sameLineLocation(basic_uri, 25, 20, 29))
	})
})
