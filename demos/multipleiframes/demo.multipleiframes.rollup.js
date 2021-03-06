// Rollup plugins
import babel from 'rollup-plugin-babel';
import babelrc from 'babelrc-rollup';
import eslint from 'rollup-plugin-eslint';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';

export default {
    input: './demos/multipleiframes/demo-multipleiframes.js',
    output: {
        file: 'dist/demo.multipleiframes.js',
        format: 'es',
        sourcemap: false
    },
    plugins: [
        resolve(),
        commonjs(),
        eslint(),
        babel(babelrc())
    ]
};
