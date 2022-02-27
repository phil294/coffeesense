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
    match_word += text[i_offset] || ''
    i_offset++
  }
  return match_word.trim()
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

function preprocess_coffee(coffee_doc: TextDocument) {
  const tmp = coffee_doc.getText()
    // Dangling space = 𝆮. This is replaced with an opening brace "(" in postprocess_js.
    // Dangling brace cannot be replaced because it is valid CS (s.a. signature hint tests).
    .replace(/([a-zA-Z_]) (\n|$)/g, (_,c) => {
      logger.logDebug(`replace dangling space with 𝆮 ${coffee_doc.uri}`)
      return `${c} 𝆮\n`
    })
    // Enable autocomplete at `@|`. For that, all usages of `@` as `this` (without dot)
    // need to be ignored: A dot needs to be inserted. To avoid syntax errors, this also
    // adds a `valueOf()` afterwards. Cursor needs to be adjusted properly in doComplete()
    .replaceAll(/@(\s|$)/g, (_, ws) => {
      logger.logDebug(`transform @ to this.valueOf() ${coffee_doc.uri}`)
      return `this.valueOf()${ws}`
    })
    //
    .replaceAll(/\.(\n|$)/g, () => {
      logger.logDebug(`transform .\n to .;\n ${coffee_doc.uri}`)
      return '.;\n'
    })
    // Enable object key autocomplete (that is, missing colon) below other key value mappings.
    // The replaced syntax is always invalid so no harm is done by adding the colon.
    // Without the colon, the error shows in the line before which doesn't make sense.
    // With the colon, the line will still be invalid, but now the error is at the right place.
    .replaceAll(/^(\s+)[a-zA-Z0-9_$]+\s*:\s*.+$\n\1[a-zA-Z0-9_$]+$/mg, (match) => {
      logger.logDebug(`transform a:b\nc\n to a:b\nc:\n ${coffee_doc.uri}`)
      return match + ':'
    })
  // Enable autocomplete on empty lines inside object properties.
  // Normally, empty lines get deleted by the cs compiler and cannot be mapped back. Insert some
  // random unicode snippet to keep the lines, and remove these snippets right after compilation below,
  // with the sole purpose of generating (properly indented) source maps.
  // But: This transform may only happen if the next text line is not an indentation child, as
  // it otherwise changes the syntax of its surroundings.
  // This tweak is separate from fake_line logic below.
  const tmp_lines = tmp.split('\n')
  const replace_string = '𒐛:𒐛'
  const object_tweak_coffee_lines: number[] = []
  tmp_lines.forEach((line, line_i) => {
    const empty_line_match = line.match(/^[ \t]+$/)
    if(empty_line_match) {
      const empty_line_indentation = empty_line_match[0]!
      let i = line_i + 1
      while(tmp_lines[i]?.match(/^[ \t]*$/))
        i++
      const next_textual_line = tmp_lines[i]
      if(next_textual_line) {
        const next_textual_line_indentation = next_textual_line.match(/^([ \t]*).*$/)![1]!.length
        if(next_textual_line_indentation > empty_line_indentation.length)
          return
      }
      tmp_lines[line_i] = empty_line_indentation + replace_string
      object_tweak_coffee_lines.push(line_i)
    }
  })
  const coffee = tmp_lines.join('\n')
  return { coffee, object_tweak_coffee_lines }
}

