# @ts-check
### ###
diagnostics_ts2 = 1
diagnostics_ts2 = '1'

###* @type {number} ###
diagnostics_should_be_number = '123'


do =>
	###* @type {number} ###
	diagnostics_should_be_number_x = '1'
	a =
		###* @type {number} ###
		diagnostics_should_be_number_b = '1'
	c =
		###* @type {number} ###
		d: '1'
	###* @type {number} ###
	diagnostics_should_be_number_y = '1'
	###*
	# @type {number}
	###
	diagnostics_should_be_number_g = '1'
	#
	###*
	# @type {number}
	###
	diagnostics_should_be_number_i = '1'
	``###*
	# @type {number}
	###
	diagnostics_should_be_number_j = '1'
	``###* @type {number} ###
	diagnostics_should_be_number_k = '1'
	###
	some.comment
	###
	###*
	@type {number}
	###
	diagnostics_should_be_number_h = '1'
	1
###* @type {number} ###
diagnostics_should_be_number_e = '2'