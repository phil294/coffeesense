/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CodeActionKind } from 'vscode-languageserver';

export interface TSCodeActionKind {
  kind: CodeActionKind;
  matches(refactor: { actionName: string }): boolean;
}

/* tslint:disable:variable-name */
const Rewrite_Import = Object.freeze<TSCodeActionKind>({
  kind: CodeActionKind.RefactorRewrite + '.import',
  matches: refactor =>
    refactor.actionName.startsWith('Convert namespace import') ||
    refactor.actionName.startsWith('Convert named imports')
});

/* tslint:enable:variable-name */

const allKnownCodeActionKinds = [Rewrite_Import];

export function getCodeActionKind(refactor: { actionName: string }): CodeActionKind {
  return allKnownCodeActionKinds.find(kind => kind.matches(refactor))?.kind ?? CodeActionKind.Refactor;
}
