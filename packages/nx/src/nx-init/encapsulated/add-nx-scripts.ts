import { execSync } from 'child_process';
import { readFileSync, constants as FsConstants } from 'fs';
import { stripIndent } from 'nx/src/utils/logger';
import * as path from 'path';
import { valid } from 'semver';
import { NxJsonConfiguration } from '../../config/nx-json';
import {
  flushChanges,
  FsTree,
  printChanges,
  Tree,
} from '../../generators/tree';
import { writeJson } from '../../generators/utils/json';

const nxWrapperPath = (p: typeof import('path') = path) =>
  p.join('.nx', 'nxw.js');

const NODE_MISSING_ERR =
  'Nx requires NodeJS to be available. To install NodeJS and NPM, see: https://nodejs.org/en/download/ .';
const NPM_MISSING_ERR =
  'Nx requires npm to be available. To install NodeJS and NPM, see: https://nodejs.org/en/download/ .';

const BATCH_SCRIPT_CONTENTS = stripIndent(
  `set path_to_root=%~dp0
  WHERE node >nul 2>nul
  IF %ERRORLEVEL% NEQ 0 (ECHO ${NODE_MISSING_ERR}; EXIT 1)
  WHERE npm >nul 2>nul
  IF %ERRORLEVEL% NEQ 0 (ECHO ${NPM_MISSING_ERR}; EXIT 1)
  node ${path.win32.join('%path_to_root%', nxWrapperPath(path.win32))} %*`
);

const SHELL_SCRIPT_CONTENTS = stripIndent(
  `#!/bin/bash
  command -v node >/dev/null 2>&1 || { echo >&2 "${NODE_MISSING_ERR}"; exit 1; }
  command -v npm >/dev/null 2>&1 || { echo >&2 "${NPM_MISSING_ERR}"; exit 1; }
  path_to_root=$(dirname $BASH_SOURCE)
  node ${path.posix.join('$path_to_root', nxWrapperPath(path.posix))} $@`
);

export function generateEncapsulatedNxSetup(version?: string) {
  const host = new FsTree(process.cwd(), false);
  writeMinimalNxJson(host, version);
  updateGitIgnore(host);
  host.write(nxWrapperPath(), getNodeScriptContents());
  host.write('nx.bat', BATCH_SCRIPT_CONTENTS);
  host.write('nx', SHELL_SCRIPT_CONTENTS, {
    mode: FsConstants.S_IXUSR | FsConstants.S_IRUSR | FsConstants.S_IWUSR,
  });
  const changes = host.listChanges();
  printChanges(changes);
  flushChanges(host.root, changes);
}

export function writeMinimalNxJson(host: Tree, version: string) {
  if (!host.exists('nx.json')) {
    if (!valid(version)) {
      version = execSync(`npm view nx@${version} version`).toString();
    }
    writeJson<NxJsonConfiguration>(host, 'nx.json', {
      tasksRunnerOptions: {
        default: {
          runner: 'nx/tasks-runners/default',
          options: {
            cacheableOperations: [],
          },
        },
      },
      installation: {
        version: version.trimEnd(),
      },
    });
  }
}

export function updateGitIgnore(host: Tree) {
  const contents = host.read('.gitignore', 'utf-8') ?? '';
  host.write(
    '.gitignore',
    [contents, '.nx/installation', '.nx/cache'].join('\n')
  );
}

function getNodeScriptContents() {
  // Read nxw.js, but remove any empty comments or comments that start with `INTERNAL: `
  return readFileSync(path.join(__dirname, 'nxw.js'), 'utf-8').replace(
    /(\/\/ INTERNAL: .*)|(\/\/\w*)$/gm,
    ''
  );
}
