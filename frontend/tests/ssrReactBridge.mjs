/**
 * Load this module via Vite `ssrLoadModule` so React, ReactDOM, and
 * react-router-dom share one instance with app components under test.
 * Direct Node imports of `react` are a different copy under Vite 8's SSR runner.
 */
export { createElement, Fragment } from 'react';
export { renderToString } from 'react-dom/server';
export { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