function try_compile(coffee: string): ITranspilationResult {
  try {
    // takes about 1-4 ms
    const response = compile(coffee, { sourceMap: true, bare: true })
    return {
      source_map: response.sourceMap.lines,
      js: response.js
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (compilation_error: any) {
      if (compilation_error.name !== "SyntaxError")
        throw compilation_error
      const l = compilation_error.location
      return {
        diagnostics: [<Diagnostic>{
          range: Range.create(l.first_line, l.first_column, l.last_line ?? l.first_line, l.last_column + 1),
          severity: DiagnosticSeverity.Error,
          message: compilation_error.message,
          tags: [],
          code: 0,
          source: 'CoffeeSense'
      }]
    }
  }
}

/**
 * Applies some transformations to the JS in result and updates source_map accordingly.
 * These transforms do not depend on any previous information.
 */
function postprocess_js(result: ITranspilationResult, object_tweak_coffee_lines: number[]) {
  if(!result.js || !result.source_map)
    return

  result.js = result.js
    // See usage of 𝆮 above
    .replaceAll('(𝆮);\n', '(   \n')

    // Prefer object method shorthand
    .replaceAll(/([a-zA-Z0-9_$]+): (async )?function(\*?)\(/g, (_, func_name, asynk, asterisk) =>
      `${asynk || ''}${asterisk}${func_name}          (`)

  const js_lines = result.js.split('\n')
  for(const line of object_tweak_coffee_lines) {
    result.source_map.forEach(x =>
      x.columns.forEach(y => {
        // This logic is equivalent to fake line source map fixing, explained there
        if(y.sourceLine === line) {
          if(!js_lines[y.line]?.match(/𒐛: 𒐛,?/))
            y.sourceLine = -1 // effectively remove this source mapping
          y.sourceColumn = 0
          y.column = 0
        }
    }))
  }
  result.js = result.js
    // See usage of 𒐛 above
    // Note that outside of objects, this will leave empty objects behind
    // but they do no harm and should go unnoticed
    .replaceAll(/𒐛: 𒐛,?/g, '')
}

const transpile_service: ITranspileService = {

  result_by_uri: new Map(),

  transpile(orig_coffee_doc) {
    const hash = MD5.hex(orig_coffee_doc.getText())
    const cached = transpilation_cache.get(hash)
    if (cached) {
      logger.logDebug(`found cached compilation for contents of ${orig_coffee_doc.uri}`)
      this.result_by_uri.set(orig_coffee_doc.uri, cached)
      return cached
    }

    const { coffee, object_tweak_coffee_lines } = preprocess_coffee(orig_coffee_doc)
    // As coffee was modified, offsets and positions are changed and for these purposes,
    // we need to construct a new doc
    const mod_coffee_doc = TextDocument.create(orig_coffee_doc.uri, 'coffeescript', 1, coffee)
    
    let coffee_error_line_no = 0, coffee_error_offset = 0, coffee_error_end = -1, coffee_error_line = '', coffee_error_line_indentation = ''
    let with_fake_line = false

    let result: ITranspilationResult
    
    // Try normal compilation
    result = try_compile(coffee)
    if(result.js)
      logger.logDebug(`successful simple compilation ${orig_coffee_doc.uri}`)
    const normal_compilation_diagnostics = result.diagnostics
    
    if(result.diagnostics) {
      coffee_error_line_no = result.diagnostics[0]!.range.start.line
      coffee_error_offset = mod_coffee_doc.offsetAt(Position.create(coffee_error_line_no, 0))
      const coffee_error_next_newline_position = coffee.slice(coffee_error_offset).indexOf('\n')
      coffee_error_end = coffee_error_next_newline_position > -1 ? coffee_error_offset + coffee_error_next_newline_position : -1
      coffee_error_line = coffee.slice(coffee_error_offset, coffee_error_end > -1 ? coffee_error_end : undefined)
			coffee_error_line_indentation = coffee_error_line.match(/^\s+/)?.[0] || ''
    }
      
    // If failed, try another compilation with error line simplified. Used for completions etc.
    // Proper lsp servers can handle autocompletion requests even when the surrounding code is invalid.
    // This is not possible with this one so we temporarily replace the erroneous line (indented)
    // with `𒐩`, reverse-map the location of that in the compiled JS (if successful) and insert the
    // error line again at that position, as JS completion *can* be based on half-baked code.
    // Reason for `𒐩`: Some random unicode character nobody uses. Might as well be `true` or `0` but
    // it should be as short as possible to not exceed the original line's length. Exotic to avoid
    // confusion with other user-set variables, should it somehow become visible. And it looks cool.
    // It would be better to apply this fix to the current line instead of the error line(s),
    // but that would need to happen inside `doComplete` where the position is known.
    // TextDocument contents need to be set *here* however, so this is not possible without
    // altering the underlying architecture of the extension.
    // As fallbacks, `𒐩:𒐩` should work in objects and `if 𒐩` in lines with increased indentation after.
    const try_fake_line_compilation = (fake_line_content: string) => {
      if(!result.js) {
        with_fake_line = true
        const coffee_fake = [
          coffee.substr(0, coffee_error_offset),
          coffee_error_line_indentation,
          fake_line_content,
          ' '.repeat(Math.max(0,coffee_error_line.length - coffee_error_line_indentation.length - fake_line_content.length)),
          coffee_error_end > -1 ? coffee.slice(coffee_error_end) : ''
        ].join('')
        result = try_compile(coffee_fake)
        if(result.js)
          logger.logDebug(`successful compilation with fake content '${fake_line_content}' ${orig_coffee_doc.uri}`)
      }
    }
    if(coffee_error_line.includes(':'))
      try_fake_line_compilation('𒐩:𒐩')
    for(const fake_line_content of ['𒐩', 'if 𒐩'])
      try_fake_line_compilation(fake_line_content)
    if(!coffee_error_line.includes(':'))
      try_fake_line_compilation('𒐩:𒐩')

    if(result.js && result.source_map && with_fake_line) {
      // Fake coffee compilation succeeded, now inject the coffee line into js

      const coffee_fake_𒐩_position = mod_coffee_doc.positionAt(coffee_error_offset + coffee_error_line_indentation.length)
      
      const coffee_error_line_modified = coffee_error_line
        // Requires special cursor handling in doComplete() yet again
        .replaceAll('@', 'this.')
        // Error at variable assignment location
        .replaceAll(/^\s*[a-zA-Z0-9_-]+\s*=/g, (assignment) => {
          // Rare case: object half line with open brace. Possibly other cases as well?
          // To make JS work, the variable needs var/const/let or a (nonexisting) prefix object.
          return `let ${assignment}`
        })
      
      const js_fake_arr = result.js.split('\n')
      // Could also be calculated using:
      // this.position_coffee_to_js({ source_map: result.source_map }, coffee_fake_𒐩_position, mod_coffee_doc)?.line
      // but source maps are less reliable than the chance of the user not typing 𒐩 themselves
      const js_fake_𒐩_line_no = js_fake_arr.findIndex(line => line.indexOf('𒐩') > -1)
      if(js_fake_𒐩_line_no < 0)
        throw new Error('could not map back js 𒐩 line')
      js_fake_arr[js_fake_𒐩_line_no] = coffee_error_line_modified

      // Source map contains lines that refer to the now again removed `𒐩`s.
      // Keep only one line reference for CS fake line which is JS fake line no,
      // and remove all column mappings for it.
      // The same position mapping effect could be achieved by removing all coffee_error_line_no
      // referring entries and add a single one {sourceLine:coffee_error_line_no,sourceColumn:0,line:js_fake_𒐩_line_no,column:0}
      result.source_map.forEach(x =>
        x.columns.forEach(y => {
          if(y.sourceLine === coffee_error_line_no) {
            if(y.line !== js_fake_𒐩_line_no)
              y.sourceLine = -1 // effectively remove this source mapping
            y.sourceColumn = 0
            y.column = 0
          }
        }))

      if(js_fake_𒐩_line_no > 0) {
        let i = js_fake_𒐩_line_no - 1
        while(js_fake_arr[i]?.match(/^\s*$/))
          i--
        const previous_line = js_fake_arr[i]
        if(previous_line?.[previous_line.length - 1] === ';') {
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

      result.js = js_fake_arr.join('\n')
      result.fake_line = coffee_fake_𒐩_position.line
    }

    if(result.js && result.source_map) {
      postprocess_js(result, object_tweak_coffee_lines)
    }
    
    if(normal_compilation_diagnostics)
      result.diagnostics = normal_compilation_diagnostics

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
    if(!mapped) {
      let line_i = js_position.line + 1
      while(line_i < source_map.length) {
        const any_next_column = source_map[line_i]?.columns?.find(Boolean)
        if(any_next_column) {
          mapped = any_next_column
          break
        }
        line_i++
      }
    }
    
    if(mapped)
      result = Position.create(mapped.sourceLine, mapped.sourceColumn)
    else
      result = undefined
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
   * or if no column match, any, or if no line match, undefined.
   * If multiple JS finds for a coffee line/col combination, try to find where JS match equals
   * the word at `coffee_position`, else where JS is any word at all, else furthest down/right
   * in JS as possible.
   */
  position_coffee_to_js(result, coffee_position, coffee_doc) {
    if(!result.source_map)
      throw 'cannot reverse map position without source map'
    const js_matches_by_line = result.source_map
      .map(line => line?.columns
        .filter(c => c?.sourceLine === coffee_position.line))
      .flat()
    if(!js_matches_by_line.length) {
        // logger.logDebug(`mapped CS => JS: ${coffee_position.line}:${coffee_position.character} => undefined`)
        return undefined
    }

    const char_at_coffee_position = coffee_doc.getText()[coffee_doc.offsetAt(coffee_position)]
    const word_at_coffee_position = get_word_around_position(coffee_doc.getText(), coffee_doc.offsetAt(coffee_position))
    
    const choose_match = (js_matches: typeof js_matches_by_line) => {
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
    if(!match && char_at_coffee_position === '.') {
        // in javascript.ts doComplete, the triggerChar is omitted. Try exact match without it:
        const js_matches_by_next_char = js_matches_by_line
          .filter(c => c?.sourceColumn === coffee_position.character + 1)
        if(js_matches_by_next_char.length)
          match = choose_match(js_matches_by_next_char)
    }
    if(!match && char_at_coffee_position === undefined) {
      // the coffee line was longer at compilation than it is now. Look for matches in the
      // cut off area:
      const js_matches_by_cut_off_chars = js_matches_by_line
        .filter(c => c?.sourceColumn > coffee_position.character)
      if(js_matches_by_cut_off_chars.length)
        match = choose_match(js_matches_by_cut_off_chars)
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
    if(!match)
      match = choose_match(js_matches_by_line)
    
    const line = match?.line
    let column = match?.column
    if(match && result.fake_line == coffee_position.line)
      // The coffee line is also a (the) altered one (fake line). In this case, `column.line` is
      // helpful but `column.column` does not make any sense, it contains only one column (where
      // the injected `𒐩` was placed). But since the error line was simply put into JS, we can
      // use the same pos:
      column = coffee_position.character

    // logger.logDebug(`mapped CS => JS: ${coffee_position.line}:${coffee_position.character} => ${match?.line}:${match?.column}`)
    if(line == null || column == null)
      return undefined
    return Position.create(line, column)
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