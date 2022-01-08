import { compile, LineMap } from 'coffeescript'
//@ts-ignore
import VolatileMap from 'volatile-map'
//@ts-ignore
import jshashes from 'jshashes'
import { Diagnostic, DiagnosticSeverity, Position, Range } from 'vscode-languageserver-types'
import { TextDocument } from 'vscode-languageserver-textdocument';
import { logger } from '../log';

export const common_js_variable_name_character = /[a-zA-Z0-9_$]/

export function get_word_around_position(text: string, offset: number) {
  let i_offset = offset
  while(text[i_offset - 1]?.match(common_js_variable_name_character))
    i_offset--
  let match_word = ""
  while(i_offset <= offset || text[i_offset]?.match(common_js_variable_name_character)) {
    match_word += text[i_offset]
    i_offset++
  }
  return match_word
}

interface ITranspilationResult {
  /** coffeescript compile diagnostics, if present, without considering `fake_line` */
  diagnostics?: Diagnostic[]
  /** set to number of coffeescript altered line if it was necessary for compilation to succeed */
  fake_line?: number
  /** compilation result. if `fake_line` is set, this result was made possible by it. */
  js?: string;
  /** accompanying its respective `js` counterpart, also possibly depending on `fake_line` if set */
  source_map?: LineMap[];
}

interface ITranspileService {
  result_by_uri: Map<string, ITranspilationResult>,
  transpile(coffee_doc: TextDocument): ITranspilationResult,
  position_js_to_coffee(source_map: LineMap[], js_position: Position): Position | undefined,
  range_js_to_coffee(source_map: LineMap[], js_range: Range): Range | undefined,
  position_coffee_to_js(result: ITranspilationResult, coffee_position: Position, coffee_doc: TextDocument): Position | undefined,
  range_coffee_to_js(result: ITranspilationResult, coffee_range: Range, coffee_doc: TextDocument): Range | undefined,
}

const MD5 = new jshashes.MD5()
const transpilation_cache: Map<string,ITranspilationResult> = new VolatileMap(180000)

