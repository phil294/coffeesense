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

###*
# @typedef {any} DefJSDoc1
###
###* @typedef {any} DefJSDoc2 ###
###* @typedef {any} DefJSDoc3 ###

``###*
# @type {DefJSDoc1}
###
a1 = []
do (###* @type {DefJSDoc2} ### a1) =>

do =>
    ``###*
    * @type {DefJSDoc3}
    ###
    a3 = []

``###* @type {import('./item-def-3').DefJSDoc4} ###
a4 = []