import { testHover } from '../../../hoverHelper'
import { position, sameLineRange } from '../../../util'
import { getDocUri } from '../../path'

describe('Should do hover', () => {
	const doc_uri = getDocUri('hover/basic.coffee')

	it('shows inherited type from another variable', async () => {
		await testHover(doc_uri, position(1, 0), {
			contents: ['\n```ts\nvar hover2: number\n```'],
			range: sameLineRange(1, 0, 0)
		})
	})
})
