import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentSymbol, Range, SymbolKind, Position } from 'vscode-languageserver-types';
import { logger } from '../log';

// Parse CoffeeScript AST (via CoffeeScript.compile(..., { ast: true })) and produce LSP DocumentSymbols
export function getDocumentSymbolsFromCoffee(doc: TextDocument): DocumentSymbol[] {
  const text = doc.getText();
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Coffee: any = require('coffeescript');
    if (!Coffee || typeof Coffee.compile !== 'function') {
      logger.logDebug && logger.logDebug('coffeescript not found');
      return [];
    }

    const ast = Coffee.compile(text, { ast: true });
    if (!ast) return [];

    const flat: { sym: DocumentSymbol; start: number; end: number }[] = [];
    const seen = new WeakSet<any>();

    const toRange = (node: any): Range | null => {
      if (!node) return null;

      if (Array.isArray(node.range) && typeof node.range[0] === 'number') {
        const start = node.range[0] as number;
        const end = node.range[1] as number;
        return Range.create(doc.positionAt(start), doc.positionAt(end));
      }

      if (typeof node.start === 'number' && typeof node.end === 'number') {
        return Range.create(doc.positionAt(node.start), doc.positionAt(node.end));
      }

      const loc = node.loc || node.location || node.locationData || node.astLocation || node.rangeData;
      if (loc && loc.start && typeof loc.start.line === 'number') {
        const sLine = Math.max(0, (loc.start.line || 0) - 1);
        const sCol = loc.start.column ?? loc.start.column0 ?? 0;
        const eLine = Math.max(0, (loc.end?.line ?? loc.last_line ?? loc.start.line) - 1);
        const eCol = loc.end?.column ?? loc.last_column ?? loc.start.column ?? 0;
        return Range.create(Position.create(sLine, sCol), Position.create(eLine, eCol));
      }

      if (typeof node.first_line === 'number') {
        const sLine = node.first_line;
        const sCol = node.first_column ?? 0;
        const eLine = node.last_line ?? sLine;
        const eCol = (node.last_column ?? node.first_column ?? 0) + 1;
        return Range.create(Position.create(sLine, sCol), Position.create(eLine, eCol));
      }

      return null;
    };

    const getName = (node: any): string | undefined => {
      if (!node) return undefined;
      if (typeof node.name === 'string' && node.name.trim()) return node.name;
      if (node.name && typeof node.name.value === 'string') return node.name.value;
      if (node.id && typeof node.id === 'object' && typeof node.id.name === 'string') return node.id.name;
      if (node.key && typeof node.key === 'object' && typeof node.key.name === 'string') return node.key.name;
      if (node.variable && node.variable.base && typeof node.variable.base.value === 'string') return node.variable.base.value;
      if (node.variable && typeof node.variable.name === 'string') return node.variable.name;
      if (node.id && node.id.base && typeof node.id.base.value === 'string') return node.id.base.value;
      if (node.id && typeof node.id === 'string') return node.id;
      if (node.identifier && typeof node.identifier === 'string') return node.identifier;
      if (node.literal && typeof node.literal === 'string') return node.literal;
      if (node.value && typeof node.value === 'string') return node.value;
      if (node.type === 'Class' && node.variable && node.variable.base && node.variable.base.value) return node.variable.base.value;
      return undefined;
    };

    // Try to build a dotted name for member expressions (e.g. module.exports, exports.foo)
    const getFullName = (node: any): string | undefined => {
      if (!node || typeof node !== 'object') return undefined;

      const tryGet = (n: any): string | undefined => {
        if (!n) return undefined;
        // direct name
        const direct = getName(n);
        if (direct) return direct;

        // common shapes: base.property, object.property, variable.base + variable.name
        const base = n.base || n.object || n.subject || n.receiver || n.left || (n.variable && n.variable.base);
        const prop = n.property || n.propertyName || n.member || n.index || n.key || n.name;

        const baseName = tryGet(base) || getName(base);
        const propName = getName(prop) || (typeof prop === 'string' ? prop : undefined) || (Array.isArray(n.properties) && n.properties.length ? getName(n.properties[0]) : undefined);

        if (baseName && propName) return `${baseName}.${propName}`;

        // fallback: some nodes expose id/base.name
        if (n.id && n.id.base && n.id.base.value) {
          const idBase = n.id.base.value;
          const idName = (n.id.name || n.id.base.name || n.id.value);
          if (idBase && idName) return `${idBase}.${idName}`;
        }

        return undefined;
      };

      return tryGet(node);
    };


    const kindFromNode = (node: any): SymbolKind => {
      const t = (node && (node.type || node.constructor?.name || '')).toString().toLowerCase();
      if (t.includes('class')) return SymbolKind.Class;
      if (t.includes('constructor')) return SymbolKind.Constructor;
      if (t.includes('method')) return SymbolKind.Method;
      if (t.includes('function') || t.includes('code') || t.includes('lambda') || t.includes('func')) return SymbolKind.Function;
      if (t.includes('property')) return SymbolKind.Property;
      if (t.includes('assign') || t.includes('var') || t.includes('value')) return SymbolKind.Variable;
      if (t.includes('module')) return SymbolKind.Module;
      return SymbolKind.Object;
    };

    // eslint-disable-next-line no-inner-declarations
    function isSymbolCandidate(node: any, parent: any): boolean {
      if (!node) return false;
      const t = (node.type || node.constructor?.name || '').toString().toLowerCase();
      if (t.includes('class')) return true;
      if (t.includes('method') || t.includes('classmethod')) return true;
      if (t.includes('constructor')) return true;
      // include any function / code node (including anonymous functions / closures)
      if (t.includes('function') || t.includes('lambda') || t.includes('code') || t.includes('functionexpression')) return true;
      // include object / property nodes so object literal structure can appear in outline
      if (t.includes('object') || t.includes('property') || t.includes('objectexpression')) return true;
      // include ES module import and export declarations
      if (t.includes('import') || t.includes('export')) return true;

      const pt = parent ? (parent.type || parent.constructor?.name || '').toString().toLowerCase() : '';
      if (pt.includes('assign') || pt.includes('assignment') || pt.includes('assignmentexpression')) return true;
      if (parent && parent.variable) return true;

      // assignments to this/@ should be considered property declarations
      if (node.variable && node.variable.base && (node.variable.base.type === 'ThisExpression' || node.variable.base.type === 'This')) return true;

      return false;
    }

    // eslint-disable-next-line no-inner-declarations
    function collect(node: any, parent?: any, propName?: string) {
      if (!node || typeof node !== 'object') return;
      if (seen.has(node)) return;
      seen.add(node);

      const nodeType = (node.type || node.constructor?.name || '').toString().toLowerCase();

      // Skip primitive literal nodes (null/boolean/number/string) to reduce outline noise.
      // Their enclosing assignment or property will be collected instead.
      if (nodeType.includes('literal') || nodeType.includes('null') || nodeType.includes('boolean') || nodeType.includes('numeric') || nodeType.includes('number') || nodeType.includes('string')) {
        return; // primitives don't become symbols themselves
      }

      // Special-case: assignment nodes -> create a symbol from the left-hand side
      const isAssignType = nodeType.includes('assign') || nodeType.includes('assignment') || nodeType.includes('assignmentexpression');
      if (isAssignType) {
        const left = node.left || node.lhs || node.lvalue || node.id || node.variable || node.leftHandSide || node.target;
        const right = node.right || node.value || node.init || node.expression || node.rvalue || node.initializer || node.rightHandSide;
        const leftName = getFullName(left) || getName(left) || getName(node);
        const assignRange = toRange(node) || toRange(left) || toRange(right);
        if (leftName && assignRange) {
          const rt = (right && (right.type || right.constructor?.name || '')).toString().toLowerCase();
          let symKind: SymbolKind = SymbolKind.Variable;
          if (rt.includes('function') || rt.includes('lambda') || rt.includes('code') || rt.includes('functionexpression')) {
            symKind = SymbolKind.Function;
          } else if (rt.includes('object') || rt.includes('objectexpression') || rt.includes('objectliteral') || rt.includes('property')) {
            symKind = SymbolKind.Variable;
          }

          const sel = toRange(left) || assignRange;
          const rStart = doc.offsetAt(assignRange.start);
          const rEnd = doc.offsetAt(assignRange.end);
          let sStart = doc.offsetAt(sel.start);
          let sEnd = doc.offsetAt(sel.end);
          if (sStart < rStart) sStart = rStart;
          if (sEnd > rEnd) sEnd = rEnd;
          if (sEnd < sStart) sEnd = sStart;

          const selectionRange = Range.create(doc.positionAt(sStart), doc.positionAt(sEnd));
          const sym: DocumentSymbol = {
            name: leftName,
            detail: (right && right.type) || (node.type || '') as string,
            kind: symKind,
            range: assignRange,
            selectionRange,
            children: undefined
          };
          flat.push({ sym, start: rStart, end: rEnd });

          // Mark left processed so the identifier itself is not emitted separately
          if (left && typeof left === 'object') seen.add(left);
        }
        // continue traversal into right side to collect object properties / nested functions
      }

      // Special-case: import declarations -> create symbols for imported bindings (ES modules)
      if (nodeType.includes('import')) {
        const specifiers = node.specifiers || node.imports || node.specifiersList || node.specifier || [];
        const source = node.source || node.from || node.module || node.path;
        if (Array.isArray(specifiers) && specifiers.length) {
          for (const spec of specifiers) {
            const local = spec.local || spec.name || spec.id || spec.variable;
            const localName = getName(local) || getName(spec) || getName(node) || (typeof spec === 'string' ? spec : undefined);
            const importRange = toRange(spec) || toRange(local) || toRange(node);
            if (localName && importRange) {
              const sel = toRange(local) || importRange;
              const rStart = doc.offsetAt(importRange.start);
              const rEnd = doc.offsetAt(importRange.end);
              let sStart = doc.offsetAt(sel.start);
              let sEnd = doc.offsetAt(sel.end);
              if (sStart < rStart) sStart = rStart;
              if (sEnd > rEnd) sEnd = rEnd;
              if (sEnd < sStart) sEnd = sStart;
              const selectionRange = Range.create(doc.positionAt(sStart), doc.positionAt(sEnd));
              const detail = (source && (source.value || source.name || source.literal || source)) || (node.type || '');
              const sym: DocumentSymbol = {
                name: localName,
                detail: detail as string,
                kind: SymbolKind.Module,
                range: importRange,
                selectionRange,
                children: undefined
              };
              flat.push({ sym, start: rStart, end: rEnd });
              if (local && typeof local === 'object') seen.add(local);
            }
          }
        } else {
          // side-effect import like `import 'module'` - emit module name if available
          const modName = (source && (source.value || source.name || source.literal || source)) || getName(node);
          const importRange = toRange(node);
          if (modName && importRange) {
            const rStart = doc.offsetAt(importRange.start);
            const rEnd = doc.offsetAt(importRange.end);
            const selectionRange = importRange;
            const sym: DocumentSymbol = {
              name: String(modName),
              detail: (node.type || '') as string,
              kind: SymbolKind.Module,
              range: importRange,
              selectionRange,
              children: undefined
            };
            flat.push({ sym, start: rStart, end: rEnd });
          }
        }
      }

      // Special-case: export declarations -> create symbols for exported bindings (ES modules)
      if (nodeType.includes('export')) {
        const specifiers = node.specifiers || node.exports || node.specifiersList || node.specifier || node.exported || [];
        const source = node.source || node.from || node.module || node.path;
        const decl = node.declaration || node.decl || node.declared || node.expression || node.value || node.right || node.default || node.exportedDecl;

        const computeRangeFromChildren = (n: any): Range | null => {
          if (!n || typeof n !== 'object') return null;
          const localSeen = new WeakSet<any>();
          const stackNodes: any[] = [n];
          let minOffset = Number.POSITIVE_INFINITY;
          let maxOffset = -1;
          while (stackNodes.length) {
            const cur = stackNodes.pop();
            if (!cur || typeof cur !== 'object' || localSeen.has(cur)) continue;
            localSeen.add(cur);
            const r = toRange(cur);
            if (r) {
              const s = doc.offsetAt(r.start);
              const e = doc.offsetAt(r.end);
              if (s < minOffset) minOffset = s;
              if (e > maxOffset) maxOffset = e;
            }
            for (const k of Object.keys(cur)) {
              const v = cur[k];
              if (Array.isArray(v)) {
                for (const el of v) if (el && typeof el === 'object') stackNodes.push(el);
              } else if (v && typeof v === 'object') {
                stackNodes.push(v);
              }
            }
          }
          if (maxOffset >= 0) return Range.create(doc.positionAt(minOffset), doc.positionAt(maxOffset));
          return null;
        };

        if (Array.isArray(specifiers) && specifiers.length) {
          for (const spec of specifiers) {
            const exported = spec.exported || spec.name || spec.local || spec.id || spec.variable || spec;
            const exportName = getName(exported) || getName(spec) || getName(node) || (typeof exported === 'string' ? exported : undefined);
            let exportRange = toRange(spec) || toRange(exported) || toRange(node) || computeRangeFromChildren(spec) || computeRangeFromChildren(exported) || computeRangeFromChildren(node);
            if (exportName && exportRange) {
              const sel = toRange(exported) || exportRange;
              const rStart = doc.offsetAt(exportRange.start);
              const rEnd = doc.offsetAt(exportRange.end);
              let sStart = doc.offsetAt(sel.start);
              let sEnd = doc.offsetAt(sel.end);
              if (sStart < rStart) sStart = rStart;
              if (sEnd > rEnd) sEnd = rEnd;
              if (sEnd < sStart) sEnd = sStart;
              const selectionRange = Range.create(doc.positionAt(sStart), doc.positionAt(sEnd));
              const sym: DocumentSymbol = {
                name: exportName,
                detail: (source && (source.value || source.name || source.literal || source)) || (node.type || 'export'),
                kind: SymbolKind.Module,
                range: exportRange,
                selectionRange,
                children: undefined
              };
              flat.push({ sym, start: rStart, end: rEnd });
            }
          }
        } else if (decl) {
          const declName = getName(decl) || getName(node) || 'default';
          let exportRange = toRange(node) || toRange(decl) || computeRangeFromChildren(decl) || computeRangeFromChildren(node);
          if (exportRange) {
            const sel = toRange(decl) || exportRange;
            const rStart = doc.offsetAt(exportRange.start);
            const rEnd = doc.offsetAt(exportRange.end);
            let sStart = doc.offsetAt(sel.start);
            let sEnd = doc.offsetAt(sel.end);
            if (sStart < rStart) sStart = rStart;
            if (sEnd > rEnd) sEnd = rEnd;
            if (sEnd < sStart) sEnd = sStart;
            const selectionRange = Range.create(doc.positionAt(sStart), doc.positionAt(sEnd));
            let symKind: SymbolKind = SymbolKind.Variable;
            const dt = (decl && (decl.type || decl.constructor?.name || '')).toString().toLowerCase();
            if (dt.includes('class')) symKind = SymbolKind.Class;
            else if (dt.includes('function') || dt.includes('lambda') || dt.includes('code')) symKind = SymbolKind.Function;
            else if (dt.includes('object')) symKind = SymbolKind.Variable;
            const sym: DocumentSymbol = {
              name: declName,
              detail: 'export default',
              kind: symKind,
              range: exportRange,
              selectionRange,
              children: undefined
            };
            flat.push({ sym, start: rStart, end: rEnd });
          }
        } else if (source) {
          const modName = (source && (source.value || source.name || source.literal || source)) || getName(node);
          let exportRange = toRange(node) || computeRangeFromChildren(node);
          if (modName && exportRange) {
            const rStart = doc.offsetAt(exportRange.start);
            const rEnd = doc.offsetAt(exportRange.end);
            const selectionRange = exportRange;
            const sym: DocumentSymbol = {
              name: String(modName),
              detail: (node.type || 'export') as string,
              kind: SymbolKind.Module,
              range: exportRange,
              selectionRange,
              children: undefined
            };
            flat.push({ sym, start: rStart, end: rEnd });
          }
        }
      }

      // Determine a name for the node. Prefer explicit names; synthesize for anonymous functions
      let name = getName(node);
      const range = toRange(node);

      if (!name && nodeType.includes('function')) {
        const params = (node.params || node.parameters || []).map((p: any) => {
          if (!p) return '';
          if (typeof p === 'string') return p;
          if (typeof p.name === 'string') return p.name;
          if (typeof p.identifier === 'string') return p.identifier;
          return '';
        }).filter(Boolean).slice(0, 3);
        name = params.length ? `function(${params.join(',')})` : 'function';
      }

      const parentType = parent ? (parent.type || parent.constructor?.name || '').toString().toLowerCase() : '';
      // If this is an anonymous class/object exported as `export default`, synthesize a visible name
      if (!name && nodeType.includes('class')) {
        name = parentType.includes('export') ? 'default class' : 'class';
      }
      if (!name && nodeType.includes('object') && parentType.includes('export')) {
        name = 'default object';
      }
      const isRightOfAssignment = parentType.includes('assign') && ['right', 'value', 'init', 'expression', 'rvalue', 'initializer', 'rightHandSide'].includes(propName || '');
      const isLeftOfAssignment = parentType.includes('assign') && ['left', 'lhs', 'lvalue', 'leftHandSide', 'id', 'variable', 'target'].includes(propName || '');

      if (name && range && isSymbolCandidate(node, parent)) {
        // Avoid duplicating symbols for assignment lhs/rhs because assignment produced the symbol
        if (isLeftOfAssignment) {
          // skip identifier symbol; assignment already emitted it
        } else if (isRightOfAssignment && (nodeType.includes('function') || nodeType.includes('lambda') || nodeType.includes('code') || nodeType.includes('identifier'))) {
          // skip the RHS function/identifier symbol — assignment emitted it
        } else {
          let selectionRange = (node.id && toRange(node.id)) || (node.key && toRange(node.key)) || range;
          const rStart = doc.offsetAt(range.start);
          const rEnd = doc.offsetAt(range.end);
          let sStart = doc.offsetAt(selectionRange.start);
          let sEnd = doc.offsetAt(selectionRange.end);
          if (sStart < rStart) sStart = rStart;
          if (sEnd > rEnd) sEnd = rEnd;
          if (sEnd < sStart) sEnd = sStart;
          selectionRange = Range.create(doc.positionAt(sStart), doc.positionAt(sEnd));

          const sym: DocumentSymbol = {
            name,
            detail: (node.type || '') as string,
            kind: kindFromNode(node),
            range,
            selectionRange,
            children: undefined
          };
          flat.push({ sym, start: rStart, end: rEnd });
        }
      }

      // Always traverse children so object properties and nested functions are discovered
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (Array.isArray(v)) {
          for (const el of v) collect(el, node, k);
        } else if (v && typeof v === 'object') {
          collect(v, node, k);
        }
      }
    }

    collect(ast, undefined, undefined);

    logger.logDebug && logger.logDebug('coffeeAstService: collected ' + flat.length + ' flat symbols');

    if (flat.length === 0) return [];

    // Build hierarchy by range containment
    flat.sort((a, b) => a.start - b.start || b.end - a.end);

    const root: DocumentSymbol[] = [];
    const stack: { sym: DocumentSymbol; start: number; end: number }[] = [];

    for (const item of flat) {
      while (stack.length > 0) {
        const top = stack[stack.length - 1]!;
        if (item.start >= top.start && item.end <= top.end) break;
        stack.pop();
      }
      if (stack.length === 0) {
        root.push(item.sym);
      } else {
        const parent = stack[stack.length - 1]!.sym;
        parent.children = parent.children || [];
        parent.children.push(item.sym);
      }
      stack.push(item);
    }

    logger.logDebug && logger.logDebug('coffeeAstService: returning ' + root.length + ' root symbols');

    return root;
  } catch (e: any) {
    logger.logDebug && logger.logDebug('coffeeAstService failed: ' + (e && e.message));
    return [];
  }
}
