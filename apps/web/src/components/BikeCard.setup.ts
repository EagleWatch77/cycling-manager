import * as React from 'react';
// Test-only: tsx compiles this repo's JSX with the classic runtime, so React must be global.
(globalThis as unknown as { React: typeof React }).React = React;
