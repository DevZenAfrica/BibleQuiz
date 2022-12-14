/// <amd-module name="@angular/compiler-cli/ngcc/src/writing/file_writer" />
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { EntryPointJsonProperty } from '../packages/entry_point';
import { EntryPointBundle } from '../packages/entry_point_bundle';
import { FileToWrite } from '../rendering/utils';
/**
 * Responsible for writing out the transformed files to disk.
 */
export interface FileWriter {
    writeBundle(bundle: EntryPointBundle, transformedFiles: FileToWrite[], formatProperties: EntryPointJsonProperty[]): void;
}
