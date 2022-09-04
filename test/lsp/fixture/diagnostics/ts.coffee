# @ts-check
diagnostics_ts = 1
diagnostics_ts = '1'

# JSDoc integration
ts_check_func = (###* @type {string} ### param1) => param1
ts_check_func 123


``###*
# @type {ThisTypeDoesNotExist}
###
ts_type_does_not_exist_var = 123

strict_null_check_1 = [strict_null_check_2: 123]
strict_null_check_1[0].strict_null_check_2
for strict_null_check_3 in strict_null_check_1
	strict_null_check_3.strict_null_check_2