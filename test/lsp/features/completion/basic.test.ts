import { position } from '../../../util'
import { testCompletion } from '../../../completionHelper'
import { getDocUri } from '../../path'

describe('Should autocomplete', () => {
	const basic_uri = getDocUri('completion/basic.coffee')
	const inline_callback_uri = getDocUri('completion/inline-callback.coffee')
	const inline_callback_special_words_uri = getDocUri('completion/inline-callback-special-words.coffee')
	const import_uri = getDocUri('completion/import.coffee')
	const string_uri = getDocUri('completion/string.coffee')
	const external_uri = getDocUri('completion/external.coffee')
	const this_uri = getDocUri('completion/this.coffee')
	const assignment_uri = getDocUri('completion/assignment.coffee')
	const tab_uri = getDocUri('completion/tab.coffee')
	const at_uri = getDocUri('completion/@.coffee')
	const at_before_text_uri = getDocUri('completion/@-before-text.coffee')
	const compilation_fail_uri = getDocUri('completion/compilation-fail.coffee')
	const last_line_uri = getDocUri('completion/last-line.coffee')
	const object_uri = getDocUri('completion/object.coffee')
	const object_before_comment_uri = getDocUri('completion/object-before-comment.coffee')
	const object_before_statement_uri = getDocUri('completion/object-before-statement.coffee')
	const object_half_defined_uri = getDocUri('completion/object-half-defined.coffee')
	const object_half_defined_above_uri = getDocUri('completion/object-half-defined-above.coffee')
	const object_half_line_uri = getDocUri('completion/object-half-line.coffee')
	const object_half_line_colon_uri = getDocUri('completion/object-half-line-colon.coffee')
	const object_half_line_with_braces_uri = getDocUri('completion/object-half-line-with-braces.coffee')
	const object_half_line_with_open_brace_uri = getDocUri('completion/object-half-line-with-open-brace.coffee')
	const object_half_line_half_defined_uri = getDocUri('completion/object-half-line-half-defined.coffee')
	const object_half_line_half_defined_above_uri = getDocUri('completion/object-half-line-half-defined-above.coffee')
	const object_invalid_line_uri = getDocUri('completion/object-invalid-line.coffee')
	const object_before_more_indent_uri = getDocUri('completion/object-before-more-indent.coffee')
	const fake_line_uri = getDocUri('completion/fake-line.coffee')
	const dot_before_comment_uri = getDocUri('completion/dot-before-comment.coffee')
	const only_dot_uri = getDocUri('completion/only-dot.coffee')
	const ae7693d_uri = getDocUri('completion/ae7693d.coffee')
	const if_uri = getDocUri('completion/if.coffee')

	it('completes basic properties after dot, partially typed (= no fake line mechanism)', async () => {
		await testCompletion(basic_uri, position(2, 23), ['bbb'])
		// Inside implicit function call braces
		await testCompletion(basic_uri, position(4, 35), ['bbb'])
		// Inside implicit function call braces, after ().
		await testCompletion(basic_uri, position(6, 25), ['toISOString'])
	})

	it('completes import module names', async () => {
		await testCompletion(import_uri, position(0, 8), ['lodash'])
		await testCompletion(import_uri, position(1, 10), ['lodash'])
		await testCompletion(import_uri, position(2, 11), ['curry'])
		await testCompletion(import_uri, position(3, 9), ['curry'])
	})

	it('completes strings', async () => {
		await testCompletion(string_uri, position(2, 27), ['constant'])
		await testCompletion(string_uri, position(5, 35), ['constant'])
	})

	it('completes for lodash methods', async () => {
		await testCompletion(external_uri, position(2, 25), ['curry', 'fill'])
	})

	it('completes even when the line is invalid', async () => {
		// ...by substituting its contents using fake line logic
		// There is some "definitely_coffee_syntax" in there to avoid this test
		// succeeding merely due to the plain javascript parsing fallback.
		await testCompletion(fake_line_uri, position(1, 44), ['apply'])
	})

	it('completes a param on inline callback with implicit function braces and fake line mechanism', async () => {
		// callback parens insertion in transpileService
		await testCompletion(inline_callback_uri, position(0, 65), ['toFixed'])
	})
	it('completes a param on inline callback with implicit function braces and fake line mechanism and special coffee words like "unless"', async () => {
		await testCompletion(inline_callback_special_words_uri, position(0, 128), ['toFixed'])
	})

	it('completes in assignment', async () => {
		await testCompletion(assignment_uri, position(1, 56), ['bbb'])
	})

	it('completes for this.', async () => {
		await testCompletion(this_uri, position(3, 13), ['bbb', 'ccc'])
	})

	// same as ^this., but with tabs
	it('completes with tab indentation', async () => {
		await testCompletion(tab_uri, position(3, 7), ['bbb', 'ccc'])
	})

	// bfa0645
	it('completes for @', async () => {
		await testCompletion(at_uri, position(3, 9), [{label: 'bbb', insertTextValue: 'bbb'}, 'ccc'])
	})

	it('completes at end of fake line if it contains a @ somewhere earlier', async () => {
		await testCompletion(at_before_text_uri, position(4, 32), ['abc'])
	})

	it('completes at the very end of file', async () => {
		await testCompletion(last_line_uri, position(1, 14), ['toFixed'])
	})

	// 4f6a2ed
	it('completes before a comment', async () => {
		await testCompletion(dot_before_comment_uri, position(1, 23), ['toFixed'])
	})

	// bfe46e9
	it('completes after dot in otherwise empty line', async () => {
		await testCompletion(only_dot_uri, position(3, 1), ['only_dot_obj_prop'])
	})

	it('completes using javascript parsing fallback when cs compilation failed', async () => {
		await testCompletion(compilation_fail_uri, position(3, 21), ['toFixed'])
	})

	it('completes object properties', async () => {
		await testCompletion(object_uri, position(11, 4), ['obj_completion_prop_1', 'obj_completion_prop_2'])
	})

	it('completes object properties before a comment', async () => {
		await testCompletion(object_before_comment_uri, position(11, 4), ['obj_before_comment_completion_prop_1', 'obj_before_comment_completion_prop_2'])
	})

	it('completes half defined object properties', async () => {
		await testCompletion(object_half_defined_uri, position(12, 4), ['obj_halfdefined_completion_prop_2'])
	})

	it('completes half defined object properties above', async () => {
		await testCompletion(object_half_defined_above_uri, position(11, 4), ['obj_halfdefined_above_completion_prop_1'])
	})

	// f5fa3af
	it('completes object properties while current line is invalid', async () => {
		await testCompletion(object_invalid_line_uri, position(11, 33), ['obj_invalid_line_completion_prop_1', 'obj_invalid_line_completion_prop_1'])
	})

	// Known shortcoming - not supported
	xit('completes partial object key with no sibling keys', async () => {
		// This does not work because there is no way to know if the partial string is an object key
		// or a full value by itself, so if this is even an object at all.
		await testCompletion(object_half_line_uri, position(11, 33), ['obj_halfdefined_completion_prop_1', 'obj_halfdefined_completion_prop_2'])
	})

	it('completes partial object key with no sibling keys before colon', async () => {
		await testCompletion(object_half_line_colon_uri, position(11, 39), ['obj_half_line_colon_completion_prop_1', 'obj_half_line_colon_completion_prop_2'])
	})

	it('completes partial object key with no sibling with braces', async () => {
		await testCompletion(object_half_line_with_braces_uri, position(11, 45), ['obj_half_line_with_braces_completion_prop_1', 'obj_half_line_with_braces_completion_prop_2'])
	})

	it('completes partial object key when object closing brace is missing', async () => {
		await testCompletion(object_half_line_with_open_brace_uri, position(11, 49), ['obj_half_line_with_open_brace_completion_prop_1', 'obj_half_line_with_open_brace_completion_prop_2'])
	})

	it('completes half defined object property when already partially typed', async () => {
		await testCompletion(object_half_line_half_defined_uri, position(12, 47), ['obj_half_line_half_defined_completion_prop_2'])
	})

	it('completes half defined object property when already partially typed below', async () => {
		await testCompletion(object_half_line_half_defined_above_uri, position(11, 53), ['obj_half_line_half_defined_above_completion_prop_1'])
	})

	it('completes object properties before a statement', async () => {
		await testCompletion(object_before_statement_uri, position(11, 4), ['obj_completion_before_statement_prop_1', 'obj_completion_before_statement_prop_2'])
	})

	// 5fede02
	it('maintains proper compilation when an empty line in object is followed by another line with even more indent follows', async () => {
		// this is not really a completion test, more of a syntax check:
		// (a check that '𒐛:𒐛' isn't inserted due to indent follow)
		await testCompletion(object_before_more_indent_uri, position(6, 75), ['sub_prop'])
	})

	// ae7693d. I forgot what exactly was going on here, but the test setup is fixed
	it('completes in special case ae7693d', async () => {
		await testCompletion(ae7693d_uri, position(2, 13), ['ae7693d_obj_sub_prop'])
	})

	// 4b8257f
	// Also tests fake-line inside if statement
	it('completes in if-statement if next line is indented', async () => {
		await testCompletion(if_uri, position(1, 10), ['if_obj_prop'])
	})
})
