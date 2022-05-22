
``###*
# @param one {{
#   obj_inline_param_key_prop_1: number }}
# @param two {{
#   obj_inline_param_key_prop_2: number,
# }}
###
obj_inline_param_key_method = (one, two) =>

obj_inline_param_key_unrelated_var = 123

#
obj_inline_param_key_method 
#
obj_inline_param_key_method {}, 
#

``###*
# @param {{ oi1: string, oi2: string }} _
# @param {{ oi3: string, oi4: string }} _
###
oi5 = ({ oi1, oi2 }, { oi3, oi4 }) =>

``###*
# @param {string} oi6
# @param {{ oi7: string, oi8: string }} _
###
oi9 = (oi6, { oi7, oi8 }) =>

oi5 { oi1: 'op1', }, {}
oi5 { oi1: 'op1', }, {    }
oi5 { oi1: 'op2', }, { oi3: 'op7', }
oi5 { oi1: 'op3', }, 
oi5 { oi1: 'op3', 
oi5 { oi1: 'op4' }, 
oi5 oi1: 'op9', 
oi5 (oi1: 'op5'), 
oi5 (oi1: 'op6'),
    
oi9 'op8', 
do =>
    oi5 oi1: 'op10', 
    oi5 

``###* @type {{ oi11: string, oi12: string }} ###
oi13 = 

``###* @type {{ oi14: string, oi15: string }} ###
oi15 = oi14: '123', 