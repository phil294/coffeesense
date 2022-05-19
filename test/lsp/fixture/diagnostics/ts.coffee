# @ts-check
diagnostics_ts = 1
diagnostics_ts = '1'

# JSDoc integration
ts_check_func = (###* @type {string} ### param1) =>
ts_check_func 123

###*
# @type {ThisTypeDoesNotExist}
###
ts_type_does_not_exist_var = 123

###* @type {number} ###
diagnostics_ts_2 = '1'