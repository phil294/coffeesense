import { position } from '../../../util'
import { testCompletion } from '../../../completionHelper'
import { getDocUri } from '../../path'
import { CompletionItemKind, Position, Range, TextEdit } from 'vscode'
import assert from 'assert'

describe('Should autocomplete', () => {

	it('completes basic properties after dot, partially typed (= no fake line mechanism)', async () => {
		const basic_uri = getDocUri('completion/basic.coffee')
		await testCompletion({ doc_uri: basic_uri, position: position(2, 23), expected_items: ['bbb'] })
		// Inside implicit function call braces
		await testCompletion({ doc_uri: basic_uri, position: position(4, 35), expected_items: ['bbb'] })
		// Inside implicit function call braces, after ().
		await testCompletion({ doc_uri: basic_uri, position: position(6, 25), expected_items: ['toISOString'], allow_unspecified: true, })
	})

	it('completes correctly in implicit return scenario', async () => {
		const doc_uri = getDocUri('completion/implicit-return.coffee')
		await testCompletion({ doc_uri, position: position(6, 41), expected_items: ['ccc1'] })
		await testCompletion({ doc_uri, position: position(6, 40), expected_items: ['bbb1'] })
		await testCompletion({ doc_uri, position: position(6, 37), expected_items: ['bbb1'] })
		await testCompletion({ doc_uri, position: position(6, 36), expected_items: ['bbb1', 'bbb2'] })
	})

	it('completes in optional chaining', async () => {
		const doc_uri = getDocUri('completion/optional-chaining.coffee')
		await testCompletion({ doc_uri, position: position(1, 21), expected_items: ['aaa'] })
	})

	const import_uri = getDocUri('completion/import.coffee')
	it('completes import modules', async () => {
		await testCompletion({ doc_uri: import_uri, position: position(0, 8), expected_items: ['lodash'], allow_unspecified: true, })
		await testCompletion({ doc_uri: import_uri, position: position(1, 10), expected_items: ['lodash'], allow_unspecified: true, })
	})
	for(const p of [[2,11], [3,9], [5,8], [5,22], [5,23], [5,24], [6,52]]) {
		it('completes import module variable names at '+p, async () => {
			await testCompletion({ doc_uri: import_uri, position: position(p[0], p[1]), expected_items: ['findLastIndex'], allow_unspecified: true, })
		})
	}

	it('completes strings', async () => {
		const string_uri = getDocUri('completion/string.coffee')
		await testCompletion({ doc_uri: string_uri, position: position(2, 27), expected_items: ['constant'] })
		await testCompletion({ doc_uri: string_uri, position: position(5, 35), expected_items: ['constant'] })
	})
	it('completes unclosed strings', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/open-string.coffee'), position: position(2, 19), expected_items: ['abc', 'def'] })
		await testCompletion({ doc_uri: getDocUri('completion/open-string-2.coffee'), position: position(2, 21), expected_items: ['abc', 'def'] })
	})

	it('completes open string as inline object assignment', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/open-string-as-inline-object.coffee'), position: position(3, 38), expected_items: ['def', 'ghi'] })
	})

	it('completes open string as inline object param', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/open-string-as-inline-object-param.coffee'), position: position(0, 28), expected_items: ['smooth'] })
	})
	it('completes empty open string as inline object param', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/open-empty-string-as-inline-object-param.coffee'), position: position(0, 27), expected_items: ['smooth', 'auto'] })
	})

	it('completes open string as function param, indented', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/open-string-as-function-param-indented.coffee'), position: position(5, 85), expected_items: ['abc']})
	})

	it('completes open string as function param after opening brace, indented', async () => {
		// TODO should probably specify target range (?) which is 1 char less, so 5,66 and 5,70 - because the `a` is already there
		await testCompletion({ doc_uri: getDocUri('completion/open-string-as-function-param-brace-indented.coffee'), position: position(5, 67), expected_items: ['abc']})
		await testCompletion({ doc_uri: getDocUri('completion/open-string-as-function-param-brace-indented-2.coffee'), position: position(5, 71), expected_items: ['abc']})
	})
	it('completes empty open string as function param after opening brace, indented', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/open-empty-string-as-function-param-brace-indented.coffee'), position: position(5, 72), expected_items: ['abc', 'def'] })
	})

	it('completes for lodash methods', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/external.coffee'), position: position(2, 25), expected_items: ['curry', 'fill'], allow_unspecified: true, })
	})

	it('completes even when the line is invalid', async () => {
		// ...by substituting its contents using fake line logic
		// There is some "definitely_coffee_syntax" in there to avoid this test
		// succeeding merely due to the plain javascript parsing fallback.
		await testCompletion({ doc_uri: getDocUri('completion/fake-line.coffee'), position: position(1, 44), expected_items: ['apply'], allow_unspecified: true, })
	})

	it('completes coffee-only syntax (implicit array) property after dot in fake line when dot is NOT the last char in line but followed by some more content', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/fake-line-array-before-nonsense.coffee'), position: position(0, 48), expected_items: ['flatMap'], allow_unspecified: true, })
	})

	it('completes a param on inline callback with implicit function braces and fake line mechanism', async () => {
		// callback parens insertion in transpileService
		await testCompletion({ doc_uri: getDocUri('completion/inline-callback.coffee'), position: position(0, 65), expected_items: ['toFixed'], allow_unspecified: true, })
	})
	it('completes a param on inline callback with implicit function braces and fake line mechanism and special coffee words like "unless"', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/inline-callback-special-words.coffee'), position: position(0, 128), expected_items: ['toFixed'], allow_unspecified: true, })
	})
	it('completes a param on inline callback with implicit function braces and fake line mechanism and colon in line outside of object', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/inline-callback-colon.coffee'), position: position(0, 75), expected_items: ['abc'] })
	})
	it('completes a param on inline callback with implicit function braces and fake line mechanism and colon in line outside of object with syntax non-understandable to tsserver', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/inline-callback-colon-2.coffee'), position: position(0, 77), expected_items: ['abc'] })
	})
	it('completes a param on inline callback with implicit function braces and fake line mechanism and the line starting with a closing bracket', async () => {
		// This (and also previous test) tests fake line logic by not replacing the entire line with garbage
		// but only removing the trailing dot
		await testCompletion({ doc_uri: getDocUri('completion/inline-callback-bracket.coffee'), position: position(2, 72), expected_items: ['inline_callback_bracket_var_1'] })
	})

	it('completes in assignment', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/assignment.coffee'), position: position(1, 56), expected_items: ['bbb'] })
	})

	it('completes for this.', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/this.coffee'), position: position(3, 13), expected_items: ['bbb', 'ccc'] })
	})

	// same as ^this., but with tabs
	it('completes with tab indentation', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/tab.coffee'), position: position(3, 7), expected_items: ['bbb', 'ccc'] })
	})

	it('completes in fake line after dot even when this line is being combined with the next line by the CS compiler', async () => {
		// This is a more complicated setup most commonly achieved in FP
		await testCompletion({ doc_uri: getDocUri('completion/fake-combined-line.coffee'), position: position(1, 1), expected_items: ['flatMap'], allow_unspecified: true, })
	})

	// bfa0645
	it('completes at @| as this.|', async () => {
		const doc_uri = getDocUri('completion/@.coffee')
		await testCompletion({ doc_uri, position: position(3, 9), expected_items: ['bbb', 'ccc'] })
		await testCompletion({ doc_uri, position: position(4, 15), expected_items: ['bbb', 'ccc'] })
		await testCompletion({ doc_uri, position: position(6, 29), expected_items: ['bbb', 'ccc'] })
		await testCompletion({ doc_uri, position: position(7, 10), expected_items: ['bbb'] })
	})

	// issue #13, #2
	it('parses @ without anything after it as this', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/@.coffee'), position: position(5, 19), expected_items: ['toFixed']})
	})

	it('completes at end of fake line if it contains a @ somewhere earlier', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/@-before-text.coffee'), position: position(4, 32), expected_items: ['abc'] })
	})

	it('completes at end of fake line if it contains a @ somewhere earlier and dot is NOT the last char in line but followed by some more content', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/@-before-text-before-nonsense.coffee'), position: position(4, 48), expected_items: ['abc'] })
	})

	it('completes at the very end of file', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/last-line.coffee'), position: position(1, 14), expected_items: ['toFixed'], allow_unspecified: true, })
	})

	// 4f6a2ed
	it('completes before a comment', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/dot-before-comment.coffee'), position: position(1, 23), expected_items: ['toFixed'], allow_unspecified: true, })
	})

	// bfe46e9
	it('completes after dot in otherwise empty line', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/only-dot.coffee'), position: position(3, 1), expected_items: ['only_dot_obj_prop'] })
	})

	it('completes using javascript parsing fallback when cs compilation failed', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/compilation-fail.coffee'), position: position(3, 21), expected_items: ['toFixed'], allow_unspecified: true, })
	})

	it('completes object properties', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/object.coffee'), position: position(11, 4), expected_items: ['obj_completion_prop_1', 'obj_completion_prop_2'] })
	})

	it('completes object properties before a comment', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/object-before-comment.coffee'), position: position(11, 4), expected_items: ['obj_before_comment_completion_prop_1', 'obj_before_comment_completion_prop_2'] })
	})

	it('completes half defined object properties', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/object-half-defined.coffee'), position: position(12, 4), expected_items: ['obj_halfdefined_completion_prop_2'] })
	})

	it('completes half defined object properties above', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/object-half-defined-above.coffee'), position: position(11, 4), expected_items: ['obj_halfdefined_above_completion_prop_1'] })
	})

	// f5fa3af
	it('completes object properties while current line is invalid', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/object-invalid-line.coffee'), position: position(11, 33), expected_items: ['obj_invalid_line_completion_prop_1', 'obj_invalid_line_completion_prop_2'] })
	})

	it('completes inline object (implicit) property keys as function params even without a colon, while also suggesting local vars', async () => {
		const inline_object_param_key_uri = getDocUri('completion/inline-object-param-key.coffee')
		await testCompletion({
			doc_uri: inline_object_param_key_uri,
			position: position(13, 28),
			expected_items: [
				'obj_inline_param_key_prop_1', // TODO expect pos 1? as there are globals. perhaps always as part of testcompletion
				{ label: 'obj_inline_param_key_unrelated_var', kind: CompletionItemKind.Variable }
			],
			allow_globals: true,
			unexpected_items: [ 'obj_inline_param_key_prop_2' ]
		})
		await testCompletion({
			doc_uri: inline_object_param_key_uri,
			position: position(15, 32),
			expected_items: [
				'obj_inline_param_key_prop_2',
				{ label: 'obj_inline_param_key_unrelated_var', kind: CompletionItemKind.Variable }
			],
			allow_globals: true,
			unexpected_items: [
				'obj_inline_param_key_prop_1',
			]
		})
	})
	it('completes inline object (implicit) property keys in various scenarios', async () => {
		const inline_object_param_key_uri = getDocUri('completion/inline-object-param-key.coffee')
		const checks = [
			[30, 5, 'oi2'], [30, 17, 'oi2'], [30, 18, 'oi2'], [30, 21, ['oi3', 'oi4'], true], [30, 22, ['oi3', 'oi4']],
			[31, 22, ['oi3', 'oi4']], [31, 23, ['oi3', 'oi4']], [31, 24, ['oi3', 'oi4'], true], [31, 25, ['oi3', 'oi4'], true], [31, 26, ['oi3', 'oi4'], true], 
			[32, 22, 'oi4'], [32, 23, ['oi3', 'oi4']], [32, 34, 'oi4'], [32, 35, 'oi4'], 
			[33, 21, ['oi3', 'oi4'], true], 
			[34, 5, 'oi2'], [34, 18, 'oi2'], 
			[35, 20, ['oi3', 'oi4'], true], 
			[36, 16, 'oi2'], 
			[37, 18, ['oi3', 'oi4'], true], 
			[39, 4, ['oi3', 'oi4']], 
			[40, 11, ['oi7', 'oi8'], true], 
			[42, 21, 'oi2'], 
			[43, 8, ['oi1', 'oi2'], true], 
			[46, 7, ['oi11', 'oi12'], true], 
			[49, 19, 'oi15'], 
		] as const
		for(const check of checks) {
			await testCompletion({
				doc_uri: inline_object_param_key_uri,
				position: position(check[0], check[1]),
				//@ts-ignore
				expected_items: Array.isArray(check[2]) ? check[2] : [ check[2] ],
				allow_globals: check[3] || false
			})
		}
	})

	it('completes inline object property keys as function params even without a colon, after opened but not yet closed brace', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/inline-object-open-brace.coffee'), position: position(9, 52), expected_items: ['inline_obj_open_brace_prop_1'] })
	})

	it('does not apply transforms onto jsdoc (exclude comments)', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/jsdoc-spacing.coffee'), position: position(12, 4), expected_items: ['obj_completion_with_jsdoc_spacing_prop_1', 'obj_completion_with_jsdoc_spacing_prop_2', 'obj_completion_with_jsdoc_spacing_prop_3' ] })
	})

	// Known shortcoming - not supported
	it('fails: completes partial object key with no sibling keys', async () => {
		// This does not work because there is no way to know if the partial string is an object key
		// or a full value by itself, so if this is even an object at all.
		await assert.rejects(
			testCompletion({ doc_uri: getDocUri('completion/object-half-line.coffee'), position: position(11, 33), expected_items: ['obj_halfdefined_completion_prop_1', 'obj_halfdefined_completion_prop_2'] }))
	})

	it('completes partial object key with no sibling keys before colon', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/object-half-line-colon.coffee'), position: position(11, 39), expected_items: ['obj_half_line_colon_completion_prop_1', 'obj_half_line_colon_completion_prop_2'] })
	})

	it('completes partial object key with no sibling with braces', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/object-half-line-with-braces.coffee'), position: position(11, 45), expected_items: ['obj_half_line_with_braces_completion_prop_1', 'obj_half_line_with_braces_completion_prop_2'] })
	})

	it('completes partial object key when object closing brace is missing', async () => {
		// This works because it's replaced with `if ... { ...` and then again with the coffee line,
		// and the } from the if-statement closes the coffee line again
		await testCompletion({ doc_uri: getDocUri('completion/object-half-line-with-open-brace.coffee'), position: position(11, 49), expected_items: ['obj_half_line_with_open_brace_completion_prop_1', 'obj_half_line_with_open_brace_completion_prop_2'] })
	})

	it('completes half defined object property when already partially typed', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/object-half-line-half-defined.coffee'), position: position(12, 47), expected_items: ['obj_half_line_half_defined_completion_prop_2'] })
	})

	it('completes half defined object property when already partially typed below', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/object-half-line-half-defined-above.coffee'), position: position(11, 53), expected_items: ['obj_half_line_half_defined_above_completion_prop_1'] })
	})

	it('completes object properties before a statement', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/object-before-statement.coffee'), position: position(11, 4), expected_items: ['obj_completion_before_statement_prop_1', 'obj_completion_before_statement_prop_2'] })
	})

	// 5fede02
	it('maintains proper compilation when an empty line in object is followed by another line with even more indent follows', async () => {
		// this is not really a completion test, more of a syntax check:
		// (a check that '𒐛:𒐛' isn't inserted due to indent follow)
		await testCompletion({ doc_uri: getDocUri('completion/object-before-more-indent.coffee'), position: position(6, 75), expected_items: ['sub_prop'] })
	})

	// ae7693d. I forgot what exactly was going on here, but the test setup is fixed
	it('completes in special case ae7693d', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/ae7693d.coffee'), position: position(2, 13), expected_items: ['ae7693d_obj_sub_prop'] })
	})

	// 4b8257f
	// Also tests fake-line inside if statement
	it('completes in if-statement if next line is indented', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/if.coffee'), position: position(1, 10), expected_items: ['if_obj_prop'] })
	})

	it('completes a variable that has been assigned to inline a if-statement', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/if-assignment.coffee'), position: position(2, 24), expected_items: ['abc'] })
	})

	it('properly inserts a ? before the . when autocompleting with no-unchecked-index-access:true', async () => {
		// the mentioned setting is active for all tests, in jsconfig.json
		await testCompletion({ doc_uri: getDocUri('completion/array-access-with-no-unchecked-index-access.coffee'), position: position(1, 51), expected_items: [{
			label: 'abc',
			insertTextValue: '?.abc',
			textEdit: TextEdit.replace(new Range(new Position(1, 50), new Position(1, 51)), '?.abc')
		}] })
	})

	it('properly replaces the . with [] when autocompleting a complex property that e.g. contains spaces', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/quoted-object-key.coffee'), position: position(2, 22), expected_items: [{
			label: 'a b',
			insertTextValue: '["a b"]',
			textEdit: TextEdit.replace(new Range(new Position(2, 21), new Position(2, 22)), '["a b"]')
		}] })
	})

	// ref issue #1
	it('completes a destructured variable that had a comment block attached, inside a wrapper', async () => {
		await testCompletion({ doc_uri: getDocUri('completion/destructuring-with-comment-block.coffee'), position: position(7, 8), expected_items: ['destructuring_with_comment_block_var_1'] })
	})

	it('completes when there are multiple unclosed curly braces', async () => {
		// this is a pretty random complicated scenario that works by removing all {} and consequently also all ...spread operators
		// (aggressive preprocess)
		await testCompletion({ doc_uri: getDocUri('completion/multiple-open-braces.coffee'), position: position(22, 17), expected_items: ['multiple_open_braces_prop_1', 'multiple_open_braces_prop_1'] })
	})
})