import * as React from 'react';
// Test-only setup. tsx compiles this repo's JSX with the classic runtime, so React must be global,
// and 'server-only' (which throws outside a Server Component) is neutralised for rendering tests.
(globalThis as unknown as { React: typeof React }).React = React;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const id = require.resolve('server-only');
require.cache[id] = { id, filename: id, loaded: true, exports: {}, children: [], paths: [], path: '', parent: null } as unknown as NodeJS.Module;
