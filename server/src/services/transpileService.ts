import { compile, LineMap } from 'coffeescript'
//@ts-ignore
import VolatileMap from 'volatile-map'
//@ts-ignore
import jshashes from 'jshashes'
import { Diagnostic, DiagnosticSeverity, Position, Range } from 'vscode-languageserver-types'
import { TextDocument } from 'vscode-languageserver-textdocument';

type ITranspilationResult = {
  /** coffeescript compile diagnostics, if present, without considering `fake_line` */
  diagnostics?: Diagnostic[]
  /** set to number of coffeescript altered line if it was necessary for compilation to succeed */
  fake_line?: number
  /** compilation result. if `fake_line` is set, this result was made possible by it. */
  js?: string;
  /** accompanying its respective `js` counterpart, also possibly depending on `fake_line` if set */
  source_map?: LineMap[];
};

const MD5 = new jshashes.MD5()
const transpilation_cache: Map<string,ITranspilationResult> = new VolatileMap(180000)

const transpile_service = {
  
  result_by_uri: new Map<string, ITranspilationResult>(),

  transpile(document: TextDocument): ITranspilationResult {
    const text = document.getText()
    const hash = MD5.hex(text)
    const cached = transpilation_cache.get(hash)
    if (cached) {
      this.result_by_uri.set(document.uri, cached)
      return cached
    }
    const coffee = text
      // Dangling space = opening brace "(". This is pretty hacky but works surprisingly
      // well. Accidental dangling spaces results in "Missing )" errors which even
      // makes sense in CS syntax.
      // To avoid unexpected syntax weirdness, we additionally show an unavoidable
      // error below (TODO: integrate this replace into the matchAll() below to avoid duplicate work)
      .replace(/([a-zA-Z_]) \n/g, (_,c) => `${c}(\n`)
    let result: ITranspilationResult
    try {
      // 1. Try normal compilation
      const response = compile(coffee, { sourceMap: true, bare: true })
      result = {
        source_map: response.sourceMap.lines,
        js: response.js.trim()
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
      diagnostics.push(...[...document.getText()
        .matchAll(/([a-zA-Z_]) \n/g)]
        .map(m => {
          const pos = document.positionAt(m.index||0+1)
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
      //   coffee_error_line_no-- // not accurate, note:yml style arrays. but it was at some point, in combination with comments in next line? cs bug?
      const coffee_error_offset = document.offsetAt(Position.create(coffee_error_line_no, 0))
      const coffee_error_next_newline_position = coffee.slice(coffee_error_offset).indexOf('\n')
      const coffee_error_end = coffee_error_next_newline_position > -1 ? coffee_error_offset + coffee_error_next_newline_position : undefined
      const coffee_error_line = coffee.slice(coffee_error_offset, coffee_error_end)
			const error_line_indentation = coffee_error_line.match(/^\s+/)?.[0] || ''

      const coffee_fake = [
				coffee.substr(0, coffee_error_offset),
				error_line_indentation,
				'𒐩',
        ' '.repeat(coffee_error_line.length - error_line_indentation.length - 1),
				coffee_error_end ? coffee.slice(coffee_error_end) : ''
			].join('')

      let js_fake, source_map_fake
      try {
        const response = compile(coffee_fake, { sourceMap: true, bare: true })
        js_fake = response.js.trim()
        source_map_fake = response.sourceMap.lines
      } catch (fake_compilation_error) {
        if (fake_compilation_error.name !== "SyntaxError")
          throw fake_compilation_error

        const coffee_fake2 = [
          coffee.substr(0, coffee_error_offset),
          error_line_indentation,
          '𒐩:𒐩',
          ' '.repeat(coffee_error_line.length - error_line_indentation.length - 3),
          coffee_error_end ? coffee.slice(coffee_error_end) : ''
        ].join('')
        // TODO: refactor this, externalize compile or something
        try {
          const response = compile(coffee_fake2, { sourceMap: true, bare: true })
          js_fake = response.js.trim()
          source_map_fake = response.sourceMap.lines
        } catch (fake2_compilation_error) {
          if (fake_compilation_error.name !== "SyntaxError")
            throw fake_compilation_error
        }
      }
      
      if(js_fake && source_map_fake) {  
        // Fake coffee compilation succeeded, now inject the coffee line into js

        const coffee_fake_𒐩_position = document.positionAt(coffee_error_offset + error_line_indentation.length)
        
        // Could also be calculated with js_fake.indexOf('𒐩'), given the user has not used the symbol
        const js_fake_𒐩_line_no = this.reverse_map_position({ source_map: source_map_fake }, coffee_fake_𒐩_position)?.line
        if(js_fake_𒐩_line_no == null)
          throw new Error('could not map back js 𒐩 line')
        
        const js_fake_arr = js_fake.split('\n')
        // if(js_fake_arr[js_fake_𒐩_line_no].match(/\s*\S.*{𒐩: 𒐩};/))
        js_fake_arr[js_fake_𒐩_line_no] = coffee_error_line
        js_fake = js_fake_arr.join('\n')

        result.fake_line = coffee_fake_𒐩_position.line
        result.js = js_fake
        result.source_map = source_map_fake
      }
    }
    transpilation_cache.set(hash, result)
    this.result_by_uri.set(document.uri, result)
    return result
  },


  /**
   * Convert position in transpiled JS text back to where it was in the original CS text.
   * Tries to find by line and column, or if not found, the first match by line only.
   */
  map_position(source_map: LineMap[], js_position: Position): Position {
    // idk but both -1 and -0 were necessary in different files. not sure where my error is. I think -1 is the normal case <- TODO: outdated, probably 0 is indeed right
    // const columns = (source_map[js_position.line-1]||source_map[js_position.line]||source_map[js_position.line+1])?.columns
    const columns = (source_map[js_position.line]||source_map[js_position.line-1]||source_map[js_position.line+1])?.columns
    let mapped: typeof columns[0] | undefined = columns?.[js_position.character]
    if(!mapped)
      mapped = columns
        ?.filter(Boolean)
        .filter(c => c.column <= js_position.character)
        .sort((a,b)=> b.column - a.column)
        [0]
    if(!mapped)
      mapped = columns.find(Boolean)
    if(!mapped)
      throw new Error('could not sourcemap js pos back to cs')
    return Position.create(mapped.sourceLine, mapped.sourceColumn)
  },

  /** Convert range in transpiled JS back to where it was in the original CS */
  map_range(source_map: LineMap[], js_range: Range): Range {
    return Range.create(
      this.map_position(source_map, js_range.start),
      this.map_position(source_map, js_range.end))
  },

  /**
   * Convert position in original CS to where it eventually turned out in the transpiled JS.
   * Tries to find by line and column, furthest down in JS as possible, or if not found,
   * by line at the next smaller column,
   * or if no column match, end of line `(Number.MAX_VALUE)`, or if no line match, undefined.
   */
  reverse_map_position(result: ITranspilationResult, coffee_position: Position): Position | undefined {
    if(!result.source_map)
      throw 'cannot reverse map position without source map'
    let in_line = result.source_map
      .map(line => line?.columns
        .filter(c => c?.sourceLine === coffee_position.line))
      .flat()
    if(!in_line.length)
        return undefined
    let column: typeof in_line[0] | undefined = in_line
      .filter(c => c?.sourceColumn === coffee_position.character)
      .sort((a,b) => b.line - a.line)
      [0]
    if(!column) {
      column = in_line
        .filter(c => c.sourceColumn <= coffee_position.character)
        .sort((a,b) => b.sourceColumn - a.sourceColumn)
        [0]
      if(!column) {
        column = in_line.find(Boolean)
        if(!column)
          return undefined
        column.column = Number.MAX_VALUE
      }
    }
    if(result.fake_line == coffee_position.line)
      // The coffee line is also a (the) altered one (fake line). In this case, `column.line` is
      // helpful but `column.column` does not make any sense, it contains only one column (where
      // the injected `𒐩` was placed). But since the error line was simply put into JS, we can
      // use the same pos:
      column.column = coffee_position.character
    return Position.create(column.line, column.column)
  },

  /** Convert range in original CS to where it eventually turned out in the transpiled JS.
   * See reverse_map_position for implementation details. */
  reverse_map_range(result: ITranspilationResult, coffee_range: Range): Range | undefined {
    const start = this.reverse_map_position(result, coffee_range.start);
    const end = this.reverse_map_position(result, coffee_range.end);
    if(start && end)
      return Range.create(start, end)
    return undefined
  },
}

export default transpile_service