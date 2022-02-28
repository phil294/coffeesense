import lodash from 'lodash'
import something_else_than_coffee from './item.something-else-than-coffee'

definition_obj =
    bbb: 1
    ccc: ->
        this.bbb

something_else_than_coffee

comprehension_3 = [1, 2, 3]
comprehension_4 = v * 2 for v in comprehension_3

[comprehension_5] = [[1, 2, 3]]
comprehension_6 = v * 2 for v in comprehension_5