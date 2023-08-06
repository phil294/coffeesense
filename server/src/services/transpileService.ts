import { compile, LineMap } from 'coffeescript'
//@ts-ignore
import VolatileMap from 'volatile-map'
//@ts-ignore
import jshashes from 'jshashes'
import { Diagnostic, DiagnosticSeverity, Position, Range } from 'vscode-languageserver-types'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { logger } from '../log'

export const common_js_variable_name_character = /[a-zA-Z0-9_$]/

export function get_word_around_position(text: string, offset: number) {
  let i_offset = offset
  while(text[i_offset - 1]?.match(common_js_variable_name_character))
    i_offset--
  const start_offset = i_offset
  let match_word = ""
  while(text[i_offset]?.match(common_js_variable_name_character)) {
    match_word += text[i_offset]
    i_offset++
  }
  return { word: match_word, offset: start_offset }
}

/** This should be avoided to occur - this can be guesswork at best.
  * One (the only) known valid use case here is JSDoc where there are no source maps
  * but autocomplete in JS. */
function source_map_position_by_line_content_equivalence(position: Position, line: string, in_text: string): Position | undefined {
  // leading # gets // but can also stay # or become leading * inside comment blocks
  const strip = (line: string) => line.replace(/^\s*((\/\/)|#*|\*|\/\*)?/, '').trim().replace(/(###|\*\/)$/, '')
  const stripped = strip(line)
  const in_lines = in_text.split('\n')
  const match_i = in_lines.findIndex(in_line => strip(in_line) === stripped)
  if(match_i > -1) {
    return Position.create(
      match_i,
      position.character - line.indexOf(stripped) + in_lines[match_i]!.indexOf(stripped))
  }
  return undefined
}


export function get_line_at_line_no(doc: TextDocument, line_no: number) {
  return doc.getText().slice(doc.offsetAt({ line: line_no, character: 0 }), doc.offsetAt({ line: line_no, character: Number.MAX_VALUE }))
}

interface ITranspilationResult {
  /** coffeescript compile diagnostics, if present, without considering `fake_line` */
  diagnostics?: Diagnostic[]
  /** set to number of coffeescript altered line if it was necessary for compilation to succeed */
  fake_line?: number
  /**
   * `'modified_js'`: Failing coffee line was brought to coffee compilation success by
   *      slightly adjusting it (removing trailing dot, mostly)
   * `'coffee_in_js'`: ...by *replacing* it with some kind of minimal placeholder
   *      and injecting the coffee line back into js as is (or with minimal changes)
   * For more details, see `try_translate_coffee`.
   */
  fake_line_mechanism?: 'modified_js' | 'coffee_in_js'
  /** compilation result. if `fake_line` is set, this result was made possible by it. */
  js?: string
  /** accompanying its respective `js` counterpart, also possibly depending on `fake_line` if set */
  source_map?: LineMap[]
}

interface ITranspileService {
  result_by_uri: Map<string, ITranspilationResult>,
  transpile(coffee_doc: TextDocument): ITranspilationResult,
  position_js_to_coffee(result: ITranspilationResult, js_position: Position, coffee_doc: TextDocument): Position | undefined,
  range_js_to_coffee(result: ITranspilationResult, js_range: Range, coffee_doc: TextDocument): Range | undefined,
  position_coffee_to_js(result: ITranspilationResult, coffee_position: Position, coffee_doc: TextDocument): Position | undefined,
  range_coffee_to_js(result: ITranspilationResult, coffee_range: Range, coffee_doc: TextDocument): Range | undefined,
}

const MD5 = new jshashes.MD5()
const transpilation_cache: Map<string,ITranspilationResult> = new VolatileMap(180000)

/** The resulting coffee must still always be valid and parsable by the compiler,
    and should not shift characters around much (otherwise source maps would need changes too) */
function preprocess_coffee(coffee_doc: TextDocument) {
  const tmp = (coffee_doc.getText() as string)
    // Enable autocomplete at `@|`. Replace with magic snippet that allows for both @|
    // and standalone @ sign. Cursor needs to be adjusted properly in doComplete().
    // .____CoffeeSenseAtSign is replaced with (this.valueOf(),this) in postprocess_js.
    .replaceAll(/^([^#\n]*([^a-z-A-Z_$\n]|^))@(\s|$)/mg, (_, c, __, ws) => {
      logger.logDebug(`transform @ to (this.valueOf(),this) ${coffee_doc.uri}`)
      return `${c}this.____CoffeeSenseAtSign${ws}`
    })
    // To avoid successful compilation where it should fail, e.g. `a.|\nconsole.log 1`
    // (debatable if this should actually be allowed though), and more importantly, fix `a.|\n#`
    .replaceAll(/^[^#\n]*(^|[^.])\.$/mg, (c) => {
      logger.logDebug(`transform .\n to .;\n ${coffee_doc.uri}`)
      return `${c};`
    })
    // Enable object key autocomplete (that is, missing colon) below other key value mappings.
    // The replaced syntax is always invalid so no harm is done by adding the colon.
    // (Exception: Object inside braces where shorthand syntax exists)
    // Without the colon, the error shows in the line before which doesn't make sense.
    // With the colon, the line will still be invalid, but now the error is at the right place.
    .replaceAll(/^(\s+)[a-zA-Z0-9_$]+\s*:\s*.+$\n\1([a-zA-Z0-9_$]+)$/mg, (match, _, key) => {
      logger.logDebug(`transform a:b\nc\n to a:b\nc:c\n ${coffee_doc.uri}`)
      return match + ':' + key
    })
    // Trailing spaces = `↯:↯`. Something to make the line not error, and object to get autocomplete with params
    // inline object keys, both as new obj param and as new entry to an existing object param.
    // These characters are again removed in postprocess_js and gets special handling in doComplete().
    // Trailing open brace on the other hand cannot be replaced because it is valid CS (s.a. signature hint tests).
    .replaceAll(/^[^#\n]*[^ #\n] $/mg, (m) => {
      logger.logDebug(`replace trailing space with ↯:↯ ${coffee_doc.uri}`)
      return m + '↯:↯'
    })
    // Similar inside objects: `{ ..., }` -> add another element to it after comma.
    // Shorthand not like above to keep line length.
    .replaceAll(/, (\s*)\}/mg, (_, ws) => {
      logger.logDebug(`replace trailing comma inside { } with ↯ ${coffee_doc.uri}`)
      return `,↯${ws}}`
    })

  const tmp_lines = tmp.split('\n')

  const starts_with_block_comment_lines = tmp_lines.map((line) =>
    line.match(/^\s*###([^#]|$)/mg)
  ).map((match, line_i) =>
    match ? line_i : -1
  ).filter(line_i =>
    line_i > -1
  ).map((line_i, i) =>
    // Eg. if block comment lines were detected and prefixed with a single # line
    // at i=2 and i=4, the array will contain [2,5] so we can iterate and modify
    // arrays from the beginning here and in postprocess_js.
    line_i + i)

  for(const line_i of starts_with_block_comment_lines) {
    // Arrange for block comments to be placed directly before their below line in JS (#1)
    // Inserts extra lines that need to be tracked so the source maps can be adjusted. That's
    // also why this needs to happen before object_tweak_coffee_lines.
    // Couldn't find a solution that does not insert extra lines:
    // - prefix all ### with another "# " -> long block comment sections become code
    // - prefix with backticks: ### -> ``### -> fails inside objects or multiline assignments
    logger.logDebug(`replace: prefix ### with single # line ${coffee_doc.uri}`)
    tmp_lines.splice(line_i, 0, '#')
  }

  const object_tweak_coffee_lines: number[] = []
  tmp_lines.forEach((line, line_i) => {
    // Enable autocomplete on empty lines inside object properties.
    // Normally, empty lines get deleted by the cs compiler and cannot be mapped back. Insert some
    // random unicode snippet to keep the lines, and remove these snippets right after compilation below,
    // with the sole purpose of generating (properly indented) source maps.
    // But: This transform may only happen if the next text line is not an indentation child, as
    // it otherwise changes the syntax of its surroundings.
    // This tweak is separate from fake_line logic below.
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
      logger.logDebug(`replace append empty line with 𒐛:𒐛 ${coffee_doc.uri}`)
      tmp_lines[line_i] = empty_line_indentation + '𒐛:𒐛'
      object_tweak_coffee_lines.push(line_i)
    }
  })
  const coffee = tmp_lines.join('\n')
  const inserted_coffee_lines = starts_with_block_comment_lines
  return { coffee, inserted_coffee_lines, object_tweak_coffee_lines }
}

/** further transforms that *can break* cs compilation, to be used if compilation could not succeed without it anyway */
function preprocess_coffee_aggressive(coffee_doc: TextDocument) {
  return coffee_doc.getText()
    // `abc "|\n` -> add another "
    .replaceAll(/^[^"']*(["'])[^"']*$/mg, (c, quote) => {
        logger.logDebug(`aggressively transform open string to closed one ${coffee_doc.uri}`)
        return c + quote
      })
    // `abc(|\n` -> add `)`. Open braces are actually allowed and used in normal CoffeeScript (issue #8)
    .replaceAll(/([a-zA-Z_$0-9])\(([^)\n]*)$/mg, (_,c, p) => {
      logger.logDebug(`aggressively replace open ( with () ${coffee_doc.uri}`)
      return `${c}(${p})`
    })
    // In case there are unclosed braces { around: {} have little value in cs
    // Remove them and any spread operators that would then result in more syntax errors
    .replaceAll(/[\t ]*[{}]$/mg, () => {
      logger.logDebug(`aggressively remove {} ${coffee_doc.uri}`)
      return ''
    })
    .replaceAll(/\.\.\.([a-zA-Z_$])/g, (_, c) => {
      logger.logDebug(`aggressively remove ...X ${coffee_doc.uri}`)
      return `_: ${c}`
    })
    .replaceAll(/([a-zA-Z_$])\.\.\./g, (_, c) => {
      logger.logDebug(`aggressively remove X... ${coffee_doc.uri}`)
      return `${c}: _`
    })
}

/** using official coffeescript compiler */
function try_compile_coffee(coffee: string): ITranspilationResult {
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

/** This is an alternative to `try_compile_coffee` - here, coffeescript code is transformed
 * so that tsserver can provide some intellisense for it. This is very limited and
 * should be avoided if possible. */
export function pseudo_compile_coffee(coffee: string) {
  return coffee
    .replaceAll('@', 'this.')
    // Callback parens insertion: In callbacks, the variable type can not be inferred:
    // JS does not understand that this is a function (because of the missing parens).
    // E.g. `x (a) => a.` becomes `x((a) => a.`
    .replaceAll(/ (\(.+)$/mg, '($1   )') // the "   " is to avoid wrong mappings
    // Same principle for function invocation insertion, e.g. `a b` becomes `a(b`
    .replaceAll(/^(.*)([a-zA-Z0-9_$\])]) ([a-zA-Z0-9_$@[{"'].*$)/mg, (match, a, b, c) => {
      if(match.startsWith('import ') || match.includes('require('))
        return match
      return `${a}${b}(${c}   )`
    })
    // Same principle for inline objects: e.g. `x(a: b` becomes `x({a:b`.
    // General object braces insertion requires iterating all lines
    // based on indentation etc so I skipped that
    .replaceAll(/([^\s{][ (])([a-zA-Z_$][a-zA-Z0-9_$]* ?:) /mg, '$1{$2')
    // More special words that JS does not understand *so bad*, it cannot give suggestions
    // anymore. && Seems to work in all cases, same as if, ! does not.
    .replaceAll(/\b(unless|not|and|is|isnt|then)\b/mg, (keyword) => '&&' + ' '.repeat(keyword.length - '&&'.length))
    // Every assignment needs a var/const/let or a (nonexisting) prefix object.
    // This transform is rare for fake line coffee_in_js (object half line with
    // open brace, or open string), but highly frequent in normal cs->js
    .replaceAll(/^[\t ]*[a-zA-Z0-9_$]+[\t ]*=([^=]|$)/mg, (line) => `let ${line}`)
    // no use case but seems sane
    .replace(/(^|[^\n#])###($|[^\n#])/mg, (_, a, b) => `${a}/*${b}`)
    .split('\n')
    .map((line) => {
      if(!line.match(/^\s*(import|require)/)) {
        // template literals
        line = line
          .replaceAll('"', '`')
          .replaceAll('#{', '${')
      }
      return line
    })
    .join('\n')
    // `x.| # comment` sometimes (??) fails because ts thinks we try to define a class prop
    .replaceAll(' #', '//')
}

const try_translate_coffee = (coffee_doc: TextDocument): ITranspilationResult => {
  let result: ITranspilationResult = {}
  let fake_line_mechanism: ITranspilationResult["fake_line_mechanism"]
  let normal_compilation_diagnostics: Diagnostic[] | undefined

  let coffee_error_line_no = 0, coffee_error_offset = 0, coffee_error_end = -1, coffee_error_line = '', coffee_error_line_indentation = '', /*useful for debugging*/successful_coffee_fake = '', fake_line_modified_js_end_removed = ''

  const coffee = coffee_doc.getText()

  // Try normal compilation
  result = try_compile_coffee(coffee)

  if(result.js) {
    logger.logDebug(`successful simple compilation ${coffee_doc.uri}`)
    return result
  } else {
    fake_line_mechanism = 'coffee_in_js'
    normal_compilation_diagnostics = result.diagnostics

    coffee_error_line_no = result.diagnostics![0]!.range.start.line
    coffee_error_offset = coffee_doc.offsetAt(Position.create(coffee_error_line_no, 0))
    const coffee_error_next_newline_position = coffee.slice(coffee_error_offset).indexOf('\n')
    coffee_error_end = coffee_error_next_newline_position > -1 ? coffee_error_offset + coffee_error_next_newline_position : -1
    coffee_error_line = coffee.slice(coffee_error_offset, coffee_error_end > -1 ? coffee_error_end : undefined)
    coffee_error_line_indentation = coffee_error_line.match(/^\s+/)?.[0] || ''
  }

  // It failed. Try another compilation with error line simplified. Used for completions etc.
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
    const coffee_fake = [
      coffee.substr(0, coffee_error_offset),
      coffee_error_line_indentation,
      fake_line_content,
      ' '.repeat(Math.max(0,coffee_error_line.length - coffee_error_line_indentation.length - fake_line_content.length)),
      coffee_error_end > -1 ? coffee.slice(coffee_error_end) : ''
    ].join('')
    result = try_compile_coffee(coffee_fake)
    if(result.js) {
      logger.logDebug(`successful compilation with fake content '${fake_line_content}' ${coffee_doc.uri}`)
      successful_coffee_fake = coffee_fake
      return true
    }
    return false
  }

  // Most common cause for failing line is probably a dot. Try without it. Anything more complicated
  // can only be guessed and tried out with the other fake line contents below.
  for(let end of ['.;', '[']) { // `;` comes from preprocess_coffee
    if(!result.js) {
      if(coffee_error_line.endsWith(end)) {
        if(coffee_error_line.endsWith('?' + end))
          end = '?' + end
        // Still need the `𒐩` to detect the fake js line further below
        if(try_fake_line_compilation(
            (coffee_error_line
              .substring(0, coffee_error_line.length - end.length) + '.𒐩'
              ).trim())) {
          fake_line_mechanism = 'modified_js'
          fake_line_modified_js_end_removed = end
        }
        break
      }
    }
  }
  // Always try `𒐩:𒐩` but if object, do so at first because `𒐩` can sometimes translate to the wrong output
  // e.g. object-invalid-line.coffee - doesn't happen often though.
  // This regex matches object key definitions but rightfully excludes stuff like `b=[{a:1}].`
  const coffee_error_line_is_in_object = !!coffee_error_line.match(/^\s*[a-zA-Z0-9_$[\]]+\s*:/)
  if(!result.js && coffee_error_line_is_in_object)
    try_fake_line_compilation('𒐩:𒐩')
  for(const fake_line_content of ['𒐩', 'if 𒐩']) {
    if(!result.js)
      try_fake_line_compilation(fake_line_content)
  }
  if(!result.js && !coffee_error_line_is_in_object)
    try_fake_line_compilation('𒐩:𒐩')


  if(result.js && result.source_map && fake_line_mechanism) {

    // Fake coffee compilation succeeded, now inject the fake line into js
    const coffee_fake_𒐩_position = coffee_doc.positionAt(coffee_error_offset + coffee_error_line_indentation.length)
    const js_fake_arr = result.js.split('\n')
    // Could also be calculated using:
    // this.position_coffee_to_js({ source_map: result.source_map }, coffee_fake_𒐩_position, coffee_doc)?.line
    // but source maps are less reliable than the chance of the user not typing 𒐩 themselves
    const js_fake_𒐩_line_no = js_fake_arr.findIndex(line => line.indexOf('𒐩') > -1)
    if(js_fake_𒐩_line_no < 0)
      throw new Error('could not map back js 𒐩 line')

    if(fake_line_mechanism === 'coffee_in_js') {
      // Below modifications that change the line length are handled in position_coffee_to_js.
      const coffee_error_line_modified = pseudo_compile_coffee(coffee_error_line)

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

    } else {
      const fake_js_line = js_fake_arr[js_fake_𒐩_line_no]!
      const 𒐩_index = fake_js_line.indexOf('.𒐩')
      const before_𒐩 = fake_js_line.slice(0, 𒐩_index)
      const after_𒐩 = fake_js_line.slice(𒐩_index + 3) // 𒐩 is length 2
      let tail = ''
        if(after_𒐩 !== ';') {
        // This is not really expected but can sometimes happen when fake line is being
        // unified with the followup line into a single line statement. Preserve this information:
        tail = after_𒐩
      }
      js_fake_arr[js_fake_𒐩_line_no] = before_𒐩 + fake_line_modified_js_end_removed.replace(';', '') + tail
    }

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
      }
    }

    result.js = js_fake_arr.join('\n')
    result.fake_line = coffee_fake_𒐩_position.line
    result.fake_line_mechanism = fake_line_mechanism
  }

  if(normal_compilation_diagnostics)
    result.diagnostics = normal_compilation_diagnostics

  return result
}

/**
 * Applies some transformations to the JS in result and updates source_map accordingly.
 * These transforms do not depend on any previous information.
 */
function postprocess_js(result: ITranspilationResult, object_tweak_coffee_lines: number[], inserted_coffee_lines: number[]) {
  if(!result.js || !result.source_map)
    return

  result.js = result.js
    // Prefer object method shorthand
    .replaceAll(/([a-zA-Z0-9_$]+): (async )?function(\*?)\(/g, (_, func_name, asynk, asterisk) =>
      `${asynk || ''}${asterisk}${func_name}          (`)
    // see preprocess
    .replaceAll('this.____CoffeeSenseAtSign', '(this.valueOf(),this)     ')
    // coffee `↯:↯` *always* results in a separate line in js so no source mapping is required, just rm them
    .replaceAll(/↯(: )?/g, (m) =>
      ' '.repeat(m.length))
    // coffee `for x in y` becomes a for-loop, and `x` is in the next line defined as
    // `y[i]`. This gives errors with strict null checks, so add a type guard:
    .replaceAll(/^(\s*)for \(.+\) \{\n\1  var ([^ ]+) = \S+\];/mg, (all, indent, varname) =>
      `${all} if (${varname} === undefined) throw 'CoffeeSense strict null check';`)

  const js_lines = result.js.split('\n')

  result.source_map.forEach(source_map_line => {
    source_map_line.columns.forEach(source_map_entry => {
      // See usage of 𒐛 above
      for(const obj_tweak_coffee_line of object_tweak_coffee_lines) {
        // This logic is equivalent to fake line source map fixing, explained there
        if(source_map_entry.sourceLine === obj_tweak_coffee_line) {
          if(!js_lines[source_map_entry.line]?.match(/𒐛: 𒐛,?/))
            source_map_entry.sourceLine = -1 // effectively remove this source mapping
          source_map_entry.sourceColumn = 0
          source_map_entry.column = 0
        }
      }

      let skip_lines_count = inserted_coffee_lines.findIndex(inserted_line_i =>
        source_map_entry.sourceLine < inserted_line_i)
      if(skip_lines_count < 0)
        skip_lines_count = inserted_coffee_lines.length
      source_map_entry.sourceLine -= skip_lines_count
    })
  })

  if(result.fake_line) {
    let fake_line_skip_lines_count = inserted_coffee_lines.findIndex(inserted_line_i =>
      result.fake_line! < inserted_line_i)
    if(fake_line_skip_lines_count < 0)
      fake_line_skip_lines_count = inserted_coffee_lines.length
    result.fake_line -= fake_line_skip_lines_count
  }

  // console.time('var-decl-fix')
  //////////////////////////////////////
  ///////// Modify variable declarations to solve various TS compiler errors:
  ///////// Note: All of this is now only needed for when a CS assignment has a block comment before it (see issue #1)
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
  const js_line_nos = Array.from(Array(js_lines.length).keys())
  // Part 1: Determine declaration areas (`   var x, y;`)
  const js_decl_lines_info = js_line_nos
    .map(decl_line_no => {
      const match = js_lines[decl_line_no]!.match(/^(\s*)(var )([^\n=]+);$/)
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
      for(const impl_line_no of js_line_nos_after_decl) {
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

    const { coffee: preprocessed_coffee, object_tweak_coffee_lines, inserted_coffee_lines } = preprocess_coffee(orig_coffee_doc)
    // As coffee was modified, offsets and positions are changed and for these purposes,
    // we need to construct a new doc
    let mod_coffee_doc = TextDocument.create(orig_coffee_doc.uri, 'coffeescript', 1, preprocessed_coffee)
    let result = try_translate_coffee(mod_coffee_doc)

    if(!result.js) {
      const aggressively_preprocessed_coffee = preprocess_coffee_aggressive(mod_coffee_doc)
      mod_coffee_doc = TextDocument.create(mod_coffee_doc.uri, 'coffeescript', 1, aggressively_preprocessed_coffee)
      result = try_translate_coffee(mod_coffee_doc)
    }

    if(result.js && result.source_map) {
      postprocess_js(result, object_tweak_coffee_lines, inserted_coffee_lines)
    } else {
      // Nothing worked at all. As a last resort, just pass the coffee to tsserver,
      // with minimal transforms:
      result.js = pseudo_compile_coffee(orig_coffee_doc.getText())
    }

    transpilation_cache.set(hash, result)
    this.result_by_uri.set(orig_coffee_doc.uri, result)
    return result
  },


  /**
   * Convert position in transpiled JS text back to where it was in the original CS text.
   * Tries to find by line and column, or if not found, the first match by line only.
   */
  position_js_to_coffee(result, js_position, coffee_doc) {
    if(!result.source_map)
      throw 'cannot map position without source map'
    let coffee_pos
    const js_line = result.js!.split('\n')[js_position.line]!
    const columns = result.source_map[js_position.line]?.columns
    let mapped = columns?.[js_position.character]
    if(!mapped)
      mapped = columns
        ?.filter(Boolean)
        .filter(c => c.column <= js_position.character)
        .sort((a,b)=> b.column - a.column)
        [0]
    if(!mapped)
      mapped = columns?.find(Boolean)
    if(js_line.trim().startsWith('/*'))
        mapped = undefined
    if(!mapped) {
      // in case it is a single isolated line part of a block comment jsdoc
      const line_pos = source_map_position_by_line_content_equivalence(
        js_position, js_line, coffee_doc.getText())
      if(line_pos)
        mapped = { sourceLine: line_pos.line, sourceColumn: line_pos.character, line: -1, column: -1 }
    }
    if(!mapped) {
      let line_i = js_position.line + 1
      while(line_i < result.source_map.length) {
        const any_next_column = result.source_map[line_i]?.columns?.find(Boolean)
        if(any_next_column) {
          mapped = any_next_column
          break
        }
        line_i++
      }
    }

    if(mapped)
      coffee_pos = Position.create(mapped.sourceLine, mapped.sourceColumn)
    else
      coffee_pos = undefined
    // logger.logDebug(`mapped JS => CS: ${js_position.line}:${js_position.character} => ${result?.line}:${result?.character}`)
    return coffee_pos
  },

  /** Convert range in transpiled JS back to where it was in the original CS */
  range_js_to_coffee(result, js_range, coffee_doc) {
    const start = this.position_js_to_coffee(result, js_range.start, coffee_doc)
    const end = this.position_js_to_coffee(result, js_range.end, coffee_doc)
    if(start && end && start.line > -1 && end.line > -1)
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
   * If no match, look for identical line content in JS.
   */
  position_coffee_to_js(result, coffee_position, coffee_doc) {
    if(!result.source_map)
      throw 'cannot reverse map position without source map'

    const coffee_position_offset = coffee_doc.offsetAt(coffee_position)
    const char_at_coffee_position = coffee_doc.getText()[coffee_position_offset]
    const word_at_coffee_position = get_word_around_position(coffee_doc.getText(), coffee_position_offset)
    const coffee_line = get_line_at_line_no(coffee_doc, coffee_position.line)
    const coffee_position_is_at_end_of_word = word_at_coffee_position.word.length && word_at_coffee_position.offset === coffee_position_offset - word_at_coffee_position.word.length
    const coffee_position_at_start_of_word = coffee_doc.positionAt(word_at_coffee_position.offset)
    const js_doc_tmp = TextDocument.create('file://tmp.js', 'js', 1, result.js||'')

    const inline_jsdoc_match = [...coffee_line.matchAll(/^(.*)(^|[^\n#])###*(.+)([^\n#])###(.*)/g)][0]
    if(inline_jsdoc_match) {
      const inline_jsdoc_content = inline_jsdoc_match[3]! + inline_jsdoc_match[4]!
      const inline_jsdoc_content_starts_at = inline_jsdoc_match[1]!.length + inline_jsdoc_match[2]!.length + 4
      const inline_jsdoc_content_ends_at = inline_jsdoc_content_starts_at + inline_jsdoc_content.length
      if(coffee_position.character >= inline_jsdoc_content_starts_at && coffee_position.character <= inline_jsdoc_content_ends_at) {
        // Inside comments, there can never be source maps, so our best bet is simple matching
        // in any case. Similar to source_map_position_by_line_content_equivalence:
        const js_lines = js_doc_tmp.getText().split('\n')
        const match_i = js_lines.findIndex(js_line => js_line.includes(inline_jsdoc_content))
        if(match_i > -1) {
          const column = coffee_position.character - coffee_line.indexOf(inline_jsdoc_content) + js_lines[match_i]!.indexOf(inline_jsdoc_content)
          logger.logDebug(`mapped CS => JS as inline JSDoc: ${coffee_position.line}:${coffee_position.character} => ${match_i}:${column}`)
          return Position.create(match_i, column)
        }
      }
    }

    // TODO: revise this function, maybe this should be always all line matches by default instead
    const get_fitting_js_matches = () => {
      const js_matches_by_line = result.source_map!
        .map(line => line?.columns
          .filter(c => c?.sourceLine === coffee_position.line))
        .flat()
      const js_matches_by_char = js_matches_by_line
        .filter(c => c?.sourceColumn === coffee_position.character)
      if(js_matches_by_char.length)
        return js_matches_by_char
      if(coffee_position_is_at_end_of_word) {
        const js_matches_by_start_of_word = js_matches_by_line
          .filter(c => c?.sourceColumn === coffee_position_at_start_of_word.character &&
            get_word_around_position(result.js||'', js_doc_tmp.offsetAt({ line: c.line, character: c.column })).word === word_at_coffee_position.word)
        if(js_matches_by_start_of_word.length)
          return js_matches_by_start_of_word
      }
      if(char_at_coffee_position === '.') {
          // in javascript.ts doComplete, the triggerChar is omitted. Try exact match without it:
          const js_matches_by_next_char = js_matches_by_line
            .filter(c => c?.sourceColumn === coffee_position.character + 1)
          if(js_matches_by_next_char.length)
            return js_matches_by_next_char
      }
      if(char_at_coffee_position === undefined) {
        // the coffee line was longer at compilation than it is now. Look for matches in the
        // cut off area:
        const js_matches_by_cut_off_chars = js_matches_by_line
          .filter(c => c?.sourceColumn > coffee_position.character)
        if(js_matches_by_cut_off_chars.length)
          return js_matches_by_cut_off_chars
      }
      let prev = '', i = coffee_position_offset - 1
      while((prev = coffee_doc.getText()[i]||'') === ' ')
        i--
      if(prev === '{') {
        // e.g. wrong source map cs `|{}` to js `{|}`
        const js_matches_by_previous_brace = js_matches_by_line
            .filter(c => c?.sourceColumn === coffee_position.character - coffee_position_offset + i)
          if(js_matches_by_previous_brace.length)
            return js_matches_by_previous_brace
      }
      return js_matches_by_line
    }
    const js_matches = get_fitting_js_matches()

    /** Return match where there is a match by word at position, or by char position, possibly adjusting column */
    const choose_js_match = () => {
      const bottom_right_match = (matches: LineMap["columns"]) =>
        [...matches].sort((a,b) => b.line - a.line || b.column - a.column)
        [0]
      const abcdefg = (matches: LineMap["columns"]) => { // TODO this stuff needs refactoring
        const js_matches_by_char = matches.filter(m =>
          (result.js || '')[js_doc_tmp.offsetAt({ line: m.line, character: m.column })] === char_at_coffee_position)
        if(js_matches_by_char.length)
          return bottom_right_match(js_matches_by_char)
        return bottom_right_match(matches)
      }
      if(word_at_coffee_position.word) {
        const js_matches_by_word = js_matches.map(match => {
          const ret = { ...match }
          let match_offset = js_doc_tmp.offsetAt({ line: match.line, character: match.column })
          let match_word_info = get_word_around_position(result.js||'', match_offset)
          if(match_word_info.word !== word_at_coffee_position.word) {
            ret.column += 1
            match_offset++
            match_word_info = get_word_around_position(result.js||'', match_offset)
            if(match_word_info.word !== word_at_coffee_position.word)
              return null
          }
          const js_position_is_at_start_of_word = match_word_info.offset === match_offset
          if(coffee_position_is_at_end_of_word && js_position_is_at_start_of_word)
            ret.column += word_at_coffee_position.word.length
          return ret
        }).filter((match): match is LineMap["columns"][number] => !!match)
        if(js_matches_by_word.length)
          return abcdefg(js_matches_by_word)
        const js_matches_by_line_contains_word = js_matches.filter(match =>
          get_line_at_line_no(js_doc_tmp, match.line).includes(word_at_coffee_position.word))
        if(js_matches_by_line_contains_word.length)
          return abcdefg(js_matches_by_line_contains_word)
      }
      // Doesn't make much sense here as match_by_char in abcdefg comes after...
      // const js_matches_by_line_contains_any_common_char = js_matches.filter(match =>
      //   get_line_at_line_no(js_doc_tmp, match.line).match(common_js_variable_name_character))
      // if(js_matches_by_line_contains_any_common_char.length)
      //   return abcdefg(js_matches_by_line_contains_any_common_char)
      return abcdefg(js_matches)
    }
    const js_match = choose_js_match()

    let line = js_match?.line
    let column = js_match?.column
    if(js_match && line != null && result.fake_line == coffee_position.line && result.fake_line_mechanism === 'coffee_in_js') {
      // The coffee line is also a (the) altered one (fake line). In this case, `column.line` is
      // helpful but `column.column` does not make any sense, it contains only one column (where
      // the injected `𒐩` was placed). But since the error line was simply put into JS, we can
      // use the same pos:
      column = coffee_position.character
      // Note however that *most* of the time, fake_line_mechanism will be 'modified_js' instead.
      // See coffee_error_line_modified: Some position adjustments for the coffee in js fake line
      const js_line = get_line_at_line_no(js_doc_tmp, line)
      if(js_line.startsWith('let '))
        column += 'let '.length
      const coffee_line_until_cursor = coffee_line.slice(0, coffee_position.character)
      // CS cursor can be everything, but in case it is at `...@a.|` or `...@a b|`,
      // the `@`s to `this` conversions need to be considered because fake lines are
      // CS only.
      // Possible error: current_line != fake_line (so current_line is JS) and
      // current_line.includes('@'), but let's ignore that
      column += (coffee_line_until_cursor.split('@').length - 1) * ('this.'.length - '@'.length)
    }

    if(!js_match) {
      const line_pos = source_map_position_by_line_content_equivalence(
          coffee_position, coffee_line, js_doc_tmp.getText())
      line = line_pos?.line
      column = line_pos?.character
    }

    logger.logDebug(`mapped CS => JS: ${coffee_position.line}:${coffee_position.character} => ${line}:${column}`)
    if(line == null || column == null)
      return undefined
    return Position.create(line, column)
  },

  /** Convert range in original CS to where it eventually turned out in the transpiled JS.
   * See reverse_map_position for implementation details. */
  range_coffee_to_js(result, coffee_range, coffee_doc) {
    const start = this.position_coffee_to_js(result, coffee_range.start, coffee_doc)
    const end = this.position_coffee_to_js(result, coffee_range.end, coffee_doc)
    if(start && end)
      return Range.create(start, end)
    return undefined
  },
}

export default transpile_service