const transpile_service: ITranspileService = {

  result_by_uri: new Map(),

  transpile(orig_coffee_doc) {
    const text = orig_coffee_doc.getText()
    const hash = MD5.hex(text)
    const cached = transpilation_cache.get(hash)
    if (cached) {
      logger.logDebug(`found cached compilation for contents of ${orig_coffee_doc.uri}`)
      this.result_by_uri.set(orig_coffee_doc.uri, cached)
      return cached
    }

    const coffee1 = text
      // Dangling space = opening brace "(". This is pretty hacky but works surprisingly
      // well. Accidental dangling spaces results in "Missing )" errors which even
      // makes sense in CS syntax.
      // To avoid unexpected syntax weirdness, we additionally show an unavoidable
      // error below (TODO: integrate this replace into the matchAll() below to avoid duplicate work)
      .replace(/([a-zA-Z_]) (\n|$)/g, (_,c) => {
        logger.logDebug(`replace dangling space with opening brace ${orig_coffee_doc.uri}`)
        return `${c}(\n`
      })
      // Enable autocomplete at `@|`. For that, all usages of `@` as `this` (without dot)
      // need to be ignored: A dot needs to be inserted. To avoid syntax errors, this also
      // adds a `valueOf()` afterwards. Cursor needs to be adjusted properly in doComplete()
      .replaceAll(/@(\s|$)/g, (_, ws) => {
        logger.logDebug(`transform @ to this.valueOf() ${orig_coffee_doc.uri}`)
        return `this.valueOf()${ws}`
      })
      //
      .replaceAll(/\.(\n|$)/g, () => {
        logger.logDebug(`transform .\n to .;\n/ ${orig_coffee_doc.uri}`)
        return `.;\n`
      })
    // Enable autocomplete on empty lines inside object properties.
    // Normally, empty lines get deleted by the cs compiler and cannot be mapped back. Insert some
    // random unicode snippet to keep the lines, and remove these snippets right after compilation below,
    // with the sole purpose of generating (properly indented) source maps.
    // But: This transform may only happen if the next text line is not an indentation child, as
    // it otherwise changes the syntax of its surroundings.
    // This tweak is separate from fake_line logic below.
    let coffee2 = ''
    let last_empty_line_eol = 0
    const replace_string = '𒐛:𒐛'
    for(const empty_line_match of coffee1.matchAll(/^([ \t]+)$/mg)) {
      const empty_line_indentation = empty_line_match[0]!.length
      const empty_line_eol = empty_line_match.index! + empty_line_indentation
      const next_lines = coffee1.slice(empty_line_eol + 1).split('\n')
      let i = 0
      while(next_lines[i]?.match(/^[ \t]*$/))
        i++
      const next_textual_line = next_lines[i]
      if(next_textual_line) {
        const next_textual_line_indentation = next_textual_line.match(/^([ \t]*).*$/)![1]!.length
        if(next_textual_line_indentation > empty_line_indentation)
          continue
      }
      coffee2 += coffee1.slice(last_empty_line_eol, empty_line_eol) + replace_string
      last_empty_line_eol = empty_line_eol
    }
    coffee2 += coffee1.slice(last_empty_line_eol)
    
    const coffee = coffee2

    // As coffee was modified, offsets and positions are changed and for these purposes,
    // we need to construct a new doc
    const mod_coffee_doc = TextDocument.create(orig_coffee_doc.uri, 'coffeescript', 1, coffee)
    let result: ITranspilationResult
    try {
      // 1. Try normal compilation
      const response = compile(coffee, { sourceMap: true, bare: true })
      logger.logDebug(`successfully compiled ${orig_coffee_doc.uri}`)
      result = {
        source_map: response.sourceMap.lines,
        js: response.js
      }
    } catch (normal_compilation_error) {
      if (normal_compilation_error.name !== "SyntaxError")
        throw normal_compilation_error
      
      // 2. It failed, so provide diagnostics from cs compiler
      const l = normal_compilation_error.location
      const diagnostics = [<Diagnostic>{
        range: Range.create(l.first_line, l.first_column, l.last_line ?? l.first_line, l.last_column + 1),
        severity: DiagnosticSeverity.Error,
        message: normal_compilation_error.message,
        tags: [],
        code: 0,
        source: 'CoffeeSense'
      }]
      // see above
      diagnostics.push(...[...orig_coffee_doc.getText()
        .matchAll(/([a-zA-Z_]) (\n|$)/g)]
        .map(m => {
          const pos = orig_coffee_doc.positionAt(m.index||0+1)
          return {
            range:  Range.create(pos, pos),
            severity: DiagnosticSeverity.Error,
            message: 'Dangling space',
            tags: [],
            code: 0,
            source: 'CoffeeSense'
          }
        }))
      result = { diagnostics }
      
      // 3. Try another compilation with error line simplified. Used for completions etc.
      // Proper lsp servers can handle autocompletion requests even when the surrounding code is invalid.
			// This is not possible with this one so we temporarily replace the erroneous line (indented)
			// with `𒐩`, reverse-map the location of that in the compiled JS (if successful) and insert the
			// error line again at that position, as JS completion *can* be based on half-baked code.
      // If this also fails, try `𒐩:𒐩` (should work in objects).
      // Reason for `𒐩`: Some random unicode character nobody uses. Might as well be `true` of `0` but
      // it should be as short as possible to not exceed the original line's length. Exotic to avoid
      // confusion with other user-set variables, should it somehow become visible. And it looks cool.
      // Object because it then also works in objects.
      // It would be better to apply this fix to the current line instead of the error line(s),
      // but that would need to happen inside `doComplete` where the position is known.
      // TextDocument contents need to be set *here* however, so this is not possible without
      // altering the underlying architecture of the extension.

      let coffee_error_line_no = l.first_line
      // if(normal_compilation_error.message === 'unexpected newline')
      //   // Experimental
      // .. not sure about this. Was *not* a good idea inside object key creation
      //   coffee_error_line_no++
      const coffee_error_offset = mod_coffee_doc.offsetAt(Position.create(coffee_error_line_no, 0))
      const coffee_error_next_newline_position = coffee.slice(coffee_error_offset).indexOf('\n')
      const coffee_error_end = coffee_error_next_newline_position > -1 ? coffee_error_offset + coffee_error_next_newline_position : undefined
      const coffee_error_line = coffee.slice(coffee_error_offset, coffee_error_end)
			const error_line_indentation = coffee_error_line.match(/^\s+/)?.[0] || ''

      const coffee_fake = [
				coffee.substr(0, coffee_error_offset),
				error_line_indentation,
				'𒐩',
        ' '.repeat(Math.max(0,coffee_error_line.length - error_line_indentation.length - 1)),
				coffee_error_end ? coffee.slice(coffee_error_end) : ''
			].join('')

      let js_fake: string | undefined
      let source_map_fake: LineMap[] | undefined
      try {
        const response = compile(coffee_fake, { sourceMap: true, bare: true })
        logger.logDebug(`successfully compiled with fake line: ${orig_coffee_doc.uri}`)
        js_fake = response.js
        source_map_fake = response.sourceMap.lines
      } catch (fake_compilation_error) {
        if (fake_compilation_error.name !== "SyntaxError")
          throw fake_compilation_error

        const coffee_fake2 = [
          coffee.substr(0, coffee_error_offset),
          error_line_indentation,
          '𒐩:𒐩',
          ' '.repeat(Math.max(0, coffee_error_line.length - error_line_indentation.length - 3)),
          coffee_error_end ? coffee.slice(coffee_error_end) : ''
        ].join('')
        // TODO: refactor this, externalize compile or something
        try {
          const response = compile(coffee_fake2, { sourceMap: true, bare: true })
          logger.logDebug(`successfully compiled with fake line 2: ${orig_coffee_doc.uri}`)
          js_fake = response.js
          source_map_fake = response.sourceMap.lines
        } catch (fake2_compilation_error) {
          if (fake_compilation_error.name !== "SyntaxError")
            throw fake_compilation_error
          logger.logDebug(`could not compile ${orig_coffee_doc.uri}`)
        }
      }
      
      if(js_fake && source_map_fake) {
        // Fake coffee compilation succeeded, now inject the coffee line into js

        const coffee_fake_𒐩_position = mod_coffee_doc.positionAt(coffee_error_offset + error_line_indentation.length)
        
        const coffee_error_line_modified = coffee_error_line
          // Requires special cursor handling in doComplete() yet again
          .replaceAll('@', 'this.')
        
        const js_fake_arr = js_fake.split('\n')
        // Could also be calculated using:
        // this.position_coffee_to_js({ source_map: source_map_fake }, coffee_fake_𒐩_position, mod_coffee_doc)?.line
        // but source maps are less reliable than the chance of the user not typing 𒐩 themselves
        const js_fake_𒐩_line_no = js_fake_arr.findIndex(line => line.indexOf('𒐩') > -1)
        if(js_fake_𒐩_line_no < 0)
          throw new Error('could not map back js 𒐩 line')
        js_fake_arr[js_fake_𒐩_line_no] = coffee_error_line_modified
        // Source map contains lines that refer to the now again removed `𒐩`s.
        // Fixing them is important when `coffee_error_line_modified` is not empty:
        const override_source_column = coffee_error_line[coffee_error_line.length-1] === ';' ? coffee_error_line.length - 1 : coffee_error_line.length
        source_map_fake[js_fake_𒐩_line_no]?.columns.forEach(col =>
          col.sourceColumn = override_source_column)

        if(js_fake_𒐩_line_no > 0) {
          let i = js_fake_𒐩_line_no - 1
          while(js_fake_arr[i]?.match(/^\s*$/)) {
            i--
          }
          const previous_line = js_fake_arr[i]!
          if(previous_line[previous_line.length - 1] === ';') {
            // This is necessary when the current coffee line is a continuation of the previous one,
            // e.g.(only?) via dot: cs `[]\n.|` becomes js `[];\n\n𒐩 ;` and then `[];\n\n.;`.
            // The first ; breaks autocomplete: remove it.
            js_fake_arr[i] = previous_line.slice(0, -1) +' '
            // Autocomplete after dot is always tricky and can still fail e.g. with `[]\n.|\n.y => 1`.
            // It's complicated because fake line mechanism removes essential closing brackets, killing
            // js syntax. This should rather be an edge case though (most likely to occur in FP),
            // and I decided against fixing it with yet another hacky workaround because it's hard to do so:
            // The cs compiler always tries to combine multiple lines into one
          }
        }

        js_fake = js_fake_arr.join('\n')
        result.fake_line = coffee_fake_𒐩_position.line
        result.js = js_fake
        result.source_map = source_map_fake
      }
    }

    if(result.js && result.source_map) {
      // See usage of 𒐛 above
      // Note that outside of objects, this will leave empty objects behind
      // but they do no harm and should go unnoticed
      result.js = result.js.replaceAll(/𒐛: 𒐛,?/g, '')

      // console.time('var-decl-fix')
      //////////////////////////////////////
      ///////// Modify variable declarations to solve various TS compiler errors:
      // Should not be error but is:
      // xy = 123   # Error: Variable 'xy' implicitly has type 'any' in some locations where its type cannot be determined.CoffeeSense [TS](7034)
      // => xy      # Error: Variable 'xy' implicitly has an 'any' type.CoffeeSense [TS](7005)
      //////// and
      // Should be error but is not:
      // a = 1
      // a = 'one'
      /////// This is because the cs compiler puts variable declarations to the front:
      // Translates to:
      // var a;
      // a = 1;
      // a = 'one';
      /////// and now `a` is of type `number | string` (https://github.com/microsoft/TypeScript/issues/45369). 
      // Below is a hacky workaround that should fix these issues in most cases. It moves the
      // declaration part (`var`) down to the variable's first implementation position.
      // This works only with easy implementations and single-variable array destructuring:
      /*
      var a, b, c;
      a = 1;
      [b] = 2;
      ({c} = 3);
      */
      // Shall become:
      /*
      var c;
      let a = 1;               // added let
      let [b] = 2;             // added let
      ({c} = 3);               // unchanged because of surrounding braces
      */
      // similarly, array destructors with more than one variable cannot be changed.
      // Returns stay untouched (return x = 1) too.
      const js_lines = result.js.split('\n')
      const js_line_nos = Array.from(Array(js_lines.length).keys())
      // Part 1: Determine declaration areas (`   var x, y;`)
      const js_decl_lines_info = js_line_nos
        .map(decl_line_no => {
          const match = js_lines[decl_line_no]!.match(/^(\s*)(var )(.+);$/)
          if(match) {
            const var_decl_infos = match[3]!.split(', ').map(var_name => ({
              var_name,
              decl_indent: match[1]!.length,
              decl_line_no,
            }))
            return {
              decl_line_no,
              var_decl_infos,
            }
          }
          return null
        })
        .filter(Boolean)
      // Part 2: For each `var` decl, find fitting first impl statement
      // (`x = 1`), if present, and return new line content (`let x = 1`).
      // Might as well be `var x = 1` but this helps differentiating/debugging
      const js_impl_line_changes = js_decl_lines_info
        .map(info => info!.var_decl_infos)
        .flat()
        .map(({ var_name, decl_indent, decl_line_no }) => {
          const js_line_nos_after_decl = js_line_nos.slice(decl_line_no)
          for(let impl_line_no of js_line_nos_after_decl) {
            const line = js_lines[impl_line_no]!
            const impl_whitespace = line.match(/^\s*/)![0]!
            const impl_indent = impl_whitespace.length
            if(impl_indent < decl_indent)
              // Parent block scope. Need to skip this variable then, no impl has been found
              // before current block got closed. It is important to stop here, as otherwise
              // it might later match an impl from *another* decl of the same var name
              return null
            const var_impl_text = `${var_name} = `
            if(line.substr(impl_indent, var_impl_text.length) === var_impl_text) {
              if(impl_indent > decl_indent)
                // This is a conditional first value assignment and type can not safely be set
                return null
              const rest_of_line = line.slice(impl_indent + var_impl_text.length)
              return {
                var_name,
                impl_line_no,
                decl_line_no,
                new_line_content: `${impl_whitespace}let ${var_impl_text}${rest_of_line}`,
                new_let_column: impl_indent,
              }
            }
          }
          return null
        }).filter(Boolean)
      // Part 3: Apply Part 2 changes and update source maps of those lines
      for(const change of js_impl_line_changes) {
        js_lines[change!.impl_line_no] = change!.new_line_content
        const map_columns = result.source_map[change!.impl_line_no]!.columns
        const map_current_impl_start = map_columns[change!.new_let_column]!
        // Can be null in cases where the variable is not user-set but e.g. a helper
        // variable put there by the cs compiler itself and ignored otherwise
        if(map_current_impl_start != null) {
          map_columns.splice(
            change!.new_let_column,
            0,
            ..."let ".split('').map((_, i) => ({
              ...map_current_impl_start,
              column: map_current_impl_start.column + i
          })))
          for(let i = map_current_impl_start.column + "let ".length; i < map_columns.length + "let ".length; i++) {
            if(map_columns[i])
              map_columns[i]!.column += "let ".length // or = i
          }
        }
      }
      // Part 4: Update decl lines (Part 1). Where no impl lines were found (Part 2),
      // keep them. If all were modified, an empty line will be put.
      for(const decl_line_info of js_decl_lines_info) {
        let new_decl_line = decl_line_info!.var_decl_infos
          .filter(decl_info => ! js_impl_line_changes.some(impl_change =>
            impl_change!.var_name === decl_info.var_name &&
              impl_change!.decl_line_no === decl_info.decl_line_no))
          .map(i => i.var_name)
          .join(', ')
        if(new_decl_line)
          // Those that could not be changed
          new_decl_line = 'var ' + new_decl_line
        js_lines[decl_line_info!.decl_line_no] = new_decl_line
      }

      result.js = js_lines.join('\n')
      // console.timeEnd('var-decl-fix')

      /* Prefer object method shorthand */
      result.js = result.js.replaceAll(/([a-zA-Z0-9_$]+): (async )?function(\*?)\(/g, (_, func_name, asynk, asterisk) =>
        `${asynk || ''}${asterisk}${func_name}          (`
      )
    }

    transpilation_cache.set(hash, result)
    this.result_by_uri.set(orig_coffee_doc.uri, result)
    return result
  },


  /**
   * Convert position in transpiled JS text back to where it was in the original CS text.
   * Tries to find by line and column, or if not found, the first match by line only.
   */
  position_js_to_coffee(source_map, js_position) {
    let result
    const columns = source_map[js_position.line]?.columns
    let mapped = columns?.[js_position.character]
    if(!mapped)
      mapped = columns
        ?.filter(Boolean)
        .filter(c => c.column <= js_position.character)
        .sort((a,b)=> b.column - a.column)
        [0]
    if(!mapped)
      mapped = columns?.find(Boolean)
    if(!mapped)
      result = undefined
    else
      result = Position.create(mapped.sourceLine, mapped.sourceColumn)
    // logger.logDebug(`mapped JS => CS: ${js_position.line}:${js_position.character} => ${result?.line}:${result?.character}`)
    return result
  },

  /** Convert range in transpiled JS back to where it was in the original CS */
  range_js_to_coffee(source_map, js_range) {
    const start = this.position_js_to_coffee(source_map, js_range.start)
    const end = this.position_js_to_coffee(source_map, js_range.end)
    if(start && end)
      return Range.create(start, end)
    return undefined
  },

  /**
   * Convert position in original CS to where it eventually turned out in the transpiled JS.
   * Tries to find by line and column, or if not found,
   * by line at the next smaller column,
   * or if no column match, end of line `(Number.MAX_VALUE)`, or if no line match, undefined.
   * If multiple JS finds for a coffee line/col combination, try to find where JS match equals
   * the word at `coffee_position`, else where JS is any word at all, else furthest down
   * in JS as possible.
   */
  position_coffee_to_js(result, coffee_position, coffee_doc) {
    if(!result.source_map)
      throw 'cannot reverse map position without source map'
    let js_matches_by_line = result.source_map
      .map(line => line?.columns
        .filter(c => c?.sourceLine === coffee_position.line))
      .flat()
    if(!js_matches_by_line.length) {
        // logger.logDebug(`mapped CS => JS: ${coffee_position.line}:${coffee_position.character} => undefined`)
        return undefined
    }
    
    const choose_match = (js_matches: typeof js_matches_by_line) => {
      const word_at_coffee_position = get_word_around_position(coffee_doc.getText(), coffee_doc.offsetAt(coffee_position))
      const js_doc_tmp = TextDocument.create('file://tmp.js', 'js', 1, result.js||'')
      const words_at_js_matches = js_matches.map(m =>
        result.js?.substr(
            js_doc_tmp.offsetAt({ line: m.line, character: m.column }),
            word_at_coffee_position.length || 1))
      if(word_at_coffee_position) {
        const index_match_by_word = words_at_js_matches.findIndex(m => m === word_at_coffee_position)
        if(index_match_by_word > -1)
            return js_matches[index_match_by_word]
      }
      const index_match_by_is_char = words_at_js_matches.findIndex(m => m?.[0]?.match(common_js_variable_name_character))
      if(index_match_by_is_char > -1)
        return js_matches[index_match_by_is_char]
      return [...js_matches]
        .sort((a,b) => b.line - a.line || b.column - a.column)
        [0]
    }

    let match
    const js_matches_by_char = js_matches_by_line
      .filter(c => c?.sourceColumn === coffee_position.character)
    if(js_matches_by_char.length)
      match = choose_match(js_matches_by_char)
    if(!match) {
      const coffee_char = coffee_doc.getText()[coffee_doc.offsetAt(coffee_position)]
      if(coffee_char === '.') {
        // in javascript.ts doComplete, the triggerChar is omitted. Try exact match without it:
        const js_matches_by_next_char = js_matches_by_line
          .filter(c => c?.sourceColumn === coffee_position.character + 1)
        if(js_matches_by_next_char.length)
          match = choose_match(js_matches_by_next_char)
      }
    }
    if(!match) {
      const next_smaller_source_column = Math.max(...js_matches_by_line
        .map(c => c.sourceColumn)
        .filter(c => c <= coffee_position.character))
      const js_matches_by_next_smaller_char = js_matches_by_line
        .filter(c => c?.sourceColumn === next_smaller_source_column)
      if(js_matches_by_next_smaller_char.length)
        match = choose_match(js_matches_by_next_smaller_char)
    }
    if(!match) {
      match = js_matches_by_line.find(Boolean)
      if(match)
        match.column = Number.MAX_VALUE
    }
    
    if(match && result.fake_line == coffee_position.line)
      // The coffee line is also a (the) altered one (fake line). In this case, `column.line` is
      // helpful but `column.column` does not make any sense, it contains only one column (where
      // the injected `𒐩` was placed). But since the error line was simply put into JS, we can
      // use the same pos:
      match.column = coffee_position.character

    // logger.logDebug(`mapped CS => JS: ${coffee_position.line}:${coffee_position.character} => ${match?.line}:${match?.column}`)
    if(!match)
      return undefined
    return Position.create(match.line, match.column)
  },

  /** Convert range in original CS to where it eventually turned out in the transpiled JS.
   * See reverse_map_position for implementation details. */
  range_coffee_to_js(result, coffee_range, coffee_doc) {
    const start = this.position_coffee_to_js(result, coffee_range.start, coffee_doc);
    const end = this.position_coffee_to_js(result, coffee_range.end, coffee_doc);
    if(start && end)
      return Range.create(start, end)
    return undefined
  },
}

export default transpile_service