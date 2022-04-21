import lodash from 'lodash'
import something_else_than_coffee from './item.something-else-than-coffee'
import item_1 from './item-def-1'
import item_2 from './item-def-2'

definition_obj =
    bbb: 1
    ccc: ->
        this.bbb

something_else_than_coffee

comprehension_3 = [1, 2, 3]
comprehension_4 = v * 2 for v in comprehension_3

[comprehension_5] = [[1, 2, 3]]
comprehension_6 = v * 2 for v in comprehension_5

item_1
item_